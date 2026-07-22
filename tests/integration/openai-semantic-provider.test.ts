import { describe, expect, it, vi } from "vitest";
import type { LlmSemanticParseInput } from "../../packages/agent-core/src/index";
import { OpenAiResponsesSemanticProvider } from "../../services/agent-api/openAiSemanticProvider";
import { semanticParserFromEnvironment } from "../../services/agent-api/runtime";

describe("OpenAI Responses semantic provider adapter", () => {
  it("requests strict structured output and returns only the parsed JSON value", async () => {
    const draft = validDraft();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(draft) }] }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const provider = new OpenAiResponsesSemanticProvider({
      apiKey: "test-key-not-a-secret",
      model: "test-model",
      baseUrl: "https://llm.example.test/v1/",
      fetchImpl,
    });

    await expect(provider.parse(input())).resolves.toEqual(draft);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://llm.example.test/v1/responses");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key-not-a-secret" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "test-model", store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(body.text.format.schema.properties.entities.items.properties.candidateId.enum).toEqual(["operation.op30", "quality-characteristic.leak-rate"]);
    expect(JSON.stringify(body.text.format.schema)).not.toMatch(/minItems|maxItems|uniqueItems|minLength|maxLength/u);
    expect(JSON.stringify(body)).not.toContain("chain-of-thought");
    expect(JSON.stringify(body)).not.toContain("test-key-not-a-secret");
  });

  it("maps provider HTTP failures and invalid output without retaining the response body", async () => {
    const unavailable = new OpenAiResponsesSemanticProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async () => new Response("sensitive provider body", { status: 503 }),
    });
    await expect(unavailable.parse(input())).rejects.toMatchObject({ detail: { code: "LLM_PROVIDER_UNAVAILABLE", details: { status: 503 } } });

    const invalid = new OpenAiResponsesSemanticProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async () => new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 }),
    });
    await expect(invalid.parse(input())).rejects.toMatchObject({ detail: { code: "LLM_RESPONSE_INVALID" } });
  });

  it("keeps deterministic as default and requires explicit server-only LLM configuration", () => {
    expect(semanticParserFromEnvironment({}).mode).toBe("deterministic");
    expect(() => semanticParserFromEnvironment({ MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" })).toThrow("MKG_OPENAI_API_KEY is required");
    expect(() => semanticParserFromEnvironment({ MKG_AGENT_SEMANTIC_PARSER_MODE: "llm", MKG_OPENAI_API_KEY: "test-key" })).toThrow("MKG_LLM_MODEL is required");
    expect(() => semanticParserFromEnvironment({ MKG_AGENT_SEMANTIC_PARSER_MODE: "hybrid", MKG_OPENAI_API_KEY: "test-key", MKG_LLM_MODEL: "test-model" })).not.toThrow();
    expect(() => semanticParserFromEnvironment({ MKG_AGENT_SEMANTIC_PARSER_MODE: "unknown" })).toThrow("Use deterministic, llm, or hybrid");
  });
});

function input(): LlmSemanticParseInput {
  return {
    requestId: "provider-test",
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

function validDraft() {
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
