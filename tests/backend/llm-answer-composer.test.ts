import { describe, expect, it } from "vitest";
import {
  DeterministicEvidenceAnswerComposer,
  EvidenceContextProjector,
  HybridEvidenceAnswerComposer,
  LlmEvidenceAnswerComposer,
  StrictCitationValidator,
  createDeterministicAgentPipeline,
  type LlmAnswerComposeInput,
  type LlmAnswerComposerProvider,
} from "../../packages/agent-core/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { AGENT_CONTRACT_VERSION, type AgentAnswer, type AgentTurnRequest, type EvidencePack } from "../../packages/knowledge-contracts/src/index";

describe("Phase 4B evidence-grounded LLM Answer Composer", () => {
  it("projects only bounded evidence context and runs the unchanged publication pipeline", async () => {
    const provider = new CapturingAnswerProvider(validDraft());
    const composer = new LlmEvidenceAnswerComposer(provider);
    const pipeline = createDeterministicAgentPipeline({ answerComposer: composer });
    const response = await pipeline.run(request("llm-answer-valid"));

    expect(provider.inputs).toHaveLength(1);
    expect(provider.inputs[0]).toMatchObject({ requestId: "llm-answer-valid", language: "en", evidence: { evidencePackId: expect.stringMatching(/^evidence-pack\./u) } });
    expect(provider.inputs[0]).not.toHaveProperty("graph");
    expect(provider.inputs[0]?.templateGuidance).toBeUndefined();
    expect(response.answer.summary).toContain("Leak Rate abnormality");
    expect(response.answer.limitations).toHaveLength(1);
    expect(response.answer.claims).toHaveLength(5);
    expect(response.citationValidation.status).toBe("passed");
    expect(response.trace.stages.find((stage) => stage.stage === "answer-composition")).toMatchObject({ tool: "llm-evidence-answer-composer.capturing-answer-provider.v1", status: "completed" });
  });

  it("rejects invented references, changed claim classifications, and undeclared reasoning", async () => {
    const unknownReference = validDraft();
    unknownReference.claims[0]!.citations = [{ evidenceId: "document.invented" }];
    await expect(compose(unknownReference)).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID", stage: "answer-composition" } });

    const changedClassification = validDraft();
    changedClassification.claims[0]!.classification = "assumption";
    await expect(compose(changedClassification)).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });

    await expect(compose({ ...validDraft(), reasoning: "private analysis" })).rejects.toMatchObject({
      detail: { code: "LLM_RESPONSE_INVALID", details: { unexpectedFieldCount: 1 } },
    });
  });

  it("requires every governed claim and evidence-backed grounding links for visible answer text", async () => {
    const missingClaim = validDraft();
    missingClaim.claims = missingClaim.claims.slice(1);
    await expect(compose(missingClaim)).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });

    const ungroundedSummary = validDraft();
    ungroundedSummary.summary.claimIds = ["claim.invented"];
    await expect(compose(ungroundedSummary)).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });

    const ungroundedAction = validDraft();
    ungroundedAction.recommendedActions[0]!.evidenceIds = ["document.invented"];
    await expect(compose(ungroundedAction)).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });
  });

  it("rejects visible text bound to an omitted optional claim and actions bound to inactive evidence", async () => {
    const optionalClaimPack = structuredClone(leakRateQualityIssueTraceBaseline.evidencePack);
    optionalClaimPack.claimPolicies = optionalClaimPack.claimPolicies?.map((policy) => policy.claimId === "claim.affected-product" ? { ...policy, required: false } : policy);
    const omittedOptionalClaim = validDraft();
    omittedOptionalClaim.claims = omittedOptionalClaim.claims.filter((claim) => claim.id !== "claim.affected-product");
    const composer = new LlmEvidenceAnswerComposer(new CapturingAnswerProvider(omittedOptionalClaim));
    await expect(composer.compose(request("omitted-optional-claim"), emptyGraph(), optionalClaimPack)).rejects.toThrow("absent from the returned claim set");

    const inactiveEvidencePack = structuredClone(leakRateQualityIssueTraceBaseline.evidencePack);
    inactiveEvidencePack.items.push({ ...inactiveEvidencePack.items[0]!, id: "evidence.inactive-action", status: "superseded" });
    const inactiveAction = validDraft();
    inactiveAction.recommendedActions[0]!.evidenceIds = ["evidence.inactive-action"];
    const inactiveComposer = new LlmEvidenceAnswerComposer(new CapturingAnswerProvider(inactiveAction));
    await expect(inactiveComposer.compose(request("inactive-action"), emptyGraph(), inactiveEvidencePack)).rejects.toThrow("references inactive evidence");
  });

  it("refuses LLM composition when the Evidence Pack has no governed claim policy", () => {
    const pack: EvidencePack = { ...leakRateQualityIssueTraceBaseline.evidencePack, claimPolicies: undefined };
    expect(() => new EvidenceContextProjector().project(pack)).toThrow("requires governed claim policies");
  });

  it("uses the deterministic template as non-authoritative guidance in hybrid mode", async () => {
    const provider = new CapturingAnswerProvider(validDraft());
    const llm = new LlmEvidenceAnswerComposer(provider);
    const hybrid = new HybridEvidenceAnswerComposer(new DeterministicEvidenceAnswerComposer(), llm);
    const pipeline = createDeterministicAgentPipeline({ answerComposer: hybrid });
    const response = await pipeline.run(request("hybrid-answer"));

    expect(provider.inputs[0]?.templateGuidance?.claims).toHaveLength(5);
    expect(response.answer.summary).toBe(validDraft().summary.text);
    expect(response.trace.stages.find((stage) => stage.stage === "answer-composition")?.tool).toBe("hybrid-evidence-answer-composer.v1");
  });

  it("keeps deterministic citation validation as the final publication gate", async () => {
    const validator = new StrictCitationValidator();
    const base = leakRateQualityIssueTraceBaseline.expectedResponse.answer;
    const malicious: AgentAnswer = {
      ...base,
      claims: [
        ...base.claims.slice(1),
        { ...base.claims[0]!, id: "claim.invented" },
        { ...base.claims[1]! },
      ],
    };
    const result = await validator.validate(malicious, leakRateQualityIssueTraceBaseline.evidencePack);

    expect(result.status).toBe("failed");
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["unknown-claim", "duplicate-claim", "missing-required-claim"]));
  });
});

