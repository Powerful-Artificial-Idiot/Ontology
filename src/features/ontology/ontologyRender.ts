import { MarkerType, Position, type Edge, type Node } from "reactflow";
import { domainStyles } from "./ontologyData";
import { ontologyNodePositions } from "./ontologyLayout";
import { getEdgeVisualState, getNodeVisualState } from "./ontologyInteraction";
import type { OntologyEdgeData, OntologyEntity, OntologyInteractionState, OntologyNodeData, OntologyScope, OntologySearchResult, OntologySourceData } from "./ontologyTypes";

interface RenderParams {
  source: OntologySourceData;
  baseVisible: OntologyScope;
  activeScope: OntologyScope;
  interaction: OntologyInteractionState;
  search: OntologySearchResult;
  expandedObjectIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectProperty: (objectTypeId: string, propertyId: string) => void;
  onFocus: (objectTypeId: string) => void;
  onHover: (entity: OntologyEntity) => void;
  onLeave: (entity: OntologyEntity) => void;
}

export function buildRenderedNodes(params: RenderParams): Node<OntologyNodeData>[] {
  return params.source.nodes
    .filter((node) => params.baseVisible.nodeIds.has(node.id))
    .map((objectType) => ({
      id: objectType.id,
      type: "ontologyObject",
      position: ontologyNodePositions[objectType.id] ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      selectable: false,
      data: {
        objectType,
        visualState: getNodeVisualState({ nodeId: objectType.id, interaction: params.interaction, activeScope: params.activeScope, search: params.search }),
        expanded: params.expandedObjectIds.has(objectType.id),
        highlightedPropertyIds: params.search.propertyIdsByObject.get(objectType.id) ?? new Set<string>(),
        inboundCount: params.source.edges.filter((edge) => edge.targetObjectType === objectType.id).length,
        outboundCount: params.source.edges.filter((edge) => edge.sourceObjectType === objectType.id).length,
        onToggleExpand: params.onToggleExpand,
        onSelectProperty: params.onSelectProperty,
        onFocus: params.onFocus,
        onHover: params.onHover,
        onLeave: params.onLeave,
      },
    }));
}

export function buildRenderedEdges(params: RenderParams): Edge<OntologyEdgeData>[] {
  return params.source.edges
    .filter((edge) => params.baseVisible.edgeIds.has(edge.id))
    .map((linkType) => ({
      id: linkType.id,
      source: linkType.sourceObjectType,
      target: linkType.targetObjectType,
      type: "ontologyLink",
      selectable: false,
      markerEnd: { type: MarkerType.ArrowClosed, color: domainStyles[linkType.domain].edge, width: 16, height: 16 },
      data: {
        linkType,
        visualState: getEdgeVisualState({ edge: linkType, interaction: params.interaction, activeScope: params.activeScope, search: params.search }),
        onHover: params.onHover,
        onLeave: params.onLeave,
      },
    }));
}
