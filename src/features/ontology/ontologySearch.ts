import { ontologyLanes, ontologySourceActions, ontologySourceEdges, ontologySourceNodes } from "./ontologyData";
import type { OntologySearchResult, OntologySourceData } from "./ontologyTypes";

export function searchOntology(keyword: string, source: OntologySourceData = { nodes: ontologySourceNodes, edges: ontologySourceEdges, lanes: ontologyLanes, actions: ontologySourceActions }): OntologySearchResult {
  const result: OntologySearchResult = {
    objectIds: new Set(),
    edgeIds: new Set(),
    relationTypes: new Set(),
    laneIds: new Set(),
    actionIds: new Set(),
    propertyIdsByObject: new Map(),
  };
  const query = keyword.trim().toLowerCase();
  if (!query) return result;

  source.lanes.forEach((lane) => {
    if ([lane.label, lane.description, ...lane.roles, ...lane.questions, ...lane.sourceSystems].join(" ").toLowerCase().includes(query)) {
      result.laneIds.add(lane.id);
    }
  });

  source.nodes.forEach((node) => {
    if ([node.id, node.label, node.description, node.domain, ...node.sourceSystems, ...(node.examples ?? []), ...(node.badges ?? [])].join(" ").toLowerCase().includes(query)) {
      result.objectIds.add(node.id);
    }
    node.properties.forEach((property) => {
      if ([property.id, property.name, property.label, property.description, property.dataType, property.example, property.semanticCategory, property.sourceSystem].join(" ").toLowerCase().includes(query)) {
        result.objectIds.add(node.id);
        const properties = result.propertyIdsByObject.get(node.id) ?? new Set<string>();
        properties.add(property.id);
        result.propertyIdsByObject.set(node.id, properties);
      }
    });
  });

  source.edges.forEach((edge) => {
    if ([edge.id, edge.label, edge.description, edge.sourceObjectType, edge.targetObjectType, edge.cardinality, edge.domain, ...(edge.examples ?? [])].join(" ").toLowerCase().includes(query)) {
      result.edgeIds.add(edge.id);
      result.relationTypes.add(edge.label);
      result.objectIds.add(edge.sourceObjectType);
      result.objectIds.add(edge.targetObjectType);
    }
  });

  source.actions.forEach((action) => {
    if ([action.id, action.label, action.description, ...action.appliesTo, ...action.affectedObjectTypes, ...(action.affectedLinkTypes ?? [])].join(" ").toLowerCase().includes(query)) {
      result.actionIds.add(action.id);
    }
  });
  return result;
}
