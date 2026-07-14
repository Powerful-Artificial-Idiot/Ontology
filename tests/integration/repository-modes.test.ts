import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpKnowledgeRepository, KnowledgeApiError } from "../../packages/ontology-client/src/index";
import { createMockKnowledgeApi } from "../../services/mock-knowledge-api/app";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import type { ViewMode } from "../../src/types";

describe("Local and HTTP knowledge repository modes", () => {
  const local = new MockKnowledgeRepository();
  let server: Server;
  let http: HttpKnowledgeRepository;

  beforeAll(async () => {
    server = createServer(createMockKnowledgeApi(local));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Mock API did not allocate a TCP port.");
    http = new HttpKnowledgeRepository({ baseUrl: `http://127.0.0.1:${address.port}/api`, timeoutMs: 2_000 });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("returns equivalent graph, ontology, and semantic catalog baselines", async () => {
    const views: ViewMode[] = ["production", "quality", "engineering", "valueStream"];
    const [localGraphs, httpGraphs, localOntology, httpOntology, localCatalog, httpCatalog] = await Promise.all([
      Promise.all(views.map((viewId) => local.getGraphView({ viewId }))),
      Promise.all(views.map((viewId) => http.getGraphView({ viewId }))),
      local.getOntologyGraph({}),
      http.getOntologyGraph({}),
      local.getSemanticCatalog(),
      http.getSemanticCatalog(),
    ]);

    expect(httpGraphs.map((graph) => graph.nodes.map((node) => node.id)))
      .toEqual(localGraphs.map((graph) => graph.nodes.map((node) => node.id)));
    expect(httpGraphs.map((graph) => graph.edges.map((edge) => edge.id)))
      .toEqual(localGraphs.map((graph) => graph.edges.map((edge) => edge.id)));
    expect(httpOntology.classes.map((item) => item.name)).toEqual(localOntology.classes.map((item) => item.name));
    expect(httpCatalog.concepts.map((item) => item.id)).toEqual(localCatalog.concepts.map((item) => item.id));
  });

  it("maps entity 404 responses to null", async () => {
    await expect(http.getEntityById("missing-entity")).resolves.toBeNull();
  });
});

describe("HTTP repository resilience", () => {
  it("aborts requests at the configured timeout", async () => {
    const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as typeof fetch;
    const repository = new HttpKnowledgeRepository({ baseUrl: "http://127.0.0.1/api", timeoutMs: 5, fetcher });

    await expect(repository.getSemanticCatalog()).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects incompatible response versions", async () => {
    const fetcher = (async () => new Response(JSON.stringify({
      metadata: { contractVersion: "2.0.0", ontologyVersion: "9.0.0", dataVersion: "9.0.0", traceId: "test", generatedAt: "2026-07-14T00:00:00Z" },
      concepts: [], entities: [], mappings: [], lanes: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    const repository = new HttpKnowledgeRepository({ baseUrl: "http://127.0.0.1/api", fetcher });

    await expect(repository.getSemanticCatalog()).rejects.toMatchObject<Partial<KnowledgeApiError>>({ code: "VERSION_MISMATCH", status: 409 });
  });

  it("rejects invalid JSON responses", async () => {
    const fetcher = (async () => new Response("not-json", { status: 200 })) as typeof fetch;
    const repository = new HttpKnowledgeRepository({ baseUrl: "http://127.0.0.1/api", fetcher });

    await expect(repository.getSemanticCatalog()).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
});
