import { describe, expect, it } from "vitest";
import { createSemanticCatalogModel } from "../../src/features/semantic/semanticCatalogModel";
import { buildOntologySourceDataFromResponse } from "../../src/features/ontology/ontologyRepositoryAdapter";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { resolveOntologyTarget, resolveSemanticTarget } from "../../src/router/explorerDeepLinks";
import { parseExplorerLocation } from "../../src/router/explorerRouter";

describe("Explorer deep links", () => {
  const repository = new MockKnowledgeRepository();

  it("resolves a direct Ontology class only after repository data is available", async () => {
    const route = parseExplorerLocation({ pathname: "/ontology/classes/Operation", search: "" });
    const source = buildOntologySourceDataFromResponse(await repository.getOntologyGraph({}));

    expect(route.ontologyTarget).toEqual({ kind: "class", id: "Operation" });
    expect(resolveOntologyTarget(route.ontologyTarget!, source)).toEqual({
      status: "resolved",
      value: { kind: "node", id: "Operation" },
    });
  });

  it("resolves Ontology properties and explains invalid IDs", async () => {
    const source = buildOntologySourceDataFromResponse(await repository.getOntologyGraph({}));
    const property = source.nodes.flatMap((node) => node.properties)[0];

    expect(resolveOntologyTarget({ kind: "property", id: property.id }, source).status).toBe("resolved");
    expect(resolveOntologyTarget({ kind: "class", id: "MissingClass" }, source)).toMatchObject({
      status: "invalid",
      message: "Ontology class “MissingClass” was not found.",
    });
  });

  it("connects the machine impact scenario to CQ-004 and Leak Rate", async () => {
    const route = parseExplorerLocation({ pathname: "/semantic/scenarios/machine-impact-analysis", search: "" });
    const catalog = createSemanticCatalogModel(await repository.getSemanticCatalog());

    expect(resolveSemanticTarget(route.semanticTarget!, catalog)).toEqual({
      status: "resolved",
      value: { conceptId: "leak-rate", entityId: "leak-rate-term", defaultQuery: "CQ-004" },
    });
  });

  it("resolves Semantic entities and explains invalid scenarios", async () => {
    const catalog = createSemanticCatalogModel(await repository.getSemanticCatalog());

    expect(resolveSemanticTarget({ kind: "entity", id: "cycle-time-term" }, catalog).status).toBe("resolved");
    expect(resolveSemanticTarget({ kind: "scenario", id: "missing-scenario" }, catalog)).toMatchObject({
      status: "invalid",
      message: "Semantic scenario “missing-scenario” was not found.",
    });
  });

  it("parses the required Quality Route entry", () => {
    expect(parseExplorerLocation({ pathname: "/routes/quality", search: "" })).toMatchObject({
      page: "route",
      viewMode: "quality",
    });
  });
});
