import neo4j, { type Driver } from "neo4j-driver";
import type { KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
import {
  FileKnowledgeAuthoringStore,
  InMemoryKnowledgeAuthoringStore,
  KnowledgeAuthoringService,
  KnowledgeAuthoringValidator,
  MockKnowledgeAuthoringPublicationStore,
  Neo4jKnowledgeAuthoringPublicationStore,
  PublishedKnowledgeOverlayRepository,
  type KnowledgeAuthoringPublicationStore,
  type KnowledgeAuthoringStore,
} from "../../packages/knowledge-authoring/src/index";
import type { AgentApiSecurityRuntime } from "../agent-api/security";
import { runtimeDataPath } from "../runtimePaths";
import { resolveCanonicalKnowledgeId } from "../../src/data/mockKnowledgeRegistry/ids";
import { createKnowledgeAuthoringHandler } from "./app";

export type ConfiguredKnowledgeAuthoringRuntime = {
  handler: ReturnType<typeof createKnowledgeAuthoringHandler>;
  service: KnowledgeAuthoringService;
  store: KnowledgeAuthoringStore;
  publication: KnowledgeAuthoringPublicationStore;
  close(): Promise<void>;
};

export async function createKnowledgeAuthoringRuntime(options: {
  repository: KnowledgeRepository;
  security: AgentApiSecurityRuntime;
  environment?: NodeJS.ProcessEnv;
  persistence?: "memory" | "file";
  publicationTarget?: "mock" | "neo4j";
}): Promise<ConfiguredKnowledgeAuthoringRuntime> {
  const environment = options.environment ?? process.env;
  const persistence = options.persistence ?? (environment.MKG_AGENT_STORE_MODE === "memory" ? "memory" : "file");
  const store = persistence === "file"
    ? new FileKnowledgeAuthoringStore(runtimeDataPath(environment, "knowledge-authoring.json", environment.MKG_KNOWLEDGE_AUTHORING_STORE_PATH))
    : new InMemoryKnowledgeAuthoringStore();
  await store.initialize();

  let driver: Driver | undefined;
  const publicationTarget = options.publicationTarget ?? (environment.MKG_AGENT_KNOWLEDGE_MODE === "neo4j" ? "neo4j" : "mock");
  const publication = publicationTarget === "neo4j"
    ? (() => {
        const password = required(environment.MKG_NEO4J_PASSWORD, "MKG_NEO4J_PASSWORD");
        driver = neo4j.driver(
          environment.MKG_NEO4J_URI ?? "bolt://127.0.0.1:7687",
          neo4j.auth.basic(environment.MKG_NEO4J_USERNAME ?? "neo4j", password),
          { disableLosslessIntegers: true },
        );
        return new Neo4jKnowledgeAuthoringPublicationStore({ driver, repository: options.repository, database: environment.MKG_NEO4J_DATABASE });
      })()
    : new MockKnowledgeAuthoringPublicationStore(options.repository);
  if (publication instanceof MockKnowledgeAuthoringPublicationStore) {
    const publishedChangeSets = (await store.read()).changeSets.filter((changeSet) => changeSet.status === "published");
    for (const changeSet of publishedChangeSets) {
      await publication.stage(changeSet);
      await publication.publish(changeSet.id);
      const verification = await publication.verify(changeSet.id);
      if (!verification.verified) throw new Error(`Persisted knowledge authoring publication could not be restored: ${changeSet.id}`);
    }
  }
  const validationRepository = publication instanceof MockKnowledgeAuthoringPublicationStore
    ? new PublishedKnowledgeOverlayRepository(options.repository, () => publication.listPublished())
    : options.repository;
  const validator = new KnowledgeAuthoringValidator({ repository: validationRepository, store, resolveAlias: resolveCanonicalKnowledgeId });
  const service = new KnowledgeAuthoringService({ store, validator, publication, authorizer: options.security.authorizer });
  return {
    handler: createKnowledgeAuthoringHandler({ service, security: options.security }),
    service,
    store,
    publication,
    close: () => driver ? driver.close() : Promise.resolve(),
  };
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required for Neo4j knowledge authoring publication.`);
  return value.trim();
}
