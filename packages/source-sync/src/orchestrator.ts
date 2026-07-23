import { randomUUID } from "node:crypto";
import type {
  AgentAuthorizationContext, CanonicalMutation, ConnectorPrincipal, ConnectorProfile,
  ConnectorRunMode, ConnectorSyncRun, GovernedDocumentChange, GovernedSourceSystem, GovernedSyncSnapshot,
  LineageRecord, PublicationJournalEntry, QuarantineItem, ReconciliationResult, SourceRecordBatch, SourceSyncReport,
} from "../../knowledge-contracts/src/index";
import { DefaultAgentAuthorizer } from "../../agent-security/src/index";
import { sha256 } from "./checksum";
import { InMemoryGovernedSyncStore } from "./store";
import { GovernedSourceSynchronizationPipeline } from "./pipeline";
import { authorizeConnectorPrincipal } from "./profile";
import { stableQuarantineId, type QuarantineStore } from "./quarantine";
import { transitionConnectorRun, type ConnectorRunStore } from "./runState";
import type { CanonicalPublicationStore, DocumentPublicationStore } from "./publication";
import type { PublicationJournalStore } from "./journal";
import type { LineageStore } from "./lineage";
import type { ConnectorReconciliationService } from "./reconciliation";
import type { GovernedSyncMapping, GovernedSyncStore, SourceSyncAuditSink, SourceSystemConnector } from "./types";

export type SourceSyncTelemetryEvent = {
  connectorId: string; sourceSystem: string; tenantId: string; mode: ConnectorRunMode; runStatus: string;
  pageCount?: number; recordCount: number; mappedCount: number; validatedCount: number; publishedCount: number;
  quarantinedCount: number; rejectedCount: number; duplicateCount: number; staleCount: number; retryCount?: number;
  checkpointAdvanced: boolean; reconciliationMismatchCount: number; durationMs: number;
};
export interface SourceSyncTelemetrySink { record(event: SourceSyncTelemetryEvent): void | Promise<void>; }
export type ConnectorRunRequest = { connectorId: string; mode: ConnectorRunMode; authorization: AgentAuthorizationContext; idempotencyKey: string };
export type ConnectorRunResult = { run: ConnectorSyncRun; report?: SourceSyncReport; reconciliation?: ReconciliationResult };

export class GovernedConnectorRunService {
  private readonly profiles: Map<string, ConnectorProfile>;
  private readonly pending = new Map<string, PendingCommit>();
  private readonly authorizer = new DefaultAgentAuthorizer();

  constructor(private readonly options: {
    profiles: ConnectorProfile[];
    principal: ConnectorPrincipal;
    connectorFactory: (profile: ConnectorProfile) => SourceSystemConnector;
    mappingFactory: (profile: ConnectorProfile) => Promise<GovernedSyncMapping>;
    syncStore: GovernedSyncStore;
    runs: ConnectorRunStore;
    quarantine: QuarantineStore;
    graphPublication: CanonicalPublicationStore;
    documentPublication: DocumentPublicationStore;
    journal: PublicationJournalStore;
    lineage: LineageStore;
    reconciliation: ConnectorReconciliationService;
    documentChanges?: (batch: SourceRecordBatch, profile: ConnectorProfile) => GovernedDocumentChange[];
    audit?: SourceSyncAuditSink;
    telemetry?: SourceSyncTelemetrySink;
    now?: () => Date;
  }) { this.profiles = new Map(options.profiles.map((profile) => [profile.id, profile])); }

