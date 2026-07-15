import { describe, expect, it } from "vitest";
import { buildOntologySourceDataFromResponse } from "../../src/features/ontology/ontologyRepositoryAdapter";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("Ontology repository response adapter", () => {
  const repository = new MockKnowledgeRepository();

  it("builds the approved 29/41 view from repository semantics", async () => {
    const response = await repository.getOntologyGraph({ version: "1.1.0" });
    const source = buildOntologySourceDataFromResponse(response);

    expect(source.nodes).toHaveLength(29);
    expect(source.edges).toHaveLength(41);
    expect(source.nodes.find((node) => node.id === "Operation")?.semanticIri).toBe("https://example.com/mkg/manufacturing#Operation");
    expect(source.edges.find((edge) => edge.id === "link-operation-conducted-by-machine")?.semanticIri).toBe("https://example.com/mkg/manufacturing#executedBy");
  });

  it("rejects missing view classes", async () => {
    const response = await repository.getOntologyGraph({});
    const incomplete = { ...response, classes: response.classes.filter((item) => item.name !== "Operation") };

    expect(() => buildOntologySourceDataFromResponse(incomplete)).toThrow("missing class Operation");
  });

  it("rejects incompatible ontology versions", async () => {
    const response = await repository.getOntologyGraph({});
    const incompatible = { ...response, metadata: { ...response.metadata, ontologyVersion: "2.0.0" } };

    expect(() => buildOntologySourceDataFromResponse(incompatible)).toThrow("Ontology version mismatch");
  });
});
