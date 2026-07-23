import { Readable } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSourceSyncApi } from "../../services/source-sync-api/app";
import { createSourceSyncRuntime } from "../../services/source-sync/runtime";
import { createAgentApiSecurity } from "../../services/agent-api/security";

describe("protected Source Sync API", () => {
  it("lists sanitized connectors and exposes source-sync health", async () => {
    const runtime = await createSourceSyncRuntime({ dataDirectory: await directory() });
    const handler = createSourceSyncApi(runtime, createAgentApiSecurity({ MKG_AGENT_AUTH_MODE: "disabled" }));
    const health = await invoke(handler, "GET", "/api/source-sync/health");
    expect(health.status).toBe(200);
    expect(health.json.sourceSync).toMatchObject({ status: "available", configuredConnectors: 6, enabledConnectors: 6 });
    const list = await invoke(handler, "GET", "/api/source-sync/connectors");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain("secretReference");
    expect(JSON.stringify(list.json)).not.toContain("Authorization");
  });

  it("requires an idempotency key and returns a sanitized completed controlled-file run", async () => {
    const runtime = await createSourceSyncRuntime({ dataDirectory: await directory() });
    const handler = createSourceSyncApi(runtime, createAgentApiSecurity({ MKG_AGENT_AUTH_MODE: "disabled" }));
    const missing = await invoke(handler, "POST", "/api/source-sync/connectors/connector.mes.controlled-file/run", { mode: "snapshot" });
    expect(missing).toMatchObject({ status: 400, json: { error: { code: "IDEMPOTENCY_KEY_REQUIRED" } } });
    const dryRun = await invoke(handler, "POST", "/api/source-sync/connectors/connector.mes.controlled-file/run", { mode: "dry-run" }, { "idempotency-key": "api-test-dry-run" });
    expect(dryRun).toMatchObject({ status: 200, json: { run: { status: "completed" }, report: { mode: "dry-run" } } });
    expect(dryRun.json.report.checkpoint).toBeUndefined();
    expect((await runtime.syncStore.getSnapshot()).checkpoints).toHaveLength(0);
    const response = await invoke(handler, "POST", "/api/source-sync/connectors/connector.mes.controlled-file/run", { mode: "snapshot" }, { "idempotency-key": "api-test-run-1" });
    expect(response.status).toBe(200);
    expect(response.json.run.status).toBe("completed");
    expect(response.json.run.authorizationSnapshot).toBeUndefined();
    expect(JSON.stringify(response.json)).not.toContain("payload");
    expect(JSON.stringify(response.json)).not.toContain("secretReference");
    expect(runtime.audit.events.map((item) => item.action)).toEqual(expect.arrayContaining(["source-sync.requested", "source-sync.source-authentication", "source-sync.publication-authorization", "source-sync.publication-commit", "source-sync.checkpoint-commit", "source-sync.reconciliation"]));
    expect(JSON.stringify(runtime.audit.events)).not.toMatch(/Authorization|Bearer|recordChecksum|"payload"/u);
    const replay = await invoke(handler, "POST", "/api/source-sync/connectors/connector.mes.controlled-file/run", { mode: "snapshot" }, { "idempotency-key": "api-test-run-1" });
    expect(replay.json.run.id).toBe(response.json.run.id);
    expect((await runtime.runs.list("connector.mes.controlled-file")).filter((item) => item.id === response.json.run.id)).toHaveLength(1);
  });

  it("fails closed for missing bearer authentication and denied tenant/domain scope", async () => {
    const runtime = await createSourceSyncRuntime({ dataDirectory: await directory() });
    const security = createAgentApiSecurity({
      MKG_AGENT_SECURITY_PROFILE: "production",
      MKG_AGENT_AUTH_MODE: "static-bearer",
      MKG_AGENT_AUTH_STATIC_TOKEN: "api-test-token-123456789",
      MKG_AGENT_AUTH_PRINCIPAL_ID: "principal.api-test",
      MKG_AGENT_AUTH_TENANT_ID: "tenant.other",
      MKG_AGENT_AUTH_ROLE_IDS: "source-sync-operator",
      MKG_AGENT_AUTH_DOMAIN_IDS: "production",
    });
    const handler = createSourceSyncApi(runtime, security);
    expect((await invoke(handler, "GET", "/api/source-sync/connectors")).status).toBe(401);
    const denied = await invoke(handler, "GET", "/api/source-sync/connectors/connector.mes.controlled-file", undefined, { authorization: "Bearer api-test-token-123456789" });
    expect(denied).toMatchObject({ status: 403, json: { error: { code: "AUTHORIZATION_DENIED" } } });
  });
});

async function directory(): Promise<string> { return mkdtemp(join(tmpdir(), "source-sync-api-")); }

type Handler = ReturnType<typeof createSourceSyncApi>;
async function invoke(handler: Handler, method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, any> }> {
  const serialized = body === undefined ? "" : JSON.stringify(body);
  const request = Readable.from(serialized ? [Buffer.from(serialized)] : []) as unknown as Parameters<Handler>[0];
  Object.assign(request, { method, url, headers: { ...headers, ...(serialized ? { "content-type": "application/json" } : {}) } });
  return new Promise((resolve, reject) => {
    let status = 200;
    let output = "";
    const response = {
      writableEnded: false,
      writeHead(code: number) { status = code; return this; },
      end(value?: string) {
        this.writableEnded = true;
        output += value ?? "";
        try { resolve({ status, json: output ? JSON.parse(output) as Record<string, any> : {} }); } catch (error) { reject(error); }
      },
    } as unknown as Parameters<Handler>[1];
    handler(request, response);
  });
}
