import type { EvidenceItem, EvidenceGovernanceMetadata } from "../../knowledge-contracts/src/index";
import { DeterministicDocumentFullTextIndex } from "./fullTextIndex";
import { DeterministicDocumentIngestionPipeline } from "./ingestion";
import type {
  DocumentIngestionResult,
  DocumentRetrievalQuery,
  DocumentRegistryManifest,
  GovernedDocumentRetrievalResult,
} from "./types";

export class GovernedDocumentEvidenceStore {
  private constructor(readonly ingestion: DocumentIngestionResult, private readonly index: DeterministicDocumentFullTextIndex) {}

  static async create(registry: DocumentRegistryManifest, pipeline: DeterministicDocumentIngestionPipeline, asOf?: string): Promise<GovernedDocumentEvidenceStore> {
    const ingestion = await pipeline.ingest(registry, asOf);
    return new GovernedDocumentEvidenceStore(ingestion, new DeterministicDocumentFullTextIndex(ingestion.chunks));
  }

  retrieve(query: DocumentRetrievalQuery): GovernedDocumentRetrievalResult {
    const result = this.index.search(query);
    return {
      ...result,
      hits: result.hits,
      items: result.hits.map(({ chunk }) => toEvidenceItem(chunk)),
    };
  }
}

function toEvidenceItem(chunk: DocumentIngestionResult["chunks"][number]): EvidenceItem {
  const governance: EvidenceGovernanceMetadata = {
    documentId: chunk.documentId,
    documentType: chunk.documentType,
    approvalStatus: chunk.approvalStatus,
    lifecycleStatus: chunk.lifecycleStatus,
    owner: chunk.owner,
    contentChecksum: chunk.contentChecksum,
    chunkChecksum: chunk.chunkChecksum,
    parserId: chunk.parserId,
    parserVersion: chunk.parserVersion,
    ingestedAt: chunk.ingestedAt,
    accessClassification: chunk.access.classification,
    accessDecision: "allowed",
  };
  return {
    id: chunk.id,
    kind: chunk.documentType === "qms-record" || chunk.documentType === "mes-record" ? "system-record" : "document",
    title: chunk.title,
    excerpt: chunk.content,
    source: {
      sourceType: "controlled-document-chunk",
      sourceId: chunk.sourceId,
      sourceSystem: chunk.sourceSystem,
      documentName: chunk.documentTitle,
      locator: chunk.locator,
      recordedAt: chunk.ingestedAt,
    },
    linkedEntityIds: [...chunk.linkedEntityIds],
    supportsClaimIds: [...chunk.supportsClaimIds],
    version: chunk.version,
    effectiveAt: chunk.effectiveFrom,
    status: "active",
    governance,
  };
}
