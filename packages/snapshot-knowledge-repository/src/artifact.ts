import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  PERSONAL_KNOWLEDGE_SCHEMA_SHA256,
  PERSONAL_KNOWLEDGE_SUPPORTED_SCHEMA_MAJOR,
  SnapshotKnowledgeRepository,
  type PersonalKnowledgeSnapshot,
} from "./index";

export const SNAPSHOT_PATH = "generated/knowledge-snapshot.json";
export const MANIFEST_PATH = "generated/knowledge-snapshot.manifest.json";
export const CHECKSUMS_PATH = "generated/checksums.txt";
export const SCHEMA_PATH = "schemas/personal-knowledge-snapshot/0.1.0.schema.json";

export type PersonalKnowledgeArtifactManifest = {
  schemaVersion: string;
  schemaSha256: string;
  snapshotSha256: string;
  contentHash: string;
  objectCount: number;
  relationCount: number;
  warningCount: number;
  errorCount: number;
  sourceRepository: string;
  generatorName: string;
  generatorVersion: string;
  sourceCommit?: string;
};

export type LoadedPersonalKnowledgeArtifact = {
  rootDirectory: string;
  manifest: PersonalKnowledgeArtifactManifest;
  snapshot: PersonalKnowledgeSnapshot;
  repository: SnapshotKnowledgeRepository;
  files: Record<typeof SNAPSHOT_PATH | typeof MANIFEST_PATH | typeof CHECKSUMS_PATH | typeof SCHEMA_PATH, string>;
};

export type PersonalKnowledgeArtifactSource =
  | { artifactDirectory: string; snapshotPath?: never }
  | { artifactDirectory?: never; snapshotPath: string };

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactRoot(source: PersonalKnowledgeArtifactSource): string {
  if (source.artifactDirectory) return resolve(source.artifactDirectory);
  if (!source.snapshotPath) throw new Error("A Personal Knowledge artifact directory or snapshot path is required.");
  const snapshot = resolve(source.snapshotPath);
  const parent = dirname(snapshot);
  return parent.endsWith(`${process.platform === "win32" ? "\\" : "/"}generated`) ? dirname(parent) : parent;
}

function requireFile(root: string, path: string): string {
  const resolved = resolve(root, path);
  if (relative(root, resolved).startsWith("..") || !existsSync(resolved)) throw new Error(`Personal Knowledge artifact file is missing: ${path}`);
  return readFileSync(resolved, "utf8");
}

function parseJson<T>(bytes: string, name: string): T {
  try {
    return JSON.parse(bytes) as T;
  } catch {
    throw new Error(`Personal Knowledge artifact contains invalid JSON: ${name}`);
  }
}

function validateChecksums(root: string, bytes: string): void {
  const expectedPaths = [SNAPSHOT_PATH, MANIFEST_PATH, SCHEMA_PATH].sort();
  const entries = bytes.trim().split("\n").map((line) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid Personal Knowledge checksum entry: ${line}`);
    if (isAbsolute(match[2]) || match[2].split(/[\\/]/).includes("..")) throw new Error("Personal Knowledge checksum path must be artifact-relative.");
    return { hash: match[1], path: match[2] };
  });
  if (JSON.stringify(entries.map((entry) => entry.path).sort()) !== JSON.stringify(expectedPaths)) {
    throw new Error("Personal Knowledge checksums do not cover the governed artifact files exactly.");
  }
  for (const entry of entries) {
    if (sha256(requireFile(root, entry.path)) !== entry.hash) throw new Error(`Personal Knowledge artifact checksum mismatch: ${entry.path}`);
  }
}

function validateManifest(manifest: PersonalKnowledgeArtifactManifest, snapshot: PersonalKnowledgeSnapshot, snapshotBytes: string): void {
  if (Number(manifest.schemaVersion.split(".")[0]) !== PERSONAL_KNOWLEDGE_SUPPORTED_SCHEMA_MAJOR) throw new Error(`Unsupported snapshot schema major version: ${manifest.schemaVersion}`);
  if (manifest.schemaVersion !== snapshot.schemaVersion) throw new Error("Personal Knowledge manifest schema version mismatch.");
  if (manifest.schemaSha256 !== PERSONAL_KNOWLEDGE_SCHEMA_SHA256) throw new Error("Personal Knowledge manifest schema hash mismatch.");
  if (manifest.snapshotSha256 !== sha256(snapshotBytes)) throw new Error("Personal Knowledge manifest snapshot checksum mismatch.");
  if (manifest.contentHash !== snapshot.contentHash) throw new Error("Personal Knowledge manifest content hash mismatch.");
  if (manifest.objectCount !== snapshot.objects.length || manifest.relationCount !== snapshot.relations.length) throw new Error("Personal Knowledge manifest count mismatch.");
  if (manifest.warningCount !== snapshot.diagnostics.warnings.length || manifest.errorCount !== snapshot.diagnostics.errors.length) throw new Error("Personal Knowledge manifest diagnostic count mismatch.");
  if (manifest.warningCount !== 0 || manifest.errorCount !== 0) throw new Error("Personal Knowledge artifact must contain zero warnings and zero errors.");
  if (manifest.generatorName !== snapshot.generator.name || manifest.generatorVersion !== snapshot.generator.version) throw new Error("Personal Knowledge manifest generator mismatch.");
  if (!manifest.sourceRepository || manifest.sourceCommit !== snapshot.sourceCommit) throw new Error("Personal Knowledge manifest source identity mismatch.");
}

export function loadPersonalKnowledgeArtifact(source: PersonalKnowledgeArtifactSource): LoadedPersonalKnowledgeArtifact {
  const rootDirectory = artifactRoot(source);
  const files = {
    [SNAPSHOT_PATH]: requireFile(rootDirectory, SNAPSHOT_PATH),
    [MANIFEST_PATH]: requireFile(rootDirectory, MANIFEST_PATH),
    [CHECKSUMS_PATH]: requireFile(rootDirectory, CHECKSUMS_PATH),
    [SCHEMA_PATH]: requireFile(rootDirectory, SCHEMA_PATH),
  };
  validateChecksums(rootDirectory, files[CHECKSUMS_PATH]);
  if (sha256(files[SCHEMA_PATH]) !== PERSONAL_KNOWLEDGE_SCHEMA_SHA256) throw new Error("Personal Knowledge canonical schema hash mismatch.");
  const snapshot = parseJson<PersonalKnowledgeSnapshot>(files[SNAPSHOT_PATH], SNAPSHOT_PATH);
  const manifest = parseJson<PersonalKnowledgeArtifactManifest>(files[MANIFEST_PATH], MANIFEST_PATH);
  const repository = new SnapshotKnowledgeRepository(snapshot);
  validateManifest(manifest, repository.snapshot, files[SNAPSHOT_PATH]);
  return { rootDirectory, manifest, snapshot: repository.snapshot, repository, files };
}
