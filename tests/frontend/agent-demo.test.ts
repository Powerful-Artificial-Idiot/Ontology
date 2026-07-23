import { describe, expect, it } from "vitest";
import type { AgentRunEvent } from "../../src/features/agent-demo/agentClient";
import { agentDemoScenarios } from "../../src/features/agent-demo/agentDemoData";
import type { AgentConversationSession, AgentConversationTurn, AgentLanguage, AgentSharedContext } from "../../src/features/agent-demo/agentDemoTypes";
import { ScriptedAgentClient } from "../../src/features/agent-demo/scriptedAgentClient";

describe("Agent Demo multi-turn scripted boundary", () => {
  it("provides three complete and internally traceable scenarios", () => {
    expect(agentDemoScenarios.map((scenario) => scenario.id)).toEqual([
      "quality-issue-trace",
      "engineering-change-impact",
      "bottleneck-analysis",
    ]);

    agentDemoScenarios.forEach((scenario) => {
      expect(scenario.suggestedQuestions?.length).toBeGreaterThan(0);
      expect(scenario.exampleQuestions).toHaveLength(3);
      expect(scenario.suggestedQuestions?.length).toBeGreaterThanOrEqual(4);
      expect(scenario.suggestedQuestionOptions).toHaveLength(scenario.suggestedQuestions?.length ?? 0);
      expect(scenario.suggestedQuestionOptions?.every((question) => question.zh.length > 0 && question.en.length > 0)).toBe(true);
      expect(scenario.references.length).toBeGreaterThanOrEqual(5);
      const referenceIds = new Set(scenario.references.map((reference) => reference.id));
      const objectIds = new Set(scenario.relatedObjects.map((object) => object.id));
      scenario.steps.forEach((step) => {
        expect(step.referenceIds?.every((id) => referenceIds.has(id)) ?? true).toBe(true);
        expect(step.referencedObjectIds?.every((id) => objectIds.has(id)) ?? true).toBe(true);
      });
      scenario.finalAnswer.citations.forEach((citation) => {
        expect(citation.referenceIds.length).toBeGreaterThan(0);
        expect(citation.referenceIds.every((id) => referenceIds.has(id))).toBe(true);
      });
    });
  });

  it("resolves English suggested questions to the same governed scripted turns", async () => {
    const client = new ScriptedAgentClient(0);
    const scenario = agentDemoScenarios.find((item) => item.id === "quality-issue-trace");
    const englishQuestion = scenario?.suggestedQuestionOptions?.[0]?.en;
    expect(englishQuestion).toBeTruthy();
    const session = await client.startSession("quality-issue-trace");
    const result = await runTurn(client, session, englishQuestion!, [], "en");

    expect(result.turn.userMessage.content).toBe(englishQuestion);
    expect(result.turn.agentResponse?.confidence).toBe("high");
    expect(JSON.stringify(result.turn.agentResponse)).not.toMatch(/[\u3400-\u9fff]/u);
    expect(result.turn.relatedObjects.some((object) => object.id.includes("op30"))).toBe(true);
  });

  it("returns English-only response payloads for every scripted English conversation", async () => {
    const client = new ScriptedAgentClient(0);
    for (const scenario of agentDemoScenarios) {
      let session = await client.startSession(scenario.id);
      const englishQuestions = scenario.suggestedQuestionOptions?.slice(0, 3).map((question) => question.en) ?? [];
      expect(englishQuestions).toHaveLength(3);

      for (const question of englishQuestions) {
        const result = await runTurn(client, session, question, [], "en");
        expect(JSON.stringify(result.turn.agentResponse)).not.toMatch(/[\u3400-\u9fff]/u);
        expect(result.turn.trace.find((step) => step.layer === "answer")?.output.join(" ")).not.toMatch(/[\u3400-\u9fff]/u);
        session = advanceSession(session, result);
      }
    }
  });

  it("starts an empty session and streams an evidence-backed first turn", async () => {
    const client = new ScriptedAgentClient(0);
    const session = await client.startSession("quality-issue-trace");
    const events: AgentRunEvent[] = [];
    const result = await runTurn(client, session, "OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险和文件？", events);

    expect(session.turns).toEqual([]);
    expect(events[0]?.type).toBe("session-started");
    expect(events[1]).toMatchObject({ type: "turn-started" });
    expect(events.filter((event) => event.type === "step-started")).toHaveLength(result.turn.trace.length);
    expect(events.filter((event) => event.type === "step-completed")).toHaveLength(result.turn.trace.length);
    expect(events.at(-1)?.type).toBe("turn-completed");
    expect(result.turn.references.length).toBeGreaterThanOrEqual(5);
    expect(result.turn.agentResponse?.citations.length).toBeGreaterThan(0);
  });

  it("carries governed context through the second and third turns", async () => {
    const client = new ScriptedAgentClient(0);
    let session = await client.startSession("quality-issue-trace");

    const first = await runTurn(client, session, "OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险和文件？");
    session = advanceSession(session, first);
    const second = await runTurn(client, session, "如果问题来自 M220 的测试程序版本变更，还需要检查什么？");
    session = advanceSession(session, second);
    const secondContext = second.turn.trace.find((step) => step.layer === "context");

    expect(secondContext?.input).toContain("Previous completed turns: 1");
    expect(secondContext?.input.some((line) => line.includes("OP30 Leak Test"))).toBe(true);
    expect(secondContext?.input.some((line) => line.includes("M220 Leak Test Bench"))).toBe(true);
    expect(secondContext?.input.some((line) => line.includes("Leak Rate"))).toBe(true);

    const third = await runTurn(client, session, "下一步我应该优先安排哪些验证动作？");
    const thirdContext = third.turn.trace.find((step) => step.layer === "context");
    expect(thirdContext?.input).toContain("Previous completed turns: 2");
    expect(third.turn.references.some((reference) => reference.type === "Validation Record")).toBe(true);
    expect(third.turn.agentResponse?.recommendedActions.length).toBeGreaterThanOrEqual(3);
  });

  it("runs three distinct seven-step conversations for every scenario", async () => {
    const client = new ScriptedAgentClient(0);
    for (const scenario of agentDemoScenarios) {
      let session = await client.startSession(scenario.id);
      expect(session.turns).toEqual([]);
      expect(session.sharedContext.activeTopic).toBeTruthy();
      expect(session.sharedContext.accumulatedReferences).toEqual([]);

      for (const question of scenario.exampleQuestions ?? []) {
        const result = await runTurn(client, session, question);
        expect(result.turn.trace.map((step) => step.layer)).toEqual(["context", "semantic", "ontology", "knowledge", "crossView", "evidence", "answer"]);
        expect(result.turn.viewIndexes.length).toBeGreaterThanOrEqual(3);
        expect(result.turn.references.length).toBeGreaterThan(0);
        expect(result.turn.agentResponse?.citations.length).toBeGreaterThan(0);
        session = advanceSession(session, result);
      }
      expect(session.turns).toHaveLength(3);
      expect(new Set(session.turns.map((turn) => turn.agentResponse?.summary)).size).toBe(3);
    }
  });

  it("stops emitting completion events after cancellation", async () => {
    const client = new ScriptedAgentClient(1);
    const session = await client.startSession("engineering-change-impact");
    const controller = new AbortController();
    const eventTypes: AgentRunEvent["type"][] = [];
    await client.runTurn({
      sessionId: session.id,
      scenarioId: session.scenarioId,
      userMessage: "Program change impact",
      previousTurns: session.turns,
      sharedContext: session.sharedContext,
      signal: controller.signal,
      onEvent: (event) => {
        eventTypes.push(event.type);
        if (event.type === "step-started") controller.abort();
      },
    });

    expect(eventTypes).toEqual(["session-started", "turn-started", "step-started"]);
  });

  it("returns a low-confidence clarification for an unsupported request", async () => {
    const client = new ScriptedAgentClient(0);
    const session = await client.startSession("quality-issue-trace");
    const result = await runTurn(client, session, "请分析一下这个问题");
    expect(result.turn.agentResponse?.confidence).toBe("low");
    expect(result.turn.agentResponse?.assumptions?.length).toBeGreaterThan(0);

    const englishResult = await runTurn(client, session, "Analyze this issue", [], "en");
    expect(englishResult.turn.agentResponse?.confidence).toBe("low");
    expect(JSON.stringify(englishResult.turn.agentResponse)).not.toMatch(/[\u3400-\u9fff]/u);
  });
});

async function runTurn(client: ScriptedAgentClient, session: AgentConversationSession, message: string, events: AgentRunEvent[] = [], language?: AgentLanguage) {
  let completed: { turn: AgentConversationTurn; sharedContext: AgentSharedContext } | undefined;
  await client.runTurn({
    sessionId: session.id,
    scenarioId: session.scenarioId,
    userMessage: message,
    language,
    previousTurns: session.turns,
    sharedContext: session.sharedContext,
    onEvent: (event) => {
      events.push(event);
      if (event.type === "turn-completed") completed = { turn: event.turn, sharedContext: event.sharedContext };
    },
  });
  if (!completed) throw new Error("Expected a completed scripted turn.");
  return completed;
}

function advanceSession(session: AgentConversationSession, result: { turn: AgentConversationTurn; sharedContext: AgentSharedContext }): AgentConversationSession {
  return { ...session, turns: [...session.turns, result.turn], sharedContext: result.sharedContext, updatedAt: result.turn.completedAt ?? session.updatedAt };
}
