import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ConnectorProfile, GovernedSourceSystem, SourceExtractManifest, SourceRecordBatch, SourceRecordEnvelope } from "../../knowledge-contracts/src/index";
import { checksumRecord, sha256 } from "./checksum";
import { parseSourceExtractManifest, parseSourceRecord } from "./fileConnector";
import { sourceAuthenticationHeaders, type SourceSecretResolver } from "./authentication";
import { isLocalhost } from "./profile";
import type { SourceSystemConnector } from "./types";

type FixturePage = {
  manifest: SourceExtractManifest;
  records: SourceRecordEnvelope[];
  pageInfo?: { hasMore?: boolean; nextCursor?: string; nextWatermark?: string };
};

export type HttpConnectorOptions = {
  profile: ConnectorProfile;
  path: string;
  secrets: SourceSecretResolver;
  fetch?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maximumResponseBytes?: number;
  maximumDurationMs?: number;
  retryLimit?: number;
};

export class HttpSourceConnectorError extends Error {
  constructor(readonly code:
    | "ENDPOINT_DENIED"
    | "SSRF_DENIED"
    | "SOURCE_AUTHENTICATION_FAILED"
    | "SOURCE_RATE_LIMITED"
    | "SOURCE_UNAVAILABLE"
    | "SOURCE_RESPONSE_INVALID"
    | "SOURCE_RESPONSE_TOO_LARGE"
    | "SOURCE_PAGE_LIMIT_EXCEEDED"
    | "SOURCE_RECORD_LIMIT_EXCEEDED"
    | "SOURCE_TIMEOUT",
  message: string) {
    super(message);
    this.name = "HttpSourceConnectorError";
  }
}

export class FixtureHttpJsonSourceConnector implements SourceSystemConnector {
  readonly sourceSystem: GovernedSourceSystem;
  private readonly fetcher: typeof fetch;
  private readonly resolveHost: (hostname: string) => Promise<string[]>;

  constructor(private readonly options: HttpConnectorOptions) {
    if (options.profile.adapterType !== "fixture-http-json" || !options.profile.endpoint) throw new HttpSourceConnectorError("ENDPOINT_DENIED", "HTTP connector requires a governed HTTP profile.");
    this.sourceSystem = options.profile.sourceSystem.toUpperCase() as GovernedSourceSystem;
    this.fetcher = options.fetch ?? fetch;
    this.resolveHost = options.resolveHost ?? resolveAddresses;
  }

  async readBatch(signal?: AbortSignal): Promise<SourceRecordBatch> {
    const started = Date.now();
    const maximumPages = this.options.profile.synchronization.maximumPages ?? 20;
    const maximumRecords = this.options.profile.synchronization.maximumRecords ?? 1_000;
    const records = new Map<string, SourceRecordEnvelope>();
    let manifest: SourceExtractManifest | undefined;
    let page = 1;
    let cursor: string | undefined;
    let watermark: string | undefined;
    let hasMore = true;
    while (hasMore) {
      abortIfNeeded(signal);
      if (page > maximumPages) throw new HttpSourceConnectorError("SOURCE_PAGE_LIMIT_EXCEEDED", "Source response exceeded the configured page limit.");
      if (Date.now() - started > (this.options.maximumDurationMs ?? 30_000)) throw new HttpSourceConnectorError("SOURCE_TIMEOUT", "Source synchronization exceeded its bounded duration.");
      const url = this.pageUrl(page, cursor, watermark);
      await this.assertEndpoint(url);
      const current = await this.requestPage(url, signal);
      manifest ??= current.manifest;
      assertCompatibleManifest(manifest, current.manifest);
      for (const record of current.records) {
        const key = `${record.sourceSystem}|${record.sourceId}|${record.version}|${record.recordChecksum}`;
        records.set(key, record);
        if (records.size > maximumRecords) throw new HttpSourceConnectorError("SOURCE_RECORD_LIMIT_EXCEEDED", "Source response exceeded the configured record limit.");
      }
      hasMore = Boolean(current.pageInfo?.hasMore);
      cursor = current.pageInfo?.nextCursor;
      watermark = current.pageInfo?.nextWatermark;
      if (hasMore && this.options.profile.synchronization.pagination === "none") throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Unpaginated connector returned additional pages.");
      if (hasMore && this.options.profile.synchronization.pagination === "cursor" && !cursor) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Cursor pagination did not return a next cursor.");
      if (hasMore && this.options.profile.synchronization.pagination === "watermark" && !watermark) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Watermark pagination did not return a next watermark.");
      page += 1;
    }
    if (!manifest) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source returned no extract manifest.");
    const combined = [...records.values()];
    return {
      manifest: {
        ...manifest,
        recordsFile: "fixture-http-json",
        recordsChecksum: sha256(JSON.stringify(combined)),
        recordCount: combined.length,
      },
      records: combined,
    };
  }

