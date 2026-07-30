import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentApi } from "../../services/agent-api/app";
import { createInMemoryAgentApiRuntime } from "../../services/agent-api/runtime";
import { createPersonalKnowledgeApiHandler } from "../../services/personal-knowledge-api/handler";
import { PersonalKnowledgeSnapshotIngestionService } from "../../packages/snapshot-knowledge-repository/src/ingestion";
import { PersonalKnowledgeQueryService } from "../../packages/snapshot-knowledge-repository/src/query";

const fixture = resolve(process.cwd(), "tests/fixtures/personal-knowledge-artifact");
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolveClose) => server.close(() => resolveClose()))));
});

async function start(active = true, invalidCitations = false) {
  const runtime = createInMemoryAgentApiRuntime();
  const ingestion = await PersonalKnowledgeSnapshotIngestionService.create({ runtimeDirectory: mkdtempSync(resolve(tmpdir(), "personal-api-")), audit: runtime.audit });
  if (active) await ingestion.ingestCandidate({ artifactDirectory: fixture });
  const query = new PersonalKnowledgeQueryService(ingestion, runtime.audit, invalidCitations ? { validate: async () => ({ status: "failed", checkedClaimIds: [], issues: [{ claimId: "fixture", code: "missing-citation", message: "fixture" }] }) } : undefined);
  runtime.personalKnowledge = ingestion;
  runtime.personalKnowledgeHandler = createPersonalKnowledgeApiHandler({ ingestion, query, security: runtime.security!, audit: runtime.audit });
  const server = createServer(createAgentApi(runtime));
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  return { baseUrl: `http://127.0.0.1:${address.port}/api/personal-knowledge`, runtime };
}

describe("Personal Knowledge read-only API", () => {
  it("reports sanitized active status and returns governed evidence, trace, and citations", async () => {
    const { baseUrl } = await start();
    const status = await fetch(`${baseUrl}/status`).then((response) => response.json()) as Record<string, unknown>;
    expect(status).toMatchObject({ available: true, schemaVersion: "0.1.0", objectCount: 28, relationCount: 50 });
    expect(JSON.stringify(status)).not.toContain(process.cwd());

    const response = await fetch(`${baseUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: "personal-knowledge", question: "find documents related to Knowledge Engineering", limit: 5 }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.plan).toMatchObject({ domain: "personal-knowledge", operation: "find-documents-related-to" });
    expect(body.evidencePack.items.length).toBeGreaterThan(0);
    expect(body.evidencePack.items.every((item: any) => item.personalKnowledge.sourceUrl.startsWith("https://"))).toBe(true);
    expect(body.citationValidation.status).toBe("passed");
    expect(body.trace.stages.map((stage: any) => stage.stage)).toEqual(["query-plan-validation", "graph-retrieval", "evidence-pack", "citation-validation"]);
  });

  it("rejects cross-domain and unknown operations", async () => {
    const { baseUrl } = await start();
    const crossDomain = await fetch(`${baseUrl}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "manufacturing-knowledge", question: "find content about Knowledge Engineering" }) });
    expect(crossDomain.status).toBe(409);
    const unknown = await fetch(`${baseUrl}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "personal-knowledge", operation: "arbitrary-cypher", concept: "Knowledge Engineering" }) });
    expect(unknown.status).toBe(422);
  });

  it("fails closed when no snapshot is active", async () => {
    const { baseUrl } = await start(false);
    expect(await fetch(`${baseUrl}/status`).then((response) => response.json())).toMatchObject({ available: false });
    const response = await fetch(`${baseUrl}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "personal-knowledge", question: "find content about Knowledge Engineering" }) });
    expect(response.status).toBe(503);
  });

  it("blocks publication and audits a citation validation failure", async () => {
    const { baseUrl, runtime } = await start(true, true);
    const response = await fetch(`${baseUrl}/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: "personal-knowledge", question: "find content about Knowledge Engineering" }) });
    expect(response.status).toBe(422);
    expect(runtime.audit.list().map((event) => event.action)).toContain("citation_validation_failed");
  });
});