  async run(request: ConnectorRunRequest, signal?: AbortSignal): Promise<ConnectorRunResult> {
    const profile = this.requireProfile(request.connectorId);
    const now = this.now();
    let run = createRun(profile, request, now);
    const existingRun = await this.options.runs.get(run.id);
    if (existingRun) return { run: existingRun };
    await this.options.runs.create(run);
    const started = now.getTime();
    let report: SourceSyncReport | undefined;
    let reconciliation: ReconciliationResult | undefined;
    try {
      await this.auditEvent(run, profile, "source-sync.requested", "allowed", { mode: request.mode });
      this.authorize(request.authorization, profile);
      authorizeConnectorPrincipal(this.options.principal, profile);
      abort(signal);
      run = await this.move(run, "extracting");
      const batch = await this.options.connectorFactory(profile).readBatch(signal);
      await this.auditEvent(run, profile, "source-sync.source-authentication", "completed", { adapterType: profile.adapterType });
      run.counters.extracted = batch.records.length;
      assertBatchProfile(batch, profile);
      abort(signal);

      run = await this.move(run, "mapping");
      const current = await this.options.syncStore.getSnapshot();
      const staging = new InMemoryGovernedSyncStore(current);
      const pipeline = new GovernedSourceSynchronizationPipeline({ connector: new FixedBatchConnector(batch), mapping: await this.options.mappingFactory(profile), store: staging, authorizer: this.authorizer, now: this.options.now });
      report = await pipeline.synchronize({ requestId: run.id, mode: "apply", expectedSourceSystem: batch.manifest.sourceSystem, expectedMappingVersion: batch.manifest.mappingVersion, authorization: request.authorization, requestedAt: now.toISOString() }, signal);
      run.counters.mapped = report.counts.accepted;
      run.counters.skippedDuplicate = report.counts.unchanged + report.decisions.filter((item) => item.code === "duplicate-record").length;
      run.counters.stale = report.decisions.filter((item) => item.code === "stale-record").length;
      run.counters.quarantined = report.counts.quarantined;
      run.counters.rejected = report.counts.rejected;
      await this.persistQuarantine(run, profile, batch, report);
      if (report.counts.quarantined || report.counts.rejected) await this.auditEvent(run, profile, "source-sync.quarantine", "failed", { quarantined: report.counts.quarantined, rejected: report.counts.rejected });
      run = await this.move(run, "validating");
      if (report.status !== "completed" || report.counts.quarantined || report.counts.rejected) throw new RunFailure("VALIDATION_QUARANTINED");
      const stagedSnapshot = await staging.getSnapshot();
      const changed = changedSnapshot(current, stagedSnapshot, report);
      this.authorizeObjects(request.authorization, profile, changed);
      await this.auditEvent(run, profile, "source-sync.publication-authorization", "allowed", { objectCount: changed.entities.length + changed.relations.length });
      run.counters.validated = changed.entities.length + changed.relations.length;

      if (request.mode === "dry-run" || request.mode === "validate-only") {
        report = nonPublishingReport(report, current);
        run = await this.move(run, "completed");
        return { run: await this.finish(run, profile, started, false, 0), report };
      }
      if (request.mode === "reconcile-only") {
        report = nonPublishingReport(report, current);
        run = await this.move(run, "reconciling");
        reconciliation = await this.options.reconciliation.reconcile({ connectorId: profile.id, runId: run.id, source: current });
        await this.auditEvent(run, profile, "source-sync.reconciliation", reconciliation.items.some((item) => item.blocking) ? "failed" : "completed", { mismatchCount: mismatchCount(reconciliation) });
        if (reconciliation.items.some((item) => item.blocking)) throw new RunFailure("RECONCILIATION_BLOCKING");
        run = await this.move(run, "completed");
        return { run: await this.finish(run, profile, started, false, mismatchCount(reconciliation)), report, reconciliation };
      }

      const mutations = toMutations(profile, current, changed, report);
      const documents = this.options.documentChanges?.(batch, profile) ?? [];
      const journal: PublicationJournalEntry = { journalVersion: "1.0.0", runId: run.id, status: "validated", expectedGraphMutationCount: mutations.length, expectedDocumentChangeCount: documents.length, completedStages: ["validated"], verificationHashes: [], updatedAt: this.now().toISOString() };
      await this.options.journal.create(journal);
      run = await this.move(run, "staging");
      await this.options.graphPublication.stage(run.id, mutations);
      await this.options.documentPublication.stage(run.id, documents);
      await this.options.journal.transition(run.id, "staged", {}, this.now());
      this.pending.set(run.id, { profile, batch, report, changed, stagedSnapshot, documents });
      abort(signal);

      run = await this.move(run, "publishing");
      const graph = await this.options.graphPublication.publish(run.id);
      await this.options.journal.transition(run.id, "graph-published", {}, this.now());
      const document = await this.options.documentPublication.publish(run.id);
      await this.options.journal.transition(run.id, "documents-published", {}, this.now());
      run.counters.staged = mutations.length + documents.length;
      run.counters.published = graph.published + document.published;
      run = await this.move(run, "verifying");
      const graphVerification = await this.options.graphPublication.verify(run.id);
      const documentVerification = await this.options.documentPublication.verify(run.id);
      if (!graphVerification.verified || !documentVerification.verified) throw new RunFailure("PUBLICATION_VERIFICATION_FAILED", true);
      await this.options.journal.transition(run.id, "verified", { verificationHashes: [graphVerification.verificationHash, documentVerification.verificationHash] }, this.now());
      await this.options.lineage.append(toLineage(profile, run.id, changed, documents, this.options.graphPublication.target, this.now()));
      run = await this.move(run, "reconciling");
      reconciliation = await this.options.reconciliation.reconcile({ connectorId: profile.id, runId: run.id, source: changed });
      await this.auditEvent(run, profile, "source-sync.reconciliation", reconciliation.items.some((item) => item.blocking) ? "failed" : "completed", { mismatchCount: mismatchCount(reconciliation) });
      if (reconciliation.items.some((item) => item.blocking)) throw new RunFailure("RECONCILIATION_BLOCKING", true);
      await this.commitPending(run.id);
      await this.options.journal.transition(run.id, "committed", {}, this.now());
      await this.auditEvent(run, profile, "source-sync.publication-commit", "completed", { published: run.counters.published });
      run.checkpointAfter = report.checkpoint;
      await this.auditEvent(run, profile, "source-sync.checkpoint-commit", "completed", { cursor: report.checkpoint?.cursor ?? 0 });
      run = await this.move(run, "completed");
      return { run: await this.finish(run, profile, started, true, mismatchCount(reconciliation)), report, reconciliation };
    } catch (error) {
      const cancelled = signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
      const partial = ["publishing", "verifying", "reconciling"].includes(run.status) || (error instanceof RunFailure && error.recovery);
      const status = cancelled && !partial ? "cancelled" : partial ? "recovery-required" : "failed";
      run = { ...run, failureCode: cancelled ? "CANCELLED" : errorCode(error) };
      run = await this.move(run, status);
      if (partial) await this.markJournalRecovery(run.id, run.failureCode!);
      if (partial) await this.auditEvent(run, profile, "source-sync.recovery-required", "failed", { failureCode: run.failureCode! });
      if (run.failureCode?.startsWith("SOURCE_AUTH")) await this.auditEvent(run, profile, "source-sync.source-authentication", "failed", { failureCode: run.failureCode });
      return { run: await this.finish(run, profile, started, false, reconciliation ? mismatchCount(reconciliation) : 0), report, reconciliation };
    }
  }

