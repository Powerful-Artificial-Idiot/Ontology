import { describe, expect, it } from "vitest";
import {
  AllowlistedGraphQueryCompiler,
  AgentPipelineError,
  CanonicalOntologyValidator,
  DeterministicLeakRateSemanticParser,
  StrictQueryPlanValidator,
  createDeterministicAgentClient,
  createDeterministicAgentPipeline,
} from "../../packages/agent-core/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { AGENT_CONTRACT_VERSION, type AgentClock, type AgentTurnRequest, type SemanticQueryPlan } from "../../packages/knowledge-contracts/src/index";

const question = "OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险和文件？";

describe("Phase 2 deterministic Agent pipeline", () => {
  it("runs the complete Leak Rate pipeline from request to validated answer", async () => {
    const pipeline = createDeterministicAgentPipeline({ clock: new SteppingClock() });
    const response = await pipeline.run(request("pipeline-001", "zh"));

    expect(response.status).toBe("completed");
    expect(response.contractVersion).toBe(AGENT_CONTRACT_VERSION);
    expect(response.queryPlan.intent).toBe("quality_issue_trace");
    expect(response.graphQueryPlan).toMatchObject({ readOnly: true, maxDepth: 2, resultLimit: 50 });
    expect(response.queryPlan.entities.map((entity) => entity.id)).toEqual(["operation.op30", "quality-characteristic.leak-rate"]);
    expect(response.evidencePack.items.map((item) => item.id)).toEqual([
      "evidence.route.brake-booster.rev-c",
      "document.control-plan.cp-bb01.rev-a",
      "document.pfmea.pf-bb01.rev-b",
      "document.sop.op30-leak-test",
      "evidence.qms.leak-rate.recent",
    ]);
    expect(response.citationValidation.status).toBe("passed");
    expect(response.answer.claims).toHaveLength(5);
    expect(response.trace.stages.map((stage) => stage.stage)).toEqual([
      "semantic-parsing",
      "query-plan-validation",
      "ontology-validation",
      "query-compilation",
      "graph-retrieval",
      "document-retrieval",
      "evidence-pack",
      "answer-composition",
      "citation-validation",
    ]);
    expect(response.trace.stages.every((stage) => stage.status === "completed")).toBe(true);
    expect(JSON.stringify(response.trace)).not.toMatch(/chain.of.thought|reasoningTokens|rawPrompt/i);
  });

  it("returns an English-only answer with the same evidence IDs", async () => {
    const pipeline = createDeterministicAgentPipeline({ clock: new SteppingClock() });
    const zh = await pipeline.run(request("pipeline-zh", "zh"));
    const en = await pipeline.run({ ...request("pipeline-en", "en"), message: "OP30 Leak Rate is abnormal. Which products, equipment, quality risks, and documents may be affected?" });

    expect(en.evidencePack.items.map((item) => item.id)).toEqual(zh.evidencePack.items.map((item) => item.id));
    expect(en.answer.claims.map((claim) => claim.citations)).toEqual(zh.answer.claims.map((claim) => claim.citations));
    expect(JSON.stringify(en.answer)).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("compiles only an allowlisted bounded read-only Graph Query Plan", async () => {
    const parser = new DeterministicLeakRateSemanticParser();
    const schemaValidator = new StrictQueryPlanValidator();
    const ontologyValidator = new CanonicalOntologyValidator();
    const compiler = new AllowlistedGraphQueryCompiler();
    const semantic = await parser.parse(request("graph-plan", "zh"), leakRateQualityIssueTraceBaseline);
    const schemaValidated = await schemaValidator.validate(semantic);
    const validated = await ontologyValidator.validate(schemaValidated, leakRateQualityIssueTraceBaseline);
    const graphPlan = await compiler.compile(validated, leakRateQualityIssueTraceBaseline);

    expect(graphPlan).toMatchObject({
      templateId: "quality-issue-trace.direct-neighborhood.v1",
      readOnly: true,
      maxDepth: 2,
      resultLimit: 50,
      seedEntityIds: ["operation.op30", "quality-characteristic.leak-rate"],
    });
    expect(JSON.stringify(graphPlan)).not.toMatch(/cypher|\bmatch\b|\breturn\b|\bcreate\b|\bmerge\b/i);
  });

  it("requires clarification instead of guessing an unsupported question", async () => {
    const pipeline = createDeterministicAgentPipeline({ clock: new SteppingClock() });
    await expect(pipeline.run({ ...request("clarify", "en"), message: "Please investigate the line." })).rejects.toMatchObject({
      detail: { code: "CLARIFICATION_REQUIRED", stage: "semantic-parsing" },
    });
  });

  it("stops before retrieval when ontology validation finds an unknown entity", async () => {
    const invalidParser = {
      async parse(_request: AgentTurnRequest): Promise<SemanticQueryPlan> {
        return {
          ...leakRateQualityIssueTraceBaseline.queryPlan,
          planId: "query-plan.invalid-entity",
          entities: [{ id: "machine.unknown", label: "Unknown Machine", type: "mfg:Machine", role: "subject" }],
        };
      },
    };
    const pipeline = createDeterministicAgentPipeline({ clock: new SteppingClock(), semanticParser: invalidParser });
    try {
      await pipeline.run(request("invalid-entity", "en"));
      throw new Error("Expected ontology validation to fail.");
    } catch (error) {
      expect(error).toMatchObject({ detail: { code: "ONTOLOGY_TERM_INVALID", stage: "ontology-validation" } });
      expect((error as AgentPipelineError).traceStages.map((stage) => [stage.stage, stage.status])).toEqual([
        ["semantic-parsing", "completed"],
        ["query-plan-validation", "completed"],
        ["ontology-validation", "failed"],
      ]);
    }
  });

  it("blocks release when a factual claim is not supported by its citation", async () => {
    const unsupportedComposer = {
      async compose() {
        return {
          summary: "Unsupported",
          findings: [],
          recommendedActions: [],
          risks: [],
          assumptions: [],
          confidence: "high" as const,
          claims: [{ id: "claim.unsupported", text: "Unsupported enterprise fact.", classification: "fact" as const, citations: [{ evidenceId: "document.sop.op30-leak-test" }] }],
        };
      },
    };
    const pipeline = createDeterministicAgentPipeline({ clock: new SteppingClock(), answerComposer: unsupportedComposer });
    await expect(pipeline.run(request("invalid-citation", "en"))).rejects.toMatchObject({
      detail: { code: "CITATION_INVALID", stage: "citation-validation" },
    });
  });

  it("persists bounded multi-turn context and an audit event per turn", async () => {
    const clock = new SteppingClock();
    const { client, sessions, audit } = createDeterministicAgentClient(clock);
    await client.startSession({ id: "session-001", mode: "live", language: "en", activeTopic: "Leak Rate investigation" });
    await client.runTurn({ ...request("session-turn-1", "en"), sessionId: "session-001", mode: "live", message: "OP30 Leak Rate abnormality may affect which products, equipment, risks, and documents?" });
    await client.runTurn({ ...request("session-turn-2", "en"), sessionId: "session-001", mode: "live", message: "For OP30 Leak Rate, list the affected product, equipment, risk, and documents again." });

    const session = await sessions.get("session-001");
    expect(session?.turnIds).toHaveLength(2);
    expect(session?.context.previousTurnIds).toHaveLength(2);
    expect(session?.context.resolvedEntityIds).toEqual(["operation.op30", "quality-characteristic.leak-rate"]);
    expect(audit.list().map((event) => event.outcome)).toEqual(["completed", "completed"]);
    expect(audit.list().every((event) => event.resourceIds.includes("operation.op30"))).toBe(true);
  });

  it("honors cancellation before executing a pipeline stage", async () => {
    const pipeline = createDeterministicAgentPipeline({ clock: new SteppingClock() });
    const controller = new AbortController();
    controller.abort();
    await expect(pipeline.run(request("cancelled", "en"), controller.signal)).rejects.toBeInstanceOf(AgentPipelineError);
    await expect(pipeline.run(request("cancelled-2", "en"), controller.signal)).rejects.toMatchObject({ detail: { code: "PIPELINE_CANCELLED" } });
  });
});

function request(requestId: string, language: "zh" | "en"): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language,
    message: question,
    context: { previousTurnIds: [], resolvedEntityIds: [], assumptions: [] },
  };
}

class SteppingClock implements AgentClock {
  private time = Date.parse("2026-07-16T00:00:00.000Z");

  now(): Date {
    const value = new Date(this.time);
    this.time += 5;
    return value;
  }
}
