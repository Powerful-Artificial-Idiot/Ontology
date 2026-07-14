import { describe, expect, it } from "vitest";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import {
  assertSemanticCatalogResponse,
  assertSemanticSearchResponse,
  KnowledgePayloadError,
} from "../../src/repositories/semanticCatalogValidation";

describe("Semantic catalog contract validation", () => {
  const repository = new MockKnowledgeRepository();

  it("accepts the local repository catalog", async () => {
    const catalog = await repository.getSemanticCatalog();
    expect(() => assertSemanticCatalogResponse(catalog)).not.toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => assertSemanticCatalogResponse({ metadata: {} })).toThrow(KnowledgePayloadError);
  });

  it("rejects ontology version mismatches", async () => {
    const catalog = await repository.getSemanticCatalog();
    const incompatible = { ...catalog, metadata: { ...catalog.metadata, ontologyVersion: "9.0.0" } };
    expect(() => assertSemanticCatalogResponse(incompatible)).toThrow("Ontology version mismatch");
  });

  it("accepts empty catalogs as a valid UI state", async () => {
    const catalog = await repository.getSemanticCatalog();
    const empty = { ...catalog, concepts: [], entities: [], mappings: [] };
    expect(() => assertSemanticCatalogResponse(empty)).not.toThrow();
  });

  it("rejects inconsistent semantic search totals", async () => {
    const response = await repository.searchSemantic({ query: "leak" });
    expect(() => assertSemanticSearchResponse({ ...response, total: response.total + 1 })).toThrow("total does not match");
  });
});