  async recover(runId: string): Promise<ConnectorRunResult> {
    let run = await this.options.runs.get(runId);
    if (!run || run.status !== "recovery-required") throw new Error("RECOVERY_RUN_NOT_AVAILABLE");
    const pending = this.pending.get(runId);
    if (!pending) return { run: { ...run, failureCode: "MANUAL_RECOVERY_REQUIRED" } };
    run = await this.move(run, "verifying");
    const journal = await this.options.journal.get(runId);
    if (!journal) throw new Error("RECOVERY_JOURNAL_MISSING");
    try {
      if (!journal.completedStages.includes("graph-published")) { await this.options.graphPublication.publish(runId); await this.options.journal.recordRecoveryStage(runId, "graph-published", this.now()); }
      if (!journal.completedStages.includes("documents-published")) { await this.options.documentPublication.publish(runId); await this.options.journal.recordRecoveryStage(runId, "documents-published", this.now()); }
    } catch {
      run = { ...run, failureCode: "RECOVERY_PUBLICATION_FAILED" };
      run = await this.move(run, "recovery-required");
      await this.auditEvent(run, pending.profile, "source-sync.recovery-result", "failed", { failureCode: run.failureCode ?? "RECOVERY_PUBLICATION_FAILED" });
      return { run, report: pending.report };
    }
    const graph = await this.options.graphPublication.verify(runId);
    const docs = await this.options.documentPublication.verify(runId);
    if (!graph.verified || !docs.verified) { run = { ...run, failureCode: "RECOVERY_VERIFICATION_FAILED" }; run = await this.move(run, "recovery-required"); await this.auditEvent(run, pending.profile, "source-sync.recovery-result", "failed", { failureCode: run.failureCode ?? "RECOVERY_VERIFICATION_FAILED" }); return { run }; }
    await this.options.journal.transition(runId, "verified", { recoveryStatus: "recovered", verificationHashes: [graph.verificationHash, docs.verificationHash] }, this.now());
    await this.options.lineage.append(toLineage(pending.profile, runId, pending.changed, pending.documents, this.options.graphPublication.target, this.now()));
    run = await this.move(run, "reconciling");
    const reconciliation = await this.options.reconciliation.reconcile({ connectorId: pending.profile.id, runId, source: pending.changed });
    if (reconciliation.items.some((item) => item.blocking)) { run = { ...run, failureCode: "RECOVERY_RECONCILIATION_BLOCKING" }; run = await this.move(run, "recovery-required"); await this.auditEvent(run, pending.profile, "source-sync.recovery-result", "failed", { failureCode: run.failureCode ?? "RECOVERY_RECONCILIATION_BLOCKING" }); return { run, report: pending.report, reconciliation }; }
    await this.commitPending(runId);
    await this.options.journal.transition(runId, "committed", { recoveryStatus: "recovered" }, this.now());
    run.checkpointAfter = pending.report.checkpoint;
    run = await this.move(run, "completed");
    await this.auditEvent(run, pending.profile, "source-sync.recovery-result", "completed", { mismatchCount: mismatchCount(reconciliation) });
    return { run, report: pending.report, reconciliation };
  }

