import { describe, expect, it } from "vitest";
import {
  AgentPipelineError,
  RepositoryGraphRetriever,
  createDeterministicAgentClient,
  createDeterministicAgentPipeline,
} from "../../packages/agent-core/src/index";
import {
  bottleneckAnalysisBaseline,
  engineeringChangeImpactBaseline,
} from "../../packages/demo-data/src/index";
import { AGENT_CONTRACT_VERSION, type AgentTurnRequest } from "../../packages/knowledge-contracts/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { createDefaultGovernedDocumentRetriever } from "../../services/agent-api/governedDocumentEvidence";

describe("Phase 5B controlled domain expansion", () => {
  it.each([
    {
      baseline: engineeringChangeImpactBaseline,
      message: "What operations, quality controls, documents and release gates are affected by changing M220 from LeakTestProgram V3.4 to V3.5?",
      intent: "engineering_change_impact",
      templateId: "engineering-change-impact.dependency-scope.v1",
      requiredIds: ["machine.m220", "program.leak-test.v3-5", "operation.op30"],
    },
    {
      baseline: bottleneckAnalysisBaseline,
      message: "Is OP20 the current bottleneck, and could OP30 Leak Rate retest shift the constraint downstream?",
      intent: "bottleneck_analysis",
      templateId: "bottleneck-analysis.flow-metrics.v1",
      requiredIds: ["operation.op20", "value-stream.metric.op20-cycle-time", "value-stream.metric.line-bottleneck-risk"],
    },
  ])("runs $intent through the shared governed pipeline", async ({ baseline, message, intent, templateId, requiredIds }) => {
    const pipeline = createDeterministicAgentPipeline({
      graphRetriever: new RepositoryGraphRetriever(new MockKnowledgeRepository()),
      documentRetriever: createDefaultGovernedDocumentRetriever(),
    });
    const response = await pipeline.run(request(`phase5b.${intent}`, baseline.scenario.id, message, "en"));

    expect(response.queryPlan.intent).toBe(intent);
    expect(response.graphQueryPlan?.templateId).toBe(templateId);
    expect(response.graphQueryPlan?.readOnly).toBe(true);
    expect(response.citationValidation.status).toBe("passed");
    expect(response.answer.claims).toHaveLength(5);
    expect(response.answer.claims.every((claim) => claim.classification !== "fact" || claim.citations.length > 0)).toBe(true);
    expect(requiredIds.every((id) => response.trace.stages.some((stage) => stage.outputRefs.includes(id)))).toBe(true);
    expect(response.evidencePack.items.some((item) => item.id.startsWith("evidence-chunk."))).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(/chain.of.thought|rawPrompt|reasoning_content|authorization/i);
  });

  it.each([
    ["engineering-change-impact", "M220 的程序版本从 V3.4 变更到 V3.5，会影响哪些工序、质量控制和放行文件？"],
    ["bottleneck-analysis", "OP20 是当前瓶颈吗？如果 OP30 漏率复测增加，瓶颈会不会转移？"],
  ])("returns a Chinese governed answer for %s", async (scenarioId, message) => {
    const response = await createDeterministicAgentPipeline().run(request(`phase5b.zh.${scenarioId}`, scenarioId, message, "zh"));
    expect(response.citationValidation.status).toBe("passed");
    expect(response.answer.summary).toMatch(/[\u3400-\u9fff]/u);
  });

  it("keeps restricted cross-domain multi-turn context inside the bottleneck scenario", async () => {
    const { client, sessions } = createDeterministicAgentClient();
    const sessionId = "session.phase5b.bottleneck";
    await client.startSession({ id: sessionId, scenarioId: "bottleneck-analysis", mode: "live", language: "en" });
    await client.runTurn({ ...request("phase5b.multi.1", "bottleneck-analysis", "Is OP20 the current bottleneck?", "en"), sessionId });
    await client.runTurn({ ...request("phase5b.multi.2", "bottleneck-analysis", "For OP20, could OP30 Leak Rate retest shift the bottleneck downstream?", "en"), sessionId });

    const session = await sessions.get(sessionId);
    expect(session?.turnIds).toHaveLength(2);
    expect(session?.context.resolvedEntityIds).toEqual(["operation.op20"]);
    expect(session?.context.activeTopic).toBe("bottleneck_analysis");
  });

  it("requires explicit governed seeds rather than guessing a new-domain question", async () => {
    await expect(createDeterministicAgentPipeline().run(request(
      "phase5b.ambiguous",
      "engineering-change-impact",
      "Assess the proposed change.",
      "en",
    ))).rejects.toMatchObject<Partial<AgentPipelineError>>({
      detail: { code: "CLARIFICATION_REQUIRED", stage: "semantic-parsing" },
    });
  });
});

function request(requestId: string, scenarioId: string, message: string, language: "zh" | "en"): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId,
    mode: "live",
    language,
    message,
    context: { previousTurnIds: [], resolvedEntityIds: [], assumptions: [] },
  };
}
