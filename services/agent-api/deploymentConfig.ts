import { isDeepSeekModel } from "./deepSeekChatCompletionsClient";
import { ensureWritableDataDirectory, validateProductionDataDirectory } from "../runtimePaths";

export type AgentDeploymentConfigStatus = {
  nodeEnvironmentProduction: boolean;
  deepSeekConfigured: boolean;
  deepSeekEndpointConfigured: boolean;
  semanticModelConfigured: boolean;
  answerModelConfigured: boolean;
  neo4jConfigured: boolean;
  authenticationConfigured: boolean;
  dataDirectoryConfigured: boolean;
  dataDirectoryWritable: boolean;
  governedDocumentsConfigured: boolean;
  persistentStoreConfigured: boolean;
  apiLoopbackOnly: boolean;
};

export async function validateAgentDeploymentConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ dataDirectory: string; status: AgentDeploymentConfigStatus }> {
  const production = environment.NODE_ENV === "production";
  const dataDirectory = validateProductionDataDirectory(environment);
  const semanticModel = environment.MKG_DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  const answerModel = environment.MKG_DEEPSEEK_ANSWER_MODEL ?? semanticModel;
  const host = environment.MKG_AGENT_API_HOST ?? "127.0.0.1";
  const deepSeekBaseUrl = environment.MKG_DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const status: AgentDeploymentConfigStatus = {
    nodeEnvironmentProduction: production,
    deepSeekConfigured: environment.MKG_LLM_PROVIDER === "deepseek" && Boolean(environment.MKG_DEEPSEEK_API_KEY?.trim()),
    deepSeekEndpointConfigured: deepSeekBaseUrl === "https://api.deepseek.com",
    semanticModelConfigured: isDeepSeekModel(semanticModel),
    answerModelConfigured: isDeepSeekModel(answerModel),
    neo4jConfigured: environment.MKG_AGENT_KNOWLEDGE_MODE === "neo4j"
      && Boolean(environment.MKG_NEO4J_URI?.trim())
      && Boolean(environment.MKG_NEO4J_USERNAME?.trim())
      && Boolean(environment.MKG_NEO4J_PASSWORD?.trim()),
    authenticationConfigured: environment.MKG_AGENT_SECURITY_PROFILE === "production"
      && environment.MKG_AGENT_AUTH_MODE === "static-bearer"
      && (environment.MKG_AGENT_AUTH_STATIC_TOKEN?.trim().length ?? 0) >= 16
      && Boolean(environment.MKG_AGENT_AUTH_PRINCIPAL_ID?.trim())
      && Boolean(environment.MKG_AGENT_AUTH_TENANT_ID?.trim())
      && Boolean(environment.MKG_AGENT_AUTH_ROLE_IDS?.trim())
      && Boolean(environment.MKG_AGENT_AUTH_DOMAIN_IDS?.trim()),
    dataDirectoryConfigured: !production || Boolean(environment.MKG_DATA_DIR?.trim()),
    dataDirectoryWritable: false,
    governedDocumentsConfigured: environment.MKG_AGENT_DOCUMENT_MODE === "governed",
    persistentStoreConfigured: environment.MKG_AGENT_STORE_MODE !== "memory",
    apiLoopbackOnly: host === "127.0.0.1" || host === "::1",
  };

  if (production) {
    const missing = [
      ["DeepSeek", status.deepSeekConfigured],
      ["official DeepSeek endpoint", status.deepSeekEndpointConfigured],
      ["DeepSeek semantic model", status.semanticModelConfigured],
      ["DeepSeek answer model", status.answerModelConfigured],
      ["Neo4j", status.neo4jConfigured],
      ["authentication", status.authenticationConfigured],
      ["data directory", status.dataDirectoryConfigured],
      ["governed documents", status.governedDocumentsConfigured],
      ["persistent Agent store", status.persistentStoreConfigured],
      ["loopback API host", status.apiLoopbackOnly],
      ["LLM semantic parser", environment.MKG_AGENT_SEMANTIC_PARSER_MODE === "llm"],
      ["LLM answer composer", environment.MKG_AGENT_ANSWER_COMPOSER_MODE === "llm"],
    ].filter(([, configured]) => !configured).map(([name]) => name);
    if (missing.length) throw new Error(`Production Agent configuration is incomplete: ${missing.join(", ")}.`);
  }

  await ensureWritableDataDirectory(dataDirectory);
  status.dataDirectoryWritable = true;
  return { dataDirectory, status };
}
