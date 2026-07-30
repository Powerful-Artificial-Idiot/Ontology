import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentAuditStore } from "../../packages/agent-core/src/index";
import type { AgentApiSecurityRuntime } from "../agent-api/security";
import type { PersonalKnowledgeSnapshotIngestionService } from "../../packages/snapshot-knowledge-repository/src/ingestion";
import {
  PERSONAL_KNOWLEDGE_DOMAIN,
  PersonalKnowledgeQueryError,
  PersonalKnowledgeQueryService,
  type PersonalKnowledgeQueryRequest,
} from "../../packages/snapshot-knowledge-repository/src/query";

export type PersonalKnowledgeApiRuntime = {
  ingestion: PersonalKnowledgeSnapshotIngestionService;
  query: PersonalKnowledgeQueryService;
  security: AgentApiSecurityRuntime;
  audit: AgentAuditStore;
};

export function createPersonalKnowledgeApiHandler(runtime: PersonalKnowledgeApiRuntime) {
  return async (request: IncomingMessage, response: ServerResponse, traceId: string): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/^\/api\/personal-knowledge\/?/, "");
    if (request.method === "OPTIONS") return send(response, 204, undefined, traceId);
    if (path === "status" && request.method === "GET") {
      const info = runtime.ingestion.getActiveSnapshotInfo();
      return send(response, 200, { available: Boolean(info), ...(info ?? {}) }, traceId);
    }
    if (path === "query" && request.method === "POST") {
      const authorization = await runtime.security.authenticator.authenticate(request, traceId);
      const domains = new Set(authorization.principal.domainIds.map((value) => value.toLowerCase()));
      if (!domains.has("*") && !domains.has(PERSONAL_KNOWLEDGE_DOMAIN)) {
        await runtime.audit.append({
          id: `audit.personal.${randomUUID()}`,
          traceId,
          actorId: authorization.principal.id,
          action: "personal_query_rejected",
          resourceIds: ["domain.personal-knowledge"],
          outcome: "denied",
          occurredAt: new Date().toISOString(),
          metadata: { reason: "domain-denied" },
        });
        return send(response, 403, { error: { code: "AUTHORIZATION_DENIED", message: "The principal cannot access the personal-knowledge domain." }, traceId }, traceId);
      }
      const body = await readBody(request);
      if (!isRecord(body)) return send(response, 400, { error: { code: "INVALID_REQUEST", message: "Request body must be a JSON object." }, traceId }, traceId);
      try {
        const result = await runtime.query.query(body as PersonalKnowledgeQueryRequest, authorization.principal.id, traceId);
        return send(response, 200, result, traceId);
      } catch (error) {
        if (error instanceof PersonalKnowledgeQueryError) {
          const status = error.code === "SNAPSHOT_UNAVAILABLE" ? 503 : error.code === "DOMAIN_MISMATCH" ? 409 : error.code === "INVALID_REQUEST" ? 400 : 422;
          return send(response, status, { error: { code: error.code, message: error.message }, traceId }, traceId);
        }
        throw error;
      }
    }
    send(response, 404, { error: { code: "NOT_FOUND", message: "Personal Knowledge route not found." }, traceId }, traceId);
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > 64 * 1024) throw new PersonalKnowledgeQueryError("INVALID_REQUEST", "Request body exceeds 64 KiB.");
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function send(response: ServerResponse, status: number, payload: unknown, traceId: string): void {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Trace-Id": traceId,
  });
  response.end(payload === undefined ? undefined : JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
