import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  DeterministicDocumentIngestionPipeline,
  DirectoryDocumentContentReader,
  GovernedDocumentEvidenceStore,
  validateDocumentRegistry,
  type DocumentAccessContext,
  type DocumentIngestionResult,
} from "../../packages/document-evidence/src/index";
import type { CanonicalKnowledgeBaseline } from "../../packages/knowledge-contracts/src/index";
import type { DocumentEvidenceRetriever, DocumentRetrievalResult, GraphRetrievalResult } from "../../packages/agent-core/src/index";

export type GovernedDocumentEvidenceRetrieverOptions = {
  registryPath: string;
  access: DocumentAccessContext;
  now?: () => Date;
};

export class GovernedDocumentEvidenceRetriever implements DocumentEvidenceRetriever {
  readonly toolName = "governed-document-evidence-retriever.v1";
  private storePromise?: Promise<GovernedDocumentEvidenceStore>;

  constructor(private readonly options: GovernedDocumentEvidenceRetrieverOptions) {}

  async retrieve(graph: GraphRetrievalResult, baseline: CanonicalKnowledgeBaseline): Promise<DocumentRetrievalResult> {
    void baseline;
    const store = await this.store();
    const asOf = this.now().toISOString();
    const result = store.retrieve({
      linkedEntityIds: graph.entities.map((entity) => entity.id),
      searchTerms: graph.entities.flatMap((entity) => [entity.id, entity.label, entity.description ?? ""]),
      asOf,
      access: this.options.access,
      limit: 20,
      perDocumentLimit: 2,
    });
    return { graphPlanId: graph.graphPlanId, items: result.items };
  }

  async getIngestionResult(): Promise<DocumentIngestionResult> {
    return (await this.store()).ingestion;
  }

  private store(): Promise<GovernedDocumentEvidenceStore> {
    this.storePromise ??= loadStore(this.options.registryPath, this.now);
    return this.storePromise;
  }

  private now = (): Date => this.options.now?.() ?? new Date();
}

export function createDefaultGovernedDocumentRetriever(environment: NodeJS.ProcessEnv = process.env): GovernedDocumentEvidenceRetriever {
  const registryPath = resolve(environment.MKG_DOCUMENT_REGISTRY_PATH ?? "packages/demo-data/documents/leak-rate/document-registry.json");
  return new GovernedDocumentEvidenceRetriever({
    registryPath,
    access: {
      principalId: environment.MKG_DOCUMENT_PRINCIPAL_ID ?? "demo-agent-service",
      roleIds: splitList(environment.MKG_DOCUMENT_ROLE_IDS, ["agent-evidence-reader"]),
      domainIds: splitList(environment.MKG_DOCUMENT_DOMAIN_IDS, ["quality", "manufacturing", "engineering"]),
    },
  });
}

async function loadStore(registryPath: string, now: () => Date): Promise<GovernedDocumentEvidenceStore> {
  const raw = await readFile(registryPath, "utf8");
  const registry = validateDocumentRegistry(JSON.parse(raw) as unknown);
  const pipeline = new DeterministicDocumentIngestionPipeline({ reader: new DirectoryDocumentContentReader(dirname(registryPath)), now });
  return GovernedDocumentEvidenceStore.create(registry, pipeline, now().toISOString());
}

function splitList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}