  private pageUrl(page: number, cursor?: string, watermark?: string): URL {
    const endpoint = this.options.profile.endpoint!;
    if (!endpoint.allowedPaths.includes(this.options.path)) throw new HttpSourceConnectorError("ENDPOINT_DENIED", "Source endpoint path is not allowlisted.");
    const url = new URL(this.options.path, `${endpoint.baseUrl}/`);
    const pagination = this.options.profile.synchronization.pagination;
    if (pagination === "page") url.searchParams.set("page", String(page));
    if (pagination === "cursor" && cursor) url.searchParams.set("cursor", cursor);
    if (pagination === "watermark" && watermark) url.searchParams.set("watermark", watermark);
    if (this.options.profile.synchronization.pageSize) url.searchParams.set("pageSize", String(this.options.profile.synchronization.pageSize));
    return url;
  }

  private async assertEndpoint(url: URL): Promise<void> {
    const endpoint = this.options.profile.endpoint!;
    const base = new URL(endpoint.baseUrl);
    if (url.protocol === "file:" || url.username || url.password) throw new HttpSourceConnectorError("SSRF_DENIED", "Source endpoint protocol or userinfo is forbidden.");
    if (url.protocol !== base.protocol || url.hostname !== base.hostname || normalizedPort(url) !== normalizedPort(base)) throw new HttpSourceConnectorError("ENDPOINT_DENIED", "Source endpoint host is not allowlisted.");
    if (!endpoint.allowedPaths.includes(url.pathname) || url.pathname.includes("..")) throw new HttpSourceConnectorError("ENDPOINT_DENIED", "Source endpoint path is not allowlisted.");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && endpoint.allowLocalhostHttp && isLocalhost(url.hostname))) throw new HttpSourceConnectorError("SSRF_DENIED", "Insecure source endpoint is forbidden.");
    if (isLocalhost(url.hostname)) {
      if (!endpoint.allowLocalhostHttp) throw new HttpSourceConnectorError("SSRF_DENIED", "Localhost source endpoint was not explicitly enabled.");
      return;
    }
    const addresses = await this.resolveHost(url.hostname);
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new HttpSourceConnectorError("SSRF_DENIED", "Source endpoint resolved to a forbidden network range.");
  }

  private async requestPage(url: URL, signal?: AbortSignal): Promise<FixturePage> {
    const headers = await sourceAuthenticationHeaders(this.options.profile, this.options.secrets);
    const retryLimit = this.options.retryLimit ?? 2;
    for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new DOMException("Source request timed out.", "TimeoutError")), this.options.timeoutMs ?? 5_000);
      const relay = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", relay, { once: true });
      try {
        const response = await this.fetcher(url, { method: "GET", headers, signal: controller.signal, redirect: "manual" });
        if (response.status >= 300 && response.status < 400) throw new HttpSourceConnectorError("SSRF_DENIED", "Source redirects are not permitted.");
        if (response.status === 401 || response.status === 403) throw new HttpSourceConnectorError("SOURCE_AUTHENTICATION_FAILED", "Source authentication was rejected.");
        if ([429, 500, 503].includes(response.status)) {
          if (attempt < retryLimit) continue;
          throw new HttpSourceConnectorError(response.status === 429 ? "SOURCE_RATE_LIMITED" : "SOURCE_UNAVAILABLE", "Source endpoint remained unavailable after bounded retries.");
        }
        if (!response.ok) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", `Source endpoint returned HTTP ${response.status}.`);
        const declaredLength = Number(response.headers.get("content-length") ?? 0);
        const maximum = this.options.maximumResponseBytes ?? 1_000_000;
        if (declaredLength > maximum) throw new HttpSourceConnectorError("SOURCE_RESPONSE_TOO_LARGE", "Source response exceeded the configured byte limit.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maximum) throw new HttpSourceConnectorError("SOURCE_RESPONSE_TOO_LARGE", "Source response exceeded the configured byte limit.");
        let parsed: unknown;
        try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source response was not valid JSON."); }
        return parseFixturePage(parsed);
      } catch (error) {
        if (error instanceof HttpSourceConnectorError) throw error;
        if (signal?.aborted) throw new DOMException("Source request was cancelled.", "AbortError");
        if (controller.signal.aborted) throw new HttpSourceConnectorError("SOURCE_TIMEOUT", "Source request exceeded its timeout.");
        throw new HttpSourceConnectorError("SOURCE_UNAVAILABLE", "Source endpoint could not be reached.");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", relay);
      }
    }
    throw new HttpSourceConnectorError("SOURCE_UNAVAILABLE", "Source endpoint request failed.");
  }
}

