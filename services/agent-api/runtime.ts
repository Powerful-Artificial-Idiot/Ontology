import { resolve } from "node:path";
import {
  InMemoryAgentRunEventStore,
  InMemoryAgentRunStore,
  DeterministicLeakRateSemanticParser,
  DeterministicEvidenceAnswerComposer,
  InMemoryCanonicalDocumentRetriever,
  HybridSemanticParser,
  HybridEvidenceAnswerComposer,
  LlmEvidenceAnswerComposer,
  LlmSemanticParser,
  RepositoryGraphRetriever,
  SystemAgentClock,
  createDeterministicAgentClient,
  type AnswerComposer,
  type AnswerComposerMode,
  type DocumentEvidenceRetriever,
  type SemanticParser,
  type SemanticParserMode,
} from "../../packages/agent-core/src/index";
import { Neo4jKnowledgeRepository, type Neo4jKnowledgeRepositoryOptions } from "../../packages/neo4j-repository/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import type { AgentApiRuntime } from "./app";
import {
  FileAgentAuditStore,
  FileAgentRunEventStore,
  FileAgentRunStore,
  FileAgentSessionStore,
  FileAgentStore,
  FileAgentTurnStore,
} from "./persistentStore";
import { AgentTurnRunService } from "./turnRunService";
import { OpenAiResponsesSemanticProvider } from "./openAiSemanticProvider";
import { OpenAiResponsesAnswerProvider } from "./openAiAnswerProvider";
import { createDefaultGovernedDocumentRetriever } from "./governedDocumentEvidence";
import { InMemoryAgentTelemetrySink, LocalJsonlAgentTelemetrySink, RedactingAgentTelemetrySink, type AgentTelemetrySink } from "../../packages/agent-evaluation/src/index";
import { DeepSeekSemanticProvider } from "./deepSeekSemanticProvider";
import { DeepSeekAnswerProvider } from "./deepSeekAnswerProvider";
import { isDeepSeekModel, type DeepSeekModel } from "./deepSeekChatCompletionsClient";

export type AgentKnowledgeRepositoryMode = "mock" | "neo4j";
export type AgentDocumentEvidenceMode = "canonical" | "governed";
export type AgentLlmProviderType = "openai-responses" | "deepseek-chat-completions";

export type ConfiguredAgentApiRuntime = AgentApiRuntime & {
  close(): Promise<void>;
};

export function createInMemoryAgentApiRuntime(): AgentApiRuntime {
  const clock = new SystemAgentClock();
  const repository = new MockKnowledgeRepository();
  const core = createDeterministicAgentClient(clock, {
    graphRetriever: new RepositoryGraphRetriever(repository),
    documentRetriever: createDefaultGovernedDocumentRetriever(),
  });
  const runs = new InMemoryAgentRunStore();
  const runEvents = new InMemoryAgentRunEventStore();
  const telemetry = new RedactingAgentTelemetrySink(new InMemoryAgentTelemetrySink());
  return {
    ...core,
    runs,
    runEvents,
    runService: new AgentTurnRunService({ client: core.client, runs, events: runEvents, telemetry }),
    knowledgeRepositoryType: "mock",
    persistenceType: "in-memory",
    semanticParserMode: "deterministic",
    answerComposerMode: "template",
    documentEvidenceMode: "governed",
  };
}

