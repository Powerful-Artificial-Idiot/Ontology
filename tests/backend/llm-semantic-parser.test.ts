import { describe, expect, it } from "vitest";
import {
  AgentPipelineError,
  CanonicalEntityCandidateResolver,
  DeterministicLeakRateSemanticParser,
  HybridSemanticParser,
  LlmSemanticParser,
  createDeterministicAgentPipeline,
  type LlmSemanticParseInput,
  type LlmSemanticParserProvider,
} from "../../packages/agent-core/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { AGENT_CONTRACT_VERSION, type AgentTurnRequest } from "../../packages/knowledge-contracts/src/index";

describe("Phase 4A LLM Semantic Parser", () => {
  it("resolves governed bilingual aliases into ranked canonical candidates", () => {
    const candidates = new CanonicalEntityCandidateResolver().resolve("请追溯 OP30 气密性异常", leakRateQualityIssueTraceBaseline);

    expect(candidates.slice(0, 2).map((candidate) => candidate.id)).toEqual([
      "operation.op30",
      "quality-characteristic.leak-rate",
    ]);
    expect(candidates.find((candidate) => candidate.id === "quality-characteristic.leak-rate")?.matchedTerms).toContain("气密性");
    expect(candidates.every((candidate) => leakRateQualityIssueTraceBaseline.entities.some((entity) => entity.id === candidate.id))).toBe(true);
  });

  it("builds a canonical SemanticQueryPlan and runs the unchanged evidence pipeline", async () => {
    const provider = new CapturingProvider(validDraft());
    const semanticParser = new LlmSemanticParser(provider);
    const pipeline = createDeterministicAgentPipeline({ semanticParser });
    const response = await pipeline.run(request("llm-valid", "OP30 气密性最近异常，需要追溯影响。"));

    expect(provider.inputs).toHaveLength(1);
    expect(response.queryPlan.entities).toEqual([
      { id: "operation.op30", label: "OP30 Leak Test", type: "mfg:Operation", role: "subject" },
      { id: "quality-characteristic.leak-rate", label: "Leak Rate", type: "qual:QualityCharacteristic", role: "subject" },
    ]);
    expect(response.graphQueryPlan?.templateId).toBe("quality-issue-trace.direct-neighborhood.v1");
    expect(response.evidencePack.items).toHaveLength(5);
    expect(response.citationValidation.status).toBe("passed");
    expect(response.trace.stages[0]).toMatchObject({ stage: "semantic-parsing", status: "completed", tool: "llm-semantic-parser.capturing-test-provider.v1" });
  });

  it("rejects invented canonical IDs before ontology validation", async () => {
    const parser = new LlmSemanticParser(new CapturingProvider({
      ...validDraft(),
      entities: [{ candidateId: "operation.op99", role: "subject" }],
    }));

    await expect(parser.parse(request("invented-id", "Investigate OP99"), leakRateQualityIssueTraceBaseline)).rejects.toMatchObject({
      detail: { code: "LLM_ENTITY_UNRESOLVED", stage: "semantic-parsing" },
    });
  });

  it("rejects non-allowlisted relationships and undeclared reasoning fields", async () => {
    const relationshipParser = new LlmSemanticParser(new CapturingProvider({ ...validDraft(), relationTypes: ["DROP DATABASE"] }));
    await expect(relationshipParser.parse(request("bad-relation", "OP30 气密性"), leakRateQualityIssueTraceBaseline)).rejects.toMatchObject({
      detail: { code: "LLM_RESPONSE_INVALID" },
    });

    const reasoningParser = new LlmSemanticParser(new CapturingProvider({ ...validDraft(), reasoning: "hidden rationale" }));
    await expect(reasoningParser.parse(request("extra-field", "OP30 气密性"), leakRateQualityIssueTraceBaseline)).rejects.toMatchObject({
      detail: { code: "LLM_RESPONSE_INVALID", details: { unexpectedFieldCount: 1 } },
    });
  });

  it("uses deterministic parsing first in hybrid mode and calls LLM only for clarification", async () => {
    const provider = new CapturingProvider(validDraft());
    const hybrid = new HybridSemanticParser(new DeterministicLeakRateSemanticParser(), new LlmSemanticParser(provider));

    const deterministic = await hybrid.parse(request("hybrid-known", "OP30 Leak Rate is abnormal."), leakRateQualityIssueTraceBaseline);
    expect(deterministic.entities.map((entity) => entity.id)).toEqual(["operation.op30", "quality-characteristic.leak-rate"]);
    expect(provider.inputs).toHaveLength(0);

    const llm = await hybrid.parse(request("hybrid-fallback", "OP30 气密性最近异常，需要追溯影响。"), leakRateQualityIssueTraceBaseline);
    expect(llm.entities.map((entity) => entity.id)).toEqual(["operation.op30", "quality-characteristic.leak-rate"]);
    expect(provider.inputs).toHaveLength(1);
  });

  it("does not silently fall back when the configured LLM provider fails", async () => {
    const provider: LlmSemanticParserProvider = {
      providerName: "unavailable-test-provider",
      async parse() {
        throw new Error("offline");
      },
    };
    const parser = new LlmSemanticParser(provider);

    await expect(parser.parse(request("provider-down", "OP30 气密性"), leakRateQualityIssueTraceBaseline)).rejects.toMatchObject({
      detail: { code: "LLM_PROVIDER_UNAVAILABLE", details: { provider: "unavailable-test-provider" } },
    });
  });
});

class CapturingProvider implements LlmSemanticParserProvider {
  readonly providerName = "capturing-test-provider";
  readonly inputs: LlmSemanticParseInput[] = [];

  constructor(private readonly output: unknown) {}

  async parse(input: LlmSemanticParseInput): Promise<unknown> {
    this.inputs.push(input);
    return this.output;
  }
}

function validDraft() {
  return {
    version: "1.0.0",
    intent: "quality_issue_trace",
    entities: [
      { candidateId: "operation.op30", role: "subject" },
      { candidateId: "quality-characteristic.leak-rate", role: "subject" },
    ],
    relationTypes: [...leakRateQualityIssueTraceBaseline.queryPlan.relationTypes],
    requestedFacets: ["production", "engineering", "quality", "governance"],
    constraints: [{ key: "entity.status", operator: "eq", value: "active" }],
    ambiguityNotes: [],
  };
}

function request(requestId: string, message: string): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: /[\u3400-\u9fff]/u.test(message) ? "zh" : "en",
    message,
  };
}
