import { describe, expect, it, vi } from "vitest";
import { EvidenceContextProjector, type LlmAnswerComposeInput } from "../../packages/agent-core/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { OpenAiResponsesAnswerProvider } from "../../services/agent-api/openAiAnswerProvider";
import { answerComposerFromEnvironment } from "../../services/agent-api/runtime";

describe("OpenAI Responses evidence-grounded answer provider", () => {
  it("sends only the evidence projection with strict claim and citation enums", async () => {
    const draft = minimalDraft();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(draft) }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAiResponsesAnswerProvider({ apiKey: "test-key-not-a-secret", model: "test-answer-model", baseUrl: "https://llm.example.test/v1/", fetchImpl });

    await expect(provider.compose(input())).resolves.toEqual(draft);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://llm.example.test/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "test-answer-model", store: false, text: { format: { type: "json_schema", strict: true, name: "evidence_grounded_answer_draft" } } });
    expect(body.text.format.schema.properties.confidence.enum).not.toContain("approved");
    expect(JSON.stringify(body.text.format.schema)).toContain("document.sop.op30-leak-test");
    expect(JSON.stringify(body.text.format.schema)).not.toMatch(/minItems|maxItems|uniqueItems|minLength|maxLength/u);
    expect(JSON.stringify(body)).not.toContain("test-key-not-a-secret");
    expect(JSON.stringify(body)).not.toContain("chain-of-thought");
  });

  it("keeps template as default and requires explicit server-only LLM answer configuration", () => {
    expect(answerComposerFromEnvironment({}).mode).toBe("template");
    expect(() => answerComposerFromEnvironment({ MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" })).toThrow("MKG_OPENAI_API_KEY is required");
    expect(() => answerComposerFromEnvironment({ MKG_AGENT_ANSWER_COMPOSER_MODE: "llm", MKG_OPENAI_API_KEY: "test-key" })).toThrow("MKG_LLM_ANSWER_MODEL or MKG_LLM_MODEL is required");
    expect(answerComposerFromEnvironment({ MKG_AGENT_ANSWER_COMPOSER_MODE: "hybrid", MKG_OPENAI_API_KEY: "test-key", MKG_LLM_ANSWER_MODEL: "test-model" }).mode).toBe("hybrid");
    expect(() => answerComposerFromEnvironment({ MKG_AGENT_ANSWER_COMPOSER_MODE: "unknown" })).toThrow("Use template, llm, or hybrid");
  });
});

function input(): LlmAnswerComposeInput {
  return {
    requestId: "answer-provider-test",
    language: "en",
    question: "Trace the OP30 Leak Rate issue.",
    evidence: new EvidenceContextProjector().project(leakRateQualityIssueTraceBaseline.evidencePack),
  };
}

function minimalDraft() {
  const claims = leakRateQualityIssueTraceBaseline.expectedResponse.answer.claims.map((claim) => ({ ...claim, citations: claim.citations.map((citation) => ({ evidenceId: citation.evidenceId })) }));
  return {
    version: "1.0.0",
    summary: { text: "Grounded OP30 Leak Rate summary.", claimIds: claims.map((claim) => claim.id) },
    findings: [{ text: "OP30 is on the released route.", claimIds: ["claim.affected-product"] }],
    recommendedActions: [{ text: "Apply the released containment control.", evidenceIds: ["document.control-plan.cp-bb01.rev-a"] }],
    risks: [{ text: "Affected batches remain unknown.", claimIds: ["claim.signal-limitation"] }],
    assumptions: ["The pilot signal is used."],
    limitations: [...leakRateQualityIssueTraceBaseline.evidencePack.limitations],
    claims,
    confidence: "high",
  };
}
