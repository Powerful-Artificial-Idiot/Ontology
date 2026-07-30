import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentAuditEvent } from "../../knowledge-contracts/src/index";
import type { AgentAuditSink } from "../../agent-core/src/index";
import { SnapshotKnowledgeRepository } from "./index";
import {
  CHECKSUMS_PATH,
  loadPersonalKnowledgeArtifact,
  MANIFEST_PATH,
  SCHEMA_PATH,
  SNAPSHOT_PATH,
  type PersonalKnowledgeArtifactSource,
} from "./artifact";

export type ActivePersonalKnowledgeSnapshotInfo = {
  schemaVersion: string;
  sourceCommit?: string;
  contentHash: string;
  objectCount: number;
  relationCount: number;
  loadedAt: string;
};

type ActivePointer = ActivePersonalKnowledgeSnapshotInfo & { versionDirectory: string };

export type PersonalKnowledgeIngestionOptions = {
  runtimeDirectory: string;
  audit: AgentAuditSink;
  now?: () => Date;
  smokeQuery?: (repository: SnapshotKnowledgeRepository) => void | Promise<void>;
  writeActivePointer?: (path: string, value: ActivePointer) => void;
};

export class PersonalKnowledgeSnapshotIngestionService {
  private active: { info: ActivePersonalKnowledgeSnapshotInfo; repository: SnapshotKnowledgeRepository } | null = null;
  private readonly now: () => Date;

  private constructor(private readonly options: PersonalKnowledgeIngestionOptions) {
    this.now = options.now ?? (() => new Date());
  }

  static async create(options: PersonalKnowledgeIngestionOptions): Promise<PersonalKnowledgeSnapshotIngestionService> {
    const service = new PersonalKnowledgeSnapshotIngestionService(options);
    ["candidates", "versions", "previous"].forEach((name) => mkdirSync(resolve(options.runtimeDirectory, name), { recursive: true }));
    await service.restoreActive();
    return service;
  }

  getActiveSnapshotInfo(): ActivePersonalKnowledgeSnapshotInfo | null {
    return this.active ? { ...this.active.info } : null;
  }

  getActiveRepository(): SnapshotKnowledgeRepository | null {
    return this.active?.repository ?? null;
  }

  listPreviousSnapshots(): ActivePersonalKnowledgeSnapshotInfo[] {
    return readdirSync(resolve(this.options.runtimeDirectory, "previous"))
      .filter((name) => name.endsWith(".json"))
      .sort().reverse()
      .map((name) => JSON.parse(readFileSync(resolve(this.options.runtimeDirectory, "previous", name), "utf8")) as ActivePointer)
      .map(({ versionDirectory: _versionDirectory, ...info }) => info);
  }

  async ingestCandidate(source: PersonalKnowledgeArtifactSource): Promise<ActivePersonalKnowledgeSnapshotInfo> {
    const traceId = `personal-snapshot.${randomUUID()}`;
    await this.audit("snapshot_candidate_received", "completed", traceId);
    try {
      const artifact = loadPersonalKnowledgeArtifact(source);
      await this.audit("snapshot_validation_passed", "completed", traceId, { contentHash: artifact.snapshot.contentHash });
      await (this.options.smokeQuery?.(artifact.repository) ?? this.defaultSmokeQuery(artifact.repository));
      const versionDirectory = resolve(this.options.runtimeDirectory, "versions", artifact.snapshot.contentHash);
      if (!existsSync(versionDirectory)) this.persistVersion(versionDirectory, artifact.rootDirectory);
      const loadedAt = this.now().toISOString();
      const pointer: ActivePointer = {
        schemaVersion: artifact.snapshot.schemaVersion,
        sourceCommit: artifact.snapshot.sourceCommit,
        contentHash: artifact.snapshot.contentHash,
        objectCount: artifact.snapshot.objects.length,
        relationCount: artifact.snapshot.relations.length,
        loadedAt,
        versionDirectory: artifact.snapshot.contentHash,
      };
      const previous = this.readActivePointer();
      if (previous && previous.contentHash !== pointer.contentHash) this.persistPrevious(previous);
      this.writePointer(pointer);
      this.active = { info: withoutDirectory(pointer), repository: artifact.repository };
      await this.audit("snapshot_promoted", "completed", traceId, { contentHash: pointer.contentHash });
      return { ...this.active.info };
    } catch (error) {
      await this.audit("snapshot_validation_failed", "failed", traceId, { reason: safeReason(error) });
      await this.audit("snapshot_rejected", "failed", traceId, { reason: safeReason(error) });
      throw error;
    }
  }

