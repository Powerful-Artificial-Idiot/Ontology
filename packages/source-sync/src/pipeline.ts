import { randomUUID } from "node:crypto";
import type {
  AgentAuditEvent,
  GovernedSyncEntity,
  GovernedSyncRelation,
  GovernedSyncSnapshot,
  SourceRecordEnvelope,
  SourceSyncChange,
  SourceSyncRecordDecision,
  SourceSyncReport,
  SourceSyncRequest,
} from "../../knowledge-contracts/src/index";
import { DefaultAgentAuthorizer } from "../../agent-security/src/index";
import { checksumRecord } from "./checksum";
import type { GovernedSyncMapping, GovernedSyncStore, SourceSyncAuditSink, SourceSynchronizationService, SourceSystemConnector, SyncMappingProfile } from "./types";

type Candidate = { record: SourceRecordEnvelope; entity: GovernedSyncEntity; relations: GovernedSyncRelation[] };

export class GovernedSourceSynchronizationPipeline implements SourceSynchronizationService {
  constructor(private readonly options: {
    connector: SourceSystemConnector;
    mapping: GovernedSyncMapping;
    store: GovernedSyncStore;
    audit?: SourceSyncAuditSink;
    authorizer?: DefaultAgentAuthorizer;
    now?: () => Date;
  }) {}

  async synchronize(request: SourceSyncRequest, signal?: AbortSignal): Promise<SourceSyncReport> {
    const now = this.options.now?.() ?? new Date();
    const batch = await this.options.connector.readBatch(signal);
    const blocked = this.validateBatch(request, batch.manifest);
    if (blocked) return this.finish(request, batch.manifest.extractId, batch.records.length, [], [], "blocked", [blocked], undefined, now);
    const snapshot = await this.options.store.getSnapshot();
    const checkpoint = snapshot.checkpoints.find((item) => item.sourceSystem === batch.manifest.sourceSystem && item.tenantId === batch.manifest.tenantId);
    if (snapshot.appliedExtractIds.includes(batch.manifest.extractId)) {
      const changes = batch.records.map((record) => ({ id: `change.${record.id}`, resourceType: "entity" as const, changeType: "unchanged" as const, canonicalId: mappedCanonicalId(record, this.options.mapping) ?? "unmapped", sourceRecordId: record.id }));
      const decisions = batch.records.map((record) => accepted(record, mappedCanonicalId(record, this.options.mapping)));
      return this.finish(request, batch.manifest.extractId, batch.records.length, decisions, changes, "completed", [], checkpoint, now);
    }
    if (checkpoint && batch.manifest.cursor <= checkpoint.cursor) {
      const decision: SourceSyncRecordDecision = { sourceRecordId: batch.manifest.extractId, status: "rejected", code: "cursor-not-advanced", message: "Extract cursor must advance beyond the applied checkpoint." };
      return this.finish(request, batch.manifest.extractId, batch.records.length, [], [], "blocked", [decision], checkpoint, now);
    }

    const candidates: Candidate[] = [];
    const decisions: SourceSyncRecordDecision[] = [];
    const sourceFingerprints = new Set<string>();
    for (const record of batch.records) {
      const fingerprint = `${record.sourceSystem}|${record.sourceId}|${record.version}|${record.recordChecksum}`;
      if (sourceFingerprints.has(fingerprint)) {
        decisions.push({ sourceRecordId: record.id, canonicalId: mappedCanonicalId(record, this.options.mapping), status: "accepted", code: "duplicate-record", message: "The duplicate source record was accepted without creating another mutation." });
        continue;
      }
      sourceFingerprints.add(fingerprint);
      const mapped = mapRecord(record, batch.manifest, this.options.mapping, now.toISOString());
      if ("decision" in mapped) decisions.push(mapped.decision);
      else {
        candidates.push(mapped);
        decisions.push(accepted(record, mapped.entity.id));
      }
    }
    const planned = planChanges(candidates, snapshot);
    const staleIds = new Set(planned.staleRecordIds);
    const hashConflictIds = new Set(planned.sameVersionHashConflictRecordIds);
    const authorityConflictIds = new Set(planned.authorityConflictRecordIds);
    const missingTombstones = new Set(planned.missingTombstoneRecordIds);
    const acceptedCandidates = candidates.filter((item) => !staleIds.has(item.record.id) && !hashConflictIds.has(item.record.id) && !authorityConflictIds.has(item.record.id) && !missingTombstones.has(item.record.id));
    for (const decision of decisions) {
      if (staleIds.has(decision.sourceRecordId)) Object.assign(decision, { status: "quarantined", code: "stale-record", message: "A newer source version is already synchronized." });
      if (hashConflictIds.has(decision.sourceRecordId)) Object.assign(decision, { status: "quarantined", code: "same-version-hash-conflict", message: "The same source version was received with different content." });
      if (authorityConflictIds.has(decision.sourceRecordId)) Object.assign(decision, { status: "quarantined", code: "source-authority-conflict", message: "A different governed source owns the canonical object." });
      if (missingTombstones.has(decision.sourceRecordId)) Object.assign(decision, { status: "quarantined", code: "tombstone-target-missing", message: "Tombstone target does not exist in the governed snapshot." });
    }
    const changes = planChanges(acceptedCandidates, snapshot).changes;
    const changedEntityIds = new Set(changes.filter((item) => item.resourceType === "entity" && item.changeType !== "unchanged").map((item) => item.canonicalId));
    const changedRelationIds = new Set(changes.filter((item) => item.resourceType === "relation" && item.changeType !== "unchanged" && item.changeType !== "tombstone").map((item) => item.canonicalId));
    const removedRelationIds = changes.filter((item) => item.resourceType === "relation" && item.changeType === "tombstone").map((item) => item.canonicalId);
    const checkpointAfter = {
      checkpointVersion: "1.0.0",
      sourceSystem: batch.manifest.sourceSystem,
      tenantId: batch.manifest.tenantId,
      cursor: batch.manifest.cursor,
      extractId: batch.manifest.extractId,
      appliedAt: now.toISOString(),
    } as const;
    if (request.mode === "apply") {
      await this.options.store.commit({
        extractId: batch.manifest.extractId,
        checkpoint: checkpointAfter,
        entities: acceptedCandidates.map((item) => item.entity).filter((item) => changedEntityIds.has(item.id)),
        relations: acceptedCandidates.flatMap((item) => item.relations).filter((item) => changedRelationIds.has(item.id)),
        removeRelationIds: removedRelationIds,
      });
    }
    return this.finish(request, batch.manifest.extractId, batch.records.length, decisions, changes, "completed", [], request.mode === "apply" ? checkpointAfter : checkpoint, now);
  }

