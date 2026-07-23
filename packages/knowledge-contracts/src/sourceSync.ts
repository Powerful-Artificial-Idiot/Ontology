import type { AgentAuthorizationContext, KnowledgeEntity, KnowledgeRelation } from "./index";

export type GovernedSourceSystem = "MES" | "QMS" | "PLM";
export type SourceRecordOperation = "upsert" | "tombstone";

export type SourceRecordEnvelope = {
  id: string;
  sourceSystem: GovernedSourceSystem;
  sourceType: string;
  sourceId: string;
  operation: SourceRecordOperation;
  tenantId: string;
  domainId: string;
  version: string;
  recordedAt: string;
  validFrom?: string;
  payload: Record<string, unknown>;
  recordChecksum: string;
};

export type SourceExtractManifest = {
  manifestVersion: "1.0.0";
  extractId: string;
  sourceSystem: GovernedSourceSystem;
  schemaVersion: string;
  mappingId: string;
  mappingVersion: string;
  tenantId: string;
  domainId: string;
  generatedAt: string;
  approvalStatus: "approved" | "draft" | "rejected";
  lifecycleStatus: "effective" | "superseded" | "withdrawn";
  cursor: number;
  recordsFile: string;
  recordsChecksum: string;
  recordCount: number;
};

export type SourceRecordBatch = {
  manifest: SourceExtractManifest;
  records: SourceRecordEnvelope[];
};

export type SourceSyncMode = "dry-run" | "apply";

export type SourceSyncRequest = {
  requestId: string;
  mode: SourceSyncMode;
  expectedSourceSystem: GovernedSourceSystem;
  expectedMappingVersion: string;
  authorization: AgentAuthorizationContext;
  requestedAt: string;
};

export type GovernedSyncEntity = KnowledgeEntity & {
  sync: {
    sourceSystem: GovernedSourceSystem;
    sourceRecordId: string;
    sourceRecordVersion: string;
    sourceRecordChecksum: string;
    mappingId: string;
    mappingVersion: string;
    synchronizedAt: string;
  };
};

export type GovernedSyncRelation = KnowledgeRelation & {
  sync: GovernedSyncEntity["sync"];
};

export type SourceSyncDecisionCode =
  | "accepted"
  | "manifest-not-approved"
  | "manifest-not-effective"
  | "source-system-mismatch"
  | "tenant-mismatch"
  | "domain-mismatch"
  | "mapping-not-found"
  | "mapping-version-mismatch"
  | "mapping-not-effective"
  | "checksum-mismatch"
  | "record-count-mismatch"
  | "record-invalid"
  | "record-unmapped"
  | "unmapped-field"
  | "stale-record"
  | "same-version-hash-conflict"
  | "duplicate-record"
  | "source-authority-conflict"
  | "tombstone-target-missing"
  | "cursor-not-advanced"
  | "authorization-denied";

export type SourceSyncRecordDecision = {
  sourceRecordId: string;
  canonicalId?: string;
  status: "accepted" | "quarantined" | "rejected";
  code: SourceSyncDecisionCode;
  message: string;
};

export type SourceSyncChange = {
  id: string;
  resourceType: "entity" | "relation";
  changeType: "insert" | "update" | "unchanged" | "tombstone";
  canonicalId: string;
  sourceRecordId: string;
};

export type SourceSyncCheckpoint = {
  checkpointVersion: "1.0.0";
  sourceSystem: GovernedSourceSystem;
  tenantId: string;
  cursor: number;
  extractId: string;
  appliedAt: string;
};

export type SourceSyncReport = {
  reportVersion: "1.0.0";
  requestId: string;
  extractId: string;
  sourceSystem: GovernedSourceSystem;
  mode: SourceSyncMode;
  status: "completed" | "blocked" | "failed";
  generatedAt: string;
  decisions: SourceSyncRecordDecision[];
  changes: SourceSyncChange[];
  checkpoint?: SourceSyncCheckpoint;
  counts: {
    received: number;
    accepted: number;
    quarantined: number;
    rejected: number;
    inserted: number;
    updated: number;
    unchanged: number;
    tombstoned: number;
  };
};

export type GovernedSyncSnapshot = {
  snapshotVersion: "1.0.0";
  entities: GovernedSyncEntity[];
  relations: GovernedSyncRelation[];
  checkpoints: SourceSyncCheckpoint[];
  appliedExtractIds: string[];
};

export type ConnectorSourceSystem = Lowercase<GovernedSourceSystem>;
export type ConnectorAdapterType = "controlled-file" | "fixture-http-json";
export type SourceAuthenticationType = "fixture-none" | "static-bearer";

export type ConnectorProfile = {
  id: string;
  version: string;
  sourceSystem: ConnectorSourceSystem;
  tenantId: string;
  allowedDomains: string[];
  adapterType: ConnectorAdapterType;
  endpoint?: {
    baseUrl: string;
    allowedPaths: string[];
    allowLocalhostHttp: boolean;
  };
  authentication: {
    type: SourceAuthenticationType;
    secretReference?: string;
  };
  synchronization: {
    mode: "snapshot" | "incremental";
    pagination: "none" | "page" | "cursor" | "watermark";
    pageSize?: number;
    maximumPages?: number;
    maximumRecords?: number;
  };
  mappingProfileId: string;
  publicationPolicyId: string;
  enabled: boolean;
};

