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
