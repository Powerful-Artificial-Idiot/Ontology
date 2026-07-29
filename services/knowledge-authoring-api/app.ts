import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { EntityMutation, RelationMutation } from "../../packages/knowledge-contracts/src/index";
import {
  authoringObjectTypes,
  authoringRelationOptions,
  getAuthoringType,
  KnowledgeAuthoringError,
  type KnowledgeAuthoringService,
  suggestCanonicalId,
} from "../../packages/knowledge-authoring/src/index";
import type { AgentApiSecurityRuntime } from "../agent-api/security";

export type KnowledgeAuthoringApiRuntime = {
  service: KnowledgeAuthoringService;
  security: AgentApiSecurityRuntime;
};

export function createKnowledgeAuthoringHandler(runtime: KnowledgeAuthoringApiRuntime) {
  return async (request: IncomingMessage, response: ServerResponse, traceId = `authoring-trace.${randomUUID()}`): Promise<void> => {
    try {
      await handle(runtime, request, response, traceId);
    } catch (error) {
      const mapped = mapError(error);
      sendJson(response, mapped.status, { error: { code: mapped.code, message: mapped.message, details: mapped.details }, traceId }, traceId);
    }
  };
}

async function handle(runtime: KnowledgeAuthoringApiRuntime, request: IncomingMessage, response: ServerResponse, traceId: string) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers(traceId));
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.shift() !== "api" || segments.shift() !== "knowledge-authoring") throw new KnowledgeAuthoringError("ROUTE_NOT_FOUND", "Knowledge authoring route not found.", 404);
  const authorization = await runtime.security.authenticator.authenticate(request, traceId);

  if (segments.length === 1 && segments[0] === "object-types") {
    method(request, "GET");
    sendJson(response, 200, { objectTypes: authoringObjectTypes }, traceId);
    return;
  }
  if (segments.length === 3 && segments[0] === "object-types" && segments[2] === "schema") {
    method(request, "GET");
    const definition = authoringObjectTypes.find((item) => item.canonicalType === decodeURIComponent(segments[1]));
    if (!definition) throw new KnowledgeAuthoringError("OBJECT_TYPE_NOT_FOUND", "Authoring object type not found.", 404);
    sendJson(response, 200, { objectType: definition }, traceId);
    return;
  }
  if (segments.length === 1 && segments[0] === "relation-options") {
    method(request, "GET");
    const sourceType = url.searchParams.get("sourceCanonicalType");
    const targetType = url.searchParams.get("targetCanonicalType");
    const domain = url.searchParams.get("domain");
    sendJson(response, 200, { relationOptions: authoringRelationOptions.filter((option) =>
      (!sourceType || option.sourceCanonicalType === sourceType)
      && (!targetType || option.targetCanonicalType === targetType)
      && (!domain || getAuthoringType(option.sourceCanonicalType)?.domain === domain || getAuthoringType(option.targetCanonicalType)?.domain === domain)) }, traceId);
    return;
  }
  if (segments.length === 1 && segments[0] === "id-availability") {
    method(request, "GET");
    const type = url.searchParams.get("type") ?? "";
    const label = url.searchParams.get("label") ?? "";
    const canonicalId = url.searchParams.get("canonicalId") ?? suggestCanonicalId(type, label);
    const availability = canonicalId
      ? await runtime.service.checkIdAvailability(type, canonicalId, authorization)
      : { available: false, syntaxValid: false, issues: [] };
    sendJson(response, 200, { canonicalId, ...availability }, traceId);
    return;
  }
  if (segments.length === 1 && segments[0] === "change-sets") {
    if (request.method === "GET") {
      const values = await runtime.service.list(authorization, url.searchParams.get("domain") ?? undefined);
      sendJson(response, 200, { changeSets: values.map(publicChangeSet) }, traceId);
      return;
    }
    method(request, "POST");
    const body = record(await readJson(request));
    const result = await runtime.service.createDraft({
      title: text(body.title, "title"),
      description: optionalText(body.description),
      domain: text(body.domain, "domain"),
      entityMutations: mutations(body.entityMutations, "entityMutations") as EntityMutation[],
      relationMutations: mutations(body.relationMutations, "relationMutations") as RelationMutation[],
      expectedVersions: stringRecord(body.expectedVersions),
    }, command(request, authorization, optionalText(body.comment)));
    sendJson(response, 201, publicChangeSet(result), traceId);
    return;
  }

  if (segments[0] !== "change-sets" || !segments[1]) throw new KnowledgeAuthoringError("ROUTE_NOT_FOUND", "Knowledge authoring route not found.", 404);
  const changeSetId = decodeURIComponent(segments[1]);
  if (segments.length === 2) {
    if (request.method === "GET") {
      sendJson(response, 200, publicChangeSet(await runtime.service.get(changeSetId, authorization)), traceId);
      return;
    }
    if (request.method === "DELETE") {
      const deleted = await runtime.service.deleteDraft(changeSetId, command(request, authorization));
      sendJson(response, 200, { deletedChangeSetId: deleted.id }, traceId);
      return;
    }
    method(request, "PATCH");
    const body = record(await readJson(request));
    const result = await runtime.service.updateDraft(changeSetId, {
      title: optionalText(body.title),
      description: optionalText(body.description),
      entityMutations: body.entityMutations === undefined ? undefined : mutations(body.entityMutations, "entityMutations") as EntityMutation[],
      relationMutations: body.relationMutations === undefined ? undefined : mutations(body.relationMutations, "relationMutations") as RelationMutation[],
      expectedVersions: body.expectedVersions === undefined ? undefined : stringRecord(body.expectedVersions),
    }, command(request, authorization, optionalText(body.comment)));
    sendJson(response, 200, publicChangeSet(result), traceId);
    return;
  }
  if (segments.length === 3 && segments[2] === "diff") {
    method(request, "GET");
    sendJson(response, 200, await runtime.service.diff(changeSetId, authorization), traceId);
    return;
  }
  if (segments.length === 3 && segments[2] === "audit") {
    method(request, "GET");
    sendJson(response, 200, { events: await runtime.service.audit(changeSetId, authorization) }, traceId);
    return;
  }
  if (segments.length === 3) {
    method(request, "POST");
    const body = record(await readJson(request));
    const workflowCommand = command(request, authorization, optionalText(body.comment));
    const actions = {
      validate: () => runtime.service.validate(changeSetId, workflowCommand),
      submit: () => runtime.service.submit(changeSetId, workflowCommand),
      "request-changes": () => runtime.service.requestChanges(changeSetId, workflowCommand),
      reject: () => runtime.service.reject(changeSetId, workflowCommand),
      approve: () => runtime.service.approve(changeSetId, workflowCommand),
      "withdraw-approval": () => runtime.service.withdrawApproval(changeSetId, workflowCommand),
      publish: () => runtime.service.publish(changeSetId, workflowCommand),
      withdraw: () => runtime.service.withdraw(changeSetId, workflowCommand),
    } as const;
    const action = actions[segments[2] as keyof typeof actions];
    if (!action) throw new KnowledgeAuthoringError("ROUTE_NOT_FOUND", "Knowledge authoring action not found.", 404);
    sendJson(response, 200, publicChangeSet(await action()), traceId);
    return;
  }
  throw new KnowledgeAuthoringError("ROUTE_NOT_FOUND", "Knowledge authoring route not found.", 404);
}