  private validateBatch(request: SourceSyncRequest, manifest: Awaited<ReturnType<SourceSystemConnector["readBatch"]>>["manifest"]): SourceSyncRecordDecision | undefined {
    const reject = (code: SourceSyncRecordDecision["code"], message: string): SourceSyncRecordDecision => ({ sourceRecordId: manifest.extractId, status: "rejected", code, message });
    if (manifest.approvalStatus !== "approved") return reject("manifest-not-approved", "Only approved source extracts may be synchronized.");
    if (manifest.lifecycleStatus !== "effective") return reject("manifest-not-effective", "Only effective source extracts may be synchronized.");
    if (manifest.sourceSystem !== request.expectedSourceSystem || manifest.sourceSystem !== this.options.connector.sourceSystem || manifest.sourceSystem !== this.options.mapping.sourceSystem) return reject("source-system-mismatch", "Connector, mapping, request, and manifest source systems must match.");
    if (manifest.mappingId !== this.options.mapping.mappingId) return reject("mapping-not-found", "Manifest mapping ID is not the configured governed mapping.");
    if (manifest.mappingVersion !== request.expectedMappingVersion || manifest.mappingVersion !== this.options.mapping.version) return reject("mapping-version-mismatch", "Manifest mapping version is not the approved expected version.");
    if (this.options.mapping.effectiveFrom && Date.parse(`${this.options.mapping.effectiveFrom}T00:00:00.000Z`) > Date.parse(manifest.generatedAt)) return reject("mapping-not-effective", "Governed mapping was not effective when the extract was generated.");
    const action = request.mode === "apply" ? "source-sync:apply" : "source-sync:read";
    const decision = (this.options.authorizer ?? new DefaultAgentAuthorizer()).authorize(request.authorization, action, {
      type: "source-extract",
      id: manifest.extractId,
      tenantId: manifest.tenantId,
      domainIds: [manifest.domainId],
    });
    if (decision.decision === "denied") return reject("authorization-denied", `Source synchronization authorization denied: ${decision.reasonCode}`);
    return undefined;
  }

