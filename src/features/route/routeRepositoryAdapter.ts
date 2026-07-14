import type { GraphViewResponse } from "../../../packages/knowledge-contracts/src/index";
import { graphEdges as routeEdgeTemplate, stackNodes as routeNodeTemplate } from "../../repositories/legacyDemoData";
import { assertCompatibleMetadata, KnowledgePayloadError } from "../../repositories/semanticCatalogValidation";
import type { GraphEdge, StackNode, ViewMode } from "../../types";

export type RouteGraphViewModel = {
  nodes: StackNode[];
  edges: GraphEdge[];
};

export function buildRouteGraphFromResponse(
  response: GraphViewResponse,
  viewMode: ViewMode,
): RouteGraphViewModel {
  assertCompatibleMetadata(response.metadata);

  const responseNodes = uniqueById(response.nodes, "Route graph node");
  const responseEdges = uniqueById(response.edges, "Route graph edge");
  const entityIds = new Set(response.entities.map((entity) => entity.id));
  const relationIds = new Set(response.relations.map((relation) => relation.id));
  const expectedNodes = routeNodeTemplate.filter(
    (node) => !node.visibleInViews || node.visibleInViews.includes(viewMode),
  );
  const expectedNodeIds = new Set(expectedNodes.map((node) => node.id));
  const expectedEdges = routeEdgeTemplate.filter(
    (edge) =>
      (!edge.visibleInViews || edge.visibleInViews.includes(viewMode))
      && expectedNodeIds.has(edge.source)
      && expectedNodeIds.has(edge.target),
  );

  for (const node of expectedNodes) {
    const responseNode = responseNodes.get(node.id);
    if (!responseNode) {
      throw new KnowledgePayloadError(`Route response is missing node ${node.id} required by the ${viewMode} view.`);
    }
    if (!entityIds.has(responseNode.entityId)) {
      throw new KnowledgePayloadError(`Route node ${node.id} references missing entity ${responseNode.entityId}.`);
    }
  }
  rejectUnexpectedIds(responseNodes, expectedNodeIds, `Route response contains a node not configured for the ${viewMode} view`);

  const expectedEdgeIds = new Set(expectedEdges.map((edge) => edge.id));
  for (const edge of expectedEdges) {
    const responseEdge = responseEdges.get(edge.id);
    if (!responseEdge) {
      throw new KnowledgePayloadError(`Route response is missing edge ${edge.id} required by the ${viewMode} view.`);
    }
    if (!expectedNodeIds.has(responseEdge.source) || !expectedNodeIds.has(responseEdge.target)) {
      throw new KnowledgePayloadError(`Route edge ${edge.id} references a node outside the ${viewMode} view.`);
    }
    if (responseEdge.relationId && !relationIds.has(responseEdge.relationId)) {
      throw new KnowledgePayloadError(`Route edge ${edge.id} references missing relation ${responseEdge.relationId}.`);
    }
  }
  rejectUnexpectedIds(responseEdges, expectedEdgeIds, `Route response contains an edge not configured for the ${viewMode} view`);

  // Canvas positions and interaction metadata remain view-owned until the API contract owns layout.
  return { nodes: expectedNodes, edges: expectedEdges };
}

function uniqueById<T extends { id: string }>(items: T[], label: string) {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (byId.has(item.id)) throw new KnowledgePayloadError(`${label} ${item.id} is duplicated.`);
    byId.set(item.id, item);
  }
  return byId;
}

function rejectUnexpectedIds<T extends { id: string }>(
  items: Map<string, T>,
  expectedIds: Set<string>,
  message: string,
) {
  for (const id of items.keys()) {
    if (!expectedIds.has(id)) throw new KnowledgePayloadError(`${message}: ${id}.`);
  }
}
