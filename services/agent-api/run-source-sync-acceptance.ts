import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AgentAuditEvent, AgentAuthorizationContext, GovernedSourceSystem, SourceSyncReport } from "../../packages/knowledge-contracts/src/index";
import {
  ControlledFileSourceConnector,
  FileGovernedSyncStore,
  GovernedSourceSynchronizationPipeline,
  InMemoryGovernedSyncStore,
  loadGovernedSyncMapping,
  type SourceSyncAuditSink,
} from "../../packages/source-sync/src/index";
import { runtimeDataPath } from "../runtimePaths";

type AcceptanceCheck = { id: string; status: "passed" | "failed"; detail: string };

const snapshotPath = runtimeDataPath(process.env, "source-sync/phase5d-acceptance-snapshot.v2.json", process.env.MKG_SOURCE_SYNC_STORE_PATH);
const reportPath = runtimeDataPath(process.env, "evaluations/phase5d-source-sync-acceptance.json", process.env.MKG_SOURCE_SYNC_ACCEPTANCE_PATH);
const fixtures = [
  { sourceSystem: "MES" as const, domainId: "production", manifest: "packages/demo-data/source-extracts/mes/manifest.json", mapping: "mappings/mes/operation-mapping.json" },
  { sourceSystem: "QMS" as const, domainId: "quality", manifest: "packages/demo-data/source-extracts/qms/manifest.json", mapping: "mappings/qms/quality-mapping.json" },
  { sourceSystem: "PLM" as const, domainId: "production", manifest: "packages/demo-data/source-extracts/plm/manifest.json", mapping: "mappings/plm/product-mapping.json" },
];

