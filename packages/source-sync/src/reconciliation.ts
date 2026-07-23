import type { GovernedSyncSnapshot, LineageRecord, ReconciliationClassification, ReconciliationItem, ReconciliationResult } from "../../knowledge-contracts/src/index";
import type { InspectableCanonicalPublicationStore } from "./publication";
import type { LineageStore } from "./lineage";

export type ReconciliationRequest = { connectorId: string; runId: string; source: GovernedSyncSnapshot; authorizationDeniedIds?: string[] };
export interface ConnectorReconciliationService { reconcile(request: ReconciliationRequest): Promise<ReconciliationResult>; }

export class DeterministicConnectorReconciliationService implements ConnectorReconciliationService {
  constructor(private readonly publication: InspectableCanonicalPublicationStore, private readonly lineage: LineageStore) {}

  async reconcile(request: ReconciliationRequest): Promise<ReconciliationResult> {
    const published = new Map((await this.publication.listPublished()).map((item) => [item.canonicalId, item]));
    const source = new Map([
      ...request.source.entities.map((entry) => [entry.id, { id: entry.id, sourceRecordId: entry.sync.sourceRecordId, version: entry.version ?? entry.sync.sourceRecordVersion, hash: entry.sync.sourceRecordChecksum, active: entry.status === "active" }] as const),
      ...request.source.relations.map((entry) => [entry.id, { id: entry.id, sourceRecordId: entry.sync.sourceRecordId, version: entry.sync.sourceRecordVersion, hash: entry.sync.sourceRecordChecksum, active: true }] as const),
    ]);
    const lineage = await this.lineage.list();
    const denied = new Set(request.authorizationDeniedIds ?? []);
    const items: ReconciliationItem[] = [];
    for (const sourceItem of source.values()) {
      const target = published.get(sourceItem.id);
      if (denied.has(sourceItem.id)) { items.push(item("authorization-mismatch", sourceItem.id, sourceItem.sourceRecordId, true, sourceItem.version, target?.proposedVersion, sourceItem.hash, target?.contentHash)); continue; }
      if (!target) { items.push(item("source-only", sourceItem.id, sourceItem.sourceRecordId, true, sourceItem.version, undefined, sourceItem.hash)); continue; }
      const line = findLineage(lineage, sourceItem.id, target.proposedVersion, target.contentHash);
      if (!line) { items.push(item("lineage-missing", sourceItem.id, sourceItem.sourceRecordId, true, sourceItem.version, target.proposedVersion, sourceItem.hash, target.contentHash)); continue; }
      if (sourceItem.version !== target.proposedVersion) { items.push(item("version-mismatch", sourceItem.id, sourceItem.sourceRecordId, true, sourceItem.version, target.proposedVersion, sourceItem.hash, target.contentHash)); continue; }
      if (sourceItem.hash !== target.contentHash) { items.push(item("hash-mismatch", sourceItem.id, sourceItem.sourceRecordId, true, sourceItem.version, target.proposedVersion, sourceItem.hash, target.contentHash)); continue; }
      if (!sourceItem.active && target.kind !== "deactivate" && target.kind !== "supersede" && target.kind !== "expire") { items.push(item("governance-mismatch", sourceItem.id, sourceItem.sourceRecordId, true, sourceItem.version, target.proposedVersion, sourceItem.hash, target.contentHash)); continue; }
      items.push(item("matched", sourceItem.id, sourceItem.sourceRecordId, false, sourceItem.version, target.proposedVersion, sourceItem.hash, target.contentHash));
    }
    for (const target of published.values()) if (!source.has(target.canonicalId)) items.push(item("canonical-only", target.canonicalId, undefined, false, undefined, target.proposedVersion, undefined, target.contentHash));
    return { connectorId: request.connectorId, runId: request.runId, counts: counts(items), items };
  }
}

function item(classification: ReconciliationClassification, canonicalId?: string, sourceRecordId?: string, blocking = false, sourceVersion?: string, canonicalVersion?: string, sourceHash?: string, canonicalHash?: string): ReconciliationItem {
  return { classification, canonicalId, sourceRecordId, blocking, sourceVersion, canonicalVersion, sourceHash, canonicalHash };
}
function findLineage(records: LineageRecord[], id: string, version: string, hash: string): LineageRecord | undefined { return records.find((record) => record.canonicalId === id && record.canonicalVersion === version && record.contentHash === hash); }
function counts(items: ReconciliationItem[]): Record<ReconciliationClassification, number> {
  const result = { matched: 0, "source-only": 0, "canonical-only": 0, "version-mismatch": 0, "hash-mismatch": 0, "governance-mismatch": 0, "authorization-mismatch": 0, "lineage-missing": 0 };
  items.forEach((entry) => { result[entry.classification] += 1; });
  return result;
}
