import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { GraphTraversalRequest, GraphViewRequest, KnowledgeRepository, SemanticSearchRequest } from "../../packages/knowledge-contracts/src/index";
import { supportedKnowledgeVersions } from "../../src/repositories/semanticCatalogValidation";

type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    traceId: string;
  };
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function createMockKnowledgeApi(repository: KnowledgeRepository) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const traceId = randomUUID();
    handleRequest(repository, request, response, traceId).catch((error: unknown) => {
      const apiError = error instanceof ApiError
        ? error
        : new ApiError(500, "INTERNAL_ERROR", "The Mock Knowledge API could not complete the request.");
      sendJson<ApiErrorPayload>(response, apiError.status, {
        error: {
          code: apiError.code,
          message: apiError.message,
          details: apiError.details,
          traceId,
        },
      }, traceId);
    });
  };
}

async function handleRequest(repository: KnowledgeRepository, request: IncomingMessage, response: ServerResponse, traceId: string) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(traceId));
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.shift() !== "api") throw new ApiError(404, "ROUTE_NOT_FOUND", "Knowledge API route not found.");

  if (segments.length === 1 && segments[0] === "meta") {
    requireMethod(request, "GET");
    sendJson(response, 200, {
      service: "mock-knowledge-api",
      demoAppVersion: "0.1.0",
      contractVersion: "1.1.0",
      ontologyVersion: supportedKnowledgeVersions.ontologyVersion,
      dataVersion: supportedKnowledgeVersions.dataVersion,
      capabilities: ["entities", "relations", "graph", "ontology", "semantic-catalog", "semantic-search"],
    }, traceId);
    return;
  }

  if (segments[0] === "entities" && segments[1]) {
    requireMethod(request, "GET");
    const id = decodeURIComponent(segments[1]);
    if (segments.length === 3 && segments[2] === "relations") {
      sendJson(response, 200, await repository.getEntityRelations(id), traceId);
      return;
    }
    if (segments.length === 2) {
      const entity = await repository.getEntityById(id);
      if (!entity) throw new ApiError(404, "ENTITY_NOT_FOUND", `Knowledge entity ${id} was not found.`, { entityId: id });
      sendJson(response, 200, entity, traceId);
      return;
    }
  }

  if (segments.length === 1 && segments[0] === "relations") {
    requireMethod(request, "GET");
    const entityId = url.searchParams.get("entityId");
    if (!entityId) throw new ApiError(400, "ENTITY_ID_REQUIRED", "The entityId query parameter is required.");
    sendJson(response, 200, await repository.getEntityRelations(entityId), traceId);
    return;
  }

  if (segments.length === 3 && segments[0] === "graph" && segments[1] === "views") {
    requireMethod(request, "GET");
    const viewId = segments[2] as GraphViewRequest["viewId"];
    if (!(["production", "quality", "engineering", "valueStream"] as string[]).includes(viewId)) {
      throw new ApiError(400, "INVALID_VIEW", `Unsupported graph view ${segments[2]}.`);
    }
    sendJson(response, 200, await repository.getGraphView({
      viewId,
      asOf: url.searchParams.get("asOf") ?? undefined,
      ontologyVersion: url.searchParams.get("ontologyVersion") ?? undefined,
    }), traceId);
    return;
  }

  if (segments.length === 2 && segments[0] === "graph" && segments[1] === "traverse") {
    requireMethod(request, "POST");
    const body = await readJson(request);
    if (!isGraphTraversalRequest(body)) throw new ApiError(400, "INVALID_GRAPH_TRAVERSAL", "A bounded read-only graph traversal request is required.");
    sendJson(response, 200, await repository.traverseGraph(body), traceId);
    return;
  }

  if (segments.length === 2 && segments[0] === "ontology" && segments[1] === "graph") {
    requireMethod(request, "GET");
    sendJson(response, 200, await repository.getOntologyGraph({
      domain: url.searchParams.get("domain") ?? undefined,
      version: url.searchParams.get("version") ?? undefined,
    }), traceId);
    return;
  }

  if (segments.length === 2 && segments[0] === "semantic" && segments[1] === "catalog") {
    requireMethod(request, "GET");
    sendJson(response, 200, await repository.getSemanticCatalog(), traceId);
    return;
  }

  if (segments.length === 2 && segments[0] === "semantic" && segments[1] === "search") {
    requireMethod(request, "POST");
    const body = await readJson(request);
    if (!isRecord(body) || typeof body.query !== "string" || !body.query.trim()) {
      throw new ApiError(400, "INVALID_SEARCH", "Semantic search requires a non-empty query.");
    }
    const search: SemanticSearchRequest = {
      query: body.query,
      domain: typeof body.domain === "string" ? body.domain : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
      asOf: typeof body.asOf === "string" ? body.asOf : undefined,
    };
    sendJson(response, 200, await repository.searchSemantic(search), traceId);
    return;
  }

  throw new ApiError(404, "ROUTE_NOT_FOUND", "Knowledge API route not found.");
}

function requireMethod(request: IncomingMessage, expected: string) {
  if (request.method !== expected) throw new ApiError(405, "METHOD_NOT_ALLOWED", `Use ${expected} for this endpoint.`, { allowed: [expected] });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request payload exceeds 1 MB.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function sendJson<T>(response: ServerResponse, status: number, payload: T, traceId: string) {
  if (response.headersSent) return;
  response.writeHead(status, { ...corsHeaders(traceId), "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function corsHeaders(traceId: string) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "X-Trace-Id": traceId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGraphTraversalRequest(value: unknown): value is GraphTraversalRequest {
  return isRecord(value)
    && typeof value.graphPlanId === "string"
    && typeof value.templateId === "string"
    && value.readOnly === true
    && Array.isArray(value.seedEntityIds)
    && value.seedEntityIds.every((id) => typeof id === "string")
    && Array.isArray(value.allowedRelationTypes)
    && value.allowedRelationTypes.every((type) => typeof type === "string")
    && typeof value.maxDepth === "number" && value.maxDepth >= 0 && value.maxDepth <= 3
    && typeof value.resultLimit === "number" && value.resultLimit >= 1 && value.resultLimit <= 200
    && (value.status === undefined || typeof value.status === "string");
}
