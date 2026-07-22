import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DeterministicEvidenceAnswerComposer,
  DeterministicLeakRateSemanticParser,
  RepositoryGraphRetriever,
  SystemAgentClock,
  createDeterministicAgentPipeline,
} from "../../packages/agent-core/src/index";
import { type ProviderAcceptanceArtifact } from "../../packages/agent-evaluation/src/index";
import { AGENT_CONTRACT_VERSION, type AgentTurnRequest } from "../../packages/knowledge-contracts/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { answerComposerFromEnvironment, semanticParserFromEnvironment } from "./runtime";
import { createDefaultGovernedDocumentRetriever } from "./governedDocumentEvidence";

const outputPath = resolve(process.env.MKG_PROVIDER_ACCEPTANCE_PATH ?? ".data/evaluations/openai-provider-acceptance.json");
const checkedAt = new Date().toISOString();
const modelIds = [...new Set([process.env.MKG_LLM_MODEL, process.env.MKG_LLM_ANSWER_MODEL ?? process.env.MKG_LLM_MODEL].filter((value): value is string => Boolean(value)))];
const artifact: ProviderAcceptanceArtifact = {
  artifactVersion: "1.0.0",
  semanticParser: "pending",
  answerComposer: "pending",
  modelIds,
  checkedAt,
  details: [],
};

if (!process.env.MKG_OPENAI_API_KEY || !process.env.MKG_LLM_MODEL) {
  artifact.details.push("Semantic Parser live provider acceptance: pending. MKG_OPENAI_API_KEY and MKG_LLM_MODEL are required.");
} else {
  artifact.semanticParser = await smokeSemanticParser(artifact.details);
}

if (!process.env.MKG_OPENAI_API_KEY || !(process.env.MKG_LLM_ANSWER_MODEL ?? process.env.MKG_LLM_MODEL)) {
  artifact.details.push("Answer Composer live provider acceptance: pending. MKG_OPENAI_API_KEY and an answer model are required.");
} else {
  artifact.answerComposer = await smokeAnswerComposer(artifact.details);
}

await atomicWrite(outputPath, artifact);
console.log(JSON.stringify({ ...artifact, outputPath }, null, 2));
if (artifact.semanticParser === "failed" || artifact.answerComposer === "failed") process.exitCode = 1;

async function smokeSemanticParser(details: string[]): Promise<"passed" | "failed"> {
  try {
    const configured = semanticParserFromEnvironment({ ...process.env, MKG_AGENT_SEMANTIC_PARSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: configured.parser, answerComposer: new DeterministicEvidenceAnswerComposer() }).run(request("provider-smoke.semantic"));
    if (response.queryPlan.entities.map((entity) => entity.id).join(",") !== "operation.op30,quality-characteristic.leak-rate") throw new Error("Canonical entity resolution did not match the acceptance baseline.");
    details.push("Semantic Parser live provider acceptance: passed using a real structured output call.");
    return "passed";
  } catch (error) {
    details.push(`Semantic Parser live provider acceptance: failed (${safeError(error)}).`);
    return "failed";
  }
}

async function smokeAnswerComposer(details: string[]): Promise<"passed" | "failed"> {
  try {
    const configured = answerComposerFromEnvironment({ ...process.env, MKG_AGENT_ANSWER_COMPOSER_MODE: "llm" });
    const response = await pipeline({ semanticParser: new DeterministicLeakRateSemanticParser(), answerComposer: configured.composer }).run(request("provider-smoke.answer"));
    if (response.citationValidation.status !== "passed") throw new Error("Citation publication gate did not pass.");
    details.push("Answer Composer live provider acceptance: passed using a real structured output call and deterministic citation validation.");
    return "passed";
  } catch (error) {
    details.push(`Answer Composer live provider acceptance: failed (${safeError(error)}).`);
    return "failed";
  }
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

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown provider error";
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
