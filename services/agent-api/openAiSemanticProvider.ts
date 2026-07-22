import type { LlmSemanticParseInput, LlmSemanticParserProvider } from "../../packages/agent-core/src/index";
import { OpenAiStructuredOutputClient, type OpenAiStructuredOutputClientOptions } from "./openAiStructuredOutputClient";

export type OpenAiResponsesSemanticProviderOptions = OpenAiStructuredOutputClientOptions;

export class OpenAiResponsesSemanticProvider implements LlmSemanticParserProvider {
  readonly providerName = "openai-responses";
  private readonly client: OpenAiStructuredOutputClient;

  constructor(options: OpenAiResponsesSemanticProviderOptions) {
    this.client = new OpenAiStructuredOutputClient(options);
  }

  async parse(input: LlmSemanticParseInput, signal?: AbortSignal): Promise<unknown> {
    return this.client.generate({
      instructions: semanticParserInstructions,
      input,
      schemaName: "semantic_query_plan_draft",
      schema: semanticDraftSchema(input),
      stage: "semantic-parsing",
      operationLabel: "semantic parsing",
      maxOutputTokens: 1500,
    }, signal);
  }
}

const semanticParserInstructions = [
  "Convert the user message into the supplied semantic query plan draft schema.",
  "Select only candidateId values and relationship types present in the input allowlists.",
  "Select entities explicitly mentioned or required to resolve the user's query subject; do not add affected facts.",
  "Use clarification_required when the governed candidates cannot resolve the request.",
  "Do not answer the business question, generate Cypher, create identifiers, or include reasoning.",
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
