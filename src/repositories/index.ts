export type { KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
export { HttpKnowledgeRepository, KnowledgeApiError } from "../../packages/ontology-client/src/index";
export { MockKnowledgeRepository } from "./MockKnowledgeRepository";

import type { KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
import { HttpKnowledgeRepository } from "../../packages/ontology-client/src/index";
import { MockKnowledgeRepository } from "./MockKnowledgeRepository";
import { supportedKnowledgeVersions } from "./semanticCatalogValidation";

export type KnowledgeRepositoryMode = "local" | "http";

export type KnowledgeRepositoryConfig = {
  mode: KnowledgeRepositoryMode;
  apiBaseUrl: string;
  timeoutMs: number;
  fetcher?: typeof fetch;
};

export function createKnowledgeRepository(config: Partial<KnowledgeRepositoryConfig> = {}): KnowledgeRepository {
  const environment = import.meta.env as ImportMetaEnv;
  const mode = parseMode(config.mode ?? environment.VITE_KNOWLEDGE_MODE);
  if (mode === "local") return new MockKnowledgeRepository();
  return new HttpKnowledgeRepository({
    baseUrl: config.apiBaseUrl ?? environment.VITE_KNOWLEDGE_API_BASE_URL ?? "/api",
    timeoutMs: config.timeoutMs === undefined ? parseTimeout(environment.VITE_KNOWLEDGE_TIMEOUT_MS) : validateTimeout(config.timeoutMs),
    fetcher: config.fetcher,
    expectedVersions: supportedKnowledgeVersions,
  });
}

function parseMode(value?: string): KnowledgeRepositoryMode {
  if (!value || value === "local") return "local";
  if (value === "http") return "http";
  throw new Error(`Unsupported VITE_KNOWLEDGE_MODE ${value}. Use local or http.`);
}

function parseTimeout(value?: string) {
  if (!value) return 5_000;
  return validateTimeout(Number(value), value);
}

function validateTimeout(timeout: number, source = String(timeout)) {
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error(`Invalid knowledge repository timeout ${source}.`);
  return timeout;
}

export const knowledgeRepository = createKnowledgeRepository();
