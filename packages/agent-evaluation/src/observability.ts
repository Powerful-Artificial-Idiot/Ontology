import type { AgentPipelineEvent, AgentRunEvent } from "../../knowledge-contracts/src/index";
import type { AgentTelemetryEvent, AgentTelemetrySink } from "./types";

const sensitiveKeyPattern = /(api.?key|authorization|^token$|access.?token|refresh.?token|bearer.?token|password|secret|prompt|raw.?output|chain.?of.?thought)/iu;

export class NoopAgentTelemetrySink implements AgentTelemetrySink {
  record(): void {}
}

export class InMemoryAgentTelemetrySink implements AgentTelemetrySink {
  private readonly records: AgentTelemetryEvent[] = [];

  record(event: AgentTelemetryEvent): void {
    this.records.push(clone(event));
  }

  list(): AgentTelemetryEvent[] {
    return this.records.map(clone);
  }
}

export class RedactingAgentTelemetrySink implements AgentTelemetrySink {
  constructor(private readonly delegate: AgentTelemetrySink) {}

  record(event: AgentTelemetryEvent): void | Promise<void> {
    return this.delegate.record({
      ...event,
      attributes: Object.fromEntries(Object.entries(event.attributes).map(([key, value]) => [key, sensitiveKeyPattern.test(key) ? "[REDACTED]" : value])),
    });
  }
}

export class LocalJsonlAgentTelemetrySink implements AgentTelemetrySink {
  private initialized = false;

  constructor(private readonly path: string) {}

  async record(event: AgentTelemetryEvent): Promise<void> {
    if (!this.initialized) {
      await mkdir(dirname(this.path), { recursive: true });
      this.initialized = true;
    }
    await appendFile(this.path, `${JSON.stringify(event)}\n`, "utf8");
  }
}

export function pipelineEventToTelemetry(event: AgentPipelineEvent): AgentTelemetryEvent {
  const stage = "stage" in event ? event.stage : undefined;
  const durationMs = stage && "durationMs" in stage && typeof stage.durationMs === "number" ? stage.durationMs : undefined;
  const errorCode = stage && "errorCode" in stage && typeof stage.errorCode === "string" ? stage.errorCode : undefined;
  return {
    eventVersion: "1.0.0",
    id: `telemetry.${event.traceId}.${event.type}.${stage?.id ?? "pipeline"}`,
    type: "pipeline",
    occurredAt: event.occurredAt,
    traceId: event.traceId,
    stage: stage?.stage,
    durationMs,
    status: event.type,
    attributes: {
      requestId: event.requestId,
      turnId: event.turnId,
      ...(stage?.tool ? { tool: stage.tool } : {}),
      ...(errorCode ? { errorCode } : {}),
    },
  };
}

export function runEventToTelemetry(event: AgentRunEvent): AgentTelemetryEvent {
  return {
    eventVersion: "1.0.0",
    id: `telemetry.${event.id}`,
    type: "run",
    occurredAt: event.occurredAt,
    runId: event.runId,
    traceId: event.pipelineEvent?.traceId,
    stage: event.pipelineEvent && "stage" in event.pipelineEvent ? event.pipelineEvent.stage.stage : undefined,
    status: event.type,
    attributes: {
      sequence: event.sequence,
      sessionId: event.sessionId,
      turnId: event.turnId,
      ...(event.error ? { errorCode: event.error.code } : {}),
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
