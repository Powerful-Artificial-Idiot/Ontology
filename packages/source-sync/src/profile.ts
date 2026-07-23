import type { ConnectorPrincipal, ConnectorProfile, ConnectorSourceSystem } from "../../knowledge-contracts/src/index";

const sources: ConnectorSourceSystem[] = ["mes", "plm", "qms"];

export function validateConnectorProfiles(value: unknown): ConnectorProfile[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Connector profile registry must be a non-empty array.");
  const profiles = value.map(validateConnectorProfile);
  ensureUnique(profiles.map((item) => item.id), "connector profile ID");
  return profiles;
}

export function validateConnectorProfile(value: unknown): ConnectorProfile {
  const item = object(value, "connector profile");
  rejectUnknown(item, ["id", "version", "sourceSystem", "tenantId", "allowedDomains", "adapterType", "endpoint", "authentication", "synchronization", "mappingProfileId", "publicationPolicyId", "enabled"], "connector profile");
  const sourceSystem = oneOf(item.sourceSystem, sources, "sourceSystem");
  const adapterType = oneOf(item.adapterType, ["controlled-file", "fixture-http-json"] as const, "adapterType");
  const endpoint = item.endpoint === undefined ? undefined : parseEndpoint(item.endpoint);
  const authentication = parseAuthentication(item.authentication);
  const synchronization = parseSynchronization(item.synchronization);
  if (adapterType === "controlled-file" && endpoint) throw new Error("Controlled-file connector profiles cannot define an HTTP endpoint.");
  if (adapterType === "fixture-http-json" && !endpoint) throw new Error("HTTP connector profiles require an endpoint.");
  if (authentication.type === "fixture-none" && adapterType !== "controlled-file" && !isExplicitLocalFixture(endpoint)) {
    throw new Error("fixture-none authentication is limited to controlled files or explicitly allowed localhost HTTP fixtures.");
  }
  if (authentication.type === "static-bearer" && !authentication.secretReference) throw new Error("static-bearer authentication requires a server-side secretReference.");
  return {
    id: text(item.id, "id"),
    version: text(item.version, "version"),
    sourceSystem,
    tenantId: text(item.tenantId, "tenantId"),
    allowedDomains: texts(item.allowedDomains, "allowedDomains"),
    adapterType,
    endpoint,
    authentication,
    synchronization,
    mappingProfileId: text(item.mappingProfileId, "mappingProfileId"),
    publicationPolicyId: text(item.publicationPolicyId, "publicationPolicyId"),
    enabled: boolean(item.enabled, "enabled"),
  };
}

export function validateConnectorPrincipal(value: unknown): ConnectorPrincipal {
  const item = object(value, "connector principal");
  rejectUnknown(item, ["id", "type", "tenantId", "roles", "allowedDomains", "allowedSourceSystems"], "connector principal");
  if (item.type !== "service") throw new Error("Connector principal type must be service.");
  return {
    id: text(item.id, "id"),
    type: "service",
    tenantId: text(item.tenantId, "tenantId"),
    roles: texts(item.roles, "roles"),
    allowedDomains: texts(item.allowedDomains, "allowedDomains"),
    allowedSourceSystems: array(item.allowedSourceSystems, "allowedSourceSystems").map((entry) => oneOf(entry, sources, "allowedSourceSystems")),
  };
}

export function authorizeConnectorPrincipal(principal: ConnectorPrincipal, profile: ConnectorProfile): void {
  if (principal.tenantId !== profile.tenantId) throw new Error("CONNECTOR_TENANT_DENIED");
  if (!principal.roles.includes("source-sync-operator")) throw new Error("CONNECTOR_ROLE_DENIED");
  if (!principal.allowedSourceSystems.includes(profile.sourceSystem)) throw new Error("CONNECTOR_SOURCE_DENIED");
  if (!profile.allowedDomains.every((domain) => principal.allowedDomains.includes("*") || principal.allowedDomains.includes(domain))) throw new Error("CONNECTOR_DOMAIN_DENIED");
}

