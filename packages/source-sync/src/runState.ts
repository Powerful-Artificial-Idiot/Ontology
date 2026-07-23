import type { ConnectorRunStatus, ConnectorSyncRun } from "../../knowledge-contracts/src/index";
import { AtomicJsonFile, clone } from "./persistence";

const terminal: ConnectorRunStatus[] = ["completed", "failed", "cancelled"];
const allowed: Record<ConnectorRunStatus, ConnectorRunStatus[]> = {
  created: ["extracting", "cancelled", "failed"],
  extracting: ["mapping", "cancelled", "failed"],
  mapping: ["validating", "cancelled", "failed"],
  validating: ["staging", "reconciling", "completed", "cancelled", "failed"],
  staging: ["publishing", "cancelled", "failed", "recovery-required"],
  publishing: ["verifying", "failed", "recovery-required"],
  verifying: ["reconciling", "failed", "recovery-required"],
  reconciling: ["completed", "failed", "recovery-required"],
  completed: [], failed: [], cancelled: [], "recovery-required": ["verifying", "failed"],
};

export function transitionConnectorRun(run: ConnectorSyncRun, status: ConnectorRunStatus, now = new Date()): ConnectorSyncRun {
  if (!allowed[run.status].includes(status)) throw new Error(`Illegal connector run transition: ${run.status} -> ${status}`);
  return { ...clone(run), status, completedAt: terminal.includes(status) ? now.toISOString() : undefined };
}

export interface ConnectorRunStore {
  create(run: ConnectorSyncRun): Promise<void>;
  update(run: ConnectorSyncRun): Promise<void>;
  get(id: string): Promise<ConnectorSyncRun | undefined>;
  list(connectorId?: string): Promise<ConnectorSyncRun[]>;
  recoverInterrupted(now?: Date): Promise<ConnectorSyncRun[]>;
}

export class InMemoryConnectorRunStore implements ConnectorRunStore {
  protected runs = new Map<string, ConnectorSyncRun>();
  async create(run: ConnectorSyncRun): Promise<void> {
    if (this.runs.has(run.id)) throw new Error(`Connector run already exists: ${run.id}`);
    this.runs.set(run.id, clone(run));
  }
  async update(run: ConnectorSyncRun): Promise<void> {
    if (!this.runs.has(run.id)) throw new Error(`Connector run does not exist: ${run.id}`);
    this.runs.set(run.id, clone(run));
  }
  async get(id: string): Promise<ConnectorSyncRun | undefined> { const item = this.runs.get(id); return item ? clone(item) : undefined; }
  async list(connectorId?: string): Promise<ConnectorSyncRun[]> { return [...this.runs.values()].filter((item) => !connectorId || item.connectorId === connectorId).map(clone); }
  async recoverInterrupted(now = new Date()): Promise<ConnectorSyncRun[]> {
    const recovered: ConnectorSyncRun[] = [];
    for (const run of this.runs.values()) {
      if (terminal.includes(run.status) || run.status === "recovery-required") continue;
      const recoveryRequired = ["staging", "publishing", "verifying", "reconciling"].includes(run.status);
      const updated = { ...run, status: recoveryRequired ? "recovery-required" as const : "failed" as const, failureCode: "INTERRUPTED_RUN", completedAt: now.toISOString() };
      this.runs.set(run.id, updated);
      recovered.push(clone(updated));
    }
    return recovered;
  }
}

type RunFile = { schemaVersion: "1.0.0"; runs: ConnectorSyncRun[] };

export class FileConnectorRunStore extends InMemoryConnectorRunStore {
  private readonly file: AtomicJsonFile<RunFile>;
  constructor(path: string) { super(); this.file = new AtomicJsonFile(path, validateRunFile, () => ({ schemaVersion: "1.0.0", runs: [] })); }
  async initialize(): Promise<void> { const value = await this.file.initialize(); this.runs = new Map(value.runs.map((item) => [item.id, clone(item)])); }
  override async create(run: ConnectorSyncRun): Promise<void> { await super.create(run); await this.persist(); }
  override async update(run: ConnectorSyncRun): Promise<void> { await super.update(run); await this.persist(); }
  override async recoverInterrupted(now?: Date): Promise<ConnectorSyncRun[]> { const result = await super.recoverInterrupted(now); if (result.length) await this.persist(); return result; }
  private persist(): Promise<void> { return this.file.write({ schemaVersion: "1.0.0", runs: [...this.runs.values()].sort((a, b) => a.id.localeCompare(b.id)) }); }
}

function validateRunFile(value: unknown): RunFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Connector run store is corrupt.");
  const item = value as Partial<RunFile>;
  if (item.schemaVersion !== "1.0.0" || !Array.isArray(item.runs)) throw new Error("Connector run store schema is invalid.");
  return clone(item as RunFile);
}
