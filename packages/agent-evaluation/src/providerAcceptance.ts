import type { EvaluationProviderAcceptance, ProviderAcceptanceStatus } from "./types";

export type ProviderAcceptanceArtifact = EvaluationProviderAcceptance & {
  artifactVersion: "1.0.0" | "1.1.0" | "1.2.0";
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
  if (!isRecord(value) || !["1.0.0", "1.1.0", "1.2.0"].includes(String(value.artifactVersion))) throw new Error("Invalid provider acceptance artifact version.");
  if (!isStatus(value.semanticParser) || !isStatus(value.answerComposer)) throw new Error("Invalid provider acceptance status.");
  if (!Array.isArray(value.details) || !value.details.every((item) => typeof item === "string")) throw new Error("Provider acceptance details must be strings.");
  if (value.modelIds !== undefined && (!Array.isArray(value.modelIds) || !value.modelIds.every((item) => typeof item === "string"))) throw new Error("Provider acceptance model IDs must be strings.");
  if (value.fullPipeline !== undefined && !isStatus(value.fullPipeline)) throw new Error("Invalid full pipeline acceptance status.");
  if (value.transport !== undefined && value.transport !== "responses-api" && value.transport !== "chat-completions") throw new Error("Invalid provider acceptance transport.");
  if (value.fallbackUsed !== undefined && typeof value.fallbackUsed !== "boolean") throw new Error("Provider acceptance fallback usage must be boolean.");
  const scenarios = value.scenarios === undefined ? undefined : validateScenarioAcceptances(value.scenarios);
  if (value.artifactVersion === "1.2.0") {
    if (!scenarios?.length) throw new Error("Provider acceptance artifact 1.2.0 requires scenario results.");
    if (typeof value.fallbackUsed !== "boolean") throw new Error("Provider acceptance artifact 1.2.0 requires fallback usage.");
    if (typeof value.checkedAt !== "string" || !Number.isFinite(Date.parse(value.checkedAt))) throw new Error("Provider acceptance artifact 1.2.0 requires a valid checkedAt timestamp.");
    if (value.semanticParser !== aggregateStatus(scenarios.map((scenario) => scenario.semanticParser))) throw new Error("Semantic Parser aggregate status does not match provider scenarios.");
    if (value.answerComposer !== aggregateStatus(scenarios.map((scenario) => scenario.answerComposer))) throw new Error("Answer Composer aggregate status does not match provider scenarios.");
    if (value.fullPipeline !== aggregateStatus(scenarios.map((scenario) => scenario.fullPipeline))) throw new Error("Full Pipeline aggregate status does not match provider scenarios.");
    if (value.fallbackUsed !== scenarios.some((scenario) => scenario.fallbackUsed)) throw new Error("Provider fallback aggregate does not match provider scenarios.");
  }
  return {
    artifactVersion: value.artifactVersion as ProviderAcceptanceArtifact["artifactVersion"],
    providerId: typeof value.providerId === "string" ? value.providerId : undefined,
    transport: value.transport as EvaluationProviderAcceptance["transport"],
    fallbackUsed: typeof value.fallbackUsed === "boolean" ? value.fallbackUsed : undefined,
    semanticParser: value.semanticParser,
    answerComposer: value.answerComposer,
    fullPipeline: value.fullPipeline as ProviderAcceptanceStatus | undefined,
    modelIds: value.modelIds as string[] | undefined,
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : undefined,
    details: value.details as string[],
    scenarios,
  };
}

function validateScenarioAcceptances(value: unknown): NonNullable<EvaluationProviderAcceptance["scenarios"]> {
  if (!Array.isArray(value)) throw new Error("Provider scenario acceptance must be an array.");
  const scenarios = value.map((item) => {
    if (!isRecord(item) || typeof item.scenarioId !== "string" || !item.scenarioId) throw new Error("Provider scenario acceptance requires a scenario ID.");
    if (!isStatus(item.semanticParser) || !isStatus(item.answerComposer) || !isStatus(item.fullPipeline)) throw new Error(`Invalid provider status for scenario ${item.scenarioId}.`);
    if (typeof item.fallbackUsed !== "boolean") throw new Error(`Provider fallback status is required for scenario ${item.scenarioId}.`);
    if (typeof item.citationCoverage !== "number" || item.citationCoverage < 0 || item.citationCoverage > 1) throw new Error(`Invalid citation coverage for scenario ${item.scenarioId}.`);
    if (typeof item.checkedAt !== "string" || !Number.isFinite(Date.parse(item.checkedAt))) throw new Error(`Invalid checkedAt for scenario ${item.scenarioId}.`);
    if (!Array.isArray(item.details) || !item.details.every((detail) => typeof detail === "string")) throw new Error(`Invalid details for scenario ${item.scenarioId}.`);
    return {
      scenarioId: item.scenarioId,
      semanticParser: item.semanticParser,
      answerComposer: item.answerComposer,
      fullPipeline: item.fullPipeline,
      fallbackUsed: item.fallbackUsed,
      citationCoverage: item.citationCoverage,
      checkedAt: item.checkedAt,
      details: item.details as string[],
    };
  });
  if (new Set(scenarios.map((scenario) => scenario.scenarioId)).size !== scenarios.length) throw new Error("Provider scenario acceptance contains duplicate scenario IDs.");
  return scenarios;
}

function isStatus(value: unknown): value is ProviderAcceptanceStatus {
  return value === "pending" || value === "passed" || value === "failed";
}

function aggregateStatus(statuses: ProviderAcceptanceStatus[]): ProviderAcceptanceStatus {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.every((status) => status === "passed")) return "passed";
  return "pending";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