function parseFixturePage(value: unknown): FixturePage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source page must be an object.");
  const item = value as Record<string, unknown>;
  const manifest = parseSourceExtractManifest(item.manifest);
  if (!Array.isArray(item.records)) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source page records must be an array.");
  const records = item.records.map(parseSourceRecord);
  records.forEach((record) => {
    const content = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordChecksum"));
    if (checksumRecord(content) !== record.recordChecksum) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source record checksum validation failed.");
  });
  const pageInfo = item.pageInfo === undefined ? undefined : parsePageInfo(item.pageInfo);
  return { manifest, records, pageInfo };
}

function parsePageInfo(value: unknown): FixturePage["pageInfo"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source pageInfo must be an object.");
  const item = value as Record<string, unknown>;
  if (item.hasMore !== undefined && typeof item.hasMore !== "boolean") throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Source hasMore must be boolean.");
  return {
    hasMore: item.hasMore as boolean | undefined,
    nextCursor: optionalString(item.nextCursor),
    nextWatermark: optionalString(item.nextWatermark),
  };
}

function assertCompatibleManifest(first: SourceExtractManifest, next: SourceExtractManifest): void {
  for (const field of ["extractId", "sourceSystem", "mappingId", "mappingVersion", "tenantId", "domainId"] as const) {
    if (first[field] !== next[field]) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Paginated source manifests are inconsistent.");
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value) throw new HttpSourceConnectorError("SOURCE_RESPONSE_INVALID", "Pagination token must be a non-empty string.");
  return value;
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  return (await lookup(hostname, { all: true, verbatim: true })).map((item) => item.address);
}

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice("::ffff:".length));
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("ff");
  }
  const values = address.split(".").map(Number);
  return values.length !== 4 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
    || values[0] === 0 || values[0] === 10 || values[0] === 127
    || (values[0] === 100 && values[1]! >= 64 && values[1]! <= 127)
    || (values[0] === 169 && values[1] === 254)
    || (values[0] === 172 && values[1]! >= 16 && values[1]! <= 31)
    || (values[0] === 192 && (values[1] === 0 || values[1] === 168))
    || (values[0] === 198 && values[1]! >= 18 && values[1]! <= 19)
    || values[0]! >= 224;
}

function normalizedPort(url: URL): string {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Source connector read was cancelled.", "AbortError");
}
