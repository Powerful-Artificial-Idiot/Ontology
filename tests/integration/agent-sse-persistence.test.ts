import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_CONTRACT_VERSION,
  type AgentRunEvent,
  type AgentTurnRun,
  type AgentTurnRunResource,
} from "../../packages/knowledge-contracts/src/index";
import { AgentPipelineError } from "../../packages/agent-core/src/index";
import { createAgentApi, type AgentApiRuntime } from "../../services/agent-api/app";
import { createConfiguredAgentApiRuntime, createInMemoryAgentApiRuntime } from "../../services/agent-api/runtime";
import { FileAgentRunEventStore, FileAgentRunStore, FileAgentStore } from "../../services/agent-api/persistentStore";
import { AgentTurnRunService } from "../../services/agent-api/turnRunService";
import { ApiAgentClient } from "../../src/features/agent-demo/apiAgentClient";
import type { AgentRunEvent as AgentUiRunEvent } from "../../src/features/agent-demo/agentClient";

const question = "OP30 Leak Rate is recently abnormal. Which products, equipment, quality risks, and documents may be affected?";
const servers: Server[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Agent SSE runs and persistent sessions", () => {
  it("streams deterministic pipeline stages and replays only events after the supplied cursor", async () => {
    const { baseUrl } = await startApi(createInMemoryAgentApiRuntime());
    const sessionId = await createSession(baseUrl);
    const created = await createRun(baseUrl, sessionId, "sse-run-1");
    const events = await readSse(`${baseUrl}/runs/${created.run.id}/events`);

    expect(events[0]?.type).toBe("run-queued");
    expect(events.at(-1)?.type).toBe("run-completed");
    const pipelineEvents = events.filter((event) => event.type === "pipeline-event");
    expect(pipelineEvents.filter((event) => event.pipelineEvent?.type === "stage-started")).toHaveLength(9);
    expect(pipelineEvents.filter((event) => event.pipelineEvent?.type === "stage-completed")).toHaveLength(9);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));

    const cursor = 8;
    const replay = await readSse(`${baseUrl}/runs/${created.run.id}/events?after=${cursor}`, { "Last-Event-ID": `${created.run.id}:${cursor}` });
    expect(replay.length).toBeGreaterThan(0);
    expect(replay.every((event) => event.sequence > cursor)).toBe(true);
    expect(new Set(replay.map((event) => event.sequence)).size).toBe(replay.length);

    const turn = await fetchJson(`${baseUrl}/turns/${created.run.turnId}`);
    expect(turn.response.status).toBe(200);
    expect(turn.payload.turn.response.citationValidation.status).toBe("passed");
  });

  it("restores sessions, turns, audit, runs, and replayable events after runtime restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-store-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "agent-store.json");
    const environment = { MKG_AGENT_KNOWLEDGE_MODE: "mock", MKG_AGENT_STORE_MODE: "file", MKG_AGENT_STORE_PATH: storePath };
    const firstRuntime = await createConfiguredAgentApiRuntime(environment);
    const first = await startApi(firstRuntime);
    const sessionId = await createSession(first.baseUrl);
    const created = await createRun(first.baseUrl, sessionId, "persistent-run-1");
    const originalEvents = await readSse(`${first.baseUrl}/runs/${created.run.id}/events`);
    await closeServer(first.server);
    await firstRuntime.close();

    const secondRuntime = await createConfiguredAgentApiRuntime(environment);
    const second = await startApi(secondRuntime);
    const [session, turns, audit, run, replay] = await Promise.all([
      fetchJson(`${second.baseUrl}/sessions/${sessionId}`),
      fetchJson(`${second.baseUrl}/sessions/${sessionId}/turns`),
      fetchJson(`${second.baseUrl}/sessions/${sessionId}/audit`),
      fetchJson(`${second.baseUrl}/runs/${created.run.id}`),
      readSse(`${second.baseUrl}/runs/${created.run.id}/events`),
    ]);

    expect(session.payload.session.turnIds).toEqual([created.run.turnId]);
    expect(turns.payload.turns).toHaveLength(1);
    expect(audit.payload.events.at(-1).outcome).toBe("completed");
    expect(run.payload.run.status).toBe("completed");
    expect(replay).toEqual(originalEvents);
    await secondRuntime.close();
  });

  it("retries only a failed run and creates a distinct attempt", async () => {
    const base = createInMemoryAgentApiRuntime();
    let attempts = 0;
    const client = {
      startSession: (options: Parameters<typeof base.client.startSession>[0]) => base.client.startSession(options),
      runTurn: (...args: Parameters<typeof base.client.runTurn>) => {
        attempts += 1;
        if (attempts === 1) throw new AgentPipelineError("PIPELINE_FAILED", "Planned first-attempt failure.");
        return base.client.runTurn(...args);
      },
    };
    const runtime: AgentApiRuntime = {
      ...base,
      client,
      runService: new AgentTurnRunService({ client, runs: base.runs, events: base.runEvents }),
    };
    const { baseUrl } = await startApi(runtime);
    const apiClient = new ApiAgentClient(baseUrl);
    await apiClient.listScenarios();
    const session = await apiClient.startSession("quality-issue-trace", "en");
    const firstEvents: AgentUiRunEvent[] = [];
    const options = {
      sessionId: session.id,
      scenarioId: session.scenarioId,
      userMessage: question,
      language: "en" as const,
      previousTurns: session.turns,
      sharedContext: session.sharedContext,
      onEvent: (event: AgentUiRunEvent) => firstEvents.push(event),
    };
    await expect(apiClient.runTurn(options)).rejects.toThrow("Planned first-attempt failure");
    const firstAccepted = firstEvents.find((event) => event.type === "run-accepted");
    expect(firstAccepted?.type).toBe("run-accepted");
    if (!firstAccepted || firstAccepted.type !== "run-accepted") throw new Error("Missing failed run identifier.");

    const retryEvents: AgentUiRunEvent[] = [];
    await apiClient.retryRun(firstAccepted.runId, { ...options, onEvent: (event) => retryEvents.push(event) });
    const retryAccepted = retryEvents.find((event) => event.type === "run-accepted");
    expect(retryAccepted?.type).toBe("run-accepted");
    expect(retryEvents.at(-1)?.type).toBe("turn-completed");
    if (!retryAccepted || retryAccepted.type !== "run-accepted") throw new Error("Missing retry run identifier.");
    expect(retryAccepted.runId).not.toBe(firstAccepted.runId);

    const retryRun = await fetchJson(`${baseUrl}/runs/${retryAccepted.runId}`);
    expect(retryRun.payload.run).toMatchObject({ attempt: 2, retryOfRunId: firstAccepted.runId, status: "completed" });
    const invalidRetry = await fetchJson(`${baseUrl}/runs/${retryAccepted.runId}/retry`, { method: "POST", body: "{}" });
    expect(invalidRetry.response.status).toBe(409);
    expect(invalidRetry.payload.error.code).toBe("RUN_NOT_RETRYABLE");
  });

  it("marks an interrupted persisted run as failed and appends a replayable terminal event", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-interrupted-"));
    temporaryDirectories.push(directory);
    const storePath = join(directory, "agent-store.json");
    const firstStore = new FileAgentStore(storePath);
    await firstStore.initialize();
    const run: AgentTurnRun = {
      id: "run.interrupted",
      sessionId: "session.interrupted",
      requestId: "request.interrupted",
      turnId: "turn.request.interrupted",
      request: {
        contractVersion: AGENT_CONTRACT_VERSION,
        requestId: "request.interrupted",
        sessionId: "session.interrupted",
        scenarioId: "quality-issue-trace",
        mode: "live",
        language: "en",
        message: question,
      },
      status: "running",
      attempt: 1,
      createdAt: "2026-07-22T00:00:00.000Z",
      startedAt: "2026-07-22T00:00:01.000Z",
    };
    await new FileAgentRunStore(firstStore).create(run);

    const recoveredStore = new FileAgentStore(storePath);
    await recoveredStore.initialize();
    const recovered = await new FileAgentRunStore(recoveredStore).get(run.id);
    const events = await new FileAgentRunEventStore(recoveredStore).list(run.id);

    expect(recovered).toMatchObject({ status: "failed", error: { code: "RUN_INTERRUPTED" } });
    expect(events.at(-1)).toMatchObject({ type: "run-failed", error: { code: "RUN_INTERRUPTED" } });
  });
});

