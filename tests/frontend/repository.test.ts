import { describe, expect, it } from "vitest";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("MockKnowledgeRepository", () => {
  const repository = new MockKnowledgeRepository();

  it("adapts the production graph without leaking canvas state into entities", async () => {
    const response = await repository.getGraphView({ viewId: "production" });
    expect(response.nodes.length).toBeGreaterThan(0);
    expect(response.edges.length).toBeGreaterThan(0);
    expect(response.metadata.contractVersion).toBe("1.0.0");
    expect(response.entities.every((entity) => !("position" in entity.properties))).toBe(true);
  });

  it("provides semantic results through the repository contract", async () => {
    const response = await repository.searchSemantic({ query: "M220" });
    expect(response.total).toBeGreaterThan(0);
    expect(response.results.some((result) => result.entity.label.includes("M220"))).toBe(true);
  });
});
