import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryAgentAuditSink } from "../../packages/agent-core/src/index";
import { computePersonalSnapshotContentHash, type PersonalKnowledgeSnapshot } from "../../packages/snapshot-knowledge-repository/src/index";
import { loadPersonalKnowledgeArtifact, MANIFEST_PATH, SCHEMA_PATH, SNAPSHOT_PATH } from "../../packages/snapshot-knowledge-repository/src/artifact";
import { PersonalKnowledgeSnapshotIngestionService } from "../../packages/snapshot-knowledge-repository/src/ingestion";

const fixture = resolve(process.cwd(), "tests/fixtures/personal-knowledge-artifact");

function copyArtifact(): string {
  const root = mkdtempSync(resolve(tmpdir(), "personal-artifact-"));
  cpSync(fixture, root, { recursive: true });
  return root;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rewriteChecksums(root: string): void {
  const paths = [SNAPSHOT_PATH, MANIFEST_PATH, SCHEMA_PATH];
  writeFileSync(resolve(root, "generated/checksums.txt"), `${paths.map((path) => `${sha256(readFileSync(resolve(root, path), "utf8"))}  ${path}`).join("\n")}\n`);
}

function updateSnapshot(root: string, mutate: (snapshot: PersonalKnowledgeSnapshot) => void, sourceCommit = "b".repeat(40)): void {
  const snapshotPath = resolve(root, SNAPSHOT_PATH);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as PersonalKnowledgeSnapshot;
  mutate(snapshot);
  snapshot.sourceCommit = sourceCommit;
  snapshot.contentHash = computePersonalSnapshotContentHash(snapshot);
  const snapshotBytes = `${JSON.stringify(snapshot, null, 2)}\n`;
  writeFileSync(snapshotPath, snapshotBytes);
  const manifestPath = resolve(root, MANIFEST_PATH);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  Object.assign(manifest, {
    schemaVersion: snapshot.schemaVersion,
    snapshotSha256: sha256(snapshotBytes),
    contentHash: snapshot.contentHash,
    objectCount: snapshot.objects.length,
    relationCount: snapshot.relations.length,
    warningCount: snapshot.diagnostics.warnings.length,
    errorCount: snapshot.diagnostics.errors.length,
    sourceCommit,
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  rewriteChecksums(root);
}

describe("governed Personal Knowledge artifact loading", () => {
  it("loads the complete governed artifact by directory and explicit snapshot path", () => {
    const root = copyArtifact();
    expect(loadPersonalKnowledgeArtifact({ artifactDirectory: root }).manifest.warningCount).toBe(0);
    expect(loadPersonalKnowledgeArtifact({ snapshotPath: resolve(root, SNAPSHOT_PATH) }).repository.getById("concept.knowledge-engineering")).not.toBeNull();
  });

  it("rejects a missing artifact and checksum mismatch", () => {
    expect(() => loadPersonalKnowledgeArtifact({ artifactDirectory: resolve(fixture, "missing") })).toThrow("file is missing");
    const root = copyArtifact();
    writeFileSync(resolve(root, SNAPSHOT_PATH), "{}\n");
    expect(() => loadPersonalKnowledgeArtifact({ artifactDirectory: root })).toThrow("checksum mismatch");
  });

  it("rejects a schema mismatch", () => {
    const root = copyArtifact();
    writeFileSync(resolve(root, SCHEMA_PATH), `${readFileSync(resolve(root, SCHEMA_PATH), "utf8")}\n`);
    rewriteChecksums(root);
    expect(() => loadPersonalKnowledgeArtifact({ artifactDirectory: root })).toThrow("canonical schema hash mismatch");
  });
});

describe("atomic Personal Knowledge promotion", () => {
  it("promotes valid candidates, retains previous versions, and rolls back", async () => {
    const audit = new InMemoryAgentAuditSink();
    const runtimeDirectory = mkdtempSync(resolve(tmpdir(), "personal-runtime-"));
    const service = await PersonalKnowledgeSnapshotIngestionService.create({ runtimeDirectory, audit });
    const first = await service.ingestCandidate({ artifactDirectory: fixture });
    const secondArtifact = copyArtifact();
    updateSnapshot(secondArtifact, (snapshot) => { snapshot.objects[0].title = `${snapshot.objects[0].title} v2`; });
    const second = await service.ingestCandidate({ artifactDirectory: secondArtifact });
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(service.listPreviousSnapshots().map((item) => item.contentHash)).toContain(first.contentHash);
    expect((await service.rollbackToPrevious()).contentHash).toBe(first.contentHash);
    expect(audit.list().map((event) => event.action)).toEqual(expect.arrayContaining(["snapshot_candidate_received", "snapshot_validation_passed", "snapshot_promoted", "snapshot_rollback_started", "snapshot_rollback_completed"]));
  });

  it("rejects smoke-query failure without creating an active snapshot", async () => {
    const service = await PersonalKnowledgeSnapshotIngestionService.create({
      runtimeDirectory: mkdtempSync(resolve(tmpdir(), "personal-runtime-")),
      audit: new InMemoryAgentAuditSink(),
      smokeQuery: () => { throw new Error("smoke failed"); },
    });
    await expect(service.ingestCandidate({ artifactDirectory: fixture })).rejects.toThrow("smoke failed");
    expect(service.getActiveSnapshotInfo()).toBeNull();
  });

  it("retains the active repository when atomic pointer promotion fails", async () => {
    let rejectPointer = false;
    const service = await PersonalKnowledgeSnapshotIngestionService.create({
      runtimeDirectory: mkdtempSync(resolve(tmpdir(), "personal-runtime-")),
      audit: new InMemoryAgentAuditSink(),
      writeActivePointer: (path, value) => {
        if (rejectPointer) throw new Error("atomic pointer failure");
        writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
      },
    });
    const active = await service.ingestCandidate({ artifactDirectory: fixture });
    const candidate = copyArtifact();
    updateSnapshot(candidate, (snapshot) => { snapshot.objects[0].title = "Rejected version"; });
    rejectPointer = true;
    await expect(service.ingestCandidate({ artifactDirectory: candidate })).rejects.toThrow("atomic pointer failure");
    expect(service.getActiveSnapshotInfo()?.contentHash).toBe(active.contentHash);
  });

  it("fails closed when rollback has no validated previous version", async () => {
    const service = await PersonalKnowledgeSnapshotIngestionService.create({ runtimeDirectory: mkdtempSync(resolve(tmpdir(), "personal-runtime-")), audit: new InMemoryAgentAuditSink() });
    await expect(service.rollbackToPrevious()).rejects.toThrow("No validated previous");
    expect(service.getActiveRepository()).toBeNull();
  });
});