  private async finish(
    request: SourceSyncRequest,
    extractId: string,
    received: number,
    decisions: SourceSyncRecordDecision[],
    changes: SourceSyncChange[],
    status: SourceSyncReport["status"],
    additionalDecisions: SourceSyncRecordDecision[],
    checkpoint: SourceSyncReport["checkpoint"],
    now: Date,
  ): Promise<SourceSyncReport> {
    const allDecisions = [...decisions, ...additionalDecisions];
    const count = (value: string) => allDecisions.filter((item) => item.status === value).length;
    const changeCount = (value: string) => changes.filter((item) => item.changeType === value).length;
    const report: SourceSyncReport = {
      reportVersion: "1.0.0",
      requestId: request.requestId,
      extractId,
      sourceSystem: request.expectedSourceSystem,
      mode: request.mode,
      status,
      generatedAt: now.toISOString(),
      decisions: allDecisions,
      changes,
      checkpoint,
      counts: {
        received,
        accepted: count("accepted"),
        quarantined: count("quarantined"),
        rejected: count("rejected"),
        inserted: changeCount("insert"),
        updated: changeCount("update"),
        unchanged: changeCount("unchanged"),
        tombstoned: changeCount("tombstone"),
      },
    };
    const audit: AgentAuditEvent = {
      id: `audit.source-sync.${randomUUID()}`,
      traceId: request.requestId,
      actorId: request.authorization.principal.id,
      action: `source-sync.${request.mode}`,
      resourceIds: [extractId],
      outcome: status === "completed" ? "completed" : "denied",
      occurredAt: now.toISOString(),
      metadata: {
        tenantId: request.authorization.principal.tenantId,
        sourceSystem: request.expectedSourceSystem,
        accepted: report.counts.accepted,
        quarantined: report.counts.quarantined,
        rejected: report.counts.rejected,
      },
    };
    await this.options.audit?.append(audit);
    return report;
  }
}

function mapRecord(record: SourceRecordEnvelope, manifest: { sourceSystem: string; tenantId: string; domainId: string }, mapping: GovernedSyncMapping, synchronizedAt: string): Candidate | { decision: SourceSyncRecordDecision } {
  const reject = (code: SourceSyncRecordDecision["code"], message: string, status: SourceSyncRecordDecision["status"] = "quarantined") => ({ decision: { sourceRecordId: record.id, status, code, message } as SourceSyncRecordDecision });
  if (record.sourceSystem !== manifest.sourceSystem) return reject("source-system-mismatch", "Record source system differs from the manifest.", "rejected");
  if (record.tenantId !== manifest.tenantId) return reject("tenant-mismatch", "Record tenant differs from the manifest.", "rejected");
  if (record.domainId !== manifest.domainId) return reject("domain-mismatch", "Record domain differs from the manifest.", "rejected");
  const content = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordChecksum"));
  if (checksumRecord(content) !== record.recordChecksum) return reject("checksum-mismatch", "Record checksum is invalid.", "rejected");
  const profile = mapping.syncProfiles.find((item) => item.sourceType === record.sourceType);
  if (!profile) return reject("record-unmapped", "No approved mapping profile exists for the source type.");
  const unknownFields = Object.keys(record.payload).filter((field) => !profile.allowedSourceFields.includes(field));
  if (unknownFields.length) return reject("unmapped-field", `Payload contains unmapped fields: ${unknownFields.join(", ")}`);
  const sourceIdentifier = record.payload[profile.idSourceField];
  if (typeof sourceIdentifier !== "string") return reject("record-invalid", "Mapped source identifier is missing or invalid.");
  const canonicalId = profile.canonicalIdMap[sourceIdentifier];
  if (!canonicalId) return reject("record-unmapped", "Source identifier has no approved canonical ID mapping.");
  const label = record.payload[profile.labelSourceField];
  if (typeof label !== "string" || !label.trim()) return reject("record-invalid", "Mapped label is missing or invalid.");
  try {
    const properties = Object.fromEntries(profile.propertyMappings.map((item) => [item.targetProperty, transform(record.payload[item.sourceField], item)]));
    const sync = {
      sourceSystem: record.sourceSystem,
      sourceRecordId: record.sourceId,
      sourceRecordVersion: record.version,
      sourceRecordChecksum: record.recordChecksum,
      mappingId: mapping.mappingId,
      mappingVersion: mapping.version,
      synchronizedAt,
    };
    const entity: GovernedSyncEntity = {
      id: canonicalId,
      type: profile.canonicalType,
      label: label.trim(),
      domain: profile.domain,
      properties,
      source: [{ sourceType: "governed-source-sync", sourceId: record.sourceId, sourceSystem: record.sourceSystem, recordedAt: record.recordedAt }],
      validFrom: record.validFrom,
      version: record.version,
      status: record.operation === "tombstone" ? "tombstoned" : "active",
      sync,
    };
    const relations = record.operation === "tombstone" ? [] : mapRelations(record, canonicalId, profile, sync);
    return { record, entity, relations };
  } catch (error) {
    return reject("record-invalid", error instanceof Error ? error.message : "Record transform failed.");
  }
}

