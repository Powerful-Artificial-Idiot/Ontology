import type {
  AgentAuditEvent,
  GovernedSourceSystem,
  GovernedSyncEntity,
  GovernedSyncRelation,
  GovernedSyncSnapshot,
  SourceRecordBatch,
  SourceSyncCheckpoint,
  SourceSyncRequest,
  SourceSyncReport,
} from "../../knowledge-contracts/src/index";

export type SyncPropertyMapping = {
  sourceField: string;
  targetProperty: string;
  transform: "string" | "number" | "boolean" | "datetime";
  unit?: string;
};

export type SyncRelationMapping = {
  sourceField: string;
  predicate: string;
  label: string;
  direction?: "source-to-target" | "target-to-source";
  targetCanonicalIdMap: Record<string, string>;
};

export type SyncMappingProfile = {
  sourceType: string;
  canonicalType: string;
  idSourceField: string;
  canonicalIdMap: Record<string, string>;
  labelSourceField: string;
  domain: string;
  allowedSourceFields: string[];
  propertyMappings: SyncPropertyMapping[];
  relationMappings: SyncRelationMapping[];
};

export type GovernedSyncMapping = {
  mappingId: string;
  version: string;
  sourceSystem: GovernedSourceSystem;
  effectiveFrom?: string;
  syncProfiles: SyncMappingProfile[];
};

export interface SourceSystemConnector {
  readonly sourceSystem: GovernedSourceSystem;
  readBatch(signal?: AbortSignal): Promise<SourceRecordBatch>;
}

export type SyncCommit = {
  extractId: string;
  checkpoint: SourceSyncCheckpoint;
  entities: GovernedSyncEntity[];
  relations: GovernedSyncRelation[];
  removeRelationIds: string[];
};

export interface GovernedSyncStore {
  getSnapshot(): Promise<GovernedSyncSnapshot>;
  commit(commit: SyncCommit): Promise<void>;
}

export interface SourceSyncAuditSink {
  append(event: AgentAuditEvent): Promise<void>;
}

export interface SourceSynchronizationService {
  synchronize(request: SourceSyncRequest, signal?: AbortSignal): Promise<SourceSyncReport>;
}
