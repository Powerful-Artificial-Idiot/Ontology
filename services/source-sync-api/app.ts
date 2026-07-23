import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentAuthorizationContext, ConnectorProfile } from "../../packages/knowledge-contracts/src/index";
import { AgentAuthenticationError, createAgentApiSecurity, type AgentApiSecurityRuntime } from "../agent-api/security";
import { publicConnectorProfile, publicConnectorRun, type SourceSyncRuntime } from "../source-sync/runtime";

export function createSourceSyncApi(runtime: SourceSyncRuntime, security: AgentApiSecurityRuntime = createAgentApiSecurity()) {
  return (request: IncomingMessage, response: ServerResponse) => {
    void handle(runtime, security, request, response).catch((error: unknown) => {
      const mapped = mapError(error);
      send(response, mapped.status, { error: { code: mapped.code, message: mapped.message } });
    });
  };
}

async function handle(runtime: SourceSyncRuntime, security: AgentApiSecurityRuntime, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "OPTIONS") return send(response, 204, undefined);
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "source-sync") throw new HttpError(404, "ROUTE_NOT_FOUND", "Source synchronization route not found.");
  if (parts.length === 3 && parts[2] === "health") return send(response, 200, { sourceSync: await runtime.health() });
  const authorization = await security.authenticator.authenticate(request, `source-sync-api.${randomUUID()}`);

  if (parts.length === 3 && parts[2] === "connectors") {
    requireMethod(request, "GET");
    const visible = [];
    for (const profile of runtime.profiles) if (allowed(security, authorization, "source-sync:read", profile)) visible.push(publicConnectorProfile(profile));
    return send(response, 200, { connectors: visible });
  }

  if (parts[2] === "connectors" && parts[3]) {
    const profile = requireProfile(runtime, decodeURIComponent(parts[3]));
    requireAuthorization(security, authorization, request.method === "POST" ? "source-sync:apply" : "source-sync:read", profile);
    if (parts.length === 4) { requireMethod(request, "GET"); return send(response, 200, { connector: publicConnectorProfile(profile) }); }
    if (parts.length === 5 && parts[4] === "status") { requireMethod(request, "GET"); const runs = await runtime.runs.list(profile.id); return send(response, 200, { connectorId: profile.id, health: await runtime.health(), latestRun: runs[0] ? publicConnectorRun(runs.sort(byNewest)[0]!) : undefined }); }
    if (parts.length === 5 && parts[4] === "runs") { requireMethod(request, "GET"); return send(response, 200, { connectorId: profile.id, runs: (await runtime.runs.list(profile.id)).sort(byNewest).map(publicConnectorRun) }); }
    if (parts.length === 5 && parts[4] === "run") {
      requireMethod(request, "POST");
      const idempotencyKey = header(request, "idempotency-key");
      if (!idempotencyKey) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
      const body = await readBody(request);
      const mode = body.mode;
      if (!["snapshot", "incremental", "dry-run", "validate-only", "reconcile-only"].includes(String(mode))) throw new HttpError(400, "RUN_MODE_INVALID", "A supported connector run mode is required.");
      const result = await runtime.execute({ connectorId: profile.id, mode: mode as Parameters<SourceSyncRuntime["execute"]>[0]["mode"], authorization, idempotencyKey });
      return send(response, result.run.status === "completed" ? 200 : 422, { run: publicConnectorRun(result.run), report: result.report, reconciliation: result.reconciliation });
    }
  }

  if (parts[2] === "runs" && parts[3]) {
    const run = await runtime.runs.get(decodeURIComponent(parts[3]));
    if (!run) throw new HttpError(404, "RUN_NOT_FOUND", "Connector run not found.");
    const profile = requireProfile(runtime, run.connectorId);
    requireAuthorization(security, authorization, request.method === "POST" ? "source-sync:apply" : "source-sync:read", profile);
    if (parts.length === 4) { requireMethod(request, "GET"); return send(response, 200, { run: publicConnectorRun(run) }); }
    if (parts.length === 5 && parts[4] === "recover") { requireMethod(request, "POST"); requireIdempotencyKey(request); return send(response, 200, { run: publicConnectorRun((await runtime.service.recover(run.id)).run) }); }
  }

  if (parts[2] === "quarantine") {
    if (parts.length === 3) { requireMethod(request, "GET"); const items = []; for (const item of await runtime.quarantine.list()) { const profile = requireProfile(runtime, item.connectorId); if (allowed(security, authorization, "source-sync:read", profile)) items.push(item); } return send(response, 200, { items }); }
    const item = await runtime.quarantine.get(decodeURIComponent(parts[3] ?? ""));
    if (!item) throw new HttpError(404, "QUARANTINE_NOT_FOUND", "Quarantine item not found.");
    const profile = requireProfile(runtime, item.connectorId);
    requireAuthorization(security, authorization, parts[4] === "replay" ? "source-sync:apply" : "source-sync:read", profile);
    if (parts.length === 4) { requireMethod(request, "GET"); return send(response, 200, { item }); }
    if (parts.length === 5 && parts[4] === "replay") { requireMethod(request, "POST"); requireIdempotencyKey(request); return send(response, 200, { run: publicConnectorRun((await runtime.service.replayQuarantine(item.id, authorization)).run) }); }
  }

  if (parts[2] === "reconciliation" && parts[3]) {
    requireMethod(request, "GET");
    const run = await runtime.runs.get(decodeURIComponent(parts[3]));
    if (!run) throw new HttpError(404, "RUN_NOT_FOUND", "Connector run not found.");
    requireAuthorization(security, authorization, "source-sync:read", requireProfile(runtime, run.connectorId));
    return send(response, 200, { reconciliation: runtime.reconciliation.get(run.id) });
  }
  throw new HttpError(404, "ROUTE_NOT_FOUND", "Source synchronization route not found.");
}