function mapRelations(record: SourceRecordEnvelope, canonicalId: string, profile: SyncMappingProfile, sync: GovernedSyncEntity["sync"]): GovernedSyncRelation[] {
  return profile.relationMappings.flatMap((mapping) => {
    const raw = record.payload[mapping.sourceField];
    if (raw === undefined || raw === null || raw === "") return [];
    if (typeof raw !== "string") throw new Error(`Relation field ${mapping.sourceField} must be a string.`);
    const targetId = mapping.targetCanonicalIdMap[raw];
    if (!targetId) throw new Error(`Relation target has no approved canonical ID mapping: ${mapping.sourceField}`);
    const relationId = `relation.sync.${record.sourceSystem.toLowerCase()}.${slug(record.sourceId)}.${slug(mapping.predicate)}.${slug(targetId)}`;
    const reverse = mapping.direction === "target-to-source";
    return [{
      id: relationId,
      sourceId: reverse ? targetId : canonicalId,
      targetId: reverse ? canonicalId : targetId,
      predicate: mapping.predicate,
      label: mapping.label,
      properties: { sourceRecordVersion: record.version },
      provenance: [{ sourceType: "governed-source-sync", sourceId: record.sourceId, sourceSystem: record.sourceSystem, recordedAt: record.recordedAt }],
      validFrom: record.validFrom,
      confidence: 1,
      assertionType: "asserted",
      sync,
    }];
  });
}

