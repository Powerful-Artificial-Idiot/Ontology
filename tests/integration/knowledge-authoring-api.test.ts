import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createAgentApi } from "../../services/agent-api/app";
import { createInMemoryAgentApiRuntime } from "../../services/agent-api/runtime";

describe("Phase 5E Knowledge Authoring API", () => {
  it("exposes governed schemas without internal paths and requires idempotency", async () => {
    const handler = createAgentApi(createInMemoryAgentApiRuntime());
    const catalog = await invoke(handler, "GET", "/api/knowledge-authoring/object-types");
    expect(catalog.status).toBe(200);
    expect(catalog.json.objectTypes).toHaveLength(6);
    expect(JSON.stringify(catalog.json)).not.toMatch(/\/Users\/|secretReference|Authorization/u);
    const schema = await invoke(handler, "GET", "/api/knowledge-authoring/object-types/Operation/schema");
    expect(schema.json.objectType).toMatchObject({ canonicalType: "Operation", idPrefix: "operation" });
    const occupied = await invoke(handler, "GET", "/api/knowledge-authoring/id-availability?type=Operation&canonicalId=operation.op30");
    expect(occupied.json).toMatchObject({ canonicalId: "operation.op30", syntaxValid: true, available: false });
    const available = await invoke(handler, "GET", "/api/knowledge-authoring/id-availability?type=Operation&canonicalId=operation.op99");
    expect(available.json).toMatchObject({ canonicalId: "operation.op99", syntaxValid: true, available: true });
    const missing = await invoke(handler, "POST", "/api/knowledge-authoring/change-sets", draftBody());
    expect(missing).toMatchObject({ status: 400, json: { error: { code: "IDEMPOTENCY_KEY_REQUIRED" } } });
  });

  it("runs create, submit, approve and publish without exposing authorization snapshots", async () => {
    const handler = createAgentApi(createInMemoryAgentApiRuntime());
    const created = await invoke(handler, "POST", "/api/knowledge-authoring/change-sets", draftBody(), { "idempotency-key": "api-create-op61" });
    expect(created.status).toBe(201);
    expect(created.json.authorizationSnapshot).toBeUndefined();
    const id = String(created.json.id);
    const direct = await invoke(handler, "POST", `/api/knowledge-authoring/change-sets/${encodeURIComponent(id)}/publish`, {}, { "idempotency-key": "api-direct-op61" });
    expect(direct).toMatchObject({ status: 409, json: { error: { code: "INVALID_AUTHORING_STATE_TRANSITION" } } });
    expect((await action(handler, id, "submit")).json.status).toBe("submitted");
    expect((await action(handler, id, "approve")).json.status).toBe("approved");
    expect((await action(handler, id, "publish")).json.status).toBe("published");
    const audit = await invoke(handler, "GET", `/api/knowledge-authoring/change-sets/${encodeURIComponent(id)}/audit`);
    expect(audit.json.events.map((event: { action: string }) => event.action)).toEqual(expect.arrayContaining(["AUTHORING_SUBMITTED", "AUTHORING_APPROVED", "AUTHORING_PUBLISHED"]));
    expect(JSON.stringify(audit.json)).not.toMatch(/Bearer|Authorization|token/u);
  });
});

function draftBody() { return { title: "Create OP61", domain: "production", entityMutations: [{ operation: "create", canonicalId: "operation.op61", canonicalType: "Operation", proposedVersion: "1.0", properties: { label: "OP61", description: "Governed API operation", status: "active", owner: "Owner", operationCode: "OP61" }, ownershipMode: "manual" }], relationMutations: [] }; }
async function action(handler: ReturnType<typeof createAgentApi>, id: string, name: string) { return invoke(handler, "POST", `/api/knowledge-authoring/change-sets/${encodeURIComponent(id)}/${name}`, {}, { "idempotency-key": `api-${name}-op61` }); }
async function invoke(handler: ReturnType<typeof createAgentApi>, method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, any> }> {
  const serialized = body === undefined ? "" : JSON.stringify(body);
  const request = Readable.from(serialized ? [Buffer.from(serialized)] : []) as unknown as Parameters<typeof handler>[0];
  Object.assign(request, { method, url, headers: { ...headers, ...(serialized ? { "content-type": "application/json" } : {}) } });
  return new Promise((resolve, reject) => {
    let status = 200; let output = "";
    const response = { writableEnded: false, destroyed: false, headersSent: false, statusCode: 200, writeHead(code: number) { status = code; this.statusCode = code; this.headersSent = true; return this; }, end(value?: string) { this.writableEnded = true; output += value ?? ""; try { resolve({ status, json: output ? JSON.parse(output) as Record<string, any> : {} }); } catch (error) { reject(error); } } } as unknown as Parameters<typeof handler>[1];
    handler(request, response);
  });
}
