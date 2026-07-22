import { sha256 } from "./checksum";
import { detectInstructionLikeContent, slugifyStableId } from "./normalization";
import { ControlledJsonDocumentParser } from "./parser";
import type {
  DocumentContentReader,
  DocumentIngestionIssue,
  DocumentIngestionResult,
  DocumentParser,
  DocumentRegistryManifest,
  GovernedDocumentChunk,
  GovernedDocumentDefinition,
} from "./types";

export type DocumentIngestionOptions = {
  reader: DocumentContentReader;
  now?: () => Date;
  parsers?: DocumentParser[];
};

export class DeterministicDocumentIngestionPipeline {
  private readonly parsers: Map<string, DocumentParser>;
  private readonly now: () => Date;

  constructor(private readonly options: DocumentIngestionOptions) {
    const parsers = options.parsers ?? [new ControlledJsonDocumentParser()];
    this.parsers = new Map(parsers.map((parser) => [`${parser.parserId}:${parser.parserVersion}`, parser]));
    this.now = options.now ?? (() => new Date());
  }

  async ingest(registry: DocumentRegistryManifest, asOf = this.now().toISOString()): Promise<DocumentIngestionResult> {
    const issues: DocumentIngestionIssue[] = [];
    const chunks: GovernedDocumentChunk[] = [];
    const acceptedDocumentIds: string[] = [];
    const rejectedDocumentIds: string[] = [];
    const chunkIds = new Set<string>();

    for (const document of registry.documents) {
      const governanceIssue = validateGovernance(document, asOf);
      if (governanceIssue) {
        issues.push(governanceIssue);
        rejectedDocumentIds.push(document.documentId);
        continue;
      }
      let content: string;
      try {
        content = await this.options.reader.read(document.contentFile);
      } catch (error) {
        issues.push(issue(document, "parser-invalid", `Unable to read controlled document: ${message(error)}`));
        rejectedDocumentIds.push(document.documentId);
        continue;
      }
      const checksum = sha256(content);
      if (checksum !== document.contentChecksum) {
        issues.push(issue(document, "checksum-mismatch", "Controlled document checksum does not match its registry entry."));
        rejectedDocumentIds.push(document.documentId);
        continue;
      }
      const parser = this.parsers.get(`${document.parserId}:${document.parserVersion}`);
      if (!parser) {
        issues.push(issue(document, "parser-invalid", "No allowlisted deterministic parser matches the registry entry."));
        rejectedDocumentIds.push(document.documentId);
        continue;
      }
      try {
        const sections = parser.parse(content);
        const documentChunks = sections.map((section, ordinal): GovernedDocumentChunk => {
          const contentValue = `${section.heading}\n${section.text}`;
          const securitySignals = detectInstructionLikeContent(contentValue);
          const id = `evidence-chunk.${document.documentId}.${slugifyStableId(section.locator)}`;
          if (chunkIds.has(id)) throw new DuplicateChunkError(id, section.locator);
          chunkIds.add(id);
          if (securitySignals.length) issues.push({ documentId: document.documentId, code: "content-security-signal", message: "Instruction-like content was quarantined and cannot become evidence.", locator: section.locator });
          return {
            id,
            documentId: document.documentId,
            documentTitle: document.title,
            title: `${document.title} - ${section.heading}`,
            documentType: document.documentType,
            version: document.version,
            locator: section.locator,
            ordinal,
            content: section.text,
            contentChecksum: document.contentChecksum,
            chunkChecksum: sha256(`${document.documentId}\n${document.version}\n${section.locator}\n${section.text}`),
            approvalStatus: document.approvalStatus,
            lifecycleStatus: document.lifecycleStatus,
            effectiveFrom: document.effectiveFrom,
            effectiveTo: document.effectiveTo,
            owner: document.owner,
            sourceSystem: document.sourceSystem,
            sourceId: document.sourceId,
            parserId: parser.parserId,
            parserVersion: parser.parserVersion,
            ingestedAt: asOf,
            linkedEntityIds: [...document.linkedEntityIds],
            supportsClaimIds: [...document.supportsClaimIds],
            access: {
              ...document.access,
              allowedRoleIds: [...document.access.allowedRoleIds],
              allowedDomainIds: [...document.access.allowedDomainIds],
            },
            securityStatus: securitySignals.length ? "quarantined" : "accepted",
            securitySignals,
          };
        });
        chunks.push(...documentChunks);
        if (documentChunks.some((chunk) => chunk.securityStatus === "accepted")) acceptedDocumentIds.push(document.documentId);
        else rejectedDocumentIds.push(document.documentId);
      } catch (error) {
        if (error instanceof DuplicateChunkError) issues.push({ documentId: document.documentId, code: "duplicate-chunk-id", message: error.message, locator: error.locator });
        else issues.push(issue(document, "parser-invalid", `Controlled document parsing failed: ${message(error)}`));
        rejectedDocumentIds.push(document.documentId);
      }
    }

    return { registryVersion: registry.registryVersion, ingestedAt: asOf, chunks, acceptedDocumentIds, rejectedDocumentIds, issues };
  }
}

function validateGovernance(document: GovernedDocumentDefinition, asOf: string): DocumentIngestionIssue | undefined {
  if (document.approvalStatus !== "approved") return issue(document, "document-not-approved", "Only approved documents may be ingested as governed evidence.");
  const timestamp = Date.parse(asOf);
  const isEffective = document.lifecycleStatus === "effective"
    && Date.parse(document.effectiveFrom) <= timestamp
    && (!document.effectiveTo || timestamp < Date.parse(document.effectiveTo));
  if (!isEffective) return issue(document, "document-not-effective", "Only currently effective, non-superseded documents may be ingested as governed evidence.");
  return undefined;
}

function issue(document: GovernedDocumentDefinition, code: DocumentIngestionIssue["code"], messageValue: string): DocumentIngestionIssue {
  return { documentId: document.documentId, code, message: messageValue };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

class DuplicateChunkError extends Error {
  constructor(readonly chunkId: string, readonly locator: string) {
    super(`Stable chunk ID is duplicated: ${chunkId}`);
  }
}
