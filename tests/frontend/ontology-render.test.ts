import { describe, expect, it, vi } from "vitest";
import { ontologySourceData } from "../../src/features/ontology/ontologyData";
import { initialOntologyInteractionState } from "../../src/features/ontology/ontologyInteraction";
import { buildRenderedEdges, buildRenderedNodes } from "../../src/features/ontology/ontologyRender";
import { searchOntology } from "../../src/features/ontology/ontologySearch";

describe("Ontology Explorer render model", () => {
  it("builds stable nodes and edges for the full ontology scope", () => {
    const baseVisible = {
      nodeIds: new Set(ontologySourceData.nodes.map((node) => node.id)),
      edgeIds: new Set(ontologySourceData.edges.map((edge) => edge.id)),
      laneIds: new Set(ontologySourceData.lanes.map((lane) => lane.id)),
    };
    const activeScope = { nodeIds: new Set<string>(), edgeIds: new Set<string>(), laneIds: new Set<string>() };
    const params = {
      source: ontologySourceData,
      baseVisible,
      activeScope,
      interaction: initialOntologyInteractionState,
      search: searchOntology(""),
      expandedObjectIds: new Set(["Operation"]),
      onToggleExpand: vi.fn(),
      onSelectProperty: vi.fn(),
      onFocus: vi.fn(),
      onHover: vi.fn(),
      onLeave: vi.fn(),
    };

    const nodes = buildRenderedNodes(params);
    const edges = buildRenderedEdges(params);

    expect(nodes).toHaveLength(26);
    expect(edges).toHaveLength(31);
    expect(nodes.find((node) => node.id === "Operation")?.data.expanded).toBe(true);
    expect(edges.every((edge) => baseVisible.nodeIds.has(edge.source) && baseVisible.nodeIds.has(edge.target))).toBe(true);
  });
});
