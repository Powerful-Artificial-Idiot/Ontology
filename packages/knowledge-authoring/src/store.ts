import type {
  AuthoringAuditEvent,
  AuthoringProvenanceRecord,
  KnowledgeChangeSet,
  KnowledgeChangeSetQuery,
} from "../../knowledge-contracts/src/index";
import { AtomicJsonFile, clone } from "../../source-sync/src/index";

export type AuthoringIdempotencyRecord = {
  key: string;
  operation: string;
  changeSetId: string;
  result: KnowledgeChangeSet;
  recordedAt: string;
};

export type AuthoringPublicationJournal = {
  changeSetId: string;
  state: "started" | "published" | "verified" | "failed" | "recovery-required";
  updatedAt: string;
  message?: string;
};

export type KnowledgeAuthoringState = {
  schemaVersion: "1.0.0";
  changeSets: KnowledgeChangeSet[];
  auditEvents: AuthoringAuditEvent[];
  provenanceRecords: AuthoringProvenanceRecord[];
  idempotencyRecords: AuthoringIdempotencyRecord[];
  publicationJournals: AuthoringPublicationJournal[];
};

export interface KnowledgeAuthoringStore {
  initialize(): Promise<void>;
  read(): Promise<KnowledgeAuthoringState>;
  transact<T>(operation: (state: KnowledgeAuthoringState) => { state: KnowledgeAuthoringState; result: T } | Promise<{ state: KnowledgeAuthoringState; result: T }>): Promise<T>;
  getChangeSet(id: string): Promise<KnowledgeChangeSet | null>;
  listChangeSets(query: KnowledgeChangeSetQuery): Promise<KnowledgeChangeSet[]>;
}

export class InMemoryKnowledgeAuthoringStore implements KnowledgeAuthoringStore {
  protected state: KnowledgeAuthoringState = emptyState();
  private queue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {}

  async read(): Promise<KnowledgeAuthoringState> {
    await this.queue;
    return clone(this.state);
  }

  async transact<T>(operation: (state: KnowledgeAuthoringState) => { state: KnowledgeAuthoringState; result: T } | Promise<{ state: KnowledgeAuthoringState; result: T }>): Promise<T> {
    let output!: T;
    let failure: unknown;
    this.queue = this.queue.then(async () => {
      try {
        const transaction = await operation(clone(this.state));
        await this.persist(transaction.state);
        this.state = clone(transaction.state);
        output = clone(transaction.result);
      } catch (error) {
        failure = error;
      }
    });
    await this.queue;
    if (failure) throw failure;
    return output;
  }

  async getChangeSet(id: string): Promise<KnowledgeChangeSet | null> {
    const state = await this.read();
    return state.changeSets.find((changeSet) => changeSet.id === id) ?? null;
  }

  async listChangeSets(query: KnowledgeChangeSetQuery): Promise<KnowledgeChangeSet[]> {
    const state = await this.read();
    return state.changeSets.filter((changeSet) =>
      changeSet.tenantId === query.tenantId
      && (!query.domain || changeSet.domain === query.domain)
      && (!query.status || changeSet.status === query.status)
      && (!query.createdBy || changeSet.createdBy === query.createdBy));
  }

  protected async persist(_state: KnowledgeAuthoringState): Promise<void> {}
}

export class FileKnowledgeAuthoringStore extends InMemoryKnowledgeAuthoringStore {
  private readonly file: AtomicJsonFile<KnowledgeAuthoringState>;

  constructor(path: string) {
    super();
    this.file = new AtomicJsonFile(path, validateState, emptyState);
  }

  override async initialize(): Promise<void> {
    this.state = await this.file.initialize();
  }

  protected override async persist(state: KnowledgeAuthoringState): Promise<void> {
    await this.file.write(validateState(state));
  }
}

export function emptyState(): KnowledgeAuthoringState {
  return {
    schemaVersion: "1.0.0",
    changeSets: [],
    auditEvents: [],
    provenanceRecords: [],
    idempotencyRecords: [],
    publicationJournals: [],
  };
}

function validateState(value: unknown): KnowledgeAuthoringState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Knowledge authoring state must be an object.");
  const state = value as Partial<KnowledgeAuthoringState>;
  if (state.schemaVersion !== "1.0.0"
    || !Array.isArray(state.changeSets)
    || !Array.isArray(state.auditEvents)
    || !Array.isArray(state.provenanceRecords)
    || !Array.isArray(state.idempotencyRecords)
    || !Array.isArray(state.publicationJournals)) {
    throw new Error("Knowledge authoring state is corrupt or uses an unsupported schema version.");
  }
  return clone(state as KnowledgeAuthoringState);
}