export type ConnectorPrincipal = {
  id: string;
  type: "service";
  tenantId: string;
  roles: string[];
  allowedDomains: string[];
  allowedSourceSystems: ConnectorSourceSystem[];
};

export type SanitizedAuthorizationSnapshot = {
  principalId: string;
  tenantId: string;
  roleIds: string[];
  domainIds: string[];
  objectIds?: string[];
  authenticationMethod: AgentAuthorizationContext["principal"]["authenticationMethod"];
};

export type ConnectorRunStatus =
  | "created"
  | "extracting"
  | "mapping"
  | "validating"
  | "staging"
  | "publishing"
  | "verifying"
  | "reconciling"
  | "completed"
  | "failed"
  | "cancelled"
  | "recovery-required";

export type ConnectorRunMode = "snapshot" | "incremental" | "dry-run" | "validate-only" | "reconcile-only";

export type ConnectorSyncRun = {
  id: string;
  connectorId: string;
  mode: ConnectorRunMode;
  tenantId: string;
  authorizationSnapshot: SanitizedAuthorizationSnapshot;
  status: ConnectorRunStatus;
  startedAt: string;
  completedAt?: string;
  counters: {
    extracted: number;
    mapped: number;
    validated: number;
    staged: number;
    published: number;
    skippedDuplicate: number;
    stale: number;
    quarantined: number;
    rejected: number;
  };
  checkpointBefore?: SourceSyncCheckpoint;
  checkpointAfter?: SourceSyncCheckpoint;
  failureCode?: string;
};

export type PublicationTarget = "mock" | "neo4j" | "document-registry";

export type LineageRecord = {
  canonicalId: string;
  canonicalVersion: string;
  sourceSystem: ConnectorSourceSystem;
  connectorId: string;
  runId: string;
  sourceRecordId: string;
  sourceVersion: string;
  contentHash: string;
  mappingProfileId: string;
  mappingProfileVersion: string;
  publicationTarget: PublicationTarget;
  publishedAt: string;
};

export type QuarantineItem = {
  id: string;
  connectorId: string;
  runId: string;
  sourceSystem: ConnectorSourceSystem;
  sourceRecordId: string;
  sourceVersion: string;
  contentHash: string;
  reasonCode: string;
  severity: "critical" | "major" | "minor";
  sanitizedMetadata: Record<string, unknown>;
  status: "open" | "resolved" | "rejected";
  createdAt: string;
  resolvedAt?: string;
};

export type ReconciliationClassification =
  | "matched"
  | "source-only"
  | "canonical-only"
  | "version-mismatch"
  | "hash-mismatch"
  | "governance-mismatch"
  | "authorization-mismatch"
  | "lineage-missing";

export type ReconciliationItem = {
  canonicalId?: string;
  sourceRecordId?: string;
  classification: ReconciliationClassification;
  sourceVersion?: string;
  canonicalVersion?: string;
  sourceHash?: string;
  canonicalHash?: string;
  blocking: boolean;
};

export type ReconciliationResult = {
  connectorId: string;
  runId: string;
  counts: Record<ReconciliationClassification, number>;
  items: ReconciliationItem[];
};

export type CanonicalMutation = {
  id: string;
  kind: "entity-upsert" | "relation-upsert" | "deactivate" | "supersede" | "expire";
  tenantId: string;
  domainId: string;
  canonicalId: string;
  canonicalType?: string;
  relation?: { sourceId: string; targetId: string; predicate: string; label?: string };
  expectedCurrentVersion?: string;
  proposedVersion: string;
  contentHash: string;
  properties: Record<string, unknown>;
};

export type PublicationStageResult = { runId: string; staged: number; stageHash: string };
export type PublicationResult = { runId: string; published: number; publicationHash: string };
export type PublicationVerificationResult = { runId: string; verified: boolean; verifiedCount: number; verificationHash: string; issues: string[] };

export type GovernedDocumentChange = {
  id: string;
  tenantId: string;
  domainId: string;
  documentId: string;
  logicalDocumentId: string;
  version: string;
  approvalStatus: "approved" | "draft" | "rejected";
  lifecycleStatus: "effective" | "superseded" | "withdrawn" | "obsolete";
  contentHash: string;
  sourceSystem: ConnectorSourceSystem;
  sourceRecordId: string;
  linkedEntityIds: string[];
  locator: string;
};

export type DocumentPublicationStageResult = PublicationStageResult;
export type DocumentPublicationResult = PublicationResult;
export type DocumentPublicationVerificationResult = PublicationVerificationResult;

export type PublicationJournalStatus =
  | "validated"
  | "staged"
  | "graph-published"
  | "documents-published"
  | "verified"
  | "committed"
  | "recovery-required";

export type PublicationJournalEntry = {
  journalVersion: "1.0.0";
  runId: string;
  status: PublicationJournalStatus;
  expectedGraphMutationCount: number;
  expectedDocumentChangeCount: number;
  completedStages: PublicationJournalStatus[];
  verificationHashes: string[];
  failureCode?: string;
  recoveryStatus?: "pending" | "recovered" | "manual-recovery-required";
  updatedAt: string;
};

export type SourceSyncHealth = {
  status: "available" | "degraded" | "unavailable";
  configuredConnectors: number;
  enabledConnectors: number;
  lastSuccessfulRunAt?: string;
  recoveryRequiredRuns: number;
  openQuarantineItems: number;
  criticalReconciliationItems: number;
};
