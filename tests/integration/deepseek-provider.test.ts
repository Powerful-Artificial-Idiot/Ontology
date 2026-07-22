import { describe, expect, it, vi } from "vitest";
import {
  EvidenceContextProjector,
  type LlmAnswerComposeInput,
  type LlmSemanticParseInput,
} from "../../packages/agent-core/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { InMemoryAgentTelemetrySink } from "../../packages/agent-evaluation/src/index";
import { DeepSeekAnswerProvider } from "../../services/agent-api/deepSeekAnswerProvider";
import { DeepSeekSemanticProvider } from "../../services/agent-api/deepSeekSemanticProvider";
import { answerComposerFromEnvironment, semanticParserFromEnvironment } from "../../services/agent-api/runtime";

describe("DeepSeek Chat Completions provider adapters", () => {
  it("uses the native Chat Completions JSON Object protocol for semantic parsing", async () => {
    const telemetry = new InMemoryAgentTelemetrySink();
    const fetchImpl = vi.fn(async () => deepSeekResponse(validSemanticDraft(), {
      prompt_tokens: 30,
      completion_tokens: 12,
      total_tokens: 42,
    }));
    const provider = new DeepSeekSemanticProvider({
      apiKey: "deepseek-test-key",
      model: "deepseek-v4-flash",
      fetchImpl,
      telemetry,
    });

    await expect(provider.parse(semanticInput())).resolves.toEqual(validSemanticDraft());
    expect(provider.providerName).toBe("deepseek-chat-completions");
    expect(provider.capabilities).toEqual({
      transport: "chat-completions",
      jsonMode: "json-object",
      supportsServerSideJsonSchema: false,
      supportsJsonObjectMode: true,
      supportsThinkingControl: true,
      supportsUsageMetadata: true,
      supportsRequestCancellation: true,
    });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer deepseek-test-key" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
      temperature: 0,
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("text");
    expect(body.messages[0].content).toContain("JSON schema");
    expect(body.messages[0].content).toContain("select every such candidate");
    expect(body.messages[0].content).toContain("empty matchedTerms");
    expect(JSON.stringify(body)).not.toContain("deepseek-test-key");
    expect(JSON.stringify(body)).not.toContain("chain-of-thought");

    expect(telemetry.list()).toHaveLength(1);
    expect(telemetry.list()[0]).toMatchObject({
      type: "provider",
      status: "completed",
      attributes: {
        provider: "deepseek-chat-completions",
        transport: "chat-completions",
        jsonMode: "json-object",
        model: "deepseek-v4-flash",
        inputTokens: 30,
        outputTokens: 12,
        totalTokens: 42,
      },
    });
    expect(JSON.stringify(telemetry.list())).not.toMatch(/deepseek-test-key|reasoning_content|raw.?output|instructions/iu);
  });

  it("uses the same governed evidence projection for answer composition", async () => {
    const draft = minimalAnswerDraft();
    const fetchImpl = vi.fn(async () => deepSeekResponse(draft));
    const provider = new DeepSeekAnswerProvider({ apiKey: "deepseek-test-key", model: "deepseek-v4-pro", fetchImpl });

    await expect(provider.compose(answerInput())).resolves.toEqual(draft);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("deepseek-v4-pro");
    expect(body.messages[0].content).toContain("evidence_grounded_answer_draft");
    expect(body.messages[0].content).toContain("evidence-chunk.document.sop.op30-leak-test");
    expect(body.messages[1].content).toContain("claimPolicies");
  });

  it("ignores reasoning content and rejects missing, truncated, or invalid final JSON", async () => {
    const reasoningOnly = new DeepSeekSemanticProvider({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "", reasoning_content: JSON.stringify(validSemanticDraft()) } }],
      }), { status: 200 }),
    });
    await expect(reasoningOnly.parse(semanticInput())).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });

    const truncated = new DeepSeekSemanticProvider({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      fetchImpl: async () => deepSeekResponse(validSemanticDraft(), undefined, "length"),
    });
    await expect(truncated.parse(semanticInput())).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID", details: { finishReason: "length" } } });

    const invalid = new DeepSeekSemanticProvider({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "not-json" } }],
      }), { status: 200 }),
    });
    await expect(invalid.parse(semanticInput())).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });
  });

  it("maps HTTP failures without retaining the provider response body", async () => {
    const provider = new DeepSeekSemanticProvider({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      fetchImpl: async () => new Response("sensitive provider body", { status: 503 }),
    });

    const error = await provider.parse(semanticInput()).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ detail: { code: "LLM_PROVIDER_UNAVAILABLE", details: { provider: "deepseek-chat-completions", status: 503 } } });
    expect(JSON.stringify(error)).not.toContain("sensitive provider body");
  });

  it("preserves caller cancellation and maps provider timeout explicitly", async () => {
    const waitingFetch = (_url: string | URL | Request, init?: RequestInit): Promise<Response> => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const cancelled = new DeepSeekSemanticProvider({ apiKey: "test-key", model: "deepseek-v4-flash", fetchImpl: waitingFetch });
    const controller = new AbortController();
    const pending = cancelled.parse(semanticInput(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ detail: { code: "PIPELINE_CANCELLED" } });

    const timedOut = new DeepSeekSemanticProvider({ apiKey: "test-key", model: "deepseek-v4-flash", timeoutMs: 1, fetchImpl: waitingFetch });
    await expect(timedOut.parse(semanticInput())).rejects.toMatchObject({
      detail: { code: "LLM_PROVIDER_UNAVAILABLE", details: { provider: "deepseek-chat-completions", timeoutMs: 1 } },
    });
  });

  it("selects DeepSeek explicitly, defaults to v4-flash, and rejects retired or unknown models", () => {
    const semantic = semanticParserFromEnvironment({
      MKG_AGENT_SEMANTIC_PARSER_MODE: "llm",
      MKG_LLM_PROVIDER: "deepseek",
      MKG_DEEPSEEK_API_KEY: "test-key",
    });
    const answer = answerComposerFromEnvironment({
      MKG_AGENT_ANSWER_COMPOSER_MODE: "llm",
      MKG_LLM_PROVIDER: "deepseek",
      MKG_DEEPSEEK_API_KEY: "test-key",
    });
    expect(semantic.providerType).toBe("deepseek-chat-completions");
    expect(answer.providerType).toBe("deepseek-chat-completions");
    expect(() => semanticParserFromEnvironment({
      MKG_AGENT_SEMANTIC_PARSER_MODE: "llm",
      MKG_LLM_PROVIDER: "deepseek",
    })).toThrow("MKG_DEEPSEEK_API_KEY is required");
    expect(() => semanticParserFromEnvironment({
      MKG_AGENT_SEMANTIC_PARSER_MODE: "llm",
      MKG_LLM_PROVIDER: "deepseek",
      MKG_DEEPSEEK_API_KEY: "test-key",
      MKG_DEEPSEEK_MODEL: "deepseek-chat",
    })).toThrow("Use deepseek-v4-flash or deepseek-v4-pro");
  });
});

