import { describe, expect, it } from "vitest";
import { ontologySourceData } from "../../src/features/ontology/ontologyData";
import {
  getEntityScope,
  getNodeVisualState,
  getPrimaryInteractionEntity,
  initialOntologyInteractionState,
  ontologyInteractionReducer,
} from "../../src/features/ontology/ontologyInteraction";
import { searchOntology } from "../../src/features/ontology/ontologySearch";
import type { OntologyInteractionState } from "../../src/features/ontology/ontologyTypes";

describe("Ontology Explorer interaction priority", () => {
  it("uses hover as the temporary scope when nothing is selected", () => {
    const interaction: OntologyInteractionState = {
      ...initialOntologyInteractionState,
      hoveredEntity: { kind: "node", id: "Product" },
    };
    const activeScope = getEntityScope(
      getPrimaryInteractionEntity(interaction),
      interaction.highlightMode,
      ontologySourceData.nodes,
      ontologySourceData.edges,
    );
    const relatedNodeId = [...activeScope.nodeIds].find((id) => id !== "Product");
    const unrelatedNodeId = ontologySourceData.nodes.find((node) => !activeScope.nodeIds.has(node.id))?.id;

    expect(getPrimaryInteractionEntity(interaction)).toEqual({ kind: "node", id: "Product" });
    expect(relatedNodeId).toBeDefined();
    expect(unrelatedNodeId).toBeDefined();
    expect(getNodeVisualState({ nodeId: "Product", interaction, activeScope, search: searchOntology("") })).toBe("hovered");
    expect(getNodeVisualState({ nodeId: relatedNodeId!, interaction, activeScope, search: searchOntology("") })).toBe("related");
    expect(getNodeVisualState({ nodeId: unrelatedNodeId!, interaction, activeScope, search: searchOntology("") })).toBe("dimmed");
  });

  it("keeps the selected neighborhood pinned while a non-related node is hovered", () => {
    const selectedEntity = { kind: "node" as const, id: "Product" };
    const selectedScope = getEntityScope(
      selectedEntity,
      "direct",
      ontologySourceData.nodes,
      ontologySourceData.edges,
    );
    const relatedNodeId = [...selectedScope.nodeIds].find((id) => id !== selectedEntity.id);
    const hoveredNodeId = ontologySourceData.nodes.find((node) => !selectedScope.nodeIds.has(node.id))?.id;
    expect(relatedNodeId).toBeDefined();
    expect(hoveredNodeId).toBeDefined();

    const interaction: OntologyInteractionState = {
      ...initialOntologyInteractionState,
      selectedEntity,
      hoveredEntity: { kind: "node", id: hoveredNodeId! },
    };
    const search = searchOntology("");

    expect(getPrimaryInteractionEntity(interaction)).toEqual(selectedEntity);
    expect(getNodeVisualState({ nodeId: selectedEntity.id, interaction, activeScope: selectedScope, search })).toBe("selected");
    expect(getNodeVisualState({ nodeId: relatedNodeId!, interaction, activeScope: selectedScope, search })).toBe("related");
    expect(getNodeVisualState({ nodeId: hoveredNodeId!, interaction, activeScope: selectedScope, search })).toBe("hovered");
  });

  it("gives explicit focus precedence over selection and hover styling", () => {
    const interaction: OntologyInteractionState = {
      ...initialOntologyInteractionState,
      selectedEntity: { kind: "node", id: "Product" },
      hoveredEntity: { kind: "node", id: "Product" },
      focusState: { mode: "node-focus", nodeId: "Product" },
    };
    const activeScope = getEntityScope(
      getPrimaryInteractionEntity(interaction),
      interaction.highlightMode,
      ontologySourceData.nodes,
      ontologySourceData.edges,
    );

    expect(getNodeVisualState({ nodeId: "Product", interaction, activeScope, search: searchOntology("") })).toBe("focused");
  });

  it("clears stale hover on selection and ignores out-of-order leave events", () => {
    const product = { kind: "node" as const, id: "Product" };
    const machine = { kind: "node" as const, id: "Machine" };
    const hovered = ontologyInteractionReducer(initialOntologyInteractionState, { type: "hover", entity: product });
    const selected = ontologyInteractionReducer(hovered, { type: "select", entity: product });
    expect(selected.hoveredEntity).toBeNull();
    expect(selected.selectedEntity).toEqual(product);

    const newerHover = ontologyInteractionReducer(selected, { type: "hover", entity: machine });
    const staleLeave = ontologyInteractionReducer(newerHover, { type: "leave", entity: product });
    expect(staleLeave.hoveredEntity).toEqual(machine);
    expect(staleLeave.selectedEntity).toEqual(product);
  });
});