  async replayQuarantine(id: string, authorization: AgentAuthorizationContext): Promise<ConnectorRunResult> {
    const item = await this.options.quarantine.get(id);
    if (!item || item.status !== "open") throw new Error("QUARANTINE_ITEM_NOT_REPLAYABLE");
    const result = await this.run({ connectorId: item.connectorId, mode: "incremental", authorization, idempotencyKey: `replay.${id}` });
    if (result.run.status === "completed") await this.options.quarantine.resolve(id, this.now());
    return result;
  }

  private requireProfile(id: string): ConnectorProfile { const profile = this.profiles.get(id); if (!profile?.enabled) throw new Error("CONNECTOR_NOT_AVAILABLE"); return profile; }
  private authorize(context: AgentAuthorizationContext, profile: ConnectorProfile): void { const decision = this.authorizer.authorize(context, "source-sync:apply", { type: "source-extract", id: profile.id, tenantId: profile.tenantId, domainIds: profile.allowedDomains }); if (decision.decision === "denied") throw new RunFailure(`AUTHORIZATION_DENIED:${decision.reasonCode}`); }
  private authorizeObjects(context: AgentAuthorizationContext, profile: ConnectorProfile, snapshot: GovernedSyncSnapshot): void { const decision = this.authorizer.authorize(context, "source-sync:apply", { type: "source-extract", id: profile.id, tenantId: profile.tenantId, domainIds: profile.allowedDomains, objectIds: snapshot.entities.map((item) => item.id) }); if (decision.decision === "denied") throw new RunFailure(`AUTHORIZATION_DENIED:${decision.reasonCode}`); }
  private async move(run: ConnectorSyncRun, status: ConnectorSyncRun["status"]): Promise<ConnectorSyncRun> { const next = transitionConnectorRun(run, status, this.now()); await this.options.runs.update(next); return next; }
  private async commitPending(runId: string): Promise<void> { const pending = this.pending.get(runId); if (!pending?.report.checkpoint) throw new Error("PENDING_CHECKPOINT_MISSING"); const entityIds = new Set(pending.changed.entities.map((item) => item.id)); const relationIds = new Set(pending.changed.relations.map((item) => item.id)); const removed = pending.report.changes.filter((item) => item.resourceType === "relation" && item.changeType === "tombstone").map((item) => item.canonicalId); await this.options.syncStore.commit({ extractId: pending.batch.manifest.extractId, checkpoint: pending.report.checkpoint, entities: pending.stagedSnapshot.entities.filter((item) => entityIds.has(item.id)), relations: pending.stagedSnapshot.relations.filter((item) => relationIds.has(item.id)), removeRelationIds: removed }); this.pending.delete(runId); }
  private async persistQuarantine(run: ConnectorSyncRun, profile: ConnectorProfile, batch: SourceRecordBatch, report: SourceSyncReport): Promise<void> { for (const decision of report.decisions.filter((item) => item.status !== "accepted")) { const record = batch.records.find((item) => item.id === decision.sourceRecordId); const item: QuarantineItem = { id: stableQuarantineId({ connectorId: profile.id, sourceRecordId: record?.sourceId ?? decision.sourceRecordId, sourceVersion: record?.version ?? batch.manifest.mappingVersion, contentHash: record?.recordChecksum ?? batch.manifest.recordsChecksum, reasonCode: decision.code }), connectorId: profile.id, runId: run.id, sourceSystem: profile.sourceSystem, sourceRecordId: record?.sourceId ?? decision.sourceRecordId, sourceVersion: record?.version ?? batch.manifest.mappingVersion, contentHash: record?.recordChecksum ?? batch.manifest.recordsChecksum, reasonCode: decision.code, severity: decision.status === "rejected" ? "critical" : "major", sanitizedMetadata: { canonicalId: decision.canonicalId, decisionStatus: decision.status }, status: "open", createdAt: this.now().toISOString() }; await this.options.quarantine.put(item); } }
  private async markJournalRecovery(runId: string, failureCode: string): Promise<void> { const entry = await this.options.journal.get(runId); if (entry && entry.status !== "recovery-required") await this.options.journal.transition(runId, "recovery-required", { failureCode, recoveryStatus: "pending" }, this.now()); }
  private async finish(run: ConnectorSyncRun, profile: ConnectorProfile, started: number, checkpointAdvanced: boolean, mismatches: number): Promise<ConnectorSyncRun> { await this.options.telemetry?.record({ connectorId: profile.id, sourceSystem: profile.sourceSystem, tenantId: profile.tenantId, mode: run.mode, runStatus: run.status, recordCount: run.counters.extracted, mappedCount: run.counters.mapped, validatedCount: run.counters.validated, publishedCount: run.counters.published, quarantinedCount: run.counters.quarantined, rejectedCount: run.counters.rejected, duplicateCount: run.counters.skippedDuplicate, staleCount: run.counters.stale, checkpointAdvanced, reconciliationMismatchCount: mismatches, durationMs: Math.max(0, this.now().getTime() - started) }); await this.audit(run, profile); return run; }
  private async audit(run: ConnectorSyncRun, profile: ConnectorProfile): Promise<void> { await this.options.audit?.append({ id: `audit.connector.${randomUUID()}`, traceId: run.id, actorId: run.authorizationSnapshot.principalId, action: `source-sync.run.${run.status}`, resourceIds: [profile.id, run.id], outcome: run.status === "completed" ? "completed" : "failed", occurredAt: this.now().toISOString(), metadata: { connectorId: profile.id, sourceSystem: profile.sourceSystem, tenantId: profile.tenantId, runStatus: run.status, published: run.counters.published, quarantined: run.counters.quarantined, rejected: run.counters.rejected } }); }
  private async auditEvent(run: ConnectorSyncRun, profile: ConnectorProfile, action: string, outcome: "allowed" | "denied" | "completed" | "failed", metadata: Record<string, string | number | boolean>): Promise<void> { await this.options.audit?.append({ id: `audit.connector.${randomUUID()}`, traceId: run.id, actorId: run.authorizationSnapshot.principalId, action, resourceIds: [profile.id, run.id], outcome, occurredAt: this.now().toISOString(), metadata: { connectorId: profile.id, sourceSystem: profile.sourceSystem, tenantId: profile.tenantId, ...metadata } }); }
  private now = (): Date => this.options.now?.() ?? new Date();
}

