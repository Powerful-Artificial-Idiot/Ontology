import type {
  LlmSemanticParseInput,
  LlmSemanticParserProvider,
  StructuredOutputCapability,
  StructuredOutputProvider,
} from "../../packages/agent-core/src/index";

export class StructuredSemanticProvider implements LlmSemanticParserProvider {
  readonly providerName: string;
  readonly capabilities: StructuredOutputCapability;

  constructor(private readonly provider: StructuredOutputProvider) {
    this.providerName = provider.providerId;
    this.capabilities = provider.capabilities;
  }

  async parse(input: LlmSemanticParseInput, signal?: AbortSignal): Promise<unknown> {
    const result = await this.provider.generateStructured<unknown>({
      instructions: semanticParserInstructions,
      input,
      schemaName: "semantic_query_plan_draft",
      schema: semanticDraftSchema(input),
      stage: "semantic-parsing",
      operationLabel: "semantic parsing",
      maxOutputTokens: 1500,
    }, signal);
    return result.value;
  }
}

const semanticParserInstructions = [
  "Return exactly one JSON object that matches the supplied JSON schema.",
  "Convert the user message into the supplied semantic query plan draft schema.",
  "Select only candidateId values and relationship types present in the input allowlists.",
  "Treat a candidate with non-empty matchedTerms as a deterministic explicit mention and select every such candidate.",
  "Do not select candidates with empty matchedTerms merely because the user asks which products, resources, risks, or evidence may be affected.",
  "Use relationTypes and requestedFacets to express the governed traversal needed to answer the requested affected categories; do not add affected facts as entities.",
  "Use clarification_required when the governed candidates cannot resolve the request.",
  "Do not answer the business question, generate Cypher, create identifiers, call tools, or include reasoning.",
].join(" ");

function semanticDraftSchema(input: LlmSemanticParseInput): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "intent", "entities", "relationTypes", "requestedFacets", "constraints", "ambiguityNotes"],
    properties: {
      version: { type: "string", enum: ["1.0.0"] },
      intent: { type: "string", enum: input.allowedIntents },
      entities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["candidateId", "role"],
          properties: {
            candidateId: { type: "string", enum: input.candidates.map((candidate) => candidate.id) },
            role: { type: "string", enum: ["subject", "affected", "resource", "risk", "evidence", "context"] },
          },
        },
      },
      relationTypes: { type: "array", items: { type: "string", enum: input.allowedRelationTypes } },
      requestedFacets: { type: "array", items: { type: "string", enum: input.allowedFacets } },
      constraints: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "operator", "value"],
          properties: {
            key: { type: "string", enum: input.allowedConstraintKeys },
            operator: { type: "string", enum: ["eq", "in", "before", "after", "between"] },
            value: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
                { type: "array", items: { type: "string" } },
              ],
            },
          },
        },
      },
      ambiguityNotes: { type: "array", items: { type: "string" } },
    },
  };
}
