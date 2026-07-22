import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAgentApi } from "../../services/agent-api/app";
import { createInMemoryAgentApiRuntime } from "../../services/agent-api/runtime";
import { ApiAgentClient } from "../../src/features/agent-demo/apiAgentClient";
import type { AgentRunEvent } from "../../src/features/agent-demo/agentClient";

describe("ApiAgentClient", () => {
  let server: Server;
  let client: ApiAgentClient;

  beforeAll(async () => {
    server = createServer(createAgentApi(createInMemoryAgentApiRuntime()));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Agent API did not allocate a TCP port.");
    client = new ApiAgentClient(`http://127.0.0.1:${address.port}/api/agent`);
  });

  afterAll(async () => {
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("maps the deterministic API response to the existing frontend Turn Bundle", async () => {
    const scenarios = await client.listScenarios();
    const session = await client.startSession("quality-issue-trace", "en");
    const events: AgentRunEvent[] = [];
    await client.runTurn({
      sessionId: session.id,
      scenarioId: session.scenarioId,
      userMessage: "OP30 Leak Rate is recently abnormal. Which products, equipment, quality risks, and documents may be affected?",
      language: "en",
      previousTurns: [],
      sharedContext: session.sharedContext,
      onEvent: (event) => events.push(event),
    });

    const completed = events.find((event) => event.type === "turn-completed");
    const accepted = events.find((event) => event.type === "run-accepted");
    expect(client.runtimeMode).toBe("api");
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "quality-issue-trace",
      "engineering-change-impact",
      "bottleneck-analysis",
    ]);
    expect(completed?.type).toBe("turn-completed");
    expect(accepted).toMatchObject({ type: "run-accepted", turnId: expect.stringMatching(/^turn\./u), runId: expect.stringMatching(/^run\./u) });
    if (!completed || completed.type !== "turn-completed") throw new Error("Missing completed event.");
    expect(completed.turn.trace).toHaveLength(9);
    expect(completed.turn.references.length).toBeGreaterThan(0);
    expect(completed.turn.relatedObjects.map((object) => object.id)).toContain("operation.op30");
    expect(completed.turn.agentResponse?.citations.length).toBeGreaterThan(0);
    expect(completed.sharedContext.resolvedEntities.map((object) => object.id)).toContain("quality-characteristic.leak-rate");

    const details = await client.getTurnDetails(completed.turn.id);
    expect(details.trace).toHaveLength(9);
    expect(details.references.map((reference) => reference.id)).toEqual(completed.turn.references.map((reference) => reference.id));
  });
});