  async rollbackToPrevious(): Promise<ActivePersonalKnowledgeSnapshotInfo> {
    const traceId = `personal-rollback.${randomUUID()}`;
    await this.audit("snapshot_rollback_started", "completed", traceId);
    const files = readdirSync(resolve(this.options.runtimeDirectory, "previous")).filter((name) => name.endsWith(".json")).sort().reverse();
    if (!files.length) throw new Error("No validated previous Personal Knowledge Snapshot is available.");
    const previousPath = resolve(this.options.runtimeDirectory, "previous", files[0]);
    const target = JSON.parse(readFileSync(previousPath, "utf8")) as ActivePointer;
    try {
      const versionRoot = resolve(this.options.runtimeDirectory, "versions", target.versionDirectory);
      const artifact = loadPersonalKnowledgeArtifact({ artifactDirectory: versionRoot });
      await (this.options.smokeQuery?.(artifact.repository) ?? this.defaultSmokeQuery(artifact.repository));
      const current = this.readActivePointer();
      if (current) this.persistPrevious(current);
      const pointer = { ...target, loadedAt: this.now().toISOString() };
      this.writePointer(pointer);
      this.active = { info: withoutDirectory(pointer), repository: artifact.repository };
      unlinkSync(previousPath);
      await this.audit("snapshot_rollback_completed", "completed", traceId, { contentHash: pointer.contentHash });
      return { ...this.active.info };
    } catch (error) {
      await this.audit("snapshot_rejected", "failed", traceId, { reason: safeReason(error) });
      throw error;
    }
  }

  private async restoreActive(): Promise<void> {
    const pointer = this.readActivePointer();
    if (!pointer) return;
    const artifact = loadPersonalKnowledgeArtifact({ artifactDirectory: resolve(this.options.runtimeDirectory, "versions", pointer.versionDirectory) });
    await (this.options.smokeQuery?.(artifact.repository) ?? this.defaultSmokeQuery(artifact.repository));
    this.active = { info: withoutDirectory(pointer), repository: artifact.repository };
  }

  private defaultSmokeQuery(repository: SnapshotKnowledgeRepository): void {
    if (!repository.getById("concept.knowledge-engineering")) throw new Error("Personal Knowledge Snapshot smoke query did not resolve concept.knowledge-engineering.");
  }

  private persistVersion(versionDirectory: string, sourceRoot: string): void {
    const temporary = resolve(this.options.runtimeDirectory, "candidates", `${randomUUID()}.tmp`);
    for (const path of [SNAPSHOT_PATH, MANIFEST_PATH, CHECKSUMS_PATH, SCHEMA_PATH]) {
      const target = resolve(temporary, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resolve(sourceRoot, path), target);
    }
    renameSync(temporary, versionDirectory);
  }

  private readActivePointer(): ActivePointer | null {
    const path = resolve(this.options.runtimeDirectory, "active.json");
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as ActivePointer : null;
  }

  private writePointer(pointer: ActivePointer): void {
    const path = resolve(this.options.runtimeDirectory, "active.json");
    if (this.options.writeActivePointer) return this.options.writeActivePointer(path, pointer);
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  }

  private persistPrevious(pointer: ActivePointer): void {
    const name = `${this.now().toISOString().replace(/:/g, "-")}-${pointer.contentHash}.json`;
    writeFileSync(resolve(this.options.runtimeDirectory, "previous", name), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  }

  private async audit(action: string, outcome: AgentAuditEvent["outcome"], traceId: string, metadata: AgentAuditEvent["metadata"] = {}): Promise<void> {
    await this.options.audit.append({
      id: `audit.personal.${randomUUID()}`,
      traceId,
      actorId: "personal-knowledge-ingestion",
      action,
      resourceIds: ["domain.personal-knowledge"],
      outcome,
      occurredAt: this.now().toISOString(),
      metadata,
    });
  }
}

function withoutDirectory(pointer: ActivePointer): ActivePersonalKnowledgeSnapshotInfo {
  return {
    schemaVersion: pointer.schemaVersion,
    sourceCommit: pointer.sourceCommit,
    contentHash: pointer.contentHash,
    objectCount: pointer.objectCount,
    relationCount: pointer.relationCount,
    loadedAt: pointer.loadedAt,
  };
}

function safeReason(error: unknown): string {
  return (error instanceof Error ? error.message : "unknown error").replace(/\/(?:Users|home|opt|var)\/[^\s]+/g, "[path]").slice(0, 240);
}
