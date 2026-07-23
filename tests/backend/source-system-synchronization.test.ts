import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  AgentAuthorizationContext,
  GovernedSourceSystem,
  SourceRecordBatch,
  SourceRecordEnvelope,
  SourceSyncRequest,
} from "../../packages/knowledge-contracts/src/index";
import {
  checksumRecord,
  ControlledFileSourceConnector,
  FileGovernedSyncStore,
  GovernedSourceSynchronizationPipeline,
  InMemoryGovernedSyncStore,
  loadGovernedSyncMapping,
  sha256,
  SourceConnectorError,
  SynchronizedKnowledgeRepository,
  type SourceSystemConnector,
} from "../../packages/source-sync/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

const mesManifest = resolve("packages/demo-data/source-extracts/mes/manifest.json");
const qmsManifest = resolve("packages/demo-data/source-extracts/qms/manifest.json");
const plmManifest = resolve("packages/demo-data/source-extracts/plm/manifest.json");
const fixedNow = () => new Date("2026-07-22T09:00:00.000Z");

describe("Phase 5D governed source synchronization", () => {
  it("reads controlled MES, QMS, and PLM extracts with exact checksums", async () => {
    const batches = await Promise.all([
      new ControlledFileSourceConnector(mesManifest, "MES").readBatch(),
      new ControlledFileSourceConnector(qmsManifest, "QMS").readBatch(),
      new ControlledFileSourceConnector(plmManifest, "PLM").readBatch(),
    ]);

    expect(batches.map((batch) => batch.manifest.sourceSystem)).toEqual(["MES", "QMS", "PLM"]);
    expect(batches.flatMap((batch) => batch.records).map((record) => record.sourceId)).toEqual(["OP-030", "CTQ-OP30-LEAK-RATE", "FP-001"]);
  });

  it("rejects extract paths that escape the controlled directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "mkg-source-path-"));
    const recordsPath = join(dirname(root), "outside-records.json");
    const raw = "[]\n";
    await writeFile(recordsPath, raw, "utf8");
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      manifestVersion: "1.0.0",
      extractId: "source-extract.path-test",
      sourceSystem: "MES",
      schemaVersion: "1.0.0",
      mappingId: "MES-OPERATION-1",
      mappingVersion: "1.0.0",
      tenantId: "tenant.demo-manufacturing",
      domainId: "production",
      generatedAt: "2026-07-22T08:06:00.000Z",
      approvalStatus: "approved",
      lifecycleStatus: "effective",
      cursor: 1,
      recordsFile: "../outside-records.json",
      recordsChecksum: sha256(raw),
      recordCount: 0,
    }), "utf8");

    await expect(new ControlledFileSourceConnector(join(root, "manifest.json"), "MES").readBatch()).rejects.toMatchObject<Partial<SourceConnectorError>>({ code: "manifest-invalid" });
  });

  it("keeps dry-run immutable, applies atomically, and replays idempotently", async () => {
    const store = new InMemoryGovernedSyncStore();
    const pipeline = await fixturePipeline("MES", mesManifest, "mappings/mes/operation-mapping.json", store);
    const dryRun = await pipeline.synchronize(request("MES", "dry-run", "production"));

    expect(dryRun).toMatchObject({ status: "completed", counts: { received: 1, accepted: 1, inserted: 2, quarantined: 0, rejected: 0 } });
    expect((await store.getSnapshot()).entities).toEqual([]);

    const applied = await pipeline.synchronize(request("MES", "apply", "production"));
    const firstSnapshot = await store.getSnapshot();
    const replayed = await pipeline.synchronize(request("MES", "apply", "production"));
    const secondSnapshot = await store.getSnapshot();

    expect(applied.checkpoint).toMatchObject({ sourceSystem: "MES", cursor: 100 });
    expect(firstSnapshot.entities.map((entity) => entity.id)).toEqual(["operation.op30"]);
    expect(firstSnapshot.relations).toHaveLength(1);
    expect(replayed.counts).toMatchObject({ unchanged: 1, rejected: 0, quarantined: 0 });
    expect(secondSnapshot).toEqual(firstSnapshot);
  });

  it("persists checkpoints and synchronized records across store restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "mkg-source-store-"));
    const path = join(root, "snapshot.json");
    const store = new FileGovernedSyncStore(path);
    await store.initialize();
    const pipeline = await fixturePipeline("QMS", qmsManifest, "mappings/qms/quality-mapping.json", store);
    await pipeline.synchronize(request("QMS", "apply", "quality"));

    const restored = new FileGovernedSyncStore(path);
    await restored.initialize();
    const snapshot = await restored.getSnapshot();

    expect(snapshot.entities[0]).toMatchObject({ id: "quality-characteristic.leak-rate", sync: { sourceSystem: "QMS" } });
    expect(snapshot.relations[0]).toMatchObject({ sourceId: "operation.op30", targetId: "quality-characteristic.leak-rate", predicate: "qual:controlsCharacteristic" });
    expect(snapshot.checkpoints[0]).toMatchObject({ sourceSystem: "QMS", cursor: 200 });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ snapshotVersion: "1.0.0" });
  });

  it("fails closed for unauthorized principals and regressed cursors", async () => {
    const source = new MutableConnector(await new ControlledFileSourceConnector(mesManifest, "MES").readBatch());
    const store = new InMemoryGovernedSyncStore();
    const mapping = await loadGovernedSyncMapping(resolve("mappings/mes/operation-mapping.json"));
    const pipeline = new GovernedSourceSynchronizationPipeline({ connector: source, mapping, store, now: fixedNow });
    const denied = await pipeline.synchronize({ ...request("MES", "apply", "production"), authorization: context(["source-sync-reader"], ["production"]) });

    expect(denied).toMatchObject({ status: "blocked", counts: { accepted: 0, rejected: 1 } });
    expect(denied.decisions[0]?.code).toBe("authorization-denied");
    expect((await store.getSnapshot()).entities).toEqual([]);

    await pipeline.synchronize(request("MES", "apply", "production"));
    source.batch = { ...source.batch, manifest: { ...source.batch.manifest, extractId: "source-extract.mes.regressed", cursor: 99 } };
    const regressed = await pipeline.synchronize(request("MES", "apply", "production"));
    expect(regressed).toMatchObject({ status: "blocked", checkpoint: { cursor: 100 } });
    expect(regressed.decisions[0]?.code).toBe("cursor-not-advanced");
  });

  it("requires an explicit tombstone and removes source-owned relations", async () => {
    const initial = await new ControlledFileSourceConnector(mesManifest, "MES").readBatch();
    const source = new MutableConnector(initial);
    const store = new InMemoryGovernedSyncStore();
    const mapping = await loadGovernedSyncMapping(resolve("mappings/mes/operation-mapping.json"));
    const pipeline = new GovernedSourceSynchronizationPipeline({ connector: source, mapping, store, now: fixedNow });
    await pipeline.synchronize(request("MES", "apply", "production"));

    const record = signedRecord({ ...initial.records[0]!, id: "source-record.mes.operation.op30.tombstone", operation: "tombstone", version: "2026.07.22.2", recordedAt: "2026-07-22T09:05:00.000Z" });
    source.batch = { manifest: { ...initial.manifest, extractId: "source-extract.mes.operations.20260722.101", cursor: 101, recordCount: 1 }, records: [record] };
    const result = await pipeline.synchronize(request("MES", "apply", "production"));
    const snapshot = await store.getSnapshot();

    expect(result.counts.tombstoned).toBe(2);
    expect(snapshot.entities[0]?.status).toBe("tombstoned");
    expect(snapshot.relations).toEqual([]);
  });

  it("quarantines unknown fields and stale source records without advancing facts", async () => {
    const initial = await new ControlledFileSourceConnector(mesManifest, "MES").readBatch();
    const source = new MutableConnector(initial);
    const store = new InMemoryGovernedSyncStore();
    const mapping = await loadGovernedSyncMapping(resolve("mappings/mes/operation-mapping.json"));
    const pipeline = new GovernedSourceSynchronizationPipeline({ connector: source, mapping, store, now: fixedNow });

    const unknown = signedRecord({
      ...initial.records[0]!,
      id: "source-record.mes.operation.op30.unknown-field",
      payload: { ...initial.records[0]!.payload, unapproved_field: "not governed" },
    });
    source.batch = { manifest: { ...initial.manifest, extractId: "source-extract.mes.unknown-field", cursor: 101 }, records: [unknown] };
    const unknownResult = await pipeline.synchronize(request("MES", "apply", "production"));
    expect(unknownResult.decisions[0]).toMatchObject({ status: "quarantined", code: "unmapped-field" });
    expect((await store.getSnapshot()).entities).toEqual([]);

    const staleStore = new InMemoryGovernedSyncStore();
    const staleSource = new MutableConnector(initial);
    const stalePipeline = new GovernedSourceSynchronizationPipeline({ connector: staleSource, mapping, store: staleStore, now: fixedNow });
    await stalePipeline.synchronize(request("MES", "apply", "production"));
    const stale = signedRecord({
      ...initial.records[0]!,
      id: "source-record.mes.operation.op30.stale",
      version: "2026.07.21.1",
      recordedAt: "2026-07-21T08:05:00.000Z",
    });
    staleSource.batch = { manifest: { ...initial.manifest, extractId: "source-extract.mes.stale", cursor: 102 }, records: [stale] };
    const staleResult = await stalePipeline.synchronize(request("MES", "apply", "production"));
    expect(staleResult.decisions[0]).toMatchObject({ status: "quarantined", code: "stale-record" });
    expect((await staleStore.getSnapshot()).entities[0]?.sync.sourceRecordVersion).toBe("2026.07.22.1");
  });

  it("plans duplicate, out-of-order, and same-version conflict records deterministically within one batch", async () => {
    const initial = await new ControlledFileSourceConnector(mesManifest, "MES").readBatch();
    const mapping = await loadGovernedSyncMapping(resolve("mappings/mes/operation-mapping.json"));
    const original = initial.records[0]!;
    const newer = signedRecord({ ...original, id: "source-record.mes.operation.op30.newer", version: "2026.07.22.2", recordedAt: "2026-07-22T08:10:00.000Z", payload: { ...original.payload, actual_cycle_time: 43 } });
    const outOfOrderBatch = { manifest: { ...initial.manifest, extractId: "source-extract.mes.out-of-order", cursor: 101, recordCount: 2 }, records: [newer, original] };
    const reversedBatch = { ...outOfOrderBatch, records: [...outOfOrderBatch.records].reverse() };
    const first = await new GovernedSourceSynchronizationPipeline({ connector: new MutableConnector(outOfOrderBatch), mapping, store: new InMemoryGovernedSyncStore(), now: fixedNow }).synchronize(request("MES", "dry-run", "production"));
    const second = await new GovernedSourceSynchronizationPipeline({ connector: new MutableConnector(reversedBatch), mapping, store: new InMemoryGovernedSyncStore(), now: fixedNow }).synchronize(request("MES", "dry-run", "production"));
    expect(first.changes.map((item) => [item.canonicalId, item.changeType])).toEqual(second.changes.map((item) => [item.canonicalId, item.changeType]));
    expect(first.decisions.some((item) => item.code === "stale-record")).toBe(true);

    const duplicateBatch = { manifest: { ...initial.manifest, extractId: "source-extract.mes.duplicate", cursor: 102, recordCount: 2 }, records: [original, structuredClone(original)] };
    const duplicate = await new GovernedSourceSynchronizationPipeline({ connector: new MutableConnector(duplicateBatch), mapping, store: new InMemoryGovernedSyncStore(), now: fixedNow }).synchronize(request("MES", "dry-run", "production"));
    expect(duplicate.changes).toHaveLength(2);
    expect(duplicate.decisions.filter((item) => item.code === "duplicate-record")).toHaveLength(1);

    const conflicting = signedRecord({ ...original, id: "source-record.mes.operation.op30.conflicting", payload: { ...original.payload, actual_cycle_time: 99 } });
    const conflictBatch = { manifest: { ...initial.manifest, extractId: "source-extract.mes.conflict", cursor: 103, recordCount: 2 }, records: [original, conflicting] };
    const conflict = await new GovernedSourceSynchronizationPipeline({ connector: new MutableConnector(conflictBatch), mapping, store: new InMemoryGovernedSyncStore(), now: fixedNow }).synchronize(request("MES", "dry-run", "production"));
    expect(conflict.changes).toEqual([]);
    expect(conflict.decisions.every((item) => item.code === "same-version-hash-conflict" && item.status === "quarantined")).toBe(true);
  });

  it("overlays governed synchronized facts without changing the repository contract", async () => {
    const store = new InMemoryGovernedSyncStore();
    const pipeline = await fixturePipeline("MES", mesManifest, "mappings/mes/operation-mapping.json", store);
    await pipeline.synchronize(request("MES", "apply", "production"));
    const repository = new SynchronizedKnowledgeRepository(new MockKnowledgeRepository(), store);

    const entity = await repository.getEntityById("operation.op30");
    expect(entity).toMatchObject({ id: "operation.op30", properties: { cycleTime: { value: 42, unit: "s" }, sourceStatus: "active" } });
    expect(entity).not.toHaveProperty("payload");
    expect(await repository.getEntityById("operation.not-canonical")).toBeNull();
  });
});