async function createSession(baseUrl: string): Promise<string> {
  const result = await fetchJson(`${baseUrl}/sessions`, {
    method: "POST",
    body: JSON.stringify({ contractVersion: AGENT_CONTRACT_VERSION, scenarioId: "quality-issue-trace", mode: "live", language: "en" }),
  });
  return result.payload.session.id as string;
}

async function createRun(baseUrl: string, sessionId: string, requestId: string): Promise<AgentTurnRunResource> {
  const result = await fetchJson(`${baseUrl}/sessions/${sessionId}/runs`, {
    method: "POST",
    body: JSON.stringify({
      contractVersion: AGENT_CONTRACT_VERSION,
      requestId,
      sessionId,
      scenarioId: "quality-issue-trace",
      mode: "live",
      language: "en",
      message: question,
      requestedAt: "2026-07-22T00:00:00.000Z",
    }),
  });
  expect(result.response.status).toBe(202);
  return result.payload as AgentTurnRunResource;
}

async function readSse(url: string, headers: Record<string, string> = {}): Promise<AgentRunEvent[]> {
  const response = await fetch(url, { headers: { Accept: "text/event-stream", ...headers } });
  expect(response.status).toBe(200);
  const text = await response.text();
  return text.split(/\r?\n\r?\n/u).flatMap((frame) => {
    const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    return data ? [JSON.parse(data) as AgentRunEvent] : [];
  });
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  return { response, payload: await response.json() as any };
}

async function startApi(runtime: AgentApiRuntime) {
  const server = createServer(createAgentApi(runtime));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Agent API did not allocate a TCP port.");
  return { server, baseUrl: `http://127.0.0.1:${address.port}/api/agent` };
}

async function closeServer(server: Server) {
  const index = servers.indexOf(server);
  if (index >= 0) servers.splice(index, 1);
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
