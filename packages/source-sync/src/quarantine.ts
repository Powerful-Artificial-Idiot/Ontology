import type { QuarantineItem } from "../../knowledge-contracts/src/index";
import { sha256 } from "./checksum";
import { AtomicJsonFile, clone } from "./persistence";

export interface QuarantineStore {
  put(item: QuarantineItem): Promise<void>;
  get(id: string): Promise<QuarantineItem | undefined>;
  list(status?: QuarantineItem["status"]): Promise<QuarantineItem[]>;
  resolve(id: string, now?: Date): Promise<QuarantineItem>;
  reject(id: string, now?: Date): Promise<QuarantineItem>;
}

export function stableQuarantineId(input: Pick<QuarantineItem, "connectorId" | "sourceRecordId" | "sourceVersion" | "contentHash" | "reasonCode">): string {
  return `quarantine.${sha256([input.connectorId, input.sourceRecordId, input.sourceVersion, input.contentHash, input.reasonCode].join("|")).slice(7, 31)}`;
}

export class InMemoryQuarantineStore implements QuarantineStore {
  protected items = new Map<string, QuarantineItem>();
  async put(item: QuarantineItem): Promise<void> { this.items.set(item.id, clone(item)); }
  async get(id: string): Promise<QuarantineItem | undefined> { const item = this.items.get(id); return item ? clone(item) : undefined; }
  async list(status?: QuarantineItem["status"]): Promise<QuarantineItem[]> { return [...this.items.values()].filter((item) => !status || item.status === status).map(clone); }
  async resolve(id: string, now = new Date()): Promise<QuarantineItem> { return this.setStatus(id, "resolved", now); }
  async reject(id: string, now = new Date()): Promise<QuarantineItem> { return this.setStatus(id, "rejected", now); }
  protected async setStatus(id: string, status: "resolved" | "rejected", now: Date): Promise<QuarantineItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Quarantine item not found: ${id}`);
    const updated = { ...item, status, resolvedAt: now.toISOString() };
    this.items.set(id, updated);
    return clone(updated);
  }
}

type QuarantineFile = { schemaVersion: "1.0.0"; items: QuarantineItem[] };
export class FileQuarantineStore extends InMemoryQuarantineStore {
  private readonly file: AtomicJsonFile<QuarantineFile>;
  constructor(path = ".data/source-sync-quarantine.json") { super(); this.file = new AtomicJsonFile(path, validateFile, () => ({ schemaVersion: "1.0.0", items: [] })); }
  async initialize(): Promise<void> { const value = await this.file.initialize(); this.items = new Map(value.items.map((item) => [item.id, clone(item)])); }
  override async put(item: QuarantineItem): Promise<void> { await super.put(item); await this.persist(); }
  override async resolve(id: string, now?: Date): Promise<QuarantineItem> { const item = await super.resolve(id, now); await this.persist(); return item; }
  override async reject(id: string, now?: Date): Promise<QuarantineItem> { const item = await super.reject(id, now); await this.persist(); return item; }
  private persist(): Promise<void> { return this.file.write({ schemaVersion: "1.0.0", items: [...this.items.values()].sort((a, b) => a.id.localeCompare(b.id)) }); }
}

function validateFile(value: unknown): QuarantineFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Quarantine store is corrupt.");
  const item = value as Partial<QuarantineFile>;
  if (item.schemaVersion !== "1.0.0" || !Array.isArray(item.items)) throw new Error("Quarantine store schema is invalid.");
  return clone(item as QuarantineFile);
}
