import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  AgentPipelineError,
  DeterministicEvidenceAnswerComposer,
  DeterministicScenarioSemanticParser,
  RepositoryGraphRetriever,
  SystemAgentClock,
  createDeterministicAgentPipeline,
} from "../../packages/agent-core/src/index";
import {
  bottleneckAnalysisBaseline,
  canonicalKnowledgeBaselines,
  engineeringChangeImpactBaseline,
} from "../../packages/demo-data/src/index";
import type {
  ProviderAcceptanceArtifact,
  ProviderAcceptanceStatus,
  ProviderScenarioAcceptance,
} from "../../packages/agent-evaluation/src/index";
import type {
  AgentTurnRequest,
  AgentTurnResponse,
  CanonicalKnowledgeBaseline,
} from "../../packages/knowledge-contracts/src/index";
import { AGENT_CONTRACT_VERSION } from "../../packages/knowledge-contracts/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { createDefaultGovernedDocumentRetriever } from "./governedDocumentEvidence";
import { answerComposerFromEnvironment, semanticParserFromEnvironment } from "./runtime";

export type LiveProviderKind = "openai" | "deepseek";

export type LiveProviderAcceptanceOptions = {
  provider: LiveProviderKind;
  outputPath: string;
  environment?: NodeJS.ProcessEnv;
};

const CROSS_DOMAIN_ACCEPTANCE_ID = "cross-domain-engineering-quality-bottleneck";

export async function runLiveProviderAcceptance(options: LiveProviderAcceptanceOptions): Promise<ProviderAcceptanceArtifact> {
  const environment: NodeJS.ProcessEnv = { ...(options.environment ?? process.env), MKG_LLM_PROVIDER: options.provider };
  const deepSeek = options.provider === "deepseek";
  const semanticModel = deepSeek ? environment.MKG_DEEPSEEK_MODEL ?? "deepseek-v4-flash" : environment.MKG_LLM_MODEL;
  const answerModel = deepSeek ? environment.MKG_DEEPSEEK_ANSWER_MODEL ?? semanticModel : environment.MKG_LLM_ANSWER_MODEL ?? semanticModel;
  const apiKeyConfigured = Boolean(deepSeek ? environment.MKG_DEEPSEEK_API_KEY : environment.MKG_OPENAI_API_KEY);
  const scenarioResults: ProviderScenarioAcceptance[] = [];
  const artifact: ProviderAcceptanceArtifact = {
    artifactVersion: "1.2.0",
    providerId: deepSeek ? "deepseek-chat-completions" : "openai-responses",
    transport: deepSeek ? "chat-completions" : "responses-api",
    fallbackUsed: false,
    semanticParser: "pending",
    answerComposer: "pending",
    fullPipeline: "pending",
    modelIds: [...new Set([semanticModel, answerModel].filter((value): value is string => Boolean(value)))],
    checkedAt: new Date().toISOString(),
    details: [],
    scenarios: scenarioResults,
  };

  if (!apiKeyConfigured || !semanticModel || !answerModel) {
    scenarioResults.push(
      ...canonicalKnowledgeBaselines.map((baseline) => pendingScenario(baseline.scenario.id, "Provider credentials and explicit models are required.")),
      pendingScenario(CROSS_DOMAIN_ACCEPTANCE_ID, "Provider credentials and explicit models are required."),
    );
    artifact.details.push(`${label(options.provider)} Phase 5B live acceptance: pending. A server-side API key and explicit semantic/answer models are required.`);
  } else {
    for (const baseline of canonicalKnowledgeBaselines) {
      scenarioResults.push(await smokeScenario(options.provider, environment, baseline));
    }
    scenarioResults.push(await smokeCrossDomain(options.provider, environment));
    artifact.semanticParser = aggregateStatus(scenarioResults.map((scenario) => scenario.semanticParser));
    artifact.answerComposer = aggregateStatus(scenarioResults.map((scenario) => scenario.answerComposer));
    artifact.fullPipeline = aggregateStatus(scenarioResults.map((scenario) => scenario.fullPipeline));
    artifact.details.push(...scenarioResults.map((scenario) => `${scenario.scenarioId}: semantic=${scenario.semanticParser}, answer=${scenario.answerComposer}, full=${scenario.fullPipeline}, fallback=${scenario.fallbackUsed}, citationCoverage=${scenario.citationCoverage}.`));
  }

  await atomicWrite(options.outputPath, artifact);
  return artifact;
}

export function acceptanceFailed(artifact: ProviderAcceptanceArtifact): boolean {
  return artifact.semanticParser === "failed"
    || artifact.answerComposer === "failed"
    || artifact.fullPipeline === "failed"
    || Boolean(artifact.scenarios?.some((scenario) => scenario.semanticParser === "failed" || scenario.answerComposer === "failed" || scenario.fullPipeline === "failed" || scenario.fallbackUsed));
}

