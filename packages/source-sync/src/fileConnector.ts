import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { GovernedSourceSystem, SourceExtractManifest, SourceRecordBatch, SourceRecordEnvelope } from "../../knowledge-contracts/src/index";
import { checksumRecord, sha256 } from "./checksum";
import type { SourceSystemConnector } from "./types";

export class SourceConnectorError extends Error {
  constructor(readonly code: "manifest-invalid" | "records-invalid" | "checksum-mismatch", message: string) {
    super(message);
    this.name = "SourceConnectorError";
  }
}

export class ControlledFileSourceConnector implements SourceSystemConnector {
  readonly sourceSystem: GovernedSourceSystem;

  constructor(private readonly manifestPath: string, sourceSystem: GovernedSourceSystem) {
    this.sourceSystem = sourceSystem;
  }

  async readBatch(signal?: AbortSignal): Promise<SourceRecordBatch> {
    abortIfNeeded(signal);
    const manifest = parseManifest(JSON.parse(await readFile(this.manifestPath, "utf8")) as unknown);
    if (manifest.sourceSystem !== this.sourceSystem) throw new SourceConnectorError("manifest-invalid", "Connector and manifest source systems do not match.");
    const root = dirname(resolve(this.manifestPath));
    const recordsPath = resolve(root, manifest.recordsFile);
    const relativePath = relative(root, recordsPath);
    if (relativePath.startsWith("..") || relativePath.includes("://")) throw new SourceConnectorError("manifest-invalid", "recordsFile must remain inside the controlled extract directory.");
    const raw = await readFile(recordsPath, "utf8");
    abortIfNeeded(signal);
    if (sha256(raw) !== manifest.recordsChecksum) throw new SourceConnectorError("checksum-mismatch", "Source extract file checksum does not match its manifest.");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new SourceConnectorError("records-invalid", "Source extract records must be an array.");
    const records = parsed.map((item, index) => parseRecord(item, index));
    if (records.length !== manifest.recordCount) throw new SourceConnectorError("records-invalid", "Source extract record count does not match its manifest.");
    for (const record of records) {
      const content = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordChecksum"));
      if (checksumRecord(content) !== record.recordChecksum) throw new SourceConnectorError("checksum-mismatch", `Source record checksum mismatch: ${record.sourceId}`);
    }
    return { manifest, records };
  }
}

function parseManifest(value: unknown): SourceExtractManifest {
  const item = object(value, "manifest");
  const sourceSystem = string(item.sourceSystem, "sourceSystem") as GovernedSourceSystem;
  if (!(["MES", "QMS", "PLM"] as string[]).includes(sourceSystem)) throw new SourceConnectorError("manifest-invalid", `Unsupported source system: ${sourceSystem}`);
  const manifest: SourceExtractManifest = {
    manifestVersion: literal(item.manifestVersion, "1.0.0", "manifestVersion"),
    extractId: string(item.extractId, "extractId"),
    sourceSystem,
    schemaVersion: string(item.schemaVersion, "schemaVersion"),
    mappingId: string(item.mappingId, "mappingId"),
    mappingVersion: string(item.mappingVersion, "mappingVersion"),
    tenantId: string(item.tenantId, "tenantId"),
    domainId: string(item.domainId, "domainId"),
    generatedAt: date(item.generatedAt, "generatedAt"),
    approvalStatus: oneOf(item.approvalStatus, ["approved", "draft", "rejected"] as const, "approvalStatus"),
    lifecycleStatus: oneOf(item.lifecycleStatus, ["effective", "superseded", "withdrawn"] as const, "lifecycleStatus"),
    cursor: integer(item.cursor, "cursor"),
    recordsFile: string(item.recordsFile, "recordsFile"),
    recordsChecksum: string(item.recordsChecksum, "recordsChecksum"),
    recordCount: integer(item.recordCount, "recordCount"),
  };
  return manifest;
}

function parseRecord(value: unknown, index: number): SourceRecordEnvelope {
  const item = object(value, `records[${index}]`);
  return {
    id: string(item.id, "id"),
    sourceSystem: oneOf(item.sourceSystem, ["MES", "QMS", "PLM"] as const, "sourceSystem"),
    sourceType: string(item.sourceType, "sourceType"),
    sourceId: string(item.sourceId, "sourceId"),
    operation: oneOf(item.operation, ["upsert", "tombstone"] as const, "operation"),
    tenantId: string(item.tenantId, "tenantId"),
    domainId: string(item.domainId, "domainId"),
    version: string(item.version, "version"),
    recordedAt: date(item.recordedAt, "recordedAt"),
    validFrom: item.validFrom === undefined ? undefined : date(item.validFrom, "validFrom"),
    payload: object(item.payload, "payload"),
    recordChecksum: string(item.recordChecksum, "recordChecksum"),
  };
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SourceConnectorError("records-invalid", `${path} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SourceConnectorError("records-invalid", `${path} must be a non-empty string.`);
  return value.trim();
}

function date(value: unknown, path: string): string {
  const result = string(value, path);
  if (!Number.isFinite(Date.parse(result))) throw new SourceConnectorError("records-invalid", `${path} must be an ISO date-time.`);
  return result;
}

function integer(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new SourceConnectorError("records-invalid", `${path} must be a non-negative integer.`);
  return Number(value);
}

function literal<T extends string>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new SourceConnectorError("manifest-invalid", `${path} must equal ${expected}.`);
  return expected;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new SourceConnectorError("records-invalid", `${path} is not supported.`);
  return value as T;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Source connector read was cancelled.", "AbortError");
}
