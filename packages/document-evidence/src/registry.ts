import type { DocumentRegistryManifest, GovernedDocumentDefinition } from "./types";

const stableIdPattern = /^[a-z][a-z0-9.-]*$/u;
const checksumPattern = /^sha256:[a-f0-9]{64}$/u;

export function validateDocumentRegistry(value: unknown): DocumentRegistryManifest {
  if (!isRecord(value) || value.registryVersion !== "1.0.0" || !Array.isArray(value.documents)) {
    throw new Error("Document registry must use registryVersion 1.0.0 and contain documents.");
  }
  assertOnlyKeys(value, ["registryVersion", "documents"]);
  if (!value.documents.length) throw new Error("Document registry must contain at least one document.");
  const documents = value.documents.map(validateDefinition);
  assertUnique(documents.map((document) => document.documentId), "documentId");
  assertUnique(documents.map((document) => `${document.sourceSystem}:${document.sourceId}:${document.version}`), "source/version identity");
  return { registryVersion: "1.0.0", documents };
}

function validateDefinition(value: unknown, index: number): GovernedDocumentDefinition {
  if (!isRecord(value)) throw new Error(`Document registry entry ${index} must be an object.`);
  assertOnlyKeys(value, [
    "documentId", "logicalDocumentId", "title", "documentType", "version", "approvalStatus", "lifecycleStatus",
    "effectiveFrom", "effectiveTo", "owner", "sourceSystem", "sourceId", "contentFile", "contentChecksum",
    "parserId", "parserVersion", "linkedEntityIds", "supportsClaimIds", "access",
  ]);
  const documentId = stableId(value.documentId, `documents[${index}].documentId`);
  const logicalDocumentId = stableId(value.logicalDocumentId, `documents[${index}].logicalDocumentId`);
  const title = text(value.title, `documents[${index}].title`);
  if (!isOneOf(value.documentType, [
    "control-plan",
    "pfmea",
    "sop",
    "qms-record",
    "engineering-change-request",
    "validation-record",
    "line-balance-study",
    "value-stream-map",
    "standard-work",
    "mes-record",
    "product-specification",
    "reaction-plan",
    "msa-study",
    "calibration-record",
    "validation-plan",
    "capability-study",
    "deviation-record",
    "maintenance-instruction",
  ])) throw new Error(`documents[${index}].documentType is unsupported.`);
  const version = text(value.version, `documents[${index}].version`);
  if (!isOneOf(value.approvalStatus, ["approved", "draft", "rejected"])) throw new Error(`documents[${index}].approvalStatus is unsupported.`);
  if (!isOneOf(value.lifecycleStatus, ["effective", "superseded", "withdrawn"])) throw new Error(`documents[${index}].lifecycleStatus is unsupported.`);
  const effectiveFrom = dateTime(value.effectiveFrom, `documents[${index}].effectiveFrom`);
  const effectiveTo = value.effectiveTo === undefined ? undefined : dateTime(value.effectiveTo, `documents[${index}].effectiveTo`);
  if (effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) throw new Error(`documents[${index}].effectiveTo must be after effectiveFrom.`);
  const contentChecksum = text(value.contentChecksum, `documents[${index}].contentChecksum`);
  if (!checksumPattern.test(contentChecksum)) throw new Error(`documents[${index}].contentChecksum must be a SHA-256 checksum.`);
  if (value.parserId !== "controlled-json" || value.parserVersion !== "1.0.0") throw new Error(`documents[${index}] uses an unsupported parser.`);
  const linkedEntityIds = stableIdArray(value.linkedEntityIds, `documents[${index}].linkedEntityIds`);
  const supportsClaimIds = stableIdArray(value.supportsClaimIds, `documents[${index}].supportsClaimIds`);
  if (!isRecord(value.access)) throw new Error(`documents[${index}].access must be an object.`);
  assertOnlyKeys(value.access, ["classification", "allowedRoleIds", "allowedDomainIds"]);
  if (!isOneOf(value.access.classification, ["public", "internal", "restricted"])) throw new Error(`documents[${index}].access.classification is unsupported.`);
  return {
    documentId,
    logicalDocumentId,
    title,
    documentType: value.documentType,
    version,
    approvalStatus: value.approvalStatus,
    lifecycleStatus: value.lifecycleStatus,
    effectiveFrom,
    effectiveTo,
    owner: text(value.owner, `documents[${index}].owner`),
    sourceSystem: text(value.sourceSystem, `documents[${index}].sourceSystem`),
    sourceId: text(value.sourceId, `documents[${index}].sourceId`),
    contentFile: text(value.contentFile, `documents[${index}].contentFile`),
    contentChecksum,
    parserId: "controlled-json",
    parserVersion: "1.0.0",
    linkedEntityIds,
    supportsClaimIds,
    access: {
      classification: value.access.classification,
      allowedRoleIds: stringArray(value.access.allowedRoleIds, `documents[${index}].access.allowedRoleIds`),
      allowedDomainIds: stringArray(value.access.allowedDomainIds, `documents[${index}].access.allowedDomainIds`),
    },
  };
}

function stableId(value: unknown, name: string): string {
  const result = text(value, name);
  if (!stableIdPattern.test(result)) throw new Error(`${name} must be a stable canonical ID.`);
  return result;
}

function stableIdArray(value: unknown, name: string): string[] {
  const values = stringArray(value, name).map((item, index) => stableId(item, `${name}[${index}]`));
  if (!values.length) throw new Error(`${name} must not be empty.`);
  return values;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${name} must be an array of non-empty strings.`);
  const result = value.map((item) => item.trim());
  assertUnique(result, name);
  return result;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`${name} must contain 1 to 500 characters.`);
  return value.trim();
}

function dateTime(value: unknown, name: string): string {
  const result = text(value, name);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${name} must be a valid date-time.`);
  return result;
}

function assertUnique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Document registry contains duplicate ${name}.`);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`Document registry contains undeclared fields: ${unexpected.join(", ")}.`);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