function transform(value: unknown, mapping: SyncMappingProfile["propertyMappings"][number]): unknown {
  if (mapping.transform === "string") {
    if (typeof value !== "string") throw new Error(`Field ${mapping.sourceField} must be a string.`);
    return mapping.unit ? { value, unit: mapping.unit } : value;
  }
  if (mapping.transform === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Field ${mapping.sourceField} must be a finite number.`);
    return mapping.unit ? { value, unit: mapping.unit } : value;
  }
  if (mapping.transform === "boolean") {
    if (typeof value !== "boolean") throw new Error(`Field ${mapping.sourceField} must be a boolean.`);
    return value;
  }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`Field ${mapping.sourceField} must be an ISO date-time.`);
  return value;
}

function planChanges(candidates: Candidate[], snapshot: GovernedSyncSnapshot): { changes: SourceSyncChange[]; staleRecordIds: string[]; sameVersionHashConflictRecordIds: string[]; authorityConflictRecordIds: string[]; missingTombstoneRecordIds: string[] } {
  const entities = new Map(snapshot.entities.map((item) => [item.id, item]));
  const relations = new Map(snapshot.relations.map((item) => [item.id, item]));
  const changes: SourceSyncChange[] = [];
  const staleRecordIds: string[] = [];
  const sameVersionHashConflictRecordIds: string[] = [];
  const authorityConflictRecordIds: string[] = [];
  const missingTombstoneRecordIds: string[] = [];
  const candidateGroups = groupBy(candidates, (candidate) => candidate.entity.id);
  for (const group of candidateGroups.values()) {
    const byVersion = groupBy(group, (candidate) => candidate.record.version);
    for (const versionGroup of byVersion.values()) if (new Set(versionGroup.map((candidate) => candidate.record.recordChecksum)).size > 1) sameVersionHashConflictRecordIds.push(...versionGroup.map((candidate) => candidate.record.id));
    const eligible = group.filter((candidate) => !sameVersionHashConflictRecordIds.includes(candidate.record.id));
    const latestTimestamp = Math.max(...eligible.map((candidate) => Date.parse(candidate.record.recordedAt)));
    staleRecordIds.push(...eligible.filter((candidate) => Date.parse(candidate.record.recordedAt) < latestTimestamp).map((candidate) => candidate.record.id));
  }
  for (const candidate of candidates) {
    if (sameVersionHashConflictRecordIds.includes(candidate.record.id) || staleRecordIds.includes(candidate.record.id)) continue;
    const existing = entities.get(candidate.entity.id);
    if (existing && existing.sync.sourceSystem !== candidate.entity.sync.sourceSystem) {
      authorityConflictRecordIds.push(candidate.record.id);
      continue;
    }
    if (existing && Date.parse(existing.source?.[0]?.recordedAt ?? "") > Date.parse(candidate.record.recordedAt)) {
      staleRecordIds.push(candidate.record.id);
      continue;
    }
    if (existing && existing.sync.sourceRecordVersion === candidate.entity.sync.sourceRecordVersion && existing.sync.sourceRecordChecksum !== candidate.entity.sync.sourceRecordChecksum) {
      sameVersionHashConflictRecordIds.push(candidate.record.id);
      continue;
    }
    if (candidate.record.operation === "tombstone" && !existing) {
      missingTombstoneRecordIds.push(candidate.record.id);
      continue;
    }
    const changeType = candidate.record.operation === "tombstone"
      ? "tombstone"
      : !existing
        ? "insert"
        : existing.sync.sourceRecordChecksum === candidate.entity.sync.sourceRecordChecksum
          ? "unchanged"
          : "update";
    changes.push(change(candidate.record, candidate.entity.id, "entity", changeType));
    if (candidate.record.operation === "tombstone") {
      for (const relation of snapshot.relations.filter((item) => item.sync.sourceSystem === candidate.record.sourceSystem && item.sync.sourceRecordId === candidate.record.sourceId)) {
        changes.push(change(candidate.record, relation.id, "relation", "tombstone"));
      }
    }
    for (const relation of candidate.relations) {
      const existingRelation = relations.get(relation.id);
      changes.push(change(candidate.record, relation.id, "relation", !existingRelation ? "insert" : existingRelation.sync.sourceRecordChecksum === relation.sync.sourceRecordChecksum ? "unchanged" : "update"));
    }
  }
  return { changes, staleRecordIds, sameVersionHashConflictRecordIds, authorityConflictRecordIds, missingTombstoneRecordIds };
}

function change(record: SourceRecordEnvelope, canonicalId: string, resourceType: SourceSyncChange["resourceType"], changeType: SourceSyncChange["changeType"]): SourceSyncChange {
  return { id: `change.${record.id}.${resourceType}.${slug(canonicalId)}`, resourceType, changeType, canonicalId, sourceRecordId: record.id };
}

function accepted(record: SourceRecordEnvelope, canonicalId?: string): SourceSyncRecordDecision {
  return { sourceRecordId: record.id, canonicalId, status: "accepted", code: "accepted", message: "Record passed governed synchronization validation." };
}

function mappedCanonicalId(record: SourceRecordEnvelope, mapping: GovernedSyncMapping): string | undefined {
  const profile = mapping.syncProfiles.find((item) => item.sourceType === record.sourceType);
  const value = profile ? record.payload[profile.idSourceField] : undefined;
  return profile && typeof value === "string" ? profile.canonicalIdMap[value] : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}
