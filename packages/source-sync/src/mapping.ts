import { readFile } from "node:fs/promises";
import type { GovernedSourceSystem } from "../../knowledge-contracts/src/index";
import type { GovernedSyncMapping, SyncMappingProfile, SyncPropertyMapping, SyncRelationMapping } from "./types";

export async function loadGovernedSyncMapping(path: string): Promise<GovernedSyncMapping> {
  return validateGovernedSyncMapping(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export function validateGovernedSyncMapping(value: unknown): GovernedSyncMapping {
  const root = record(value, "mapping");
  const sourceSystem = text(root.sourceSystem, "sourceSystem") as GovernedSourceSystem;
  if (!(["MES", "QMS", "PLM"] as string[]).includes(sourceSystem)) throw new Error(`Unsupported governed source system: ${sourceSystem}`);
  const profiles = array(root.syncProfiles, "syncProfiles").map(profile);
  if (!profiles.length) throw new Error("syncProfiles must not be empty.");
  unique(profiles.map((item) => item.sourceType), "sourceType");
  return {
    mappingId: text(root.mappingId, "mappingId"),
    version: text(root.version, "version"),
    sourceSystem,
    effectiveFrom: optionalText(root.effectiveFrom, "effectiveFrom"),
    syncProfiles: profiles,
  };
}

function profile(value: unknown, index: number): SyncMappingProfile {
  const item = record(value, `syncProfiles[${index}]`);
  const canonicalIdMap = stringMap(item.canonicalIdMap, `syncProfiles[${index}].canonicalIdMap`);
  const allowedSourceFields = strings(item.allowedSourceFields, `syncProfiles[${index}].allowedSourceFields`);
  const propertyMappings = array(item.propertyMappings, `syncProfiles[${index}].propertyMappings`).map((entry, propertyIndex) => property(entry, index, propertyIndex));
  const relationMappings = array(item.relationMappings, `syncProfiles[${index}].relationMappings`).map((entry, relationIndex) => relation(entry, index, relationIndex));
  const requiredFields = [text(item.idSourceField, "idSourceField"), text(item.labelSourceField, "labelSourceField")];
  for (const field of [...requiredFields, ...propertyMappings.map((mapping) => mapping.sourceField), ...relationMappings.map((mapping) => mapping.sourceField)]) {
    if (!allowedSourceFields.includes(field)) throw new Error(`Mapped source field is not allowlisted: ${field}`);
  }
  return {
    sourceType: text(item.sourceType, "sourceType"),
    canonicalType: text(item.canonicalType, "canonicalType"),
    idSourceField: requiredFields[0]!,
    canonicalIdMap,
    labelSourceField: requiredFields[1]!,
    domain: text(item.domain, "domain"),
    allowedSourceFields,
    propertyMappings,
    relationMappings,
  };
}

function property(value: unknown, profileIndex: number, index: number): SyncPropertyMapping {
  const item = record(value, `syncProfiles[${profileIndex}].propertyMappings[${index}]`);
  const transform = text(item.transform, "transform") as SyncPropertyMapping["transform"];
  if (!(["string", "number", "boolean", "datetime"] as string[]).includes(transform)) throw new Error(`Unsupported sync transform: ${transform}`);
  return {
    sourceField: text(item.sourceField, "sourceField"),
    targetProperty: text(item.targetProperty, "targetProperty"),
    transform,
    unit: optionalText(item.unit, "unit"),
  };
}

function relation(value: unknown, profileIndex: number, index: number): SyncRelationMapping {
  const item = record(value, `syncProfiles[${profileIndex}].relationMappings[${index}]`);
  return {
    sourceField: text(item.sourceField, "sourceField"),
    predicate: text(item.predicate, "predicate"),
    label: text(item.label, "label"),
    direction: item.direction === undefined ? "source-to-target" : oneOf(item.direction, ["source-to-target", "target-to-source"] as const, "direction"),
    targetCanonicalIdMap: stringMap(item.targetCanonicalIdMap, "targetCanonicalIdMap"),
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string.`);
  return value.trim();
}

function optionalText(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : text(value, path);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
  const result = text(value, path) as T;
  if (!values.includes(result)) throw new Error(`${path} is not supported.`);
  return result;
}

function strings(value: unknown, path: string): string[] {
  const result = array(value, path).map((item, index) => text(item, `${path}[${index}]`));
  unique(result, path);
  return result;
}

function stringMap(value: unknown, path: string): Record<string, string> {
  const input = record(value, path);
  const result = Object.fromEntries(Object.entries(input).map(([key, item]) => [text(key, `${path}.key`), text(item, `${path}.${key}`)]));
  if (!Object.keys(result).length) throw new Error(`${path} must not be empty.`);
  return result;
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${path} contains duplicate values.`);
}
