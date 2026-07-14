import { describe, expect, it } from "vitest";
import { ontologySourceData } from "../../src/features/ontology/ontologyData";
import { semanticConceptBundles } from "../../src/features/semantic/semanticData";
import { semanticLaneDefinitions } from "../../src/features/semantic/semanticUtils";
import { knowledgeRepository, MockKnowledgeRepository } from "../../src/repositories";

describe("Explorer regression baseline", () => {
  it("preserves the approved Route Explorer node count", async () => {
    const route = await knowledgeRepository.getGraphView({ viewId: "production" });

    expect(route.nodes).toHaveLength(9);
    expect(route.edges.length).toBeGreaterThan(0);
  });

  it("preserves the approved Ontology Explorer graph counts", () => {
    expect(ontologySourceData.nodes).toHaveLength(26);
    expect(ontologySourceData.edges).toHaveLength(31);
  });

  it("preserves the approved Semantic Explorer catalog counts", () => {
    expect(semanticLaneDefinitions).toHaveLength(5);
    expect(semanticConceptBundles).toHaveLength(8);
  });

  it("initializes the application repository through the shared entry point", () => {
    expect(knowledgeRepository).toBeInstanceOf(MockKnowledgeRepository);
  });
});
