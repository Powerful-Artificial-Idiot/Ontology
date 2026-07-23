import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GovernedSyncSnapshot } from "../../knowledge-contracts/src/index";
import type { GovernedSyncStore, SyncCommit } from "./types";

export class InMemoryGovernedSyncStore implements GovernedSyncStore {
  protected snapshot: GovernedSyncSnapshot = emptySnapshot();

  async getSnapshot(): Promise<GovernedSyncSnapshot> {
    return clone(this.snapshot);
  }

  async commit(commit: SyncCommit): Promise<void> {
    this.snapshot = applyCommit(this.snapshot, commit);
  }
}

export class FileGovernedSyncStore extends InMemoryGovernedSyncStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {
    super();
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      this.snapshot = parseSnapshot(JSON.parse(await readFile(this.filePath, "utf8")) as unknown);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await this.persist();
    }
  }

  override async commit(commit: SyncCommit): Promise<void> {
    this.snapshot = applyCommit(this.snapshot, commit);
    await this.persist();
  }

  private persist(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.snapshot, null, 2)}\n`, "utf8");
      await rename(temporary, this.filePath);
    });
    return this.queue;
  }
}

function applyCommit(current: GovernedSyncSnapshot, commit: SyncCommit): GovernedSyncSnapshot {
  if (current.appliedExtractIds.includes(commit.extractId)) return clone(current);
  const entities = new Map(current.entities.map((item) => [item.id, item]));
  const relations = new Map(current.relations.map((item) => [item.id, item]));
  commit.entities.forEach((item) => entities.set(item.id, clone(item)));
  commit.removeRelationIds.forEach((id) => relations.delete(id));
  commit.relations.forEach((item) => relations.set(item.id, clone(item)));
  const checkpoints = current.checkpoints.filter((item) => !(item.sourceSystem === commit.checkpoint.sourceSystem && item.tenantId === commit.checkpoint.tenantId));
  checkpoints.push(clone(commit.checkpoint));
  return {
    snapshotVersion: "1.0.0",
    entities: [...entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
    relations: [...relations.values()].sort((left, right) => left.id.localeCompare(right.id)),
    checkpoints: checkpoints.sort((left, right) => left.sourceSystem.localeCompare(right.sourceSystem) || left.tenantId.localeCompare(right.tenantId)),
    appliedExtractIds: [...current.appliedExtractIds, commit.extractId].sort(),
  };
}

function parseSnapshot(value: unknown): GovernedSyncSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Governed sync snapshot must be an object.");
  const snapshot = value as Partial<GovernedSyncSnapshot>;
  if (snapshot.snapshotVersion !== "1.0.0" || !Array.isArray(snapshot.entities) || !Array.isArray(snapshot.relations) || !Array.isArray(snapshot.checkpoints) || !Array.isArray(snapshot.appliedExtractIds)) {
    throw new Error("Governed sync snapshot has an unsupported or invalid format.");
  }
  return clone(snapshot as GovernedSyncSnapshot);
}

function emptySnapshot(): GovernedSyncSnapshot {
  return { snapshotVersion: "1.0.0", entities: [], relations: [], checkpoints: [], appliedExtractIds: [] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
