import type { OntologyLinkType, OntologyObjectType } from "../../types";
import { ontologyLanes, ontologySourceActions } from "./ontologyData";
import { laneByObjectId } from "./ontologyLayout";
import type {
  OntologyEntity,
  OntologyFocusState,
  OntologyHighlightMode,
  OntologyInteractionAction,
  OntologyInteractionState,
  OntologyScope,
  OntologySearchResult,
  OntologyVisualState,
} from "./ontologyTypes";

export const initialOntologyInteractionState: OntologyInteractionState = {
  hoveredEntity: null,
  selectedEntity: null,
  focusState: { mode: "normal" },
  domainFilter: "all",
  highlightMode: "direct",
};

export function ontologyInteractionReducer(
  state: OntologyInteractionState,
  action: OntologyInteractionAction,
): OntologyInteractionState {
  if (action.type === "hover") return { ...state, hoveredEntity: action.entity };
  if (action.type === "leave") {
    return isSameEntity(state.hoveredEntity, action.entity) ? { ...state, hoveredEntity: null } : state;
  }
  if (action.type === "clear-hover") return state.hoveredEntity ? { ...state, hoveredEntity: null } : state;
  if (action.type === "select") return { ...state, hoveredEntity: null, selectedEntity: action.entity };
  if (action.type === "focus") return { ...state, hoveredEntity: null, focusState: action.focus };
  if (action.type === "filter") {
    return { ...state, hoveredEntity: null, selectedEntity: null, focusState: { mode: "normal" }, domainFilter: action.filter };
  }
  if (action.type === "highlight-mode") return { ...state, hoveredEntity: null, highlightMode: action.mode };
  return initialOntologyInteractionState;
}

export function getPrimaryInteractionEntity(interaction: OntologyInteractionState): OntologyEntity | null {
  return interaction.selectedEntity ?? interaction.hoveredEntity;
}

export function getEntityScope(
  entity: OntologyEntity | null,
  highlightMode: OntologyHighlightMode,
  nodes: readonly OntologyObjectType[],
  edges: readonly OntologyLinkType[],
): OntologyScope {
  const scope: OntologyScope = { nodeIds: new Set(), edgeIds: new Set(), laneIds: new Set() };
  if (!entity) return scope;

  if (entity.kind === "property") {
    return getEntityScope({ kind: "node", id: entity.objectTypeId }, highlightMode, nodes, edges);
  }
  if (entity.kind === "edge") {
    const edge = edges.find((item) => item.id === entity.id);
    if (edge) addEdge(scope, edge);
    return scope;
  }
  if (entity.kind === "relationshipType") {
    edges.filter((edge) => edge.label === entity.id).forEach((edge) => addEdge(scope, edge));
    return scope;
  }
  if (entity.kind === "lane") {
    const lane = ontologyLanes.find((item) => item.id === entity.id);
    lane?.objectTypeIds.forEach((id) => scope.nodeIds.add(id));
    if (lane) scope.laneIds.add(lane.id);
    edges.filter((edge) => scope.nodeIds.has(edge.sourceObjectType) || scope.nodeIds.has(edge.targetObjectType)).forEach((edge) => addEdge(scope, edge));
    return scope;
  }
  if (entity.kind === "action") {
    const action = ontologySourceActions.find((item) => item.id === entity.id);
    action?.affectedObjectTypes.forEach((id) => addNode(scope, id));
    action?.affectedLinkTypes?.forEach((id) => {
      const edge = edges.find((item) => item.id === id);
      if (edge) addEdge(scope, edge);
    });
    return scope;
  }

  addNode(scope, entity.id);
  if (highlightMode === "domain") {
    const lane = ontologyLanes.find((item) => item.id === laneByObjectId.get(entity.id));
    lane?.objectTypeIds.forEach((id) => addNode(scope, id));
    edges.filter((edge) => scope.nodeIds.has(edge.sourceObjectType) || scope.nodeIds.has(edge.targetObjectType)).forEach((edge) => addEdge(scope, edge));
    return scope;
  }

  edges
    .filter((edge) => edge.sourceObjectType === entity.id || edge.targetObjectType === entity.id)
    .forEach((edge) => addEdge(scope, edge));
  return scope;
}

