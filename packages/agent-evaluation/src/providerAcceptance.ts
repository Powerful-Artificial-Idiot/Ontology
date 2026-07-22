import type { EvaluationProviderAcceptance, ProviderAcceptanceStatus } from "./types";

export type ProviderAcceptanceArtifact = EvaluationProviderAcceptance & {
  artifactVersion: "1.0.0";
};

export function pendingProviderAcceptance(environment: NodeJS.ProcessEnv = process.env): EvaluationProviderAcceptance {
  const apiKeyConfigured = Boolean(environment.MKG_OPENAI_API_KEY);
  const semanticModel = environment.MKG_LLM_MODEL;
  const answerModel = environment.MKG_LLM_ANSWER_MODEL ?? environment.MKG_LLM_MODEL;
  return {
    semanticParser: "pending",
    answerComposer: "pending",
    modelIds: [...new Set([semanticModel, answerModel].filter((value): value is string => Boolean(value)))],
    details: [
      `OpenAI API key configured: ${apiKeyConfigured}.`,
      `Semantic parser model configured: ${Boolean(semanticModel)}.`,
      `Answer composer model configured: ${Boolean(answerModel)}.`,
      "Semantic Parser live provider acceptance remains pending until a real smoke execution succeeds.",
      "Answer Composer live provider acceptance remains pending until a real smoke execution succeeds.",
    ],
  };
}

export function validateProviderAcceptanceArtifact(value: unknown): ProviderAcceptanceArtifact {
  if (!isRecord(value) || value.artifactVersion !== "1.0.0") throw new Error("Invalid provider acceptance artifact version.");
  if (!isStatus(value.semanticParser) || !isStatus(value.answerComposer)) throw new Error("Invalid provider acceptance status.");
  if (!Array.isArray(value.details) || !value.details.every((item) => typeof item === "string")) throw new Error("Provider acceptance details must be strings.");
  if (value.modelIds !== undefined && (!Array.isArray(value.modelIds) || !value.modelIds.every((item) => typeof item === "string"))) throw new Error("Provider acceptance model IDs must be strings.");
  return {
    artifactVersion: "1.0.0",
    semanticParser: value.semanticParser,
    answerComposer: value.answerComposer,
    modelIds: value.modelIds as string[] | undefined,
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : undefined,
    details: value.details as string[],
  };
}

function isStatus(value: unknown): value is ProviderAcceptanceStatus {
  return value === "pending" || value === "passed" || value === "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
