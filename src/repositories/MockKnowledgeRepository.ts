import type {
  ContractMetadata,
  GraphViewRequest,
  GraphViewResponse,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRepository,
  OntologyGraphRequest,
  OntologyGraphResponse,
  SemanticCatalogResponse,
  SemanticSearchRequest,
  SemanticSearchResponse,
} from "../../packages/knowledge-contracts/src/index";
import cq004MachineQualityImpact from "../../packages/demo-data/semantic/generated/cq-004-machine-quality-impact.json";
import { searchSemanticCatalog, semanticLaneDefinitions } from "../features/semantic/semanticUtils";
import { connectOntologyViewToArtifact } from "../features/ontology/ontologyArtifactAdapter";
import {
  graphEdges,
  ontologyLinkTypes,
  ontologyObjectTypes,
  semanticConceptBundles,
  semanticEntities,
  semanticMappings,
  stackNodes,
} from "./legacyDemoData";

const metadata = (): ContractMetadata => ({
  contractVersion: "1.1.0",
  ontologyVersion: "1.1.0",
  dataVersion: "0.5.0",
  traceId: `mock-${Date.now()}`,
  generatedAt: new Date().toISOString(),
});

const connectedOntology = connectOntologyViewToArtifact(ontologyObjectTypes, ontologyLinkTypes);

export class MockKnowledgeRepository implements KnowledgeRepository {
  async getGraphView(request: GraphViewRequest): Promise<GraphViewResponse> {
    const visibleNodes = stackNodes.filter((node) => !node.visibleInViews || node.visibleInViews.includes(request.viewId));
    const nodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = graphEdges.filter((edge) =>
      (!edge.visibleInViews || edge.visibleInViews.includes(request.viewId)) && nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const entities = visibleNodes.flatMap((node) => node.stackObjects.map(toKnowledgeEntity));
    const relations = visibleEdges.map(toKnowledgeRelation);

    return {
      metadata: metadata(),
      entities,
      relations,
      nodes: visibleNodes.map((node) => ({
        id: node.id,
        entityId: node.topObjectByView[request.viewId] ?? node.stackObjects[0].id,
        visualType: node.nodeCategory,
        stackId: node.id,
        viewMetadata: { position: node.positionByView?.[request.viewId] ?? node.position },
      })),
      edges: visibleEdges.map((edge) => ({
        id: edge.id,
        relationId: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.relationType,
        viewMetadata: edge.metadataByView[request.viewId],
      })),
    };
  }

  async getEntityById(id: string): Promise<KnowledgeEntity | null> {
    const stackObject = stackNodes.flatMap((node) => node.stackObjects).find((object) => object.id === id);
    if (stackObject) return toKnowledgeEntity(stackObject);
    const ontologyObject = ontologyObjectTypes.find((object) => object.id === id);
    if (ontologyObject) return { id, type: "OntologyClass", label: ontologyObject.label, description: ontologyObject.description, domain: ontologyObject.domain, properties: { sourceSystems: ontologyObject.sourceSystems, status: ontologyObject.status } };
    const semanticEntity = semanticEntities.find((entity) => entity.id === id);
    return semanticEntity ? { id, type: entityType(semanticEntity.type), label: semanticEntity.label, description: semanticEntity.description, domain: semanticEntity.domain, properties: { ...semanticEntity.attributes, aliases: semanticEntity.aliases }, status: semanticEntity.status } : null;
  }

  async getOntologyGraph(_request: OntologyGraphRequest): Promise<OntologyGraphResponse> {
    const properties = new Map<string, OntologyGraphResponse["properties"][number]>();
    connectedOntology.nodes.forEach((object) => object.properties.forEach((property) => {
      if (!property.semanticIri || properties.has(property.semanticIri)) return;
      properties.set(property.semanticIri, {
        iri: property.semanticIri,
        name: property.name,
        label: property.label,
        propertyType: "datatype",
        domain: [object.semanticIri ?? object.id],
        description: property.description,
      });
    }));
    return {
      metadata: metadata(),
      classes: connectedOntology.nodes.map((object) => ({ iri: object.semanticIri ?? object.id, name: object.id, label: object.semanticLabel ?? object.label, description: object.description, module: object.semanticModule ?? object.domain, version: object.semanticVersion, properties: object.properties.map((property) => ({ iri: property.semanticIri ?? property.id, required: property.required })) })),
      properties: Array.from(properties.values()),
      relations: connectedOntology.edges.map((edge) => ({ id: edge.id, sourceId: edge.sourceObjectType, targetId: edge.targetObjectType, predicate: edge.semanticIri ?? edge.id, label: edge.label })),
    };
  }

  async getSemanticCatalog(): Promise<SemanticCatalogResponse> {
    return {
      metadata: metadata(),
      lanes: semanticLaneDefinitions,
      concepts: semanticConceptBundles,
      entities: semanticEntities,
      mappings: semanticMappings,
    };
  }

  async searchSemantic(request: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    const normalizedQuery = request.query.trim().toLowerCase();
    if (normalizedQuery === "cq-004" || normalizedQuery === "machine quality impact") {
      return cq004MachineQualityImpact as SemanticSearchResponse;
    }
    const matches = searchSemanticCatalog(request.query).slice(0, request.limit ?? 25);
    const results = matches.map((match, index) => ({
      entity: { id: match.entity.id, type: entityType(match.entity.type), label: match.entity.label, description: match.entity.description, domain: match.entity.domain, properties: match.entity.attributes ?? {}, source: (match.entity.sourceDocuments ?? []).map((documentName) => ({ sourceType: "document", sourceId: documentName, documentName })) },
      score: Math.max(0.5, 1 - index * 0.03),
      matchedConcepts: [match.concept.id],
      explanation: match.ambiguity ?? `Matched ${match.group}.`,
    }));
    return { metadata: metadata(), results, total: results.length };
  }

  async getEntityRelations(id: string): Promise<KnowledgeRelation[]> {
    return graphEdges.filter((edge) => edge.source === id || edge.target === id).map(toKnowledgeRelation);
  }
}

function toKnowledgeEntity(object: (typeof stackNodes)[number]["stackObjects"][number]): KnowledgeEntity {
  return {
    id: object.id,
    type: object.type,
    label: object.label,
    description: object.description,
    properties: object.attributes,
    source: [{ sourceType: "system-record", sourceId: object.sourceId, sourceSystem: object.sourceSystem, recordedAt: object.lastUpdated }],
    version: object.version,
    status: "active",
  };
}

function toKnowledgeRelation(edge: (typeof graphEdges)[number]): KnowledgeRelation {
  return { id: edge.id, sourceId: edge.source, targetId: edge.target, predicate: edge.relationType, label: edge.relationType, properties: { ...edge.metadataByView } };
}

function entityType(type: string) {
  return type.replace(/^./, (value) => value.toUpperCase());
}
