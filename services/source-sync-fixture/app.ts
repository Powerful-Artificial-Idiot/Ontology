import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { GovernedSourceSystem } from "../../packages/knowledge-contracts/src/index";
import { ControlledFileSourceConnector } from "../../packages/source-sync/src/index";

const fixtures: Record<string, { source: GovernedSourceSystem; manifest: string }> = {
  mes: { source: "MES", manifest: "packages/demo-data/source-extracts/mes/manifest.json" },
  plm: { source: "PLM", manifest: "packages/demo-data/source-extracts/plm/manifest.json" },
  qms: { source: "QMS", manifest: "packages/demo-data/source-extracts/qms/manifest.json" },
};

export type SourceFixtureBehavior = "normal" | "duplicate-page" | "out-of-order" | "delay" | "malformed-json" | "malformed-record" | "unauthorized" | "forbidden" | "rate-limit" | "server-error" | "unavailable" | "redirect" | "oversized";

export function createSourceSyncFixtureHandler(options: { token: string; behavior?: SourceFixtureBehavior; delayMs?: number; maximumPayloadBytes?: number }) {
  const attempts = new Map<string, number>();
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const match = /^\/fixture\/(mes|plm|qms)\/records$/u.exec(url.pathname);
    if (!match) return send(response, 404, { error: "not-found" });
    if (options.behavior === "redirect") { response.writeHead(302, { Location: "http://127.0.0.1/private" }); response.end(); return; }
    if (options.behavior === "unauthorized" || request.headers.authorization !== `Bearer ${options.token}`) return send(response, 401, { error: "unauthorized" });
    if (options.behavior === "forbidden") return send(response, 403, { error: "forbidden" });
    const attemptKey = `${match[1]}:${url.search}`;
    const attempt = (attempts.get(attemptKey) ?? 0) + 1;
    attempts.set(attemptKey, attempt);
    if (options.behavior === "rate-limit" && attempt <= 3) return send(response, 429, { error: "rate-limited" });
    if (options.behavior === "server-error" && attempt <= 3) return send(response, 500, { error: "server-error" });
    if (options.behavior === "unavailable" && attempt <= 3) return send(response, 503, { error: "unavailable" });
    if (options.behavior === "delay") await new Promise((done) => setTimeout(done, options.delayMs ?? 250));
    if (options.behavior === "malformed-json") { response.writeHead(200, { "Content-Type": "application/json" }); response.end("{"); return; }
    if (options.behavior === "oversized") { response.writeHead(200, { "Content-Type": "application/json" }); response.end("x".repeat(options.maximumPayloadBytes ?? 2_000_000)); return; }
    const fixture = fixtures[match[1]!]!;
    const batch = await new ControlledFileSourceConnector(resolve(fixture.manifest), fixture.source).readBatch();
    const page = pageIndex(url);
    const pageSize = Math.max(1, Number(url.searchParams.get("pageSize") ?? 1));
    const start = page * pageSize;
    let records = batch.records.slice(start, start + pageSize);
    if (options.behavior === "duplicate-page" && page > 0) records = batch.records.slice(0, pageSize);
    if (options.behavior === "out-of-order") records = [...records].reverse();
    if (options.behavior === "malformed-record" && records[0]) records = [{ ...records[0], recordChecksum: "sha256:invalid" }];
    const hasMore = start + pageSize < batch.records.length;
    send(response, 200, {
      manifest: batch.manifest,
      records,
      pageInfo: {
        hasMore,
        nextCursor: hasMore ? String(page + 1) : undefined,
        nextWatermark: hasMore ? String(page + 1) : undefined,
      },
    });
  };
}

function pageIndex(url: URL): number {
  if (url.searchParams.has("page")) return Math.max(0, Number(url.searchParams.get("page")) - 1);
  if (url.searchParams.has("cursor")) return Math.max(0, Number(url.searchParams.get("cursor")));
  if (url.searchParams.has("watermark")) return Math.max(0, Number(url.searchParams.get("watermark")));
  return 0;
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-store" });
  response.end(body);
}