async function smokeScenario(provider: LiveProviderKind, environment: NodeJS.ProcessEnv, baseline: CanonicalKnowledgeBaseline): Promise<ProviderScenarioAcceptance> {
  const details: string[] = [];
  const checkedAt = new Date().toISOString();
  const semanticParser = await smokeSemanticParser(provider, environment, baseline, details);
  const answerComposer = await smokeAnswerComposer(provider, environment, baseline, details);
  const full = semanticParser === "passed" && answerComposer === "passed"
    ? await smokeFullPipeline(provider, environment, baseline, details)
    : { status: "failed" as const, citationCoverage: 0 };
  if (full.status === "failed" && (semanticParser !== "passed" || answerComposer !== "passed")) details.push("Full pipeline was blocked because a component provider smoke failed.");
  return {
    scenarioId: baseline.scenario.id,
    semanticParser,
    answerComposer,
    fullPipeline: full.status,
    fallbackUsed: false,
    citationCoverage: full.citationCoverage,
    checkedAt,
    details,
  };
}

async function smokeSemanticParser(provider: LiveProviderKind, environment: NodeJS.ProcessEnv, baseline: CanonicalKnowledgeBaseline, details: string[]): Promise<ProviderAcceptanceStatus> {
  try {
    const configured = semanticParserFromEnvironment({ ...environment, MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: configured.parser, answerComposer: new DeterministicEvidenceAnswerComposer() }).run(request(`${provider}.${baseline.scenario.id}.semantic`, baseline));
    assertGovernedResponse(response, baseline);
    details.push("Semantic Parser passed with a real provider call, canonical reconstruction, and ontology validation.");
    return "passed";
  } catch (error) {
    details.push(`Semantic Parser failed (${safeError(error)}).`);
    return "failed";
  }
}

async function smokeAnswerComposer(provider: LiveProviderKind, environment: NodeJS.ProcessEnv, baseline: CanonicalKnowledgeBaseline, details: string[]): Promise<ProviderAcceptanceStatus> {
  try {
    const configured = answerComposerFromEnvironment({ ...environment, MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: new DeterministicScenarioSemanticParser(), answerComposer: configured.composer }).run(request(`${provider}.${baseline.scenario.id}.answer`, baseline));
    assertGovernedResponse(response, baseline);
    details.push("Answer Composer passed with a real provider call and deterministic claim/evidence/citation validation.");
    return "passed";
  } catch (error) {
    details.push(`Answer Composer failed (${safeError(error)}).`);
    return "failed";
  }
}

