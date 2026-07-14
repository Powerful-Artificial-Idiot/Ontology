import { describe, expect, it } from "vitest";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("MockKnowledgeRepository", () => {
  const repository = new MockKnowledgeRepository();

  it("adapts the production graph without leaking canvas state into entities", async () => {
    const response = await repository.getGraphView({ viewId: "production" });
    expect(response.nodes.length).toBeGreaterThan(0);
    expect(response.edges.length).toBeGreaterThan(0);
    expect(response.metadata.contractVersion).toBe("1.1.0");
    expect(response.entities.every((entity) => !("position" in entity.properties))).toBe(true);
  });

  it("provides semantic results through the repository contract", async () => {
    const response = await repository.searchSemantic({ query: "M220" });
    expect(response.total).toBeGreaterThan(0);
    expect(response.results.some((result) => result.entity.label.includes("M220"))).toBe(true);
  });

  it("provides the complete semantic catalog through the repository contract", async () => {
    const response = await repository.getSemanticCatalog();
    expect(response.lanes).toHaveLength(5);
    expect(response.concepts).toHaveLength(8);
    expect(response.entities.length).toBeGreaterThan(response.concepts.length);
    expect(response.mappings.length).toBeGreaterThan(0);
  });

  it("exposes the generated CQ-004 scenario with provenance and inference", async () => {
    const response = await repository.searchSemantic({ query: "CQ-004" });
    const relations = response.results[0].matchedRelations ?? [];
    expect(response.total).toBe(1);
    expect(new Set(relations.map((relation) => relation.assertionType))).toEqual(new Set(["asserted", "inferred"]));
    expect(response.results[0].evidence?.length).toBeGreaterThan(0);
    expect(response.results[0].explanation).toContain("direct machine-to-characteristic impact is inferred");
  });
});