export async function createConfiguredAgentApiRuntime(environment: NodeJS.ProcessEnv = process.env): Promise<ConfiguredAgentApiRuntime> {
  const mode = parseRepositoryMode(environment.MKG_AGENT_KNOWLEDGE_MODE);
  const clock = new SystemAgentClock();
  const telemetry = telemetryFromEnvironment(environment);
  const semantic = semanticParserFromEnvironment(environment, telemetry);
  const answer = answerComposerFromEnvironment(environment, telemetry);
  const documentMode = parseDocumentEvidenceMode(environment.MKG_AGENT_DOCUMENT_MODE);
  let documentRetriever: DocumentEvidenceRetriever;
  if (documentMode === "governed") {
    const governed = createDefaultGovernedDocumentRetriever(environment);
    const ingestion = await governed.getIngestionResult();
    if (ingestion.rejectedDocumentIds.length || ingestion.issues.length) {
      throw new Error(`Governed document registry validation failed: ${JSON.stringify(ingestion.issues)}`);
    }
    documentRetriever = governed;
  } else {
    documentRetriever = new InMemoryCanonicalDocumentRetriever();
  }
  const repository = mode === "neo4j"
    ? new Neo4jKnowledgeRepository(neo4jOptionsFromEnvironment(environment))
    : new MockKnowledgeRepository();
  if (repository instanceof Neo4jKnowledgeRepository) {
    try {
      await repository.verifyConnectivity();
    } catch (error) {
      await repository.close();
      throw new Error(`Neo4j repository connectivity check failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  const persistenceMode = environment.MKG_AGENT_STORE_MODE === "memory" ? "in-memory" : "file";
  const persistentStore = persistenceMode === "file"
    ? new FileAgentStore(resolve(environment.MKG_AGENT_STORE_PATH ?? ".data/agent-store.json"))
    : undefined;
  await persistentStore?.initialize();
  const sessions = persistentStore ? new FileAgentSessionStore(persistentStore) : undefined;
  const turns = persistentStore ? new FileAgentTurnStore(persistentStore) : undefined;
  const audit = persistentStore ? new FileAgentAuditStore(persistentStore) : undefined;
  const core = createDeterministicAgentClient(
    clock,
    { graphRetriever: new RepositoryGraphRetriever(repository), documentRetriever, semanticParser: semantic.parser, answerComposer: answer.composer },
    { sessions, turns, audit },
  );
  const runs = persistentStore ? new FileAgentRunStore(persistentStore) : new InMemoryAgentRunStore();
  const runEvents = persistentStore ? new FileAgentRunEventStore(persistentStore) : new InMemoryAgentRunEventStore();
  const usesLlm = semantic.mode !== "deterministic" || answer.mode !== "template";
  const timeoutMs = parsePositiveInteger(environment.MKG_AGENT_RUN_TIMEOUT_MS, usesLlm ? 60_000 : 10_000);
  return {
    ...core,
    runs,
    runEvents,
    runService: new AgentTurnRunService({ client: core.client, runs, events: runEvents, timeoutMs, telemetry }),
    timeoutMs,
    knowledgeRepositoryType: mode,
    persistenceType: persistenceMode,
    semanticParserMode: semantic.mode,
    answerComposerMode: answer.mode,
    documentEvidenceMode: documentMode,
    llmProviderType: semantic.providerType ?? answer.providerType,
    close: () => repository instanceof Neo4jKnowledgeRepository ? repository.close() : Promise.resolve(),
  };
}

export function answerComposerFromEnvironment(environment: NodeJS.ProcessEnv = process.env, telemetry?: AgentTelemetrySink): { mode: AnswerComposerMode; composer: AnswerComposer; providerType?: AgentLlmProviderType } {
  const mode = parseAnswerComposerMode(environment.MKG_AGENT_ANSWER_COMPOSER_MODE);
  const template = new DeterministicEvidenceAnswerComposer();
  if (mode === "template") return { mode, composer: template };
  const provider = environment.MKG_LLM_PROVIDER ?? "openai";
  const timeoutMs = parsePositiveInteger(environment.MKG_LLM_ANSWER_TIMEOUT_MS ?? environment.MKG_LLM_TIMEOUT_MS, 30_000);
  if (provider === "openai") {
    const apiKey = environment.MKG_OPENAI_API_KEY;
    const model = environment.MKG_LLM_ANSWER_MODEL ?? environment.MKG_LLM_MODEL;
    if (!apiKey) throw new Error("MKG_OPENAI_API_KEY is required when the answer composer mode uses an LLM.");
    if (!model) throw new Error("MKG_LLM_ANSWER_MODEL or MKG_LLM_MODEL is required when the answer composer mode uses an LLM.");
    const llm = new LlmEvidenceAnswerComposer(new OpenAiResponsesAnswerProvider({ apiKey, model, baseUrl: environment.MKG_OPENAI_BASE_URL, timeoutMs, telemetry }));
    return { mode, composer: mode === "hybrid" ? new HybridEvidenceAnswerComposer(template, llm) : llm, providerType: "openai-responses" };
  }
  if (provider === "deepseek") {
    const apiKey = environment.MKG_DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("MKG_DEEPSEEK_API_KEY is required when the answer composer uses DeepSeek.");
    const model = deepSeekModel(environment.MKG_DEEPSEEK_ANSWER_MODEL ?? environment.MKG_DEEPSEEK_MODEL ?? "deepseek-v4-flash");
    const llm = new LlmEvidenceAnswerComposer(new DeepSeekAnswerProvider({ apiKey, model, baseUrl: environment.MKG_DEEPSEEK_BASE_URL, timeoutMs, telemetry }));
    return { mode, composer: mode === "hybrid" ? new HybridEvidenceAnswerComposer(template, llm) : llm, providerType: "deepseek-chat-completions" };
  }
  throw new Error(`Unsupported MKG_LLM_PROVIDER ${provider}. Use openai or deepseek.`);
}

export function semanticParserFromEnvironment(environment: NodeJS.ProcessEnv = process.env, telemetry?: AgentTelemetrySink): { mode: SemanticParserMode; parser: SemanticParser; providerType?: AgentLlmProviderType } {
  const mode = parseSemanticParserMode(environment.MKG_AGENT_SEMANTIC_PARSER_MODE);
  const deterministic = new DeterministicLeakRateSemanticParser();
  if (mode === "deterministic") return { mode, parser: deterministic };
  const provider = environment.MKG_LLM_PROVIDER ?? "openai";
  const timeoutMs = parsePositiveInteger(environment.MKG_LLM_TIMEOUT_MS, 20_000);
  if (provider === "openai") {
    const apiKey = environment.MKG_OPENAI_API_KEY;
    const model = environment.MKG_LLM_MODEL;
    if (!apiKey) throw new Error("MKG_OPENAI_API_KEY is required when the semantic parser mode uses an LLM.");
    if (!model) throw new Error("MKG_LLM_MODEL is required when the semantic parser mode uses an LLM.");
    const llm = new LlmSemanticParser(new OpenAiResponsesSemanticProvider({ apiKey, model, baseUrl: environment.MKG_OPENAI_BASE_URL, timeoutMs, telemetry }));
    return { mode, parser: mode === "hybrid" ? new HybridSemanticParser(deterministic, llm) : llm, providerType: "openai-responses" };
  }
  if (provider === "deepseek") {
    const apiKey = environment.MKG_DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("MKG_DEEPSEEK_API_KEY is required when the semantic parser uses DeepSeek.");
    const model = deepSeekModel(environment.MKG_DEEPSEEK_MODEL ?? "deepseek-v4-flash");
    const llm = new LlmSemanticParser(new DeepSeekSemanticProvider({ apiKey, model, baseUrl: environment.MKG_DEEPSEEK_BASE_URL, timeoutMs, telemetry }));
    return { mode, parser: mode === "hybrid" ? new HybridSemanticParser(deterministic, llm) : llm, providerType: "deepseek-chat-completions" };
  }
  throw new Error(`Unsupported MKG_LLM_PROVIDER ${provider}. Use openai or deepseek.`);
}

function deepSeekModel(value: string): DeepSeekModel {
  if (!isDeepSeekModel(value)) throw new Error(`Unsupported DeepSeek model ${value}. Use deepseek-v4-flash or deepseek-v4-pro.`);
  return value;
}

function telemetryFromEnvironment(environment: NodeJS.ProcessEnv): AgentTelemetrySink {
  if (environment.MKG_AGENT_TELEMETRY_MODE === "off") return { record() {} };
  return new RedactingAgentTelemetrySink(new LocalJsonlAgentTelemetrySink(resolve(environment.MKG_AGENT_TELEMETRY_PATH ?? ".data/agent-telemetry.jsonl")));
}

export function neo4jOptionsFromEnvironment(environment: NodeJS.ProcessEnv = process.env): Neo4jKnowledgeRepositoryOptions {
  const password = environment.MKG_NEO4J_PASSWORD;
  if (!password) throw new Error("MKG_NEO4J_PASSWORD is required when MKG_AGENT_KNOWLEDGE_MODE=neo4j.");
  return {
    uri: environment.MKG_NEO4J_URI ?? "bolt://127.0.0.1:7687",
    username: environment.MKG_NEO4J_USERNAME ?? "neo4j",
    password,
    database: environment.MKG_NEO4J_DATABASE ?? "neo4j",
  };
}

function parseRepositoryMode(value?: string): AgentKnowledgeRepositoryMode {
  if (!value || value === "mock") return "mock";
  if (value === "neo4j") return "neo4j";
  throw new Error(`Unsupported MKG_AGENT_KNOWLEDGE_MODE ${value}. Use mock or neo4j.`);
}

function parseDocumentEvidenceMode(value?: string): AgentDocumentEvidenceMode {
  if (!value || value === "governed") return "governed";
  if (value === "canonical") return "canonical";
  throw new Error(`Unsupported MKG_AGENT_DOCUMENT_MODE ${value}. Use governed or canonical.`);
}

function parseSemanticParserMode(value?: string): SemanticParserMode {
  if (!value || value === "deterministic") return "deterministic";
  if (value === "llm" || value === "hybrid") return value;
  throw new Error(`Unsupported MKG_AGENT_SEMANTIC_PARSER_MODE ${value}. Use deterministic, llm, or hybrid.`);
}

function parseAnswerComposerMode(value?: string): AnswerComposerMode {
  if (!value || value === "template") return "template";
  if (value === "llm" || value === "hybrid") return value;
  throw new Error(`Unsupported MKG_AGENT_ANSWER_COMPOSER_MODE ${value}. Use template, llm, or hybrid.`);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Expected a positive integer but received ${value}.`);
  return parsed;
}