export function getNodeVisualState({
  nodeId,
  interaction,
  activeScope,
  search,
}: {
  nodeId: string;
  interaction: OntologyInteractionState;
  activeScope: OntologyScope;
  search: OntologySearchResult;
}): OntologyVisualState {
  const { hoveredEntity, selectedEntity, focusState } = interaction;
  if (focusState.mode === "node-focus" && focusState.nodeId === nodeId) return "focused";
  if (isNodeEntity(selectedEntity, nodeId)) return "selected";
  if (isNodeEntity(hoveredEntity, nodeId)) return "hovered";
  if (search.objectIds.has(nodeId) || search.propertyIdsByObject.has(nodeId)) return "highlighted";
  if (activeScope.nodeIds.has(nodeId)) return "related";
  if (hoveredEntity || selectedEntity || hasSearchResults(search)) return "dimmed";
  return "default";
}

export function getEdgeVisualState({
  edge,
  interaction,
  activeScope,
  search,
}: {
  edge: OntologyLinkType;
  interaction: OntologyInteractionState;
  activeScope: OntologyScope;
  search: OntologySearchResult;
}): OntologyVisualState {
  const { hoveredEntity, selectedEntity, focusState } = interaction;
  if (focusState.mode === "relationship-focus" && focusState.relationshipType === edge.label) return "focused";
  if (selectedEntity?.kind === "edge" && selectedEntity.id === edge.id) return "selected";
  if (hoveredEntity?.kind === "edge" && hoveredEntity.id === edge.id) return "hovered";
  if (selectedEntity?.kind === "relationshipType" && selectedEntity.id === edge.label) return "selected";
  if (hoveredEntity?.kind === "relationshipType" && hoveredEntity.id === edge.label) return "hovered";
  if (search.edgeIds.has(edge.id) || search.relationTypes.has(edge.label)) return "highlighted";
  if (activeScope.edgeIds.has(edge.id)) return "related";
  if (hoveredEntity || selectedEntity || hasSearchResults(search)) return "dimmed";
  return "default";
}

export function getLaneVisualState(laneId: string, interaction: OntologyInteractionState, activeScope: OntologyScope): OntologyVisualState {
  if (interaction.focusState.mode === "lane-focus" && interaction.focusState.laneId === laneId) return "focused";
  if (interaction.selectedEntity?.kind === "lane" && interaction.selectedEntity.id === laneId) return "selected";
  if (interaction.hoveredEntity?.kind === "lane" && interaction.hoveredEntity.id === laneId) return "hovered";
  if (activeScope.laneIds.has(laneId)) return "related";
  if (interaction.hoveredEntity || interaction.selectedEntity) return "dimmed";
  return "default";
}

export function getFocusLabel(focus: OntologyFocusState) {
  if (focus.mode === "node-focus") return `Focus: ${focus.nodeId}`;
  if (focus.mode === "lane-focus") return `Focus Lane: ${ontologyLanes.find((lane) => lane.id === focus.laneId)?.label ?? focus.laneId}`;
  if (focus.mode === "relationship-focus") return `Focus Relationship: ${focus.relationshipType}`;
  return "";
}

export function isSameEntity(a: OntologyEntity | null, b: OntologyEntity | null) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "property" && b.kind === "property") return a.objectTypeId === b.objectTypeId && a.propertyId === b.propertyId;
  return "id" in a && "id" in b && a.id === b.id;
}

export function isFocusValid(focus: OntologyFocusState, nodes: readonly OntologyObjectType[], edges: readonly OntologyLinkType[]) {
  if (focus.mode === "normal") return true;
  if (focus.mode === "node-focus") return nodes.some((node) => node.id === focus.nodeId);
  if (focus.mode === "lane-focus") return ontologyLanes.some((lane) => lane.id === focus.laneId);
  return edges.some((edge) => edge.label === focus.relationshipType);
}

function addNode(scope: OntologyScope, nodeId: string) {
  scope.nodeIds.add(nodeId);
  const laneId = laneByObjectId.get(nodeId);
  if (laneId) scope.laneIds.add(laneId);
}

function addEdge(scope: OntologyScope, edge: OntologyLinkType) {
  scope.edgeIds.add(edge.id);
  addNode(scope, edge.sourceObjectType);
  addNode(scope, edge.targetObjectType);
}

function isNodeEntity(entity: OntologyEntity | null, nodeId: string) {
  return entity?.kind === "node" && entity.id === nodeId || entity?.kind === "property" && entity.objectTypeId === nodeId;
}

function hasSearchResults(search: OntologySearchResult) {
  return search.objectIds.size + search.edgeIds.size + search.laneIds.size + search.actionIds.size > 0;
}
