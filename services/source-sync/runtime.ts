import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentAuditEvent, AgentAuthorizationContext, ConnectorProfile, ConnectorRunMode, ConnectorSyncRun, GovernedDocumentChange, ReconciliationResult, SourceRecordBatch, SourceSyncHealth } from "../../packages/knowledge-contracts/src/index";
import {
  ControlledFileSourceConnector,
  DeterministicConnectorReconciliationService,
  EnvironmentSourceSecretResolver,
  FileConnectorRunStore,
  FileDocumentPublicationStore,
  FileGovernedSyncStore,
  FileLineageStore,
  FilePublicationJournalStore,
  FileQuarantineStore,
  FixtureHttpJsonSourceConnector,
  GovernedConnectorRunService,
  MockCanonicalPublicationStore,
  loadGovernedSyncMapping,
  validateConnectorProfiles,
  type ConnectorRunResult,
  type SourceSyncTelemetryEvent,
} from "../../packages/source-sync/src/index";
import { runtimeDataDirectory } from "../runtimePaths";

const root = resolve(process.cwd());
const profilePath = resolve(root, "packages/demo-data/source-sync/connector-profiles.v1.json");
const paths = {
  mes: { manifest: "packages/demo-data/source-extracts/mes/manifest.json", mapping: "mappings/mes/operation-mapping.json", http: "/fixture/mes/records" },
  plm: { manifest: "packages/demo-data/source-extracts/plm/manifest.json", mapping: "mappings/plm/product-mapping.json", http: "/fixture/plm/records" },
  qms: { manifest: "packages/demo-data/source-extracts/qms/manifest.json", mapping: "mappings/qms/quality-mapping.json", http: "/fixture/qms/records" },
} as const;

export type SourceSyncRuntime = Awaited<ReturnType<typeof createSourceSyncRuntime>>;

export async function createSourceSyncRuntime(options: { dataDirectory?: string; profiles?: ConnectorProfile[]; environment?: NodeJS.ProcessEnv } = {}) {
  const environment = options.environment ?? process.env;
  const dataDirectory = resolve(options.dataDirectory ?? resolve(runtimeDataDirectory(environment), "source-sync"));
  const profiles = options.profiles ?? validateConnectorProfiles(JSON.parse(await readFile(profilePath, "utf8")) as unknown);
  const syncStore = new FileGovernedSyncStore(resolve(dataDirectory, "snapshot.json"));
  const runs = new FileConnectorRunStore(resolve(dataDirectory, "runs.json"));
  const quarantine = new FileQuarantineStore(resolve(dataDirectory, "quarantine.json"));
  const lineage = new FileLineageStore(resolve(dataDirectory, "lineage.json"));
  const journal = new FilePublicationJournalStore(resolve(dataDirectory, "publication-journal.json"));
  const documentPublication = new FileDocumentPublicationStore(resolve(dataDirectory, "document-registry.json"));
  await Promise.all([syncStore.initialize(), runs.initialize(), quarantine.initialize(), lineage.initialize(), journal.initialize(), documentPublication.initialize()]);
  await runs.recoverInterrupted();
  const graphPublication = new MockCanonicalPublicationStore({ maximumWriteCount: 1_000, allowedTypes: ["mfg:Operation", "prod:Product", "qual:QualityCharacteristic"], allowedPredicates: ["mfg:executedBy", "qual:controlsCharacteristic"] });
  const reconciliationService = new DeterministicConnectorReconciliationService(graphPublication, lineage);
  const audit = new MemorySourceSyncAuditSink();
  const telemetry = new MemorySourceSyncTelemetrySink();
  const reconciliation = new Map<string, ReconciliationResult>();
  const service = new GovernedConnectorRunService({
    profiles,
    principal: { id: "service.source-sync.demo", type: "service", tenantId: "tenant.demo-manufacturing", roles: ["source-sync-operator"], allowedDomains: ["production", "quality"], allowedSourceSystems: ["mes", "plm", "qms"] },
    connectorFactory: (profile) => profile.adapterType === "controlled-file"
      ? new ControlledFileSourceConnector(resolve(paths[profile.sourceSystem].manifest), profile.sourceSystem.toUpperCase() as "MES" | "PLM" | "QMS")
      : new FixtureHttpJsonSourceConnector({ profile, path: paths[profile.sourceSystem].http, secrets: new EnvironmentSourceSecretResolver(environment) }),
    mappingFactory: (profile) => loadGovernedSyncMapping(resolve(paths[profile.sourceSystem].mapping)),
    syncStore,
    runs,
    quarantine,
    graphPublication,
    documentPublication,
    journal,
    lineage,
    reconciliation: reconciliationService,
    documentChanges: qmsDocumentChanges,
    audit,
    telemetry,
  });

  const execute = async (request: { connectorId: string; mode: ConnectorRunMode; authorization: AgentAuthorizationContext; idempotencyKey: string }, signal?: AbortSignal): Promise<ConnectorRunResult> => {
    const result = await service.run(request, signal);
    if (result.reconciliation) reconciliation.set(result.run.id, result.reconciliation);
    return result;
  };

  const health = async (): Promise<SourceSyncHealth> => {
    const runList = await runs.list();
    const quarantineList = await quarantine.list();
    const reconciliationItems = [...reconciliation.values()].flatMap((item) => item.items);
    return {
      status: runList.some((item) => item.status === "recovery-required") ? "degraded" : "available",
      configuredConnectors: profiles.length,
      enabledConnectors: profiles.filter((item) => item.enabled).length,
      lastSuccessfulRunAt: runList.filter((item) => item.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0]?.completedAt,
      recoveryRequiredRuns: runList.filter((item) => item.status === "recovery-required").length,
      openQuarantineItems: quarantineList.filter((item) => item.status === "open").length,
      criticalReconciliationItems: reconciliationItems.filter((item) => item.blocking).length,
    };
  };

  return { profiles, service, execute, health, syncStore, runs, quarantine, lineage, journal, graphPublication, documentPublication, reconciliation, audit, telemetry };
}