function deepSeekResponse(value: unknown, usage?: Record<string, number>, finishReason = "stop"): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { role: "assistant", content: JSON.stringify(value), reasoning_content: "not consumed" } }],
    usage,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function semanticInput(): LlmSemanticParseInput {
  return {
    requestId: "deepseek-provider-test",
    language: "en",
    message: "Trace the OP30 Leak Rate issue.",
    context: { resolvedEntityIds: [] },
    ontologyVersion: "1.1.0",
    candidates: [
      { id: "operation.op30", label: "OP30 Leak Test", type: "mfg:Operation", domain: "production", matchedTerms: ["OP30"], matchScore: 4 },
      { id: "quality-characteristic.leak-rate", label: "Leak Rate", type: "qual:QualityCharacteristic", domain: "quality", matchedTerms: ["Leak Rate"], matchScore: 9 },
    ],
    allowedIntents: ["quality_issue_trace", "clarification_required"],
    allowedRelationTypes: ["ontology.relationship.controls"],
    allowedFacets: ["production", "quality", "engineering", "valueStream", "governance"],
    allowedConstraintKeys: ["entity.status"],
  };
}

function validSemanticDraft() {
  return {
    version: "1.0.0",
    intent: "quality_issue_trace",
    entities: [{ candidateId: "operation.op30", role: "subject" }],
    relationTypes: ["ontology.relationship.controls"],
    requestedFacets: ["quality"],
    constraints: [{ key: "entity.status", operator: "eq", value: "active" }],
    ambiguityNotes: [],
  };
}

function answerInput(): LlmAnswerComposeInput {
  return {
    requestId: "deepseek-answer-provider-test",
    language: "en",
    question: "Trace the OP30 Leak Rate issue.",
    evidence: new EvidenceContextProjector().project(leakRateQualityIssueTraceBaseline.evidencePack),
  };
}

function minimalAnswerDraft() {
  const claims = leakRateQualityIssueTraceBaseline.expectedResponse.answer.claims.map((claim) => ({
    ...claim,
    citations: claim.citations.map((citation) => ({ evidenceId: citation.evidenceId })),
  }));
  return {
    version: "1.0.0",
    summary: { text: "Grounded OP30 Leak Rate summary.", claimIds: claims.map((claim) => claim.id) },
    findings: [{ text: "OP30 is on the released route.", claimIds: ["claim.affected-product"] }],
    recommendedActions: [{ text: "Apply the released containment control.", evidenceIds: [evidenceIdForDocument("document.control-plan.cp-bb01.rev-a")] }],
    risks: [{ text: "Affected batches remain unknown.", claimIds: ["claim.signal-limitation"] }],
    assumptions: ["The pilot signal is used."],
    limitations: [...leakRateQualityIssueTraceBaseline.evidencePack.limitations],
    claims,
    confidence: "high",
  };
}

function evidenceIdForDocument(documentId: string): string {
  const item = leakRateQualityIssueTraceBaseline.evidencePack.items.find((evidence) => evidence.governance?.documentId === documentId);
  if (!item) throw new Error(`Missing canonical evidence chunk for ${documentId}`);
  return item.id;
}
