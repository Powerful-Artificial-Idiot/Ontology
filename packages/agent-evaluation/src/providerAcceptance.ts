import type { EvaluationProviderAcceptance, ProviderAcceptanceStatus } from "./types";

export type ProviderAcceptanceArtifact = EvaluationProviderAcceptance & {
  artifactVersion: "1.0.0" | "1.1.0";
};

export function pendingProviderAcceptance(environment: NodeJS.ProcessEnv = process.env): EvaluationProviderAcceptance {
  const provider = environment.MKG_LLM_PROVIDER === "deepseek" ? "deepseek" : "openai";
  const deepSeek = provider === "deepseek";
  const apiKeyConfigured = Boolean(deepSeek ? environment.MKG_DEEPSEEK_API_KEY : environment.MKG_OPENAI_API_KEY);
  const semanticModel = deepSeek ? environment.MKG_DEEPSEEK_MODEL ?? "deepseek-v4-flash" : environment.MKG_LLM_MODEL;
  const answerModel = deepSeek ? environment.MKG_DEEPSEEK_ANSWER_MODEL ?? semanticModel : environment.MKG_LLM_ANSWER_MODEL ?? environment.MKG_LLM_MODEL;
  const label = deepSeek ? "DeepSeek" : "OpenAI";
  return {
    providerId: deepSeek ? "deepseek-chat-completions" : "openai-responses",
    transport: deepSeek ? "chat-completions" : "responses-api",
    fallbackUsed: false,
    semanticParser: "pending",
    answerComposer: "pending",
    fullPipeline: deepSeek ? "pending" : undefined,
    modelIds: [...new Set([semanticModel, answerModel].filter((value): value is string => Boolean(value)))],
    details: [
      `${label} API key configured: ${apiKeyConfigured}.`,
      `Semantic parser model configured: ${Boolean(semanticModel)}.`,
      `Answer composer model configured: ${Boolean(answerModel)}.`,
      `${label} Semantic Parser live provider acceptance remains pending until a real smoke execution succeeds.`,
      `${label} Answer Composer live provider acceptance remains pending until a real smoke execution succeeds.`,
      ...(deepSeek ? ["DeepSeek full pipeline live provider acceptance remains pending until a real smoke execution succeeds."] : []),
    ],
  };
}

export function validateProviderAcceptanceArtifact(value: unknown): ProviderAcceptanceArtifact {
  if (!isRecord(value) || (value.artifactVersion !== "1.0.0" && value.artifactVersion !== "1.1.0")) throw new Error("Invalid provider acceptance artifact version.");
  if (!isStatus(value.semanticParser) || !isStatus(value.answerComposer)) throw new Error("Invalid provider acceptance status.");
  if (!Array.isArray(value.details) || !value.details.every((item) => typeof item === "string")) throw new Error("Provider acceptance details must be strings.");
  if (value.modelIds !== undefined && (!Array.isArray(value.modelIds) || !value.modelIds.every((item) => typeof item === "string"))) throw new Error("Provider acceptance model IDs must be strings.");
  if (value.fullPipeline !== undefined && !isStatus(value.fullPipeline)) throw new Error("Invalid full pipeline acceptance status.");
  if (value.transport !== undefined && value.transport !== "responses-api" && value.transport !== "chat-completions") throw new Error("Invalid provider acceptance transport.");
  if (value.fallbackUsed !== undefined && typeof value.fallbackUsed !== "boolean") throw new Error("Provider acceptance fallback usage must be boolean.");
  return {
    artifactVersion: value.artifactVersion,
    providerId: typeof value.providerId === "string" ? value.providerId : undefined,
    transport: value.transport as EvaluationProviderAcceptance["transport"],
    fallbackUsed: typeof value.fallbackUsed === "boolean" ? value.fallbackUsed : undefined,
    semanticParser: value.semanticParser,
    answerComposer: value.answerComposer,
    fullPipeline: value.fullPipeline as ProviderAcceptanceStatus | undefined,
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
