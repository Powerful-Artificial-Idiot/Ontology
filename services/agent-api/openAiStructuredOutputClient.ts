import { AgentPipelineError } from "../../packages/agent-core/src/index";
import type { AgentTraceStageName } from "../../packages/knowledge-contracts/src/index";
import type { AgentTelemetrySink } from "../../packages/agent-evaluation/src/index";

export type FetchImplementation = typeof fetch;

export type OpenAiStructuredOutputClientOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImplementation;
  telemetry?: AgentTelemetrySink;
};

export type OpenAiStructuredOutputRequest = {
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: Record<string, unknown>;
  stage: AgentTraceStageName;
  operationLabel: string;
  maxOutputTokens: number;
};

export class OpenAiStructuredOutputClient {
  readonly providerName = "openai-responses";
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchImplementation;

  constructor(private readonly options: OpenAiStructuredOutputClientOptions) {
    if (!options.apiKey.trim()) throw new Error("OpenAI API key is required.");
    if (!options.model.trim()) throw new Error("OpenAI model is required.");
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/u, "");
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(request: OpenAiStructuredOutputRequest, signal?: AbortSignal): Promise<unknown> {
    const startedAt = new Date();
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          store: false,
          instructions: request.instructions,
          input: JSON.stringify(request.input),
          text: {
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
          max_output_tokens: request.maxOutputTokens,
        }),
      });
      if (!response.ok) {
        throw new AgentPipelineError("LLM_PROVIDER_UNAVAILABLE", `OpenAI Responses API returned HTTP ${response.status}.`, request.stage, { provider: this.providerName, status: response.status });
      }
      let payload: unknown;
      try {
        payload = await response.json() as unknown;
      } catch {
        throw new AgentPipelineError("LLM_RESPONSE_INVALID", `OpenAI ${request.operationLabel} response is not valid JSON.`, request.stage, { provider: this.providerName });
      }
      const outputText = extractOutputText(payload);
      if (!outputText) throw new AgentPipelineError("LLM_RESPONSE_INVALID", `OpenAI response did not contain structured ${request.operationLabel} output.`, request.stage, { provider: this.providerName });
      try {
        const parsed = JSON.parse(outputText) as unknown;
        await this.recordTelemetry(request, "completed", startedAt, tokenUsage(payload));
        return parsed;
      } catch {
        throw new AgentPipelineError("LLM_RESPONSE_INVALID", `OpenAI structured ${request.operationLabel} output is not valid JSON.`, request.stage, { provider: this.providerName });
      }
    } catch (error) {
      await this.recordTelemetry(request, "failed", startedAt, {});
      if (error instanceof AgentPipelineError) throw error;
      if (signal?.aborted) throw new AgentPipelineError("PIPELINE_CANCELLED", `LLM ${request.operationLabel} was cancelled.`, request.stage);
      throw new AgentPipelineError(
        "LLM_PROVIDER_UNAVAILABLE",
        timedOut ? `OpenAI ${request.operationLabel} exceeded ${this.timeoutMs} ms.` : `OpenAI ${request.operationLabel} request failed.`,
        request.stage,
        { provider: this.providerName, timeoutMs: this.timeoutMs },
      );
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private async recordTelemetry(
    request: OpenAiStructuredOutputRequest,
    status: "completed" | "failed",
    startedAt: Date,
    usage: Record<string, number>,
  ): Promise<void> {
    const completedAt = new Date();
    try {
      await this.options.telemetry?.record({
        eventVersion: "1.0.0",
        id: `telemetry.provider.${request.stage}.${startedAt.getTime()}.${status}`,
        type: "provider",
        occurredAt: completedAt.toISOString(),
        stage: request.stage,
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        status,
        attributes: {
          provider: this.providerName,
          model: this.options.model,
          operation: request.operationLabel,
          ...usage,
        },
      });
    } catch {
      // Telemetry is best-effort and must never alter provider execution semantics.
    }
  }
}

function tokenUsage(payload: unknown): Record<string, number> {
  if (!isRecord(payload) || !isRecord(payload.usage)) return {};
  const usage: Record<string, number> = {};
  for (const [source, target] of [["input_tokens", "inputTokens"], ["output_tokens", "outputTokens"], ["total_tokens", "totalTokens"]] as const) {
    if (typeof payload.usage[source] === "number") usage[target] = payload.usage[source];
  }
  return usage;
}

function extractOutputText(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return undefined;
  for (const output of value.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
