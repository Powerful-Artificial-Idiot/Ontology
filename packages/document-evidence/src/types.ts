import type { EvidenceItem } from "../../knowledge-contracts/src/index";

export type DocumentType =
  | "control-plan"
  | "pfmea"
  | "sop"
  | "qms-record"
  | "engineering-change-request"
  | "validation-record"
  | "line-balance-study"
  | "value-stream-map"
  | "standard-work"
  | "mes-record"
  | "product-specification"
  | "reaction-plan"
  | "msa-study"
  | "calibration-record"
  | "validation-plan"
  | "capability-study"
  | "deviation-record"
  | "maintenance-instruction";
export type DocumentApprovalStatus = "approved" | "draft" | "rejected";
export type DocumentLifecycleStatus = "effective" | "superseded" | "withdrawn";
export type DocumentAccessClassification = "public" | "internal" | "restricted";

export type DocumentAccessPolicy = {
  classification: DocumentAccessClassification;
  allowedRoleIds: string[];
  allowedDomainIds: string[];
};

export type GovernedDocumentDefinition = {
  documentId: string;
  logicalDocumentId: string;
  title: string;
  documentType: DocumentType;
  version: string;
  approvalStatus: DocumentApprovalStatus;
  lifecycleStatus: DocumentLifecycleStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  owner: string;
  sourceSystem: string;
  sourceId: string;
  contentFile: string;
  contentChecksum: string;
  parserId: "controlled-json";
  parserVersion: "1.0.0";
  linkedEntityIds: string[];
  supportsClaimIds: string[];
  access: DocumentAccessPolicy;
};

export type DocumentRegistryManifest = {
  registryVersion: "1.0.0";
  documents: GovernedDocumentDefinition[];
};

export type DocumentAccessContext = {
  principalId: string;
  roleIds: string[];
  domainIds: string[];
  objectIds?: string[];
};

export type ParsedDocumentSection = {
  locator: string;
  heading: string;
  text: string;
};

export type GovernedDocumentChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  title: string;
  documentType: DocumentType;
  version: string;
  locator: string;
  ordinal: number;
  content: string;
  contentChecksum: string;
  chunkChecksum: string;
  approvalStatus: DocumentApprovalStatus;
  lifecycleStatus: DocumentLifecycleStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  owner: string;
  sourceSystem: string;
  sourceId: string;
  parserId: string;
  parserVersion: string;
  ingestedAt: string;
  linkedEntityIds: string[];
  supportsClaimIds: string[];
  access: DocumentAccessPolicy;
  securityStatus: "accepted" | "quarantined";
  securitySignals: string[];
};

export type DocumentIngestionIssueCode =
  | "registry-invalid"
  | "document-not-approved"
  | "document-not-effective"
  | "checksum-mismatch"
  | "parser-invalid"
  | "content-security-signal"
  | "duplicate-chunk-id";

export type DocumentIngestionIssue = {
  documentId: string;
  code: DocumentIngestionIssueCode;
  message: string;
  locator?: string;
};

export type DocumentIngestionResult = {
  registryVersion: string;
  ingestedAt: string;
  chunks: GovernedDocumentChunk[];
  acceptedDocumentIds: string[];
  rejectedDocumentIds: string[];
  issues: DocumentIngestionIssue[];
};

export type DocumentRetrievalQuery = {
  linkedEntityIds: string[];
  searchTerms: string[];
  asOf: string;
  access: DocumentAccessContext;
  documentTypes?: DocumentType[];
  sourceSystems?: string[];
  limit?: number;
  perDocumentLimit?: number;
};

export type DocumentRetrievalHit = {
  chunk: GovernedDocumentChunk;
  score: number;
  matchedTerms: string[];
  matchedEntityIds: string[];
};

export type GovernedDocumentRetrievalResult = {
  items: EvidenceItem[];
  hits: DocumentRetrievalHit[];
  excludedByAccess: number;
  excludedByGovernance: number;
};

export interface DocumentContentReader {
  read(relativePath: string): Promise<string>;
}

export interface DocumentParser {
  readonly parserId: string;
  readonly parserVersion: string;
  parse(content: string): ParsedDocumentSection[];
}
