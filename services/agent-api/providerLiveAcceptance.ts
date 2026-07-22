import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  AgentPipelineError,
  DeterministicEvidenceAnswerComposer,
  DeterministicLeakRateSemanticParser,
  RepositoryGraphRetriever,
  SystemAgentClock,
  createDeterministicAgentPipeline,
} from "../../packages/agent-core/src/index";
import type { ProviderAcceptanceArtifact, ProviderAcceptanceStatus } from "../../packages/agent-evaluation/src/index";
import { AGENT_CONTRACT_VERSION, type AgentTurnRequest, type AgentTurnResponse } from "../../packages/knowledge-contracts/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { createDefaultGovernedDocumentRetriever } from "./governedDocumentEvidence";
import { answerComposerFromEnvironment, semanticParserFromEnvironment } from "./runtime";

export type LiveProviderKind = "openai" | "deepseek";

export type LiveProviderAcceptanceOptions = {
  provider: LiveProviderKind;
  outputPath: string;
  environment?: NodeJS.ProcessEnv;
};

export async function runLiveProviderAcceptance(options: LiveProviderAcceptanceOptions): Promise<ProviderAcceptanceArtifact> {
  const environment: NodeJS.ProcessEnv = { ...(options.environment ?? process.env), MKG_LLM_PROVIDER: options.provider };
  const deepSeek = options.provider === "deepseek";
  const semanticModel = deepSeek ? environment.MKG_DEEPSEEK_MODEL ?? "deepseek-v4-flash" : environment.MKG_LLM_MODEL;
  const answerModel = deepSeek ? environment.MKG_DEEPSEEK_ANSWER_MODEL ?? semanticModel : environment.MKG_LLM_ANSWER_MODEL ?? semanticModel;
  const apiKeyConfigured = Boolean(deepSeek ? environment.MKG_DEEPSEEK_API_KEY : environment.MKG_OPENAI_API_KEY);
  const artifact: ProviderAcceptanceArtifact = {
    artifactVersion: "1.1.0",
    providerId: deepSeek ? "deepseek-chat-completions" : "openai-responses",
    transport: deepSeek ? "chat-completions" : "responses-api",
    fallbackUsed: false,
    semanticParser: "pending",
    answerComposer: "pending",
    fullPipeline: deepSeek ? "pending" : undefined,
    modelIds: [...new Set([semanticModel, answerModel].filter((value): value is string => Boolean(value)))],
    checkedAt: new Date().toISOString(),
    details: [],
  };

  if (!apiKeyConfigured || !semanticModel) {
    artifact.details.push(`${label(options.provider)} Semantic Parser live acceptance: pending. A server-side API key and semantic model are required.`);
  } else {
    artifact.semanticParser = await smokeSemanticParser(options.provider, environment, artifact.details);
  }

  if (!apiKeyConfigured || !answerModel) {
    artifact.details.push(`${label(options.provider)} Answer Composer live acceptance: pending. A server-side API key and answer model are required.`);
  } else {
    artifact.answerComposer = await smokeAnswerComposer(options.provider, environment, artifact.details);
  }

  if (deepSeek) {
    if (!apiKeyConfigured || !semanticModel || !answerModel) {
      artifact.details.push("DeepSeek full pipeline live acceptance: pending. Provider credentials and models are required.");
    } else if (artifact.semanticParser === "passed" && artifact.answerComposer === "passed") {
      artifact.fullPipeline = await smokeFullPipeline(environment, artifact.details);
    } else {
      artifact.fullPipeline = "failed";
      artifact.details.push("DeepSeek full pipeline live acceptance: failed because a component smoke did not pass.");
    }
  }

  await atomicWrite(options.outputPath, artifact);
  return artifact;
}

export function acceptanceFailed(artifact: ProviderAcceptanceArtifact): boolean {
  return artifact.semanticParser === "failed" || artifact.answerComposer === "failed" || artifact.fullPipeline === "failed";
}

