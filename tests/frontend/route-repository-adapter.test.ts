import { describe, expect, it } from "vitest";
import { buildRouteGraphFromResponse } from "../../src/features/route/routeRepositoryAdapter";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import type { ViewMode } from "../../src/types";

describe("Route repository response adapter", () => {
  const repository = new MockKnowledgeRepository();
  const views: ViewMode[] = ["production", "quality", "engineering", "valueStream"];

  it.each(views)("builds the configured %s view", async (viewMode) => {
    const response = await repository.getGraphView({ viewId: viewMode });
    const graph = buildRouteGraphFromResponse(response, viewMode);

    expect(graph.nodes.map((node) => node.id)).toEqual(response.nodes.map((node) => node.id));
    expect(graph.edges.map((edge) => edge.id)).toEqual(response.edges.map((edge) => edge.id));
    expect(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.source))).toBe(true);
    expect(graph.edges.every((edge) => graph.nodes.some((node) => node.id === edge.target))).toBe(true);
  });

  it("preserves the approved nine-node production route", async () => {
    const response = await repository.getGraphView({ viewId: "production" });
    expect(buildRouteGraphFromResponse(response, "production").nodes).toHaveLength(9);
  });

  it("rejects a missing configured node", async () => {
    const response = await repository.getGraphView({ viewId: "production" });
    const incomplete = { ...response, nodes: response.nodes.filter((node) => node.id !== "OP30") };

    expect(() => buildRouteGraphFromResponse(incomplete, "production")).toThrow("missing node OP30");
  });

  it("rejects incompatible ontology versions", async () => {
    const response = await repository.getGraphView({ viewId: "production" });
    const incompatible = { ...response, metadata: { ...response.metadata, ontologyVersion: "2.0.0" } };

    expect(() => buildRouteGraphFromResponse(incompatible, "production")).toThrow("Ontology version mismatch");
  });
});
