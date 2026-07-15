import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockKnowledgeApi } from "../../services/mock-knowledge-api/app";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { knowledgeIds } from "../../src/data/mockKnowledgeRegistry/ids";

describe("Mock Knowledge API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await startApi(new MockKnowledgeRepository()));
  });

  afterAll(async () => {
    await closeServer(server);
  });

  it("reports service metadata without exposing local paths", async () => {
    const response = await fetch(`${baseUrl}/api/meta`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ contractVersion: "1.1.0", ontologyVersion: "1.1.0", dataVersion: "0.5.0" });
    expect(JSON.stringify(payload)).not.toContain("/Users/");
  });

  it("serves entity, relation, graph, ontology, and catalog resources", async () => {
    const [entity, relations, graph, ontology, catalog] = await Promise.all([
      fetchJson(`${baseUrl}/api/entities/${knowledgeIds.operation.op30}`),
      fetchJson(`${baseUrl}/api/entities/OP30/relations`),
      fetchJson(`${baseUrl}/api/graph/views/production`),
      fetchJson(`${baseUrl}/api/ontology/graph`),
      fetchJson(`${baseUrl}/api/semantic/catalog`),
    ]);

    expect(entity.payload.label).toBe("OP30 Leak Test");
    expect(Array.isArray(relations.payload)).toBe(true);
    expect(graph.payload.nodes).toHaveLength(9);
    expect(ontology.payload.classes).toHaveLength(29);
    expect(catalog.payload.concepts).toHaveLength(11);
  });

  it("serves semantic search through POST", async () => {
    const response = await fetch(`${baseUrl}/api/semantic/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Leak Rate" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.total).toBeGreaterThan(0);
  });

  it("returns stable 400, 404, and 405 error envelopes", async () => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/graph/views/unknown`),
      fetch(`${baseUrl}/api/entities/not-found`),
      fetch(`${baseUrl}/api/semantic/search`, { method: "GET" }),
      fetch(`${baseUrl}/api/semantic/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([400, 404, 405, 400]);
    expect(payloads.map((payload) => payload.error.code)).toEqual(["INVALID_VIEW", "ENTITY_NOT_FOUND", "METHOD_NOT_ALLOWED", "INVALID_JSON"]);
    expect(payloads.every((payload) => payload.error.traceId)).toBe(true);
  });

  it("hides internal repository errors", async () => {
    class FailingRepository extends MockKnowledgeRepository {
      override async getSemanticCatalog(): Promise<never> {
        throw new Error("sensitive /Users/example/private-path");
      }
    }
    const failing = await startApi(new FailingRepository());
    try {
      const response = await fetch(`${failing.baseUrl}/api/semantic/catalog`);
      const payload = await response.json();
      expect(response.status).toBe(500);
      expect(payload.error.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(payload)).not.toContain("/Users/");
    } finally {
      await closeServer(failing.server);
    }
  });
});

async function fetchJson(url: string) {
  const response = await fetch(url);
  return { response, payload: await response.json() };
}

async function startApi(repository: MockKnowledgeRepository) {
  const server = createServer(createMockKnowledgeApi(repository));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock API did not allocate a TCP port.");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
