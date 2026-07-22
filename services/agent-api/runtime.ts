import { resolve } from "node:path";
import {
  InMemoryAgentRunEventStore,
  InMemoryAgentRunStore,
  DeterministicLeakRateSemanticParser,
  DeterministicEvidenceAnswerComposer,
  HybridSemanticParser,
  HybridEvidenceAnswerComposer,
  LlmEvidenceAnswerComposer,
  LlmSemanticParser,
  RepositoryGraphRetriever,
  SystemAgentClock,
  createDeterministicAgentClient,
  type AnswerComposer,
  type AnswerComposerMode,
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

export type AgentKnowledgeRepositoryMode = "mock" | "neo4j";

export type ConfiguredAgentApiRuntime = AgentApiRuntime & {
  close(): Promise<void>;
};

export function createInMemoryAgentApiRuntime(): AgentApiRuntime {
  const clock = new SystemAgentClock();
  const repository = new MockKnowledgeRepository();
  const core = createDeterministicAgentClient(clock, { graphRetriever: new RepositoryGraphRetriever(repository) });
  const runs = new InMemoryAgentRunStore();
  const runEvents = new InMemoryAgentRunEventStore();
  return {
    ...core,
    runs,
    runEvents,
    runService: new AgentTurnRunService({ client: core.client, runs, events: runEvents }),
    knowledgeRepositoryType: "mock",
    persistenceType: "in-memory",
    semanticParserMode: "deterministic",
    answerComposerMode: "template",
  };
}

export async function createConfiguredAgentApiRuntime(environment: NodeJS.ProcessEnv = process.env): Promise<ConfiguredAgentApiRuntime> {
  const mode = parseRepositoryMode(environment.MKG_AGENT_KNOWLEDGE_MODE);
  const clock = new SystemAgentClock();
  const semantic = semanticParserFromEnvironment(environment);
  const answer = answerComposerFromEnvironment(environment);
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
    { graphRetriever: new RepositoryGraphRetriever(repository), semanticParser: semantic.parser, answerComposer: answer.composer },
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
    runService: new AgentTurnRunService({ client: core.client, runs, events: runEvents, timeoutMs }),
    timeoutMs,
    knowledgeRepositoryType: mode,
    persistenceType: persistenceMode,
    semanticParserMode: semantic.mode,
    answerComposerMode: answer.mode,
    llmProviderType: semantic.providerType ?? answer.providerType,
    close: () => repository instanceof Neo4jKnowledgeRepository ? repository.close() : Promise.resolve(),
  };
}

export function answerComposerFromEnvironment(environment: NodeJS.ProcessEnv = process.env): { mode: AnswerComposerMode; composer: AnswerComposer; providerType?: "openai-responses" } {
  const mode = parseAnswerComposerMode(environment.MKG_AGENT_ANSWER_COMPOSER_MODE);
  const template = new DeterministicEvidenceAnswerComposer();
  if (mode === "template") return { mode, composer: template };
  const provider = environment.MKG_LLM_PROVIDER ?? "openai";
  if (provider !== "openai") throw new Error(`Unsupported MKG_LLM_PROVIDER ${provider}. Use openai.`);
  const apiKey = environment.MKG_OPENAI_API_KEY;
  const model = environment.MKG_LLM_ANSWER_MODEL ?? environment.MKG_LLM_MODEL;
  if (!apiKey) throw new Error("MKG_OPENAI_API_KEY is required when the answer composer mode uses an LLM.");
  if (!model) throw new Error("MKG_LLM_ANSWER_MODEL or MKG_LLM_MODEL is required when the answer composer mode uses an LLM.");
  const llm = new LlmEvidenceAnswerComposer(new OpenAiResponsesAnswerProvider({
    apiKey,
    model,
    baseUrl: environment.MKG_OPENAI_BASE_URL,
    timeoutMs: parsePositiveInteger(environment.MKG_LLM_ANSWER_TIMEOUT_MS ?? environment.MKG_LLM_TIMEOUT_MS, 30_000),
  }));
  return { mode, composer: mode === "hybrid" ? new HybridEvidenceAnswerComposer(template, llm) : llm, providerType: "openai-responses" };
}

export function semanticParserFromEnvironment(environment: NodeJS.ProcessEnv = process.env): { mode: SemanticParserMode; parser: SemanticParser; providerType?: "openai-responses" } {
  const mode = parseSemanticParserMode(environment.MKG_AGENT_SEMANTIC_PARSER_MODE);
  const deterministic = new DeterministicLeakRateSemanticParser();
  if (mode === "deterministic") return { mode, parser: deterministic };
  const provider = environment.MKG_LLM_PROVIDER ?? "openai";
  if (provider !== "openai") throw new Error(`Unsupported MKG_LLM_PROVIDER ${provider}. Use openai.`);
  const apiKey = environment.MKG_OPENAI_API_KEY;
  const model = environment.MKG_LLM_MODEL;
  if (!apiKey) throw new Error("MKG_OPENAI_API_KEY is required when the semantic parser mode uses an LLM.");
  if (!model) throw new Error("MKG_LLM_MODEL is required when the semantic parser mode uses an LLM.");
  const llm = new LlmSemanticParser(new OpenAiResponsesSemanticProvider({
    apiKey,
    model,
    baseUrl: environment.MKG_OPENAI_BASE_URL,
    timeoutMs: parsePositiveInteger(environment.MKG_LLM_TIMEOUT_MS, 20_000),
  }));
  return { mode, parser: mode === "hybrid" ? new HybridSemanticParser(deterministic, llm) : llm, providerType: "openai-responses" };
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