function parseEndpoint(value: unknown): NonNullable<ConnectorProfile["endpoint"]> {
  const item = object(value, "endpoint");
  rejectUnknown(item, ["baseUrl", "allowedPaths", "allowLocalhostHttp"], "endpoint");
  const baseUrl = text(item.baseUrl, "baseUrl");
  const url = safeUrl(baseUrl);
  const allowLocalhostHttp = boolean(item.allowLocalhostHttp, "allowLocalhostHttp");
  if (url.username || url.password) throw new Error("Connector endpoint must not contain URL userinfo.");
  if (url.search || url.hash) throw new Error("Connector base URL must not contain a query or fragment.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && allowLocalhostHttp && isLocalhost(url.hostname))) {
    throw new Error("Connector endpoints require HTTPS; localhost HTTP must be explicitly allowed for fixtures.");
  }
  const allowedPaths = texts(item.allowedPaths, "allowedPaths");
  allowedPaths.forEach((path) => {
    if (!path.startsWith("/") || path.includes("..") || path.includes("?") || path.includes("#")) throw new Error("Connector allowed paths must be absolute normalized paths.");
  });
  return { baseUrl: url.toString().replace(/\/$/u, ""), allowedPaths, allowLocalhostHttp };
}

function parseAuthentication(value: unknown): ConnectorProfile["authentication"] {
  const item = object(value, "authentication");
  rejectUnknown(item, ["type", "secretReference"], "authentication");
  const type = oneOf(item.type, ["fixture-none", "static-bearer"] as const, "authentication.type");
  const secretReference = item.secretReference === undefined ? undefined : text(item.secretReference, "secretReference");
  if (secretReference && !/^MKG_SOURCE_SECRET_[A-Z0-9_]+$/u.test(secretReference)) throw new Error("Source secret references must use the MKG_SOURCE_SECRET_* namespace.");
  return { type, secretReference };
}

function parseSynchronization(value: unknown): ConnectorProfile["synchronization"] {
  const item = object(value, "synchronization");
  rejectUnknown(item, ["mode", "pagination", "pageSize", "maximumPages", "maximumRecords"], "synchronization");
  return {
    mode: oneOf(item.mode, ["snapshot", "incremental"] as const, "synchronization.mode"),
    pagination: oneOf(item.pagination, ["none", "page", "cursor", "watermark"] as const, "synchronization.pagination"),
    pageSize: optionalPositiveInteger(item.pageSize, "pageSize"),
    maximumPages: optionalPositiveInteger(item.maximumPages, "maximumPages"),
    maximumRecords: optionalPositiveInteger(item.maximumRecords, "maximumRecords"),
  };
}

function isExplicitLocalFixture(endpoint?: ConnectorProfile["endpoint"]): boolean {
  if (!endpoint?.allowLocalhostHttp) return false;
  return isLocalhost(new URL(endpoint.baseUrl).hostname);
}

export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function safeUrl(value: string): URL {
  try { return new URL(value); } catch { throw new Error("Connector endpoint is not a valid URL."); }
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}

function texts(value: unknown, name: string): string[] {
  const values = array(value, name).map((entry) => text(entry, name));
  if (!values.length) throw new Error(`${name} must not be empty.`);
  ensureUnique(values, name);
  return values;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${name} must be a positive integer.`);
  return Number(value);
}

function oneOf<const T extends readonly string[]>(value: unknown, values: T, name: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) throw new Error(`${name} is not supported.`);
  return value as T[number];
}

function rejectUnknown(item: Record<string, unknown>, allowed: string[], name: string): void {
  const unknown = Object.keys(item).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${name} contains unsupported fields: ${unknown.join(", ")}`);
}

function ensureUnique(values: string[], name: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${name} contains duplicate values.`);
}
