import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentPipelineError,
  InMemoryAgentRunEventStore,
  InMemoryAgentRunStore,
  SystemAgentClock,
  createDeterministicAgentClient,
} from "../../packages/agent-core/src/index";
import { AGENT_CONTRACT_VERSION, type AgentTurnRequest, type AgentTurnResponse, type AgentTurnRun } from "../../packages/knowledge-contracts/src/index";
import type { EvaluationCheck, EvaluationMetric, RuntimeProbeResult } from "../../packages/agent-evaluation/src/index";
import { AgentTurnRunService, isTerminalRun } from "./turnRunService";
import {
  FileAgentAuditStore,
  FileAgentRunEventStore,
  FileAgentRunStore,
  FileAgentSessionStore,
  FileAgentStore,
  FileAgentTurnStore,
} from "./persistentStore";

export async function runAgentRuntimeProbes(): Promise<RuntimeProbeResult[]> {
  return [await sequenceReplayProbe(), await persistenceRecoveryProbe(), await retryProbe(), await timeoutProbe(), await cancellationProbe()];
}

async function persistenceRecoveryProbe(): Promise<RuntimeProbeResult> {
  const directory = await mkdtemp(join(tmpdir(), "mkg-agent-evaluation-"));
  const path = join(directory, "agent-store.json");
  try {
    const store = new FileAgentStore(path);
    await store.initialize();
    const sessions = new FileAgentSessionStore(store);
    const turns = new FileAgentTurnStore(store);
    const audit = new FileAgentAuditStore(store);
    const runs = new FileAgentRunStore(store);
    const events = new FileAgentRunEventStore(store);
    const core = createDeterministicAgentClient(new SystemAgentClock(), {}, { sessions, turns, audit });
    await core.client.startSession({ id: "runtime-probe.persistence", scenarioId: "quality-issue-trace", mode: "live", language: "en" });
    const service = new AgentTurnRunService({ client: core.client, runs, events });
    const created = await service.create(request("runtime-probe.persistence", "runtime-probe.persistence"));
    const completed = await waitForTerminal(service, created.id);
    await waitForTerminalEvent(service, created.id);

    const recoveredStore = new FileAgentStore(path);
    await recoveredStore.initialize();
    const recoveredSession = await new FileAgentSessionStore(recoveredStore).get("runtime-probe.persistence");
    const recoveredTurns = await new FileAgentTurnStore(recoveredStore).listBySession("runtime-probe.persistence");
    const recoveredRun = await new FileAgentRunStore(recoveredStore).get(created.id);
    const recoveredEvents = await new FileAgentRunEventStore(recoveredStore).list(created.id);
    return probe("runtime.persistence-recovery", [
      runtimeCheck("source-completed", completed.status === "completed", "Source run completed before restart simulation."),
      runtimeCheck("session-recovered", recoveredSession?.turnIds.length === 1, "Session and completed turn reference survive store reload."),
      runtimeCheck("turn-recovered", recoveredTurns.length === 1, "Persisted Turn Bundle survives store reload."),
      runtimeCheck("run-recovered", recoveredRun?.status === "completed", "Terminal run state survives store reload."),
      runtimeCheck("events-recovered", recoveredEvents.length > 0 && recoveredEvents.at(-1)?.type === "run-completed", "SSE event history survives store reload."),
    ], [technicalMetric("recovered-event-count", "count", recoveredEvents.length)]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function sequenceReplayProbe(): Promise<RuntimeProbeResult> {
  const core = createDeterministicAgentClient(new SystemAgentClock());
  await core.client.startSession({ id: "runtime-probe.sequence", scenarioId: "quality-issue-trace", mode: "live", language: "en" });
  const service = serviceFor(core.client);
  const run = await service.create(request("runtime-probe.sequence", "runtime-probe.sequence"));
  const completed = await waitForTerminal(service, run.id);
  const events = await waitForTerminalEvent(service, run.id);
  const cursor = events[Math.min(2, events.length - 1)]?.sequence ?? 0;
  const replay = await service.eventsAfter(run.id, cursor);
  const contiguous = events.every((event, index) => event.sequence === index + 1);
  const replayValid = replay.every((event) => event.sequence > cursor);
  return probe("runtime.sse-sequence-replay", [
    runtimeCheck("run-completed", completed.status === "completed", "Run completed before replay validation."),
    runtimeCheck("sequence-contiguous", contiguous && new Set(events.map((event) => event.sequence)).size === events.length, "SSE event sequence is unique and contiguous."),
    runtimeCheck("cursor-replay", replayValid && replay.length === events.length - cursor, "Cursor replay returns only events after the supplied sequence."),
  ], [technicalMetric("event-count", "count", events.length), technicalMetric("replayed-event-count", "count", replay.length)]);
}

async function retryProbe(): Promise<RuntimeProbeResult> {
  const core = createDeterministicAgentClient(new SystemAgentClock());
  await core.client.startSession({ id: "runtime-probe.retry", scenarioId: "quality-issue-trace", mode: "live", language: "en" });
  let attempts = 0;
  const client = {
    runTurn: async (...args: Parameters<typeof core.client.runTurn>): Promise<AgentTurnResponse> => {
      attempts += 1;
      if (attempts === 1) throw new AgentPipelineError("PIPELINE_FAILED", "Synthetic retry probe failure.");
      return core.client.runTurn(...args);
    },
  };
  const service = serviceFor(client);
  const first = await service.create(request("runtime-probe.retry.first", "runtime-probe.retry"));
  const failed = await waitForTerminal(service, first.id);
  await waitForTerminalEvent(service, first.id);
  const retry = await service.retry(first.id);
  const completed = await waitForTerminal(service, retry.id);
  await waitForTerminalEvent(service, retry.id);
  return probe("runtime.controlled-retry", [
    runtimeCheck("initial-failure", failed.status === "failed", "Initial synthetic failure is persisted."),
    runtimeCheck("retry-completed", completed.status === "completed", "Controlled retry completed."),
    runtimeCheck("retry-link", completed.retryOfRunId === first.id && completed.attempt === 2, "Retry preserves lineage and increments attempt."),
  ], [technicalMetric("attempt-count", "count", attempts)]);
}

async function timeoutProbe(): Promise<RuntimeProbeResult> {
  const service = serviceFor({ runTurn: abortableNeverCompletes }, 10);
  const run = await service.create(request("runtime-probe.timeout", "runtime-probe.timeout"));
  const terminal = await waitForTerminal(service, run.id);
  await waitForTerminalEvent(service, run.id);
  return probe("runtime.timeout", [
    runtimeCheck("timeout-status", terminal.status === "failed", "Timed-out run is marked failed."),
    runtimeCheck("timeout-code", terminal.error?.code === "REQUEST_TIMEOUT", "Timed-out run exposes the governed timeout code."),
  ], [technicalMetric("timeout-budget", "milliseconds", 10)]);
}

async function cancellationProbe(): Promise<RuntimeProbeResult> {
  const service = serviceFor({ runTurn: abortableNeverCompletes }, 2_000);
  const run = await service.create(request("runtime-probe.cancel", "runtime-probe.cancel"));
  await waitForStatus(service, run.id, "running");
  const accepted = service.cancel(run.id);
  const terminal = await waitForTerminal(service, run.id);
  await waitForTerminalEvent(service, run.id);
  return probe("runtime.cancellation", [
    runtimeCheck("cancel-accepted", accepted, "Cancellation reaches an active run."),
    runtimeCheck("cancelled-status", terminal.status === "cancelled", "Cancelled run reaches a terminal cancelled state."),
    runtimeCheck("cancelled-code", terminal.error?.code === "PIPELINE_CANCELLED", "Cancellation exposes the governed error code."),
  ], []);
}

function serviceFor(client: { runTurn: (...args: never[]) => Promise<AgentTurnResponse> }, timeoutMs = 5_000): AgentTurnRunService {
  return new AgentTurnRunService({ client, runs: new InMemoryAgentRunStore(), events: new InMemoryAgentRunEventStore(), timeoutMs });
}

async function abortableNeverCompletes(_request: AgentTurnRequest, signal?: AbortSignal): Promise<AgentTurnResponse> {
  await new Promise<void>((_resolve, reject) => {
    if (signal?.aborted) {
      reject(new AgentPipelineError("PIPELINE_CANCELLED", "Synthetic run cancelled."));
      return;
    }
    signal?.addEventListener("abort", () => reject(new AgentPipelineError("PIPELINE_CANCELLED", "Synthetic run cancelled.")), { once: true });
  });
  throw new AgentPipelineError("PIPELINE_FAILED", "Unreachable runtime probe state.");
}

function request(requestId: string, sessionId: string): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    sessionId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: "en",
    message: "OP30 Leak Rate is abnormal. Which products, equipment, quality risks, and documents may be affected?",
    requestedAt: new Date().toISOString(),
  };
}

async function waitForTerminal(service: AgentTurnRunService, runId: string): Promise<AgentTurnRun> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await service.get(runId);
    if (run && isTerminalRun(run)) return run;
    await delay(5);
  }
  throw new Error(`Runtime probe did not reach a terminal state: ${runId}`);
}

async function waitForStatus(service: AgentTurnRunService, runId: string, status: AgentTurnRun["status"]): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await service.get(runId))?.status === status) return;
    await delay(2);
  }
  throw new Error(`Runtime probe did not reach status ${status}: ${runId}`);
}

async function waitForTerminalEvent(service: AgentTurnRunService, runId: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const events = await service.eventsAfter(runId);
    const type = events.at(-1)?.type;
    if (type === "run-completed" || type === "run-failed" || type === "run-cancelled") return events;
    await delay(5);
  }
  throw new Error(`Runtime probe did not persist a terminal event: ${runId}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function probe(id: string, checks: EvaluationCheck[], metrics: EvaluationMetric[]): RuntimeProbeResult {
  return { id, status: checks.every((check) => check.passed) ? "passed" : "failed", checks, metrics };
}

function runtimeCheck(id: string, passed: boolean, message: string): EvaluationCheck {
  return { id, category: "runtime", severity: "critical", passed, message };
}

function technicalMetric(id: string, unit: EvaluationMetric["unit"], value: number): EvaluationMetric {
  return { id, category: "technical", unit, value };
}