function requireProfile(runtime: SourceSyncRuntime, id: string): ConnectorProfile { const profile = runtime.profiles.find((item) => item.id === id); if (!profile) throw new HttpError(404, "CONNECTOR_NOT_FOUND", "Connector not found."); return profile; }
function allowed(security: AgentApiSecurityRuntime, context: AgentAuthorizationContext, action: "source-sync:read" | "source-sync:apply", profile: ConnectorProfile): boolean { return security.authorizer.authorize(context, action, { type: "source-extract", id: profile.id, tenantId: profile.tenantId, domainIds: profile.allowedDomains }).decision === "allowed"; }
function requireAuthorization(security: AgentApiSecurityRuntime, context: AgentAuthorizationContext, action: "source-sync:read" | "source-sync:apply", profile: ConnectorProfile): void { if (!allowed(security, context, action, profile)) throw new HttpError(403, "AUTHORIZATION_DENIED", "The principal is not authorized for this connector."); }
function requireMethod(request: IncomingMessage, method: string): void { if (request.method !== method) throw new HttpError(405, "METHOD_NOT_ALLOWED", `Use ${method} for this endpoint.`); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
function requireIdempotencyKey(request: IncomingMessage): string { const value = header(request, "idempotency-key"); if (!value) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required."); return value; }
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> { const chunks: Buffer[] = []; let size = 0; for await (const value of request) { const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value); size += chunk.length; if (size > 32_768) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large."); chunks.push(chunk); } try { const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; } catch { throw new HttpError(400, "PAYLOAD_INVALID", "Request body must be a JSON object."); } }
function send(response: ServerResponse, status: number, payload: unknown): void { if (response.writableEnded) return; response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" }); response.end(payload === undefined ? undefined : JSON.stringify(payload)); }
function mapError(error: unknown): HttpError { if (error instanceof HttpError) return error; if (error instanceof AgentAuthenticationError) return new HttpError(401, error.code, error.message); return new HttpError(500, "SOURCE_SYNC_FAILED", "Source synchronization request failed."); }
function byNewest(left: { startedAt: string }, right: { startedAt: string }): number { return right.startedAt.localeCompare(left.startedAt); }
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
