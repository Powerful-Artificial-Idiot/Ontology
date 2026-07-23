import type { LineageRecord } from "../../knowledge-contracts/src/index";
import { AtomicJsonFile, clone } from "./persistence";

export interface LineageStore {
  append(records: LineageRecord[]): Promise<void>;
  list(runId?: string): Promise<LineageRecord[]>;
}

export class InMemoryLineageStore implements LineageStore {
  protected records = new Map<string, LineageRecord>();
  async append(records: LineageRecord[]): Promise<void> {
    records.forEach((record) => this.records.set(lineageKey(record), clone(record)));
  }
  async list(runId?: string): Promise<LineageRecord[]> { return [...this.records.values()].filter((item) => !runId || item.runId === runId).map(clone); }
}

type LineageFile = { schemaVersion: "1.0.0"; records: LineageRecord[] };
export class FileLineageStore extends InMemoryLineageStore {
  private readonly file: AtomicJsonFile<LineageFile>;
  constructor(path: string) { super(); this.file = new AtomicJsonFile(path, validateFile, () => ({ schemaVersion: "1.0.0", records: [] })); }
  async initialize(): Promise<void> { const value = await this.file.initialize(); this.records = new Map(value.records.map((item) => [lineageKey(item), clone(item)])); }
  override async append(records: LineageRecord[]): Promise<void> { await super.append(records); await this.file.write({ schemaVersion: "1.0.0", records: [...this.records.values()] }); }
}

function lineageKey(record: LineageRecord): string { return `${record.publicationTarget}|${record.canonicalId}|${record.canonicalVersion}|${record.sourceRecordId}|${record.contentHash}`; }
function validateFile(value: unknown): LineageFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Lineage store is corrupt.");
  const item = value as Partial<LineageFile>;
  if (item.schemaVersion !== "1.0.0" || !Array.isArray(item.records)) throw new Error("Lineage store schema is invalid.");
  return clone(item as LineageFile);
}
