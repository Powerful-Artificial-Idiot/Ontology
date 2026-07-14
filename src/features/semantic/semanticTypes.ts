export type SemanticEntityType =
  | "businessTerm"
  | "synonym"
  | "metric"
  | "ontologyObject"
  | "ontologyProperty"
  | "ontologyRelationship"
  | "systemField"
  | "sourceEvidence"
  | "aiContext"
  | "governance";

export type SemanticDomain = "production" | "quality" | "engineering" | "valueStream" | "governance";
export type SemanticStatus = "draft" | "reviewed" | "approved";
export type SemanticConfidence = "low" | "medium" | "high" | "approved";

export interface SemanticEntity {
  id: string;
  conceptId: string;
  label: string;
  type: SemanticEntityType;
  domain: SemanticDomain;
  description: string;
  aliases?: string[];
  examples?: string[];
  owner?: string;
  status?: SemanticStatus;
  confidence?: SemanticConfidence;
  sourceSystems?: string[];
  sourceDocuments?: string[];
  unit?: string;
  dataType?: string;
  attributes?: Record<string, string>;
  relatedOntologyObjects?: string[];
  usedInRouteExplorer?: string[];
}

export type SemanticRelation =
  | "synonymOf"
  | "means"
  | "mapsToObject"
  | "mapsToProperty"
  | "mapsToRelationship"
  | "storedIn"
  | "evidencedBy"
  | "usedByAgent"
  | "ownedBy"
  | "approvedBy";

export interface SemanticMapping {
  id: string;
  conceptId: string;
  sourceId: string;
  targetId: string;
  relation: SemanticRelation;
  label: string;
  description: string;
  confidence?: SemanticConfidence;
}

export interface SemanticAIContext {
  resolvedMeaning: string;
  relevantObjects: string[];
  availableActions: string[];
  promptContext: string;
  ambiguityNotes?: string[];
  evidenceCoverage: string;
}

export interface SemanticConceptBundle {
  id: string;
  primaryTermId: string;
  title: string;
  domain: SemanticDomain;
  summary: string;
  entityIds: string[];
  mappingIds: string[];
  aiContext: SemanticAIContext;
}

export type SemanticLaneId = "business" | "ontology" | "system" | "evidence" | "ai";
export type SemanticDomainFilter = "all" | SemanticDomain;

export interface SemanticSearchMatch {
  entity: SemanticEntity;
  concept: SemanticConceptBundle;
  group: "Business Terms" | "Synonyms" | "Metrics" | "System Fields" | "Evidence Documents" | "AI Context";
  ambiguity?: string;
}