async function smokeSemanticParser(provider: LiveProviderKind, environment: NodeJS.ProcessEnv, details: string[]): Promise<ProviderAcceptanceStatus> {
  try {
    const configured = semanticParserFromEnvironment({ ...environment, MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: configured.parser, answerComposer: new DeterministicEvidenceAnswerComposer() }).run(request(`${provider}-provider-smoke.semantic`));
    assertGovernedResponse(response);
    details.push(`${label(provider)} Semantic Parser live acceptance: passed using a real provider call and canonical reconstruction.`);
    return "passed";
  } catch (error) {
    details.push(`${label(provider)} Semantic Parser live acceptance: failed (${safeError(error)}).`);
    return "failed";
  }
}

async function smokeAnswerComposer(provider: LiveProviderKind, environment: NodeJS.ProcessEnv, details: string[]): Promise<ProviderAcceptanceStatus> {
  try {
    const configured = answerComposerFromEnvironment({ ...environment, MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: new DeterministicLeakRateSemanticParser(), answerComposer: configured.composer }).run(request(`${provider}-provider-smoke.answer`));
    assertGovernedResponse(response);
    details.push(`${label(provider)} Answer Composer live acceptance: passed using a real provider call and deterministic citation validation.`);
    return "passed";
  } catch (error) {
    details.push(`${label(provider)} Answer Composer live acceptance: failed (${safeError(error)}).`);
    return "failed";
  }
}

async function smokeFullPipeline(environment: NodeJS.ProcessEnv, details: string[]): Promise<ProviderAcceptanceStatus> {
  try {
    const semantic = semanticParserFromEnvironment({ ...environment, MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" });
    const answer = answerComposerFromEnvironment({ ...environment, MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: semantic.parser, answerComposer: answer.composer }).run(request("deepseek-provider-smoke.full-pipeline"));
    assertGovernedResponse(response);
    details.push("DeepSeek full pipeline live acceptance: passed from Semantic Parser through deterministic citation publication gate.");
    return "passed";
  } catch (error) {
    details.push(`DeepSeek full pipeline live acceptance: failed (${safeError(error)}).`);
    return "failed";
  }
}

function assertGovernedResponse(response: AgentTurnResponse): void {
  const entityIds = new Set(response.queryPlan.entities.map((entity) => entity.id));
  if (entityIds.size !== 2 || !entityIds.has("operation.op30") || !entityIds.has("quality-characteristic.leak-rate")) throw new ProviderAcceptanceError("Canonical entity resolution did not match the acceptance baseline.");
  if (!response.graphQueryPlan?.readOnly || response.graphQueryPlan.templateId !== "quality-issue-trace.direct-neighborhood.v1") throw new ProviderAcceptanceError("Safe GraphQueryPlan acceptance failed.");
  if (response.evidencePack.items.length !== 5) throw new ProviderAcceptanceError("Evidence Pack acceptance failed.");
  if (response.citationValidation.status !== "passed" || response.citationValidation.issues.length) throw new ProviderAcceptanceError("Citation publication gate did not pass.");
}

class ProviderAcceptanceError extends Error {
  override readonly name = "ProviderAcceptanceError";
}

function pipeline(overrides: Parameters<typeof createDeterministicAgentPipeline>[0]) {
  return createDeterministicAgentPipeline({
    clock: new SystemAgentClock(),
    graphRetriever: new RepositoryGraphRetriever(new MockKnowledgeRepository()),
    documentRetriever: createDefaultGovernedDocumentRetriever(),
    ...overrides,
  });
}

function request(requestId: string): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: "en",
    message: "OP30 Leak Rate is abnormal. Which products, equipment, quality risks, and documents may be affected?",
    requestedAt: new Date().toISOString(),
  };
}

function label(provider: LiveProviderKind): string {
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}

function safeError(error: unknown): string {
  if (error instanceof AgentPipelineError) return `${error.detail.code}: ${error.detail.message}`;
  if (error instanceof ProviderAcceptanceError) return error.message;
  return error instanceof Error ? error.name : "unknown provider error";
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