type PendingCommit = { profile: ConnectorProfile; batch: SourceRecordBatch; report: SourceSyncReport; changed: GovernedSyncSnapshot; stagedSnapshot: GovernedSyncSnapshot; documents: GovernedDocumentChange[] };
class FixedBatchConnector implements SourceSystemConnector { readonly sourceSystem: GovernedSourceSystem; constructor(private readonly batch: SourceRecordBatch) { this.sourceSystem = batch.manifest.sourceSystem; } async readBatch(): Promise<SourceRecordBatch> { return structuredClone(this.batch); } }
class RunFailure extends Error { constructor(message: string, readonly recovery = false) { super(message); } }

function createRun(profile: ConnectorProfile, request: ConnectorRunRequest, now: Date): ConnectorSyncRun { return { id: `connector-run.${sha256(`${profile.id}|${request.idempotencyKey}`).slice(7, 31)}`, connectorId: profile.id, mode: request.mode, tenantId: profile.tenantId, authorizationSnapshot: { principalId: request.authorization.principal.id, tenantId: request.authorization.principal.tenantId, roleIds: [...request.authorization.principal.roleIds], domainIds: [...request.authorization.principal.domainIds], objectIds: request.authorization.principal.objectIds ? [...request.authorization.principal.objectIds] : undefined, authenticationMethod: request.authorization.principal.authenticationMethod }, status: "created", startedAt: now.toISOString(), counters: { extracted: 0, mapped: 0, validated: 0, staged: 0, published: 0, skippedDuplicate: 0, stale: 0, quarantined: 0, rejected: 0 } }; }
function assertBatchProfile(batch: SourceRecordBatch, profile: ConnectorProfile): void { if (batch.manifest.sourceSystem.toLowerCase() !== profile.sourceSystem || batch.manifest.tenantId !== profile.tenantId || !profile.allowedDomains.includes(batch.manifest.domainId)) throw new RunFailure("CONNECTOR_PROFILE_MISMATCH"); }
function changedSnapshot(before: GovernedSyncSnapshot, after: GovernedSyncSnapshot, report: SourceSyncReport): GovernedSyncSnapshot { const entityIds = new Set(report.changes.filter((item) => item.resourceType === "entity" && item.changeType !== "unchanged").map((item) => item.canonicalId)); const relationIds = new Set(report.changes.filter((item) => item.resourceType === "relation" && item.changeType !== "unchanged" && item.changeType !== "tombstone").map((item) => item.canonicalId)); return { snapshotVersion: "1.0.0", entities: after.entities.filter((item) => entityIds.has(item.id)), relations: after.relations.filter((item) => relationIds.has(item.id)), checkpoints: after.checkpoints.filter((item) => !before.checkpoints.some((old) => old.sourceSystem === item.sourceSystem && old.cursor === item.cursor)), appliedExtractIds: after.appliedExtractIds.filter((id) => !before.appliedExtractIds.includes(id)) }; }
function toMutations(profile: ConnectorProfile, before: GovernedSyncSnapshot, changed: GovernedSyncSnapshot, report: SourceSyncReport): CanonicalMutation[] {
  const existing = new Map(before.entities.map((item) => [item.id, item]));
  const entities = changed.entities.map((item): CanonicalMutation => ({ id: `mutation.${item.id}.${item.version ?? "unversioned"}`, kind: item.status === "tombstoned" ? "deactivate" : "entity-upsert", tenantId: profile.tenantId, domainId: item.domain ?? profile.allowedDomains[0]!, canonicalId: item.id, canonicalType: item.type, expectedCurrentVersion: existing.get(item.id)?.version, proposedVersion: item.version ?? item.sync.sourceRecordVersion, contentHash: item.sync.sourceRecordChecksum, properties: item.properties }));
  const existingRelations = new Map(before.relations.map((item) => [item.id, item]));
  const relations = changed.relations.map((item): CanonicalMutation => ({ id: `mutation.${item.id}.${item.sync.sourceRecordVersion}`, kind: "relation-upsert", tenantId: profile.tenantId, domainId: profile.allowedDomains[0]!, canonicalId: item.id, relation: { sourceId: item.sourceId, targetId: item.targetId, predicate: item.predicate, label: item.label }, expectedCurrentVersion: existingRelations.get(item.id)?.sync.sourceRecordVersion, proposedVersion: item.sync.sourceRecordVersion, contentHash: item.sync.sourceRecordChecksum, properties: item.properties ?? {} }));
  const tombstoneIds = new Set(report.changes.filter((item) => item.resourceType === "relation" && item.changeType === "tombstone").map((item) => item.canonicalId));
  const relationTombstones = before.relations.filter((item) => tombstoneIds.has(item.id)).map((item): CanonicalMutation => ({ id: `mutation.${item.id}.${item.sync.sourceRecordVersion}.deactivate`, kind: "deactivate", tenantId: profile.tenantId, domainId: profile.allowedDomains[0]!, canonicalId: item.id, relation: { sourceId: item.sourceId, targetId: item.targetId, predicate: item.predicate, label: item.label }, expectedCurrentVersion: item.sync.sourceRecordVersion, proposedVersion: `${item.sync.sourceRecordVersion}.tombstone`, contentHash: item.sync.sourceRecordChecksum, properties: { ...(item.properties ?? {}), active: false } }));
  return [...entities, ...relations, ...relationTombstones];
}
function toLineage(profile: ConnectorProfile, runId: string, changed: GovernedSyncSnapshot, documents: GovernedDocumentChange[], graphTarget: "mock" | "neo4j", now: Date): LineageRecord[] {
  const entityLineage = changed.entities.map((item): LineageRecord => ({ canonicalId: item.id, canonicalVersion: item.version ?? item.sync.sourceRecordVersion, sourceSystem: profile.sourceSystem, connectorId: profile.id, runId, sourceRecordId: item.sync.sourceRecordId, sourceVersion: item.sync.sourceRecordVersion, contentHash: item.sync.sourceRecordChecksum, mappingProfileId: item.sync.mappingId, mappingProfileVersion: item.sync.mappingVersion, publicationTarget: graphTarget, publishedAt: now.toISOString() }));
  const relationLineage = changed.relations.map((item): LineageRecord => ({ canonicalId: item.id, canonicalVersion: item.sync.sourceRecordVersion, sourceSystem: profile.sourceSystem, connectorId: profile.id, runId, sourceRecordId: item.sync.sourceRecordId, sourceVersion: item.sync.sourceRecordVersion, contentHash: item.sync.sourceRecordChecksum, mappingProfileId: item.sync.mappingId, mappingProfileVersion: item.sync.mappingVersion, publicationTarget: graphTarget, publishedAt: now.toISOString() }));
  return [...entityLineage, ...relationLineage, ...documents.map((item): LineageRecord => ({ canonicalId: item.documentId, canonicalVersion: item.version, sourceSystem: item.sourceSystem, connectorId: profile.id, runId, sourceRecordId: item.sourceRecordId, sourceVersion: item.version, contentHash: item.contentHash, mappingProfileId: profile.mappingProfileId, mappingProfileVersion: profile.version, publicationTarget: "document-registry", publishedAt: now.toISOString() }))];
}
function mismatchCount(result: ReconciliationResult): number { return result.items.filter((item) => item.classification !== "matched").length; }
function nonPublishingReport(report: SourceSyncReport, current: GovernedSyncSnapshot): SourceSyncReport { return { ...report, mode: "dry-run", checkpoint: current.checkpoints.find((item) => item.sourceSystem === report.sourceSystem) }; }
function errorCode(error: unknown): string { return error instanceof Error ? error.message.split(":")[0]! : "CONNECTOR_RUN_FAILED"; }
function abort(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("Connector run cancelled.", "AbortError"); }
