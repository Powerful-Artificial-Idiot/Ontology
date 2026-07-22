import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AGENT_CONTRACT_VERSION, type AgentTurnResource } from "../../packages/knowledge-contracts/src/index";
import { AgentPipelineError } from "../../packages/agent-core/src/index";
import { createAgentApi, type AgentApiRuntime } from "../../services/agent-api/app";
import { createInMemoryAgentApiRuntime } from "../../services/agent-api/runtime";

const question = "OP30 Leak Rate is recently abnormal. Which products, equipment, quality risks, and documents may be affected?";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("Deterministic Agent API", () => {
  it("persists sessions and turns and exposes trace, evidence, and audit resources", async () => {
    const { baseUrl } = await startApi();
    const health = await fetchJson(`${baseUrl}/health`);
    const scenarios = await fetchJson(`${baseUrl}/scenarios`);
    const created = await fetchJson(`${baseUrl}/sessions`, {
      method: "POST",
      body: JSON.stringify({ contractVersion: AGENT_CONTRACT_VERSION, scenarioId: "quality-issue-trace", mode: "live", language: "en" }),
    });
    const sessionId = created.payload.session.id as string;

    const first = await executeTurn(baseUrl, sessionId, "api-turn-1");
    const second = await executeTurn(baseUrl, sessionId, "api-turn-2");
    const turnId = (first.payload as AgentTurnResource).turn.response.turnId;

    const [session, turns, trace, evidence, audit] = await Promise.all([
      fetchJson(`${baseUrl}/sessions/${sessionId}`),
      fetchJson(`${baseUrl}/sessions/${sessionId}/turns`),
      fetchJson(`${baseUrl}/turns/${turnId}/trace`),
      fetchJson(`${baseUrl}/turns/${turnId}/evidence`),
      fetchJson(`${baseUrl}/sessions/${sessionId}/audit`),
    ]);

    expect(health.payload).toMatchObject({ status: "ok", contractVersion: "1.0.0", pipeline: "deterministic", semanticParser: "deterministic", answerComposer: "template", documentEvidence: "governed", persistence: "in-memory" });
    expect(scenarios.payload.scenarios).toHaveLength(1);
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);
    expect(session.payload.session.turnIds).toHaveLength(2);
    expect(session.payload.session.context.previousTurnIds).toHaveLength(2);
    expect(turns.payload.turns).toHaveLength(2);
    expect(trace.payload.trace.stages).toHaveLength(9);
    expect(evidence.payload.evidencePack.items.length).toBeGreaterThan(0);
    expect(evidence.payload.citationValidation.status).toBe("passed");
    expect(audit.payload.events.map((event: { outcome: string }) => event.outcome)).toEqual(["completed", "completed"]);
    expect(JSON.stringify(turns.payload)).not.toContain("chain-of-thought");
  });

  it("returns shared, stable error envelopes for invalid contracts and clarification", async () => {
    const { baseUrl } = await startApi();
    const incompatible = await fetchJson(`${baseUrl}/sessions`, {
      method: "POST",
      body: JSON.stringify({ contractVersion: "9.0.0", scenarioId: "quality-issue-trace", mode: "live", language: "en" }),
    });
    const created = await fetchJson(`${baseUrl}/sessions`, {
      method: "POST",
      body: JSON.stringify({ contractVersion: AGENT_CONTRACT_VERSION, scenarioId: "quality-issue-trace", mode: "live", language: "en" }),
    });
    const sessionId = created.payload.session.id as string;
    const clarification = await fetchJson(`${baseUrl}/sessions/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify(turnRequest(sessionId, "clarification", "Please investigate the line.")),
    });

    expect(incompatible.response.status).toBe(409);
    expect(incompatible.payload.error.code).toBe("AGENT_CONTRACT_INCOMPATIBLE");
    expect(incompatible.payload.traceId).toBeTruthy();
    expect(clarification.response.status).toBe(422);
    expect(clarification.payload.error).toMatchObject({ code: "CLARIFICATION_REQUIRED", stage: "semantic-parsing" });
    const turns = await fetchJson(`${baseUrl}/sessions/${sessionId}/turns`);
    expect(turns.payload.turns).toHaveLength(0);
  });

  it("cancels a turn when the server deadline expires", async () => {
    const baseRuntime = createInMemoryAgentApiRuntime();
    const runtime: AgentApiRuntime = {
      ...baseRuntime,
      timeoutMs: 5,
      client: {
        startSession: (options) => baseRuntime.client.startSession(options),
        runTurn: (_request, signal) => new Promise((_, reject) => {
          const fail = () => reject(new AgentPipelineError("PIPELINE_CANCELLED", "Cancelled by API deadline."));
          if (signal?.aborted) fail();
          else signal?.addEventListener("abort", fail, { once: true });
        }),
      },
    };
    const { baseUrl } = await startApi(runtime);
    const created = await fetchJson(`${baseUrl}/sessions`, {
      method: "POST",
      body: JSON.stringify({ contractVersion: AGENT_CONTRACT_VERSION, scenarioId: "quality-issue-trace", mode: "live", language: "en" }),
    });
    const sessionId = created.payload.session.id as string;
    const result = await fetchJson(`${baseUrl}/sessions/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify(turnRequest(sessionId, "timeout", question)),
    });

    expect(result.response.status).toBe(504);
    expect(result.payload.error.code).toBe("REQUEST_TIMEOUT");
  });
});

function executeTurn(baseUrl: string, sessionId: string, requestId: string) {
  return fetchJson(`${baseUrl}/sessions/${sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify(turnRequest(sessionId, requestId, question)),
  });
}

function turnRequest(sessionId: string, requestId: string, message: string) {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    sessionId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: "en",
    message,
    requestedAt: "2026-07-16T00:00:00.000Z",
  };
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  return { response, payload: await response.json() as any };
}

async function startApi(runtime = createInMemoryAgentApiRuntime()) {
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
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
