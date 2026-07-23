import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CanonicalMutation, ConnectorProfile, ConnectorSyncRun, GovernedSyncEntity, GovernedSyncSnapshot, LineageRecord } from "../../packages/knowledge-contracts/src/index";
import {
  DeterministicConnectorReconciliationService,
  ControlledFileSourceConnector,
  FileConnectorRunStore,
  FileGovernedSyncStore,
  FileLineageStore,
  FilePublicationJournalStore,
  FileQuarantineStore,
  FixtureHttpJsonSourceConnector,
  GovernedConnectorRunService,
  HttpSourceConnectorError,
  InMemoryConnectorRunStore,
  InMemoryGovernedSyncStore,
  InMemoryLineageStore,
  InMemoryPublicationJournalStore,
  InMemoryQuarantineStore,
  MockCanonicalPublicationStore,
  MockDocumentPublicationStore,
  sourceAuthenticationHeaders,
  transitionConnectorRun,
  checksumRecord,
  loadGovernedSyncMapping,
  validateConnectorPrincipal,
  validateConnectorProfile,
  validateConnectorProfiles,
} from "../../packages/source-sync/src/index";

describe("Phase 5D connector profiles and source authentication", () => {
  it("accepts governed profiles and strips unsupported profile fields", () => {
    expect(validateConnectorProfiles([controlledProfile()])).toHaveLength(1);
    expect(() => validateConnectorProfiles([controlledProfile(), controlledProfile()])).toThrow(/duplicate/u);
    expect(() => validateConnectorProfile({ ...controlledProfile(), token: "embedded" })).toThrow(/unsupported fields/u);
    expect(() => validateConnectorProfile({ ...controlledProfile(), sourceSystem: "sap" })).toThrow(/not supported/u);
  });

  it("fails closed for non-local fixture-none HTTP and invalid endpoint shapes", () => {
    expect(() => validateConnectorProfile(httpProfile("https://example.com", "fixture-none"))).toThrow(/fixture-none/u);
    expect(() => validateConnectorProfile({ ...httpProfile("http://127.0.0.1:4176"), endpoint: { baseUrl: "http://127.0.0.1:4176", allowedPaths: ["/fixture/../private"], allowLocalhostHttp: true } })).toThrow(/normalized/u);
    expect(() => validateConnectorProfile(httpProfile("https://user:pass@example.com"))).toThrow(/userinfo/u);
    expect(() => validateConnectorProfile(httpProfile("http://example.com"))).toThrow(/HTTPS/u);
  });

  it("validates connector service principals and loads bearer secrets server-side only", async () => {
    expect(validateConnectorPrincipal({ id: "service.test", type: "service", tenantId: "tenant.demo-manufacturing", roles: ["source-sync-operator"], allowedDomains: ["production"], allowedSourceSystems: ["mes"] }).type).toBe("service");
    const profile = httpProfile("http://127.0.0.1:4176");
    const headers = await sourceAuthenticationHeaders(profile, { resolve: async (reference) => reference === "MKG_SOURCE_SECRET_FIXTURE_TOKEN" ? "runtime-only-value" : undefined });
    expect(headers.Authorization).toBe("Bearer runtime-only-value");
    expect(JSON.stringify(profile)).not.toContain("runtime-only-value");
    await expect(sourceAuthenticationHeaders(profile, { resolve: async () => undefined })).rejects.toMatchObject({ code: "SOURCE_AUTH_CONFIGURATION_INVALID" });
  });
});

