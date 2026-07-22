import type { LlmAnswerComposeInput, LlmAnswerComposerProvider } from "../../packages/agent-core/src/index";
import { OpenAiStructuredOutputClient, type OpenAiStructuredOutputClientOptions } from "./openAiStructuredOutputClient";

export type OpenAiResponsesAnswerProviderOptions = OpenAiStructuredOutputClientOptions;

export class OpenAiResponsesAnswerProvider implements LlmAnswerComposerProvider {
  readonly providerName = "openai-responses";
  private readonly client: OpenAiStructuredOutputClient;

  constructor(options: OpenAiResponsesAnswerProviderOptions) {
    this.client = new OpenAiStructuredOutputClient(options);
  }

  compose(input: LlmAnswerComposeInput, signal?: AbortSignal): Promise<unknown> {
    return this.client.generate({
      instructions: answerComposerInstructions,
      input,
      schemaName: "evidence_grounded_answer_draft",
      schema: answerDraftSchema(input),
      stage: "answer-composition",
      operationLabel: "answer composition",
      maxOutputTokens: 3500,
    }, signal);
  }
}

const answerComposerInstructions = [
  "Compose an answer only from the supplied Evidence Context Projection.",
  "Every summary, finding, and risk must reference governed claim IDs; every recommended action must reference evidence IDs.",
  "Use only claim IDs, classifications, and evidence IDs allowed by the schema.",
  "Keep assumptions and limitations explicit and do not present them as facts.",
  "Do not search, generate Cypher, create facts, create references, decide publication, or include reasoning.",
  "Write all user-facing text in the requested language.",
].join(" ");

function answerDraftSchema(input: LlmAnswerComposeInput): Record<string, unknown> {
  const claimIds = input.evidence.claimPolicies.map((policy) => policy.claimId);
  const activeEvidence = input.evidence.items.filter((item) => !item.status || item.status === "active");
  const evidenceIds = activeEvidence.map((item) => item.id);
  const groundedText = {
    type: "object",
    additionalProperties: false,
    required: ["text", "claimIds"],
    properties: {
      text: { type: "string" },
      claimIds: { type: "array", items: { type: "string", enum: claimIds } },
    },
  };
  const groundedAction = {
    type: "object",
    additionalProperties: false,
    required: ["text", "evidenceIds"],
    properties: {
      text: { type: "string" },
      evidenceIds: { type: "array", items: { type: "string", enum: evidenceIds } },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["version", "summary", "findings", "recommendedActions", "risks", "assumptions", "limitations", "claims", "confidence"],
    properties: {
      version: { type: "string", enum: ["1.0.0"] },
      summary: groundedText,
      findings: { type: "array", items: groundedText },
      recommendedActions: { type: "array", items: groundedAction },
      risks: { type: "array", items: groundedText },
      assumptions: { type: "array", items: { type: "string" } },
      limitations: { type: "array", items: { type: "string" } },
      claims: {
        type: "array",
        items: { anyOf: input.evidence.claimPolicies.map((policy) => claimSchema(policy.claimId, policy.classification, activeEvidence.filter((item) => item.supportsClaimIds.includes(policy.claimId)).map((item) => item.id))) },
      },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
  };
}

function claimSchema(claimId: string, classification: string, evidenceIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "text", "classification", "citations"],
    properties: {
      id: { type: "string", enum: [claimId] },
      text: { type: "string" },
      classification: { type: "string", enum: [classification] },
      citations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["evidenceId"],
          properties: { evidenceId: { type: "string", enum: evidenceIds } },
        },
      },
    },
  };
}
