import type { OntologyFilter, OntologyLinkType, OntologyObjectType } from "../../types";
import { ontologyLanes } from "./ontologyData";
import { laneByObjectId } from "./ontologyLayout";
import type { OntologyFocusState, OntologyScope } from "./ontologyTypes";

export function getDomainLaneIds(domainFilter: OntologyFilter): Set<string> {
  if (domainFilter === "all") return new Set(ontologyLanes.map((lane) => lane.id));
  if (domainFilter === "production") return new Set(["product-material", "process", "resource"]);
  if (domainFilter === "quality") return new Set(["quality", "process", "engineering-document"]);
  if (domainFilter === "engineering") return new Set(["engineering-document", "resource", "process"]);
  if (domainFilter === "valueStream") return new Set(["value-stream", "process", "product-material"]);
  return new Set(["governance", "engineering-document"]);
}

export function getBaseVisibleOntologyElements({
  nodes,
  edges,
  domainFilter,
  focusState,
}: {
  nodes: readonly OntologyObjectType[];
  edges: readonly OntologyLinkType[];
  domainFilter: OntologyFilter;
  focusState: OntologyFocusState;
}): OntologyScope {
  const all = (): OntologyScope => ({
    nodeIds: new Set(nodes.map((node) => node.id)),
    edgeIds: new Set(edges.map((edge) => edge.id)),
    laneIds: new Set(ontologyLanes.map((lane) => lane.id)),
  });

  let result: OntologyScope;

  if (focusState.mode === "normal") {
    if (domainFilter === "all") return all();
    const laneIds = getDomainLaneIds(domainFilter);
    const nodeIds = new Set(nodes.filter((node) => laneIds.has(laneByObjectId.get(node.id) ?? "")).map((node) => node.id));
    const edgeIds = new Set(edges.filter((edge) => nodeIds.has(edge.sourceObjectType) && nodeIds.has(edge.targetObjectType)).map((edge) => edge.id));
    result = { nodeIds, edgeIds, laneIds };
  } else if (focusState.mode === "node-focus") {
    const nodeIds = new Set<string>([focusState.nodeId]);
    const directEdges = edges.filter((edge) => edge.sourceObjectType === focusState.nodeId || edge.targetObjectType === focusState.nodeId);
    directEdges.forEach((edge) => {
      nodeIds.add(edge.sourceObjectType);
      nodeIds.add(edge.targetObjectType);
    });
    result = {
      nodeIds,
      edgeIds: new Set(directEdges.map((edge) => edge.id)),
      laneIds: laneIdsForNodes(nodeIds),
    };
  } else if (focusState.mode === "lane-focus") {
    const lane = ontologyLanes.find((item) => item.id === focusState.laneId);
    const nodeIds = new Set(lane?.objectTypeIds ?? []);
    result = {
      nodeIds,
      edgeIds: new Set(edges.filter((edge) => nodeIds.has(edge.sourceObjectType) && nodeIds.has(edge.targetObjectType)).map((edge) => edge.id)),
      laneIds: lane ? new Set([lane.id]) : new Set(),
    };
  } else {
    const matchingEdges = edges.filter((edge) => edge.label === focusState.relationshipType);
    const nodeIds = new Set(matchingEdges.flatMap((edge) => [edge.sourceObjectType, edge.targetObjectType]));
    result = {
      nodeIds,
      edgeIds: new Set(matchingEdges.map((edge) => edge.id)),
      laneIds: laneIdsForNodes(nodeIds),
    };
  }

  if (nodes.length > 0 && result.nodeIds.size === 0) {
    console.warn("[Ontology] Empty base visible set. Falling back to all nodes.", { domainFilter, focusState });
    return all();
  }

  return result;
}

function laneIdsForNodes(nodeIds: Set<string>) {
  const laneIds = new Set<string>();
  nodeIds.forEach((nodeId) => {
    const laneId = laneByObjectId.get(nodeId);
    if (laneId) laneIds.add(laneId);
  });
  return laneIds;
}