async function main(): Promise<void> {
  const store = new FileGovernedSyncStore(snapshotPath);
  await store.initialize();
  const audit = new MemoryAuditSink();
  const applied: SourceSyncReport[] = [];
  const replayed: SourceSyncReport[] = [];

  for (const fixture of fixtures) {
    const pipeline = new GovernedSourceSynchronizationPipeline({
      connector: new ControlledFileSourceConnector(resolve(fixture.manifest), fixture.sourceSystem),
      mapping: await loadGovernedSyncMapping(resolve(fixture.mapping)),
      store,
      audit,
      now: () => new Date("2026-07-22T10:00:00.000Z"),
    });
    applied.push(await pipeline.synchronize(syncRequest(fixture.sourceSystem, fixture.domainId, "apply", ["source-sync-operator"])));
    replayed.push(await pipeline.synchronize(syncRequest(fixture.sourceSystem, fixture.domainId, "apply", ["source-sync-operator"])));
  }

  const restored = new FileGovernedSyncStore(snapshotPath);
  await restored.initialize();
  const snapshot = await restored.getSnapshot();
  const denied = await deniedApplyCheck();
  const serializedSnapshot = JSON.stringify(snapshot);
  const serializedAudit = JSON.stringify(audit.events);
  const checks: AcceptanceCheck[] = [
    check("controlled-source-coverage", applied.every(success) && applied.map((item) => item.sourceSystem).join(",") === "MES,QMS,PLM", "MES, QMS, and PLM controlled extracts completed without quarantine or rejection."),
    check("canonical-id-resolution", exact(snapshot.entities.map((item) => item.id), ["operation.op30", "product.brake-booster", "quality-characteristic.leak-rate"]), "All source records resolve only to existing canonical IDs."),
    check("ontology-relation-direction", snapshot.relations.some((item) => item.sourceId === "operation.op30" && item.targetId === "machine.m220" && item.predicate === "mfg:executedBy") && snapshot.relations.some((item) => item.sourceId === "operation.op30" && item.targetId === "quality-characteristic.leak-rate" && item.predicate === "qual:controlsCharacteristic"), "Synchronized MES and QMS relations preserve governed ontology direction."),
    check("checkpoint-persistence", snapshot.checkpoints.length === 3 && exact(snapshot.checkpoints.map((item) => item.sourceSystem), ["MES", "PLM", "QMS"]), "Per-source cursors and extract IDs survive atomic store reload."),
    check("extract-idempotency", replayed.every((item) => success(item) && item.counts.updated === 0 && item.counts.inserted === 0), "Replaying an applied extract produces no mutation."),
    check("authorization-fail-closed", denied.status === "blocked" && denied.decisions.some((item) => item.code === "authorization-denied"), "A read-only synchronization principal cannot apply an extract."),
    check("derived-state-only", !serializedSnapshot.includes('"payload"') && !serializedSnapshot.includes('"recordsFile"'), "Persistent synchronization state contains mapped facts and provenance, not raw source payloads or extract bodies."),
    check("sanitized-audit", audit.events.length === 6 && !serializedAudit.includes("recordChecksum") && !serializedAudit.includes("payload") && !serializedAudit.includes("Authorization"), "Audit events contain decision summaries without credentials, checksums, or source payloads."),
  ];
  const status = checks.every((item) => item.status === "passed") ? "passed" : "failed";
  const report = {
    phase: "5D",
    reportVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    status,
    connectorMode: "controlled-file-extract",
    liveEnterpriseConnectivity: "pending",
    sources: applied.map((item) => ({ sourceSystem: item.sourceSystem, status: item.status, counts: item.counts })),
    synchronized: { entities: snapshot.entities.length, relations: snapshot.relations.length, checkpoints: snapshot.checkpoints.length },
    controls: checks,
    limitations: [
      "MES, QMS, and PLM fixtures are governed local extracts; no enterprise endpoint or credential is configured.",
      "Source-system writeback, CDC brokers, enterprise schedulers, and owner approval workflows remain pending.",
    ],
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info(`Phase 5D source synchronization acceptance: ${status} (${checks.filter((item) => item.status === "passed").length}/${checks.length})`);
  console.info(`Sources: ${applied.map((item) => `${item.sourceSystem}:${item.counts.accepted}/${item.counts.received}`).join(", ")}`);
  console.info(`Snapshot: ${snapshot.entities.length} entities / ${snapshot.relations.length} relations / ${snapshot.checkpoints.length} checkpoints`);
  console.info(`Report: ${reportPath}`);
  if (status !== "passed") process.exitCode = 1;
}

async function deniedApplyCheck(): Promise<SourceSyncReport> {
  const fixture = fixtures[0]!;
  const pipeline = new GovernedSourceSynchronizationPipeline({
    connector: new ControlledFileSourceConnector(resolve(fixture.manifest), fixture.sourceSystem),
    mapping: await loadGovernedSyncMapping(resolve(fixture.mapping)),
    store: new InMemoryGovernedSyncStore(),
    now: () => new Date("2026-07-22T10:00:00.000Z"),
  });
  return pipeline.synchronize(syncRequest(fixture.sourceSystem, fixture.domainId, "apply", ["source-sync-reader"]));
}

function syncRequest(sourceSystem: GovernedSourceSystem, domainId: string, mode: "dry-run" | "apply", roleIds: string[]) {
  return {
    requestId: `acceptance.source-sync.${sourceSystem.toLowerCase()}.${mode}`,
    mode,
    expectedSourceSystem: sourceSystem,
    expectedMappingVersion: "1.0.0",
    authorization: context(roleIds, [domainId]),
    requestedAt: "2026-07-22T10:00:00.000Z",
  } as const;
}

function context(roleIds: string[], domainIds: string[]): AgentAuthorizationContext {
  return {
    principal: { id: "principal.phase5d-acceptance", tenantId: "tenant.demo-manufacturing", roleIds, domainIds, authenticationMethod: "static-bearer" },
    authenticatedAt: "2026-07-22T10:00:00.000Z",
    requestId: "acceptance.source-sync",
  };
}

function success(report: SourceSyncReport): boolean {
  return report.status === "completed" && report.counts.quarantined === 0 && report.counts.rejected === 0;
}

function exact(actual: string[], expected: string[]): boolean {
  return [...actual].sort().join("|") === [...expected].sort().join("|");
}

function check(id: string, passed: boolean, detail: string): AcceptanceCheck {
  return { id, status: passed ? "passed" : "failed", detail };
}

class MemoryAuditSink implements SourceSyncAuditSink {
  readonly events: AgentAuditEvent[] = [];
  async append(event: AgentAuditEvent): Promise<void> { this.events.push(event); }
}

await main();