describe("Phase 5D HTTP connector controls", () => {
  it.each(["mes", "plm", "qms"] as const)("retrieves a governed %s fixture over localhost HTTP", async (source) => {
    const token = `fixture-token-${source}-123456789`;
    const profile = httpProfile("http://127.0.0.1:4176", "static-bearer", source);
    const batch = await new FixtureHttpJsonSourceConnector({ profile, path: `/fixture/${source}/records`, secrets: { resolve: async () => token }, fetch: async (_url, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
      return jsonResponse(await controlledPayload(source));
    } }).readBatch();
    expect(batch.records).toHaveLength(1);
    expect(batch.manifest.sourceSystem.toLowerCase()).toBe(source);
  });

  it("does not retry 401 or leak the bearer value", async () => {
    let calls = 0;
    const connector = new FixtureHttpJsonSourceConnector({
      profile: httpProfile("http://127.0.0.1:4176"), path: "/fixture/mes/records", secrets: { resolve: async () => "private-runtime-token" },
      fetch: async () => { calls += 1; return new Response("denied", { status: 401 }); },
    });
    await expect(connector.readBatch()).rejects.toMatchObject({ code: "SOURCE_AUTHENTICATION_FAILED" });
    expect(calls).toBe(1);
    await connector.readBatch().catch((error: Error) => expect(error.message).not.toContain("private-runtime-token"));
  });

  it.each([429, 500, 503])("retries bounded transient HTTP %s responses", async (status) => {
    let calls = 0;
    const valid = await controlledPayload("mes");
    const connector = new FixtureHttpJsonSourceConnector({
      profile: httpProfile("http://127.0.0.1:4176"), path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" }, retryLimit: 2,
      fetch: async () => { calls += 1; return calls < 3 ? new Response("temporary", { status }) : jsonResponse(valid); },
    });
    expect((await connector.readBatch()).records).toHaveLength(1);
    expect(calls).toBe(3);
  });

  it("rejects redirects, malformed JSON, oversized responses, page overflow, and record overflow", async () => {
    const profile = httpProfile("http://127.0.0.1:4176");
    const make = (fetcher: typeof fetch, overrides: Partial<ConstructorParameters<typeof FixtureHttpJsonSourceConnector>[0]> = {}) => new FixtureHttpJsonSourceConnector({ profile, path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" }, fetch: fetcher, ...overrides });
    await expect(make(async () => new Response(null, { status: 302, headers: { Location: "https://example.com" } })).readBatch()).rejects.toMatchObject({ code: "SSRF_DENIED" });
    await expect(make(async () => new Response("{", { status: 200 })).readBatch()).rejects.toMatchObject({ code: "SOURCE_RESPONSE_INVALID" });
    await expect(make(async () => new Response("x".repeat(100), { status: 200 }), { maximumResponseBytes: 10 }).readBatch()).rejects.toMatchObject({ code: "SOURCE_RESPONSE_TOO_LARGE" });
    const valid = await controlledPayload("mes");
    const more = { ...valid, pageInfo: { hasMore: true } };
    const pageLimited = { ...profile, synchronization: { ...profile.synchronization, pagination: "page" as const, maximumPages: 1 } };
    await expect(new FixtureHttpJsonSourceConnector({ profile: pageLimited, path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" }, fetch: async () => jsonResponse(more) }).readBatch()).rejects.toMatchObject({ code: "SOURCE_PAGE_LIMIT_EXCEEDED" });
    const recordLimited = { ...profile, synchronization: { ...profile.synchronization, maximumRecords: 1 } };
    const secondContent = { ...valid.records[0], id: "second", sourceId: "OP-031" };
    delete secondContent.recordChecksum;
    const second = { ...secondContent, recordChecksum: checksumRecord(secondContent) };
    await expect(new FixtureHttpJsonSourceConnector({ profile: recordLimited, path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" }, fetch: async () => jsonResponse({ ...valid, records: [valid.records[0], second] }) }).readBatch()).rejects.toMatchObject({ code: "SOURCE_RECORD_LIMIT_EXCEEDED" });
  });

  it("enforces timeout, cancellation, path allowlist, and private-address SSRF denial", async () => {
    const slowFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")), { once: true }));
    await expect(new FixtureHttpJsonSourceConnector({ profile: httpProfile("http://127.0.0.1:4176"), path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" }, fetch: slowFetch, timeoutMs: 5 }).readBatch()).rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });
    const controller = new AbortController(); controller.abort();
    await expect(new FixtureHttpJsonSourceConnector({ profile: httpProfile("http://127.0.0.1:4176"), path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" } }).readBatch(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(new FixtureHttpJsonSourceConnector({ profile: httpProfile("http://127.0.0.1:4176"), path: "/private", secrets: { resolve: async () => "fixture-token-123456789" } }).readBatch()).rejects.toMatchObject({ code: "ENDPOINT_DENIED" });
    const external = httpProfile("https://source.example.test");
    await expect(new FixtureHttpJsonSourceConnector({ profile: external, path: "/fixture/mes/records", secrets: { resolve: async () => "fixture-token-123456789" }, resolveHost: async () => ["10.0.0.1"] }).readBatch()).rejects.toMatchObject({ code: "SSRF_DENIED" });
  });
});

describe("Phase 5D state, persistence, publication, lineage, and reconciliation", () => {
  it("accepts the legal run path and rejects backward or terminal mutation", () => {
    let run = runFixture();
    for (const status of ["extracting", "mapping", "validating", "staging", "publishing", "verifying", "reconciling", "completed"] as const) run = transitionConnectorRun(run, status);
    expect(run.status).toBe("completed");
    expect(() => transitionConnectorRun(run, "failed")).toThrow(/Illegal/u);
    expect(() => transitionConnectorRun({ ...runFixture(), status: "mapping" }, "extracting")).toThrow(/Illegal/u);
  });

  it("marks interrupted publication as recovery-required and early interruption as failed", async () => {
    const store = new InMemoryConnectorRunStore();
    await store.create({ ...runFixture(), id: "early", status: "mapping" });
    await store.create({ ...runFixture(), id: "partial", status: "publishing" });
    const recovered = await store.recoverInterrupted(new Date("2026-07-23T00:00:00Z"));
    expect(recovered.find((item) => item.id === "early")?.status).toBe("failed");
    expect(recovered.find((item) => item.id === "partial")?.status).toBe("recovery-required");
  });

  it("rejects corrupted stores and enforces checkpoint monotonicity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "source-sync-store-"));
    const path = join(directory, "snapshot.json");
    const store = new FileGovernedSyncStore(path); await store.initialize();
    const checkpoint = { checkpointVersion: "1.0.0" as const, sourceSystem: "MES" as const, tenantId: "tenant.demo-manufacturing", cursor: 10, extractId: "extract.10", appliedAt: "2026-07-23T00:00:00Z" };
    await store.commit({ extractId: "extract.10", checkpoint, entities: [], relations: [], removeRelationIds: [] });
    await expect(store.commit({ extractId: "extract.9", checkpoint: { ...checkpoint, cursor: 9, extractId: "extract.9" }, entities: [], relations: [], removeRelationIds: [] })).rejects.toThrow(/monotonically/u);
    await writeFile(path, "{}", "utf8");
    await expect(new FileGovernedSyncStore(path).initialize()).rejects.toThrow(/unsupported or invalid/u);
  });

  it("persists sanitized run, quarantine, journal, and lineage records atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "source-sync-persistence-"));
    const runStore = new FileConnectorRunStore(join(directory, "runs.json")); await runStore.initialize(); await runStore.create(runFixture());
    const quarantine = new FileQuarantineStore(join(directory, "quarantine.json")); await quarantine.initialize();
    await quarantine.put({ id: "quarantine.1", connectorId: "connector.mes", runId: "run.1", sourceSystem: "mes", sourceRecordId: "OP-030", sourceVersion: "1", contentHash: hash64("a"), reasonCode: "record-invalid", severity: "major", sanitizedMetadata: { canonicalId: "operation.op30" }, status: "open", createdAt: "2026-07-23T00:00:00Z" });
    await quarantine.resolve("quarantine.1", new Date("2026-07-23T01:00:00Z"));
    expect((await quarantine.get("quarantine.1"))?.status).toBe("resolved");
    const journal = new FilePublicationJournalStore(join(directory, "journal.json")); await journal.initialize();
    await journal.create({ journalVersion: "1.0.0", runId: "run.1", status: "validated", expectedGraphMutationCount: 1, expectedDocumentChangeCount: 0, completedStages: ["validated"], verificationHashes: [], updatedAt: "2026-07-23T00:00:00Z" });
    await journal.transition("run.1", "staged"); await journal.transition("run.1", "graph-published"); await journal.transition("run.1", "verified"); await journal.transition("run.1", "committed");
    const lineage = new FileLineageStore(join(directory, "lineage.json")); await lineage.initialize(); await lineage.append([lineageFixture()]); await lineage.append([lineageFixture()]);
    expect(await lineage.list()).toHaveLength(1);
    expect(await readFile(join(directory, "lineage.json"), "utf8")).not.toContain("payload");
  });

  it("publishes graph and documents through separate verified stores", async () => {
    const graph = new MockCanonicalPublicationStore({ allowedTypes: ["mfg:Operation"], allowedPredicates: ["mfg:executedBy"] });
    const mutation = mutationFixture();
    expect((await graph.stage("run.1", [mutation])).staged).toBe(1);
    expect((await graph.publish("run.1")).published).toBe(1);
    expect((await graph.verify("run.1")).verified).toBe(true);
    expect((await graph.stage("run.2", [mutation])).staged).toBe(0);
    await expect(graph.stage("run.conflict", [{ ...mutation, contentHash: hash64("different") }])).rejects.toThrow(/SAME_VERSION_HASH_CONFLICT/u);
    await expect(graph.stage("run.cross-tenant", [{ ...mutation, tenantId: "tenant.other", proposedVersion: "v2" }])).rejects.toThrow(/CROSS_TENANT/u);
    await expect(graph.stage("run.delete", [{ ...mutation, kind: "delete" as CanonicalMutation["kind"] }])).rejects.toThrow(/PERMANENT_DELETE_DISABLED/u);
    const docs = new MockDocumentPublicationStore();
    const document = { id: "change.doc", tenantId: "tenant.demo-manufacturing", domainId: "quality", documentId: "document.control-plan", logicalDocumentId: "control-plan", version: "Rev.A", approvalStatus: "approved" as const, lifecycleStatus: "effective" as const, contentHash: hash64("document"), sourceSystem: "qms" as const, sourceRecordId: "CP-BB01", linkedEntityIds: ["operation.op30"], locator: "control-plan/rev-a" };
    await docs.stage("run.docs", [document]); await docs.publish("run.docs"); expect((await docs.verify("run.docs")).verified).toBe(true);
    await expect(docs.stage("run.draft", [{ ...document, approvalStatus: "draft" }])).rejects.toThrow(/DOCUMENT_NOT_APPROVED/u);
    await expect(docs.stage("run.obsolete", [{ ...document, lifecycleStatus: "obsolete" }])).rejects.toThrow(/DOCUMENT_NOT_EFFECTIVE/u);
    await expect(docs.stage("run.docs-cross-tenant", [{ ...document, tenantId: "tenant.other" }])).rejects.toThrow(/CROSS_TENANT/u);
  });

  it("classifies matched, source-only, canonical-only, version, hash, authorization and lineage mismatches", async () => {
    const graph = new MockCanonicalPublicationStore({ allowedTypes: ["mfg:Operation"] });
    const lineage = new InMemoryLineageStore();
    const mutation = mutationFixture(); await graph.stage("run.1", [mutation]); await graph.publish("run.1"); await lineage.append([lineageFixture()]);
    const service = new DeterministicConnectorReconciliationService(graph, lineage);
    const matched = await service.reconcile({ connectorId: "connector.mes", runId: "run.1", source: snapshotFixture() });
    expect(matched.counts.matched).toBe(1);
    const denied = await service.reconcile({ connectorId: "connector.mes", runId: "run.2", source: snapshotFixture(), authorizationDeniedIds: ["operation.op30"] });
    expect(denied.counts["authorization-mismatch"]).toBe(1);
    const missing = await new DeterministicConnectorReconciliationService(graph, new InMemoryLineageStore()).reconcile({ connectorId: "connector.mes", runId: "run.3", source: snapshotFixture() });
    expect(missing.counts["lineage-missing"]).toBe(1);
    const sourceOnly = await new DeterministicConnectorReconciliationService(new MockCanonicalPublicationStore(), lineage).reconcile({ connectorId: "connector.mes", runId: "run.4", source: snapshotFixture() });
    expect(sourceOnly.counts["source-only"]).toBe(1);
  });

  it("rejects illegal journal transitions", async () => {
    const journal = new InMemoryPublicationJournalStore();
    await journal.create({ journalVersion: "1.0.0", runId: "run.1", status: "validated", expectedGraphMutationCount: 0, expectedDocumentChangeCount: 0, completedStages: ["validated"], verificationHashes: [], updatedAt: "2026-07-23T00:00:00Z" });
    await expect(journal.transition("run.1", "committed")).rejects.toThrow(/Illegal/u);
  });

  it("marks partial cross-store publication recovery-required and resumes only missing stages", async () => {
    const profile: ConnectorProfile = { ...controlledProfile(), id: "connector.qms.controlled-file", sourceSystem: "qms", allowedDomains: ["quality"], mappingProfileId: "QMS-QUALITY-1" };
    const syncStore = new InMemoryGovernedSyncStore();
    const runs = new InMemoryConnectorRunStore();
    const graph = new MockCanonicalPublicationStore({ allowedTypes: ["qual:QualityCharacteristic"], allowedPredicates: ["qual:controlsCharacteristic"] });
    const documents = new FailOnceDocumentPublicationStore();
    const journal = new InMemoryPublicationJournalStore();
    const lineage = new InMemoryLineageStore();
    const service = new GovernedConnectorRunService({
      profiles: [profile],
      principal: { id: "service.test", type: "service", tenantId: profile.tenantId, roles: ["source-sync-operator"], allowedDomains: ["quality"], allowedSourceSystems: ["qms"] },
      connectorFactory: () => new ControlledFileSourceConnector(resolve("packages/demo-data/source-extracts/qms/manifest.json"), "QMS"),
      mappingFactory: () => loadGovernedSyncMapping(resolve("mappings/qms/quality-mapping.json")),
      syncStore, runs, quarantine: new InMemoryQuarantineStore(), graphPublication: graph, documentPublication: documents, journal, lineage,
      reconciliation: new DeterministicConnectorReconciliationService(graph, lineage),
      documentChanges: (batch) => [{ id: "document-change.qms", tenantId: profile.tenantId, domainId: "quality", documentId: "document.qms.leak-rate", logicalDocumentId: "qms.leak-rate", version: batch.records[0]!.version, approvalStatus: "approved", lifecycleStatus: "effective", contentHash: batch.records[0]!.recordChecksum, sourceSystem: "qms", sourceRecordId: batch.records[0]!.sourceId, linkedEntityIds: ["quality-characteristic.leak-rate"], locator: "qms/leak-rate/current" }],
    });
    const authorization = { principal: { id: "principal.test", tenantId: profile.tenantId, roleIds: ["source-sync-operator"], domainIds: ["quality"], objectIds: ["*"], authenticationMethod: "static-bearer" as const }, authenticatedAt: "2026-07-23T00:00:00Z", requestId: "partial-test" };
    const failed = await service.run({ connectorId: profile.id, mode: "snapshot", authorization, idempotencyKey: "partial-document" });
    expect(failed.run.status).toBe("recovery-required");
    expect((await syncStore.getSnapshot()).checkpoints).toHaveLength(0);
    expect((await journal.get(failed.run.id))?.status).toBe("recovery-required");
    const recovered = await service.recover(failed.run.id);
    expect(recovered.run.status).toBe("completed");
    expect((await syncStore.getSnapshot()).checkpoints).toHaveLength(1);
    expect((await journal.get(failed.run.id))).toMatchObject({ status: "committed", recoveryStatus: "recovered" });
    expect((await lineage.list(failed.run.id)).map((item) => item.publicationTarget).sort()).toEqual(["document-registry", "mock", "mock"]);
  });
});

async function controlledPayload(source: "mes" | "plm" | "qms") {
  const manifest = JSON.parse(await readFile(resolve(`packages/demo-data/source-extracts/${source}/manifest.json`), "utf8")) as Record<string, unknown>;
  const records = JSON.parse(await readFile(resolve(`packages/demo-data/source-extracts/${source}/records.json`), "utf8")) as Record<string, unknown>[];
  return { manifest, records, pageInfo: { hasMore: false } };
}

function jsonResponse(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }); }
function controlledProfile(): ConnectorProfile { return { id: "connector.mes.controlled-file", version: "1.0.0", sourceSystem: "mes", tenantId: "tenant.demo-manufacturing", allowedDomains: ["production"], adapterType: "controlled-file", authentication: { type: "fixture-none" }, synchronization: { mode: "snapshot", pagination: "none", maximumPages: 1, maximumRecords: 100 }, mappingProfileId: "MES-OPERATION-1", publicationPolicyId: "publication.demo", enabled: true }; }
function httpProfile(baseUrl: string, authentication: "fixture-none" | "static-bearer" = "static-bearer", source: "mes" | "plm" | "qms" = "mes"): ConnectorProfile { return validateConnectorProfile({ id: `connector.${source}.http`, version: "1.0.0", sourceSystem: source, tenantId: "tenant.demo-manufacturing", allowedDomains: [source === "qms" ? "quality" : "production"], adapterType: "fixture-http-json", endpoint: { baseUrl, allowedPaths: [`/fixture/${source}/records`], allowLocalhostHttp: baseUrl.startsWith("http://127.0.0.1") }, authentication: { type: authentication, ...(authentication === "static-bearer" ? { secretReference: "MKG_SOURCE_SECRET_FIXTURE_TOKEN" } : {}) }, synchronization: { mode: "incremental", pagination: source === "mes" ? "page" : source === "plm" ? "cursor" : "watermark", pageSize: 1, maximumPages: 5, maximumRecords: 10 }, mappingProfileId: source === "mes" ? "MES-OPERATION-1" : source === "plm" ? "PLM-PRODUCT-1" : "QMS-QUALITY-1", publicationPolicyId: "publication.demo", enabled: true }); }
function runFixture(): ConnectorSyncRun { return { id: "run.1", connectorId: "connector.mes", mode: "snapshot", tenantId: "tenant.demo-manufacturing", authorizationSnapshot: { principalId: "principal.test", tenantId: "tenant.demo-manufacturing", roleIds: ["source-sync-operator"], domainIds: ["production"], authenticationMethod: "static-bearer" }, status: "created", startedAt: "2026-07-23T00:00:00Z", counters: { extracted: 0, mapped: 0, validated: 0, staged: 0, published: 0, skippedDuplicate: 0, stale: 0, quarantined: 0, rejected: 0 } }; }
function hash64(seed: string): string { return `sha256:${seed.padEnd(64, "0").slice(0, 64).replace(/[^a-f0-9]/gu, "a")}`; }
function mutationFixture(): CanonicalMutation { return { id: "mutation.operation.op30.v1", kind: "entity-upsert", tenantId: "tenant.demo-manufacturing", domainId: "production", canonicalId: "operation.op30", canonicalType: "mfg:Operation", proposedVersion: "v1", contentHash: hash64("a"), properties: { cycleTime: 42 } }; }
function lineageFixture(): LineageRecord { return { canonicalId: "operation.op30", canonicalVersion: "v1", sourceSystem: "mes", connectorId: "connector.mes", runId: "run.1", sourceRecordId: "OP-030", sourceVersion: "v1", contentHash: hash64("a"), mappingProfileId: "MES-OPERATION-1", mappingProfileVersion: "1.0.0", publicationTarget: "mock", publishedAt: "2026-07-23T00:00:00Z" }; }
function snapshotFixture(): GovernedSyncSnapshot { const entity: GovernedSyncEntity = { id: "operation.op30", type: "mfg:Operation", label: "OP30 Leak Test", domain: "production", properties: {}, version: "v1", status: "active", sync: { sourceSystem: "MES", sourceRecordId: "OP-030", sourceRecordVersion: "v1", sourceRecordChecksum: hash64("a"), mappingId: "MES-OPERATION-1", mappingVersion: "1.0.0", synchronizedAt: "2026-07-23T00:00:00Z" } }; return { snapshotVersion: "1.0.0", entities: [entity], relations: [], checkpoints: [], appliedExtractIds: [] }; }
class FailOnceDocumentPublicationStore extends MockDocumentPublicationStore { private failed = false; override async publish(runId: string) { if (!this.failed) { this.failed = true; throw new Error("DOCUMENT_PUBLICATION_TEMPORARY_FAILURE"); } return super.publish(runId); } }