async function smokeFullPipeline(provider: LiveProviderKind, environment: NodeJS.ProcessEnv, baseline: CanonicalKnowledgeBaseline, details: string[]): Promise<{ status: ProviderAcceptanceStatus; citationCoverage: number }> {
  try {
    const semantic = semanticParserFromEnvironment({ ...environment, MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" });
    const answer = answerComposerFromEnvironment({ ...environment, MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: semantic.parser, answerComposer: answer.composer }).run(request(`${provider}.${baseline.scenario.id}.full`, baseline));
    assertGovernedResponse(response, baseline);
    details.push("Full Pipeline passed from provider semantic parsing through the deterministic citation publication gate.");
    return { status: "passed", citationCoverage: citationCoverage(response) };
  } catch (error) {
    details.push(`Full Pipeline failed (${safeError(error)}).`);
    return { status: "failed", citationCoverage: 0 };
  }
}

async function smokeCrossDomain(provider: LiveProviderKind, environment: NodeJS.ProcessEnv): Promise<ProviderScenarioAcceptance> {
  const details: string[] = [];
  const checkedAt = new Date().toISOString();
  try {
    const semantic = semanticParserFromEnvironment({ ...environment, MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" });
    const answer = answerComposerFromEnvironment({ ...environment, MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" });
    const agent = pipeline({ semanticParser: semantic.parser, answerComposer: answer.composer });
    const engineering = await agent.run(request(`${provider}.cross-domain.engineering`, engineeringChangeImpactBaseline));
    const bottleneck = await agent.run(request(`${provider}.cross-domain.bottleneck`, bottleneckAnalysisBaseline));
    assertGovernedResponse(engineering, engineeringChangeImpactBaseline);
    assertGovernedResponse(bottleneck, bottleneckAnalysisBaseline);
    if (!engineering.answer.claims.some((claim) => claim.id === "claim.quality-control-impact")) throw new ProviderAcceptanceError("Engineering response omitted the governed quality-control impact claim.");
    if (!bottleneck.answer.claims.some((claim) => claim.id === "claim.shift-risk")) throw new ProviderAcceptanceError("Bottleneck response omitted the governed downstream shift-risk claim.");
    const coverage = Math.min(citationCoverage(engineering), citationCoverage(bottleneck));
    details.push("Cross-domain Engineering Change -> Quality Control -> Bottleneck Shift Risk chain passed with governed evidence in both pipelines.");
    return { scenarioId: CROSS_DOMAIN_ACCEPTANCE_ID, semanticParser: "passed", answerComposer: "passed", fullPipeline: "passed", fallbackUsed: false, citationCoverage: coverage, checkedAt, details };
  } catch (error) {
    details.push(`Cross-domain Full Pipeline failed (${safeError(error)}).`);
    return { scenarioId: CROSS_DOMAIN_ACCEPTANCE_ID, semanticParser: "failed", answerComposer: "failed", fullPipeline: "failed", fallbackUsed: false, citationCoverage: 0, checkedAt, details };
  }
}

function assertGovernedResponse(response: AgentTurnResponse, baseline: CanonicalKnowledgeBaseline): void {
  const baselineEntityIds = new Set(baseline.entities.map((entity) => entity.id));
  const resolvedIds = new Set(response.queryPlan.entities.map((entity) => entity.id));
  if (response.queryPlan.intent !== baseline.scenario.intent) throw new ProviderAcceptanceError("Semantic intent did not match the canonical scenario.");
  if (!baseline.scenario.seedEntityIds.every((id) => resolvedIds.has(id))) throw new ProviderAcceptanceError("Canonical seed entity resolution did not match the acceptance baseline.");
  if (![...resolvedIds].every((id) => baselineEntityIds.has(id))) throw new ProviderAcceptanceError("Provider output introduced an entity outside the canonical baseline.");
  if (!response.graphQueryPlan?.readOnly || response.graphQueryPlan.templateId !== baseline.graphQueryPlan.templateId) throw new ProviderAcceptanceError("Safe GraphQueryPlan acceptance failed.");
  const requiredClaims = baseline.evidencePack.claimPolicies?.filter((policy) => policy.required).map((policy) => policy.claimId) ?? [];
  if (!requiredClaims.every((claimId) => response.answer.claims.some((claim) => claim.id === claimId))) throw new ProviderAcceptanceError("Answer omitted a required governed claim.");
  if (response.citationValidation.status !== "passed" || response.citationValidation.issues.length || citationCoverage(response) !== 1) throw new ProviderAcceptanceError("Citation publication gate did not pass with full factual coverage.");
}

function citationCoverage(response: AgentTurnResponse): number {
  const evidenceIds = new Set(response.evidencePack.items.map((item) => item.id));
  const facts = response.answer.claims.filter((claim) => claim.classification === "fact");
  if (!facts.length) return 1;
  return facts.filter((claim) => claim.citations.length > 0 && claim.citations.every((citation) => evidenceIds.has(citation.evidenceId))).length / facts.length;
}

function pipeline(overrides: Parameters<typeof createDeterministicAgentPipeline>[0]) {
  return createDeterministicAgentPipeline({
    clock: new SystemAgentClock(),
    graphRetriever: new RepositoryGraphRetriever(new MockKnowledgeRepository()),
    documentRetriever: createDefaultGovernedDocumentRetriever(),
    ...overrides,
  });
}

function request(requestId: string, baseline: CanonicalKnowledgeBaseline): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId: baseline.scenario.id,
    mode: "live",
    language: "en",
    message: baseline.scenario.question,
    requestedAt: new Date().toISOString(),
  };
}

function pendingScenario(scenarioId: string, reason: string): ProviderScenarioAcceptance {
  return { scenarioId, semanticParser: "pending", answerComposer: "pending", fullPipeline: "pending", fallbackUsed: false, citationCoverage: 0, checkedAt: new Date().toISOString(), details: [reason] };
}

function aggregateStatus(statuses: ProviderAcceptanceStatus[]): ProviderAcceptanceStatus {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.every((status) => status === "passed")) return "passed";
  return "pending";
}

function label(provider: LiveProviderKind): string {
  return provider === "deepseek" ? "DeepSeek" : "OpenAI";
}

function safeError(error: unknown): string {
  if (error instanceof AgentPipelineError) return `${error.detail.code}: ${error.detail.message}`;
  if (error instanceof ProviderAcceptanceError) return error.message;
  return error instanceof Error ? error.name : "unknown provider error";
}

class ProviderAcceptanceError extends Error {
  override readonly name = "ProviderAcceptanceError";
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