function command(request: IncomingMessage, authorization: Awaited<ReturnType<AgentApiSecurityRuntime["authenticator"]["authenticate"]>>, comment?: string) {
  const raw = request.headers["idempotency-key"];
  const idempotencyKey = Array.isArray(raw) ? raw[0] : raw;
  if (!idempotencyKey) throw new KnowledgeAuthoringError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.", 400);
  return { authorization, idempotencyKey, comment };
}

function publicChangeSet<T extends { authorizationSnapshot: unknown }>(changeSet: T): Omit<T, "authorizationSnapshot"> {
  const result = { ...changeSet };
  delete (result as { authorizationSnapshot?: unknown }).authorizationSnapshot;
  return result;
}

function method(request: IncomingMessage, expected: string) { if (request.method !== expected) throw new KnowledgeAuthoringError("METHOD_NOT_ALLOWED", `Use ${expected} for this endpoint.`, 405); }
async function readJson(request: IncomingMessage): Promise<unknown> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.length; if (size > 256_000) throw new KnowledgeAuthoringError("REQUEST_TOO_LARGE", "Knowledge authoring request exceeds 256 KB.", 413); chunks.push(buffer); } try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new KnowledgeAuthoringError("REQUEST_INVALID", "Request body must be valid JSON.", 400); } }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new KnowledgeAuthoringError("REQUEST_INVALID", "Request body must be an object.", 400); return value as Record<string, unknown>; }
function text(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim() || value.length > 500) throw new KnowledgeAuthoringError("REQUEST_INVALID", `${field} must contain 1 to 500 characters.`, 422); return value.trim(); }
function optionalText(value: unknown): string | undefined { if (value === undefined || value === null || value === "") return undefined; if (typeof value !== "string" || value.length > 4_000) throw new KnowledgeAuthoringError("REQUEST_INVALID", "Text field is invalid or too long.", 422); return value.trim() || undefined; }
function mutations(value: unknown, field: string): unknown[] { if (value === undefined) return []; if (!Array.isArray(value) || value.length > 100 || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new KnowledgeAuthoringError("REQUEST_INVALID", `${field} must be an array of at most 100 objects.`, 422); return value; }
function stringRecord(value: unknown): Record<string, string> { if (value === undefined) return {}; const input = record(value); if (Object.values(input).some((item) => typeof item !== "string")) throw new KnowledgeAuthoringError("REQUEST_INVALID", "expectedVersions values must be strings.", 422); return input as Record<string, string>; }
function sendJson(response: ServerResponse, status: number, payload: unknown, traceId: string) { if (response.headersSent || response.destroyed) return; response.writeHead(status, { ...headers(traceId), "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(payload)); }
function headers(traceId: string) { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Cache-Control": "no-store", "X-Trace-Id": traceId }; }
function mapError(error: unknown): { status: number; code: string; message: string; details?: unknown } { if (error instanceof KnowledgeAuthoringError) return error; if (error instanceof Error && error.name === "AgentAuthenticationError") return { status: 401, code: "AUTHENTICATION_REQUIRED", message: error.message }; return { status: 500, code: "AUTHORING_FAILED", message: "The governed knowledge authoring request failed." }; }
