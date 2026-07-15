export type MockKnowledgeSourcePage = "Route Explorer" | "Ontology Explorer" | "Semantic Explorer" | "Agent Demo";
export type MockKnowledgeSourceView = "Production View" | "Quality View" | "Engineering View" | "Value Stream View" | "Ontology View" | "Semantic View";

export type MockKnowledgeObjectType =
  | "Product" | "Part" | "Operation" | "Machine" | "Fixture" | "Program"
  | "QualityCharacteristic" | "CTQ" | "FailureMode" | "ControlMethod"
  | "Document" | "SystemField" | "ValueStreamMetric" | "SemanticTerm"
  | "OntologyObjectType" | "OntologyRelationshipType" | "WIPBuffer";

export type MockKnowledgeDomain = "production" | "quality" | "engineering" | "valueStream" | "semantic" | "ontology" | "governance";

export type MockKnowledgeObject = {
  id: string;
  label: string;
  type: MockKnowledgeObjectType;
  domain: MockKnowledgeDomain;
  description: string;
  sourcePage?: MockKnowledgeSourcePage;
  sourceViews?: MockKnowledgeSourceView[];
  sourceSystem?: string;
  version?: string;
  attributes?: Record<string, string | number | boolean>;
};

export type MockKnowledgeRelationType = "hasOperation" | "nextOperation" | "controls" | "performedOn" | "usesProgram" | "requiresFixture" | "requiresValidation" | "governedBy" | "riskAnalyzedBy" | "describedBy" | "storedIn" | "synonymOf" | "mapsToObject" | "mapsToProperty" | "evidencedBy" | "contributesTo" | "affects" | "supports";

export type MockKnowledgeRelation = {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: MockKnowledgeRelationType;
  label: string;
  description: string;
  sourcePage?: MockKnowledgeSourcePage;
  sourceView?: MockKnowledgeSourceView;
  evidenceIds?: string[];
};

export type MockEvidenceType = "Semantic Catalog" | "Ontology" | "Route Graph" | "Control Plan" | "PFMEA" | "SOP" | "MES Mock Data" | "QMS Mock Data" | "Value Stream Map" | "Line Balance Study" | "Standard Work" | "Engineering Spec" | "Engineering Change Request" | "Validation Record";

export type MockEvidenceDocument = {
  id: string;
  title: string;
  type: MockEvidenceType;
  version?: string;
  sourceSystem?: string;
  evidenceText: string;
  supports: string;
  linkedObjectIds: string[];
  sourcePage: MockKnowledgeSourcePage;
  sourceViews: MockKnowledgeSourceView[];
};

export type MockSemanticMapping = {
  id: string;
  sourceId: string;
  targetId: string;
  relation: "synonymOf" | "mapsToObject" | "mapsToProperty" | "storedIn";
  description: string;
};

export type CrossViewKnowledgeIndex = {
  view: MockKnowledgeSourceView;
  findings: string[];
  objectIds: string[];
  referenceIds: string[];
};

export type MockKnowledgeValidationIssue = { severity: "error" | "warning"; code: string; message: string };
export type MockKnowledgeValidationReport = { passed: boolean; errors: number; warnings: number; issues: MockKnowledgeValidationIssue[] };