function qmsDocumentChanges(batch: SourceRecordBatch, profile: ConnectorProfile): GovernedDocumentChange[] {
  if (profile.sourceSystem !== "qms") return [];
  return batch.records.filter((record) => record.operation === "upsert").map((record) => ({
    id: `document-change.${record.id}`,
    tenantId: record.tenantId,
    domainId: record.domainId,
    documentId: `document.qms-record.${record.sourceId.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
    logicalDocumentId: `qms-record.${record.sourceId}`,
    version: record.version,
    approvalStatus: "approved",
    lifecycleStatus: "effective",
    contentHash: record.recordChecksum,
    sourceSystem: "qms",
    sourceRecordId: record.sourceId,
    linkedEntityIds: ["quality-characteristic.leak-rate", "operation.op30"],
    locator: `qms-record/${record.sourceId}/${record.version}`,
  }));
}

export function publicConnectorProfile(profile: ConnectorProfile): Omit<ConnectorProfile, "authentication"> & { authentication: { type: ConnectorProfile["authentication"]["type"] } } {
  return { ...structuredClone(profile), authentication: { type: profile.authentication.type } };
}

export function publicConnectorRun(run: ConnectorSyncRun): Omit<ConnectorSyncRun, "authorizationSnapshot"> {
  const publicRun = structuredClone(run) as Partial<ConnectorSyncRun>;
  delete publicRun.authorizationSnapshot;
  return publicRun as Omit<ConnectorSyncRun, "authorizationSnapshot">;
}

export class MemorySourceSyncAuditSink {
  readonly events: AgentAuditEvent[] = [];
  async append(event: AgentAuditEvent): Promise<void> { this.events.push(structuredClone(event)); }
}

export class MemorySourceSyncTelemetrySink {
  readonly events: SourceSyncTelemetryEvent[] = [];
  async record(event: SourceSyncTelemetryEvent): Promise<void> { this.events.push(structuredClone(event)); }
}
