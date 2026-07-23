export type ProvenanceReference = {
  sourceType: string;
  sourceId: string;
  sourceSystem?: string;
  documentName?: string;
  locator?: string;
  recordedAt?: string;
};

export type KnowledgeEntity = {
  id: string;
  iri?: string;
  type: string;
  label: string;
  description?: string;
  domain?: string;
  properties: Record<string, unknown>;
  source?: ProvenanceReference[];
  validFrom?: string;
  validTo?: string;
  version?: string;
  status?: string;
};

export type KnowledgeRelation = {
  id: string;
  sourceId: string;
  targetId: string;
  predicate: string;
  label?: string;
  properties?: Record<string, unknown>;
  provenance?: ProvenanceReference[];
  validFrom?: string;
  validTo?: string;
  confidence?: number;
  evidenceType?: string;
  assertionType?: "asserted" | "inferred";
};

export type GraphNode = {
  id: string;
  entityId: string;
  visualType: string;
  column?: number;
  stackId?: string;
  isCritical?: boolean;
  thumbnail?: string;
  badges?: string[];
  viewMetadata?: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  relationId?: string;
  source: string;
  target: string;
  label?: string;
  metrics?: {
    partsQty?: number;
    cycleTimeSeconds?: number;
  };
  viewMetadata?: Record<string, unknown>;
};

export type OntologyPropertyReference = {
  iri: string;
  required?: boolean;
};

export type OntologyClass = {
  iri: string;
  name: string;
  label: string;
  description?: string;
  parentClasses?: string[];
  properties?: OntologyPropertyReference[];
  module: string;
  version?: string;
};

export type OntologyProperty = {
  iri: string;
  name: string;
  label: string;
  propertyType: "object" | "datatype";
  domain?: string[];
  range?: string[];
  inverseOf?: string;
  description?: string;
};

export type SemanticSearchResult = {
  entity: KnowledgeEntity;
  score: number;
  matchedConcepts: string[];
  matchedRelations?: KnowledgeRelation[];
  explanation?: string;
  evidence?: ProvenanceReference[];
};

export type ContractMetadata = {
  contractVersion: string;
  ontologyVersion: string;
  dataVersion: string;
  traceId: string;
  generatedAt: string;
};

export type GraphViewRequest = {
  viewId: "production" | "quality" | "engineering" | "valueStream";
  asOf?: string;
  ontologyVersion?: string;
};

export type GraphViewResponse = {
  metadata: ContractMetadata;
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphTraversalRequest = {
  graphPlanId: string;
  templateId: string;
  readOnly: true;
  seedEntityIds: string[];
  allowedRelationTypes: string[];
  maxDepth: number;
  resultLimit: number;
  status?: string;
};

export type GraphTraversalResult = {
  metadata: ContractMetadata;
  graphPlanId: string;
  templateId: string;
  repositoryType: "mock" | "http" | "neo4j";
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
};

export type OntologyGraphRequest = {
  domain?: string;
  version?: string;
};

export type OntologyGraphResponse = {
  metadata: ContractMetadata;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  relations: KnowledgeRelation[];
};

export type SemanticSearchRequest = {
  query: string;
  domain?: string;
  limit?: number;
  asOf?: string;
};

export type SemanticSearchResponse = {
  metadata: ContractMetadata;
  results: SemanticSearchResult[];
  total: number;
};

export type SemanticCatalogLane = {
  id: "business" | "ontology" | "system" | "evidence" | "ai";
  label: string;
  description: string;
};

export type SemanticCatalogEntity = {
  id: string;
  conceptId: string;
  label: string;
  type: string;
  domain: string;
  description: string;
  aliases?: string[];
  examples?: string[];
  owner?: string;
  status?: string;
  confidence?: string;
  sourceSystems?: string[];
  sourceDocuments?: string[];
  unit?: string;
  dataType?: string;
  attributes?: Record<string, string>;
  relatedOntologyObjects?: string[];
  usedInRouteExplorer?: string[];
};

export type SemanticCatalogMapping = {
  id: string;
  conceptId: string;
  sourceId: string;
  targetId: string;
  relation: string;
  label: string;
  description: string;
  confidence?: string;
};

export type SemanticCatalogConcept = {
  id: string;
  primaryTermId: string;
  title: string;
  domain: string;
  summary: string;
  entityIds: string[];
  mappingIds: string[];
  aiContext: {
    resolvedMeaning: string;
    relevantObjects: string[];
    availableActions: string[];
    promptContext: string;
    ambiguityNotes?: string[];
    evidenceCoverage: string;
  };
};

export type SemanticCatalogResponse = {
  metadata: ContractMetadata;
  lanes: SemanticCatalogLane[];
  concepts: SemanticCatalogConcept[];
  entities: SemanticCatalogEntity[];
  mappings: SemanticCatalogMapping[];
};

export interface KnowledgeRepository {
  traverseGraph(request: GraphTraversalRequest): Promise<GraphTraversalResult>;
  getGraphView(request: GraphViewRequest): Promise<GraphViewResponse>;
  getEntityById(id: string): Promise<KnowledgeEntity | null>;
  getOntologyGraph(request: OntologyGraphRequest): Promise<OntologyGraphResponse>;
  getSemanticCatalog(): Promise<SemanticCatalogResponse>;
  searchSemantic(request: SemanticSearchRequest): Promise<SemanticSearchResponse>;
  getEntityRelations(id: string): Promise<KnowledgeRelation[]>;
}

export * from "./security";
export * from "./sourceSync";
export * from "./agent";
export * from "./quantitativeQuality";
