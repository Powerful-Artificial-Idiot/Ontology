import type { OntologyGraphResponse } from "../../../packages/knowledge-contracts/src/index";
import { assertCompatibleMetadata, KnowledgePayloadError } from "../../repositories/semanticCatalogValidation";
import { ontologySourceData as ontologyViewTemplate } from "./ontologyData";
import type { OntologySourceData } from "./ontologyTypes";

export function buildOntologySourceDataFromResponse(response: OntologyGraphResponse): OntologySourceData {
  assertCompatibleMetadata(response.metadata);
  const classByName = new Map(response.classes.map((item) => [item.name, item]));
  const propertyByIri = new Map(response.properties.map((item) => [item.iri, item]));
  const relationById = new Map(response.relations.map((item) => [item.id, item]));

  const nodes = ontologyViewTemplate.nodes.map((node) => {
    const semanticClass = classByName.get(node.id);
    if (!semanticClass) throw new KnowledgePayloadError(`Ontology response is missing class ${node.id} required by the view configuration.`);
    const properties = node.properties.map((property) => {
      if (!property.semanticIri || !propertyByIri.has(property.semanticIri)) {
        throw new KnowledgePayloadError(`Ontology response is missing property ${property.semanticIri ?? property.name} required by ${node.id}.`);
      }
      return property;
    });
    return {
      ...node,
      properties,
      semanticIri: semanticClass.iri,
      semanticLabel: semanticClass.label,
      semanticModule: semanticClass.module,
      semanticVersion: semanticClass.version ?? response.metadata.ontologyVersion,
    };
  });

  const edges = ontologyViewTemplate.edges.map((edge) => {
    const semanticRelation = relationById.get(edge.id);
    if (!semanticRelation) throw new KnowledgePayloadError(`Ontology response is missing relation ${edge.id} required by the view configuration.`);
    return {
      ...edge,
      semanticIri: semanticRelation.predicate,
      semanticLabel: semanticRelation.label ?? edge.label,
    };
  });

  return { nodes, edges, lanes: ontologyViewTemplate.lanes, actions: ontologyViewTemplate.actions };
}
