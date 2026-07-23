import type { PublicationJournalEntry, PublicationJournalStatus } from "../../knowledge-contracts/src/index";
import { AtomicJsonFile, clone } from "./persistence";

const transitions: Record<PublicationJournalStatus, PublicationJournalStatus[]> = {
  validated: ["staged", "recovery-required"],
  staged: ["graph-published", "documents-published", "recovery-required"],
  "graph-published": ["documents-published", "verified", "recovery-required"],
  "documents-published": ["graph-published", "verified", "recovery-required"],
  verified: ["committed", "recovery-required"],
  committed: [],
  "recovery-required": ["verified"],
};

export interface PublicationJournalStore {
  create(entry: PublicationJournalEntry): Promise<void>;
  transition(runId: string, status: PublicationJournalStatus, update?: Partial<Pick<PublicationJournalEntry, "failureCode" | "recoveryStatus" | "verificationHashes">>, now?: Date): Promise<PublicationJournalEntry>;
  recordRecoveryStage(runId: string, stage: "graph-published" | "documents-published", now?: Date): Promise<PublicationJournalEntry>;
  get(runId: string): Promise<PublicationJournalEntry | undefined>;
  list(): Promise<PublicationJournalEntry[]>;
}

export class InMemoryPublicationJournalStore implements PublicationJournalStore {
  protected entries = new Map<string, PublicationJournalEntry>();
  async create(entry: PublicationJournalEntry): Promise<void> {
    if (this.entries.has(entry.runId)) throw new Error(`Publication journal already exists: ${entry.runId}`);
    this.entries.set(entry.runId, clone(entry));
  }
  async transition(runId: string, status: PublicationJournalStatus, update: Partial<Pick<PublicationJournalEntry, "failureCode" | "recoveryStatus" | "verificationHashes">> = {}, now = new Date()): Promise<PublicationJournalEntry> {
    const current = this.entries.get(runId);
    if (!current) throw new Error(`Publication journal not found: ${runId}`);
    if (!transitions[current.status].includes(status)) throw new Error(`Illegal publication journal transition: ${current.status} -> ${status}`);
    const entry = { ...current, ...clone(update), status, completedStages: [...current.completedStages, status], updatedAt: now.toISOString() };
    this.entries.set(runId, entry);
    return clone(entry);
  }
  async get(runId: string): Promise<PublicationJournalEntry | undefined> { const item = this.entries.get(runId); return item ? clone(item) : undefined; }
  async recordRecoveryStage(runId: string, stage: "graph-published" | "documents-published", now = new Date()): Promise<PublicationJournalEntry> { const current = this.entries.get(runId); if (!current || current.status !== "recovery-required") throw new Error(`Publication journal is not recoverable: ${runId}`); const entry = { ...current, completedStages: current.completedStages.includes(stage) ? current.completedStages : [...current.completedStages, stage], updatedAt: now.toISOString() }; this.entries.set(runId, entry); return clone(entry); }
  async list(): Promise<PublicationJournalEntry[]> { return [...this.entries.values()].map(clone); }
}

type JournalFile = { schemaVersion: "1.0.0"; entries: PublicationJournalEntry[] };
export class FilePublicationJournalStore extends InMemoryPublicationJournalStore {
  private readonly file: AtomicJsonFile<JournalFile>;
  constructor(path: string) { super(); this.file = new AtomicJsonFile(path, validateFile, () => ({ schemaVersion: "1.0.0", entries: [] })); }
  async initialize(): Promise<void> { const value = await this.file.initialize(); this.entries = new Map(value.entries.map((item) => [item.runId, clone(item)])); }
  override async create(entry: PublicationJournalEntry): Promise<void> { await super.create(entry); await this.persist(); }
  override async transition(runId: string, status: PublicationJournalStatus, update?: Partial<Pick<PublicationJournalEntry, "failureCode" | "recoveryStatus" | "verificationHashes">>, now?: Date): Promise<PublicationJournalEntry> { const entry = await super.transition(runId, status, update, now); await this.persist(); return entry; }
  override async recordRecoveryStage(runId: string, stage: "graph-published" | "documents-published", now?: Date): Promise<PublicationJournalEntry> { const entry = await super.recordRecoveryStage(runId, stage, now); await this.persist(); return entry; }
  private persist(): Promise<void> { return this.file.write({ schemaVersion: "1.0.0", entries: [...this.entries.values()] }); }
}

function validateFile(value: unknown): JournalFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Publication journal is corrupt.");
  const item = value as Partial<JournalFile>;
  if (item.schemaVersion !== "1.0.0" || !Array.isArray(item.entries)) throw new Error("Publication journal schema is invalid.");
  return clone(item as JournalFile);
}