class CapturingAnswerProvider implements LlmAnswerComposerProvider {
  readonly providerName = "capturing-answer-provider";
  readonly inputs: LlmAnswerComposeInput[] = [];

  constructor(private readonly output: unknown) {}

  async compose(input: LlmAnswerComposeInput): Promise<unknown> {
    this.inputs.push(input);
    return this.output;
  }
}

async function compose(output: unknown) {
  const composer = new LlmEvidenceAnswerComposer(new CapturingAnswerProvider(output));
  return composer.compose(request("invalid-answer"), emptyGraph(), leakRateQualityIssueTraceBaseline.evidencePack);
}

function emptyGraph() {
  return { graphPlanId: "graph.test", repositoryType: "test", entities: [], relations: [] };
}

function validDraft() {
  return {
    version: "1.0.0",
    summary: { text: "The OP30 Leak Rate abnormality may affect the released Brake Booster route and its governed process resources.", claimIds: ["claim.affected-product", "claim.affected-equipment", "claim.quality-risk", "claim.governed-documents", "claim.signal-limitation"] },
    findings: [
      { text: "OP30 belongs to the released Brake Booster Assembly route.", claimIds: ["claim.affected-product"] },
      { text: "OP30 uses M220, FX-002, and LeakTestProgram V3.4.", claimIds: ["claim.affected-equipment"] },
      { text: "Leak Rate is controlled at 100% frequency and linked to Internal Leakage risk.", claimIds: ["claim.quality-risk"] },
      { text: "Control Plan, PFMEA, and SOP are the governed investigation documents.", claimIds: ["claim.governed-documents"] },
    ],
    recommendedActions: [
      { text: "Start containment under the released Control Plan.", evidenceIds: ["document.control-plan.cp-bb01.rev-a"] },
      { text: "Verify M220, FX-002, the released program, and golden-part results.", evidenceIds: ["document.sop.op30-leak-test"] },
    ],
    risks: [{ text: "The actual affected batch population remains unknown without live QMS and MES genealogy.", claimIds: ["claim.signal-limitation"] }],
    assumptions: ["The abnormal signal is the local QMS fixture signal supplied by this pilot."],
    limitations: ["No live QMS time-series, batch genealogy or equipment telemetry is connected in Phase 1."],
    claims: leakRateQualityIssueTraceBaseline.expectedResponse.answer.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      classification: claim.classification,
      citations: claim.citations.map((citation) => ({ evidenceId: citation.evidenceId })),
    })),
    confidence: "high",
  };
}

function request(requestId: string): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: "en",
    message: "OP30 Leak Rate is abnormal. Which products, equipment, quality risks, and documents may be affected?",
  };
}
