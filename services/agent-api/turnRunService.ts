import { randomUUID } from "node:crypto";
import type {
  AgentError,
  AgentPipelineEvent,
  AgentRunEvent,
  AgentTurnRequest,
  AgentTurnRun,
} from "../../packages/knowledge-contracts/src/index";
import {
  AgentPipelineError,
  type AgentRunEventStore,
  type AgentRunStore,
  type DeterministicAgentClient,
} from "../../packages/agent-core/src/index";

type RunListener = (event: AgentRunEvent) => void;

export type AgentTurnRunServiceOptions = {
  client: Pick<DeterministicAgentClient, "runTurn">;
  runs: AgentRunStore;
  events: AgentRunEventStore;
  timeoutMs?: number;
  now?: () => Date;
};

export class AgentTurnRunService {
  private readonly listeners = new Map<string, Set<RunListener>>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: AgentTurnRunServiceOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? (() => new Date());
  }

  async create(request: AgentTurnRequest, retryOf?: AgentTurnRun): Promise<AgentTurnRun> {
    const createdAt = this.now().toISOString();
    const runId = `run.${randomUUID()}`;
    const turnId = expectedTurnId(request.requestId);
    const run: AgentTurnRun = {
      id: runId,
      sessionId: request.sessionId ?? "",
      requestId: request.requestId,
      turnId,
      request: cloneJson(request),
      status: "queued",
      attempt: retryOf ? retryOf.attempt + 1 : 1,
      retryOfRunId: retryOf?.id,
      createdAt,
    };
    await this.options.runs.create(run);
    await this.appendEvent(run, "run-queued");
    queueMicrotask(() => void this.execute(run.id));
    return cloneJson(run);
  }

  async retry(runId: string): Promise<AgentTurnRun> {
    const previous = await this.options.runs.get(runId);
    if (!previous) throw new AgentPipelineError("RUN_NOT_FOUND", `Run not found: ${runId}`);
    if (previous.status !== "failed" && previous.status !== "cancelled") {
      throw new AgentPipelineError("RUN_NOT_RETRYABLE", `Only failed or cancelled runs can be retried: ${runId}`);
    }
    const request: AgentTurnRequest = {
      ...cloneJson(previous.request),
      requestId: `${previous.request.requestId}.retry-${previous.attempt + 1}-${randomUUID().slice(0, 8)}`,
      requestedAt: this.now().toISOString(),
    };
    return this.create(request, previous);
  }

  async get(runId: string): Promise<AgentTurnRun | null> {
    return this.options.runs.get(runId);
  }

  async eventsAfter(runId: string, afterSequence = 0): Promise<AgentRunEvent[]> {
    return this.options.events.list(runId, afterSequence);
  }

  subscribe(runId: string, listener: RunListener): () => void {
    const listeners = this.listeners.get(runId) ?? new Set<RunListener>();
    listeners.add(listener);
    this.listeners.set(runId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(runId);
    };
  }

  cancel(runId: string): boolean {
    const controller = this.controllers.get(runId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private async execute(runId: string): Promise<void> {
    const run = await this.options.runs.get(runId);
    if (!run || run.status !== "queued") return;
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      run.status = "running";
      run.startedAt = this.now().toISOString();
      await this.options.runs.save(run);
      await this.appendEvent(run, "run-started");
      await this.options.client.runTurn(run.request, controller.signal, (event) => this.appendPipelineEvent(run, event));
      run.status = "completed";
      run.completedAt = this.now().toISOString();
      await this.options.runs.save(run);
      await this.appendEvent(run, "run-completed");
    } catch (error) {
      const mapped = mapRunError(error, timedOut);
      run.status = mapped.code === "PIPELINE_CANCELLED" ? "cancelled" : "failed";
      run.error = mapped;
      run.completedAt = this.now().toISOString();
      await this.options.runs.save(run);
      await this.appendEvent(run, run.status === "cancelled" ? "run-cancelled" : "run-failed", undefined, mapped);
    } finally {
      globalThis.clearTimeout(timeout);
      this.controllers.delete(runId);
    }
  }

  private async appendPipelineEvent(run: AgentTurnRun, pipelineEvent: AgentPipelineEvent): Promise<void> {
    await this.appendEvent(run, "pipeline-event", pipelineEvent);
  }

  private async appendEvent(
    run: AgentTurnRun,
    type: AgentRunEvent["type"],
    pipelineEvent?: AgentPipelineEvent,
    error?: AgentError,
  ): Promise<void> {
    const current = await this.options.events.list(run.id);
    const sequence = current.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1;
    const event: AgentRunEvent = {
      id: `${run.id}:${sequence}`,
      sequence,
      runId: run.id,
      sessionId: run.sessionId,
      turnId: run.turnId,
      type,
      occurredAt: this.now().toISOString(),
      pipelineEvent,
      error,
    };
    await this.options.events.append(event);
    this.listeners.get(run.id)?.forEach((listener) => listener(cloneJson(event)));
  }
}

export function isTerminalRun(run: AgentTurnRun): boolean {
  return run.status === "completed" || run.status === "failed" || run.status === "cancelled";
}

function expectedTurnId(requestId: string): string {
  return `turn.${requestId.replace(/[^a-zA-Z0-9._-]/gu, "-")}`;
}

function mapRunError(error: unknown, timedOut: boolean): AgentError {
  if (timedOut) return { code: "REQUEST_TIMEOUT", message: "Agent turn exceeded the server deadline.", details: {} };
  if (error instanceof AgentPipelineError) return cloneJson(error.detail);
  return {
    code: "PIPELINE_FAILED",
    message: error instanceof Error ? error.message : "The Agent pipeline failed.",
    details: {},
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