async function fixturePipeline(sourceSystem: GovernedSourceSystem, manifest: string, mappingPath: string, store: InMemoryGovernedSyncStore | FileGovernedSyncStore) {
  return new GovernedSourceSynchronizationPipeline({
    connector: new ControlledFileSourceConnector(manifest, sourceSystem),
    mapping: await loadGovernedSyncMapping(resolve(mappingPath)),
    store,
    now: fixedNow,
  });
}

function request(sourceSystem: GovernedSourceSystem, mode: SourceSyncRequest["mode"], domain: string): SourceSyncRequest {
  return {
    requestId: `request.sync.${sourceSystem.toLowerCase()}.${mode}`,
    mode,
    expectedSourceSystem: sourceSystem,
    expectedMappingVersion: "1.0.0",
    authorization: context(["source-sync-operator"], [domain]),
    requestedAt: "2026-07-22T09:00:00.000Z",
  };
}

function context(roleIds: string[], domainIds: string[]): AgentAuthorizationContext {
  return {
    principal: { id: "principal.source-sync", tenantId: "tenant.demo-manufacturing", roleIds, domainIds, authenticationMethod: "static-bearer" },
    authenticatedAt: "2026-07-22T09:00:00.000Z",
    requestId: "request.source-sync",
  };
}

function signedRecord(record: SourceRecordEnvelope): SourceRecordEnvelope {
  const content = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordChecksum"));
  return { ...record, recordChecksum: checksumRecord(content) };
}

class MutableConnector implements SourceSystemConnector {
  constructor(public batch: SourceRecordBatch) {}
  get sourceSystem(): GovernedSourceSystem { return this.batch.manifest.sourceSystem; }
  async readBatch(): Promise<SourceRecordBatch> { return structuredClone(this.batch); }
}
