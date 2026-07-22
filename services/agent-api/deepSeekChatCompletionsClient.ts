import { AgentPipelineError } from "../../packages/agent-core/src/index";
import type {
  StructuredGenerationRequest,
  StructuredGenerationResult,
  StructuredGenerationUsage,
  StructuredOutputCapability,
  StructuredOutputProvider,
} from "../../packages/agent-core/src/index";
import type { AgentTelemetrySink } from "../../packages/agent-evaluation/src/index";
import type { FetchImplementation } from "./openAiStructuredOutputClient";

export type DeepSeekModel = "deepseek-v4-flash" | "deepseek-v4-pro";

export type DeepSeekChatCompletionsClientOptions = {
  apiKey: string;
  model: DeepSeekModel;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImplementation;
  telemetry?: AgentTelemetrySink;
};

export class DeepSeekChatCompletionsClient implements StructuredOutputProvider {
  readonly providerId = "deepseek-chat-completions";
  readonly capabilities: StructuredOutputCapability = {
    transport: "chat-completions",
    jsonMode: "json-object",
    supportsServerSideJsonSchema: false,
    supportsJsonObjectMode: true,
    supportsThinkingControl: true,
    supportsUsageMetadata: true,
    supportsRequestCancellation: true,
  };
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchImplementation;

  constructor(private readonly options: DeepSeekChatCompletionsClientOptions) {
    if (!options.apiKey.trim()) throw new Error("DeepSeek API key is required.");
    if (!isDeepSeekModel(options.model)) throw new Error("DeepSeek model must be deepseek-v4-flash or deepseek-v4-pro.");
    this.baseUrl = (options.baseUrl ?? "https://api.deepseek.com").replace(/\/$/u, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateStructured<T>(request: StructuredGenerationRequest, signal?: AbortSignal): Promise<StructuredGenerationResult<T>> {
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
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            {
              role: "system",
              content: `${request.instructions} The required JSON schema named ${request.schemaName} is: ${JSON.stringify(request.schema)}`,
            },
            { role: "user", content: JSON.stringify(request.input) },
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          stream: false,
          temperature: 0,
          max_tokens: request.maxOutputTokens,
        }),
      });
      if (!response.ok) {
        throw new AgentPipelineError("LLM_PROVIDER_UNAVAILABLE", `DeepSeek Chat Completions API returned HTTP ${response.status}.`, request.stage, { provider: this.providerId, status: response.status });
      }
      let payload: unknown;
      try {
        payload = await response.json() as unknown;
      } catch {
        throw new AgentPipelineError("LLM_RESPONSE_INVALID", `DeepSeek ${request.operationLabel} response is not valid JSON.`, request.stage, { provider: this.providerId });
      }
      const completion = extractCompletion(payload);
      if (!completion.content) {
        throw new AgentPipelineError("LLM_RESPONSE_INVALID", `DeepSeek response did not contain structured ${request.operationLabel} content.`, request.stage, { provider: this.providerId });
      }
      if (completion.finishReason !== "stop") {
        throw new AgentPipelineError("LLM_RESPONSE_INVALID", `DeepSeek ${request.operationLabel} ended with finish reason ${completion.finishReason ?? "unknown"}.`, request.stage, { provider: this.providerId, finishReason: completion.finishReason ?? "unknown" });
      }
      let value: T;
      try {
        value = JSON.parse(completion.content) as T;
      } catch {
        throw new AgentPipelineError("LLM_RESPONSE_INVALID", `DeepSeek structured ${request.operationLabel} content is not valid JSON.`, request.stage, { provider: this.providerId });
      }
      const usage = tokenUsage(payload);
      await this.recordTelemetry(request, "completed", startedAt, usage);
      return { value, providerId: this.providerId, modelId: this.options.model, usage };
    } catch (error) {
      await this.recordTelemetry(request, "failed", startedAt, {});
      if (error instanceof AgentPipelineError) throw error;
      if (signal?.aborted) throw new AgentPipelineError("PIPELINE_CANCELLED", `LLM ${request.operationLabel} was cancelled.`, request.stage);
      throw new AgentPipelineError(
        "LLM_PROVIDER_UNAVAILABLE",
        timedOut ? `DeepSeek ${request.operationLabel} exceeded ${this.timeoutMs} ms.` : `DeepSeek ${request.operationLabel} request failed.`,
        request.stage,
        { provider: this.providerId, timeoutMs: this.timeoutMs },
      );
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  private async recordTelemetry(
    request: StructuredGenerationRequest,
    status: "completed" | "failed",
    startedAt: Date,
    usage: StructuredGenerationUsage,
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
          provider: this.providerId,
          transport: this.capabilities.transport,
          jsonMode: this.capabilities.jsonMode,
          model: this.options.model,
          operation: request.operationLabel,
          ...usage,
        },
      });
    } catch {
      // Telemetry is best-effort and never changes provider execution semantics.
    }
  }
}

export function isDeepSeekModel(value: string): value is DeepSeekModel {
  return value === "deepseek-v4-flash" || value === "deepseek-v4-pro";
}

function extractCompletion(value: unknown): { content?: string; finishReason?: string } {
  if (!isRecord(value) || !Array.isArray(value.choices)) return {};
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return {};
  return {
    content: typeof choice.message.content === "string" && choice.message.content.trim() ? choice.message.content : undefined,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : undefined,
  };
}

function tokenUsage(payload: unknown): StructuredGenerationUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) return {};
  return {
    inputTokens: typeof payload.usage.prompt_tokens === "number" ? payload.usage.prompt_tokens : undefined,
    outputTokens: typeof payload.usage.completion_tokens === "number" ? payload.usage.completion_tokens : undefined,
    totalTokens: typeof payload.usage.total_tokens === "number" ? payload.usage.total_tokens : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
