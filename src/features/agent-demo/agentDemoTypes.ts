export type AgentLayer = "user" | "context" | "semantic" | "ontology" | "knowledge" | "crossView" | "evidence" | "answer";

export type AgentDomain = "quality" | "engineering" | "valueStream" | "production";

export type AgentLanguage = "zh" | "en";

export type AgentSuggestedQuestion = {
  zh: string;
  en: string;
};

export type AgentToolName =
  | "contextResolver"
  | "semanticResolver"
  | "ontologyMapper"
  | "knowledgeRetriever"
  | "crossViewIndexer"
  | "evidenceFinder"
  | "answerComposer";

export type AgentReasoningStep = {
  id: string;
  order: number;
  layer: AgentLayer;
  title: string;
  description: string;
  input: string[];
  action: string;
  output: string[];
  confidence: "low" | "medium" | "high" | "approved";
  toolName?: AgentToolName;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  referencedObjectIds?: string[];
  referenceIds?: string[];
  durationMs?: number;
};

export type AgentFinalAnswer = {
  summary: string;
  findings: string[];
  recommendedActions: string[];
  risks?: string[];
  assumptions?: string[];
  citations: Array<{
    claim: string;
    referenceIds: string[];
  }>;
};

export type AgentReferenceType =
  | "Semantic Catalog"
  | "Ontology"
  | "Route Graph"
  | "Control Plan"
  | "PFMEA"
  | "SOP"
  | "MES Mock Data"
  | "QMS Mock Data"
  | "Value Stream Map"
  | "Line Balance Study"
  | "Standard Work"
  | "Engineering Spec"
  | "Engineering Change Request"
  | "Validation Record";

export type AgentReference = {
  id: string;
  title: string;
  type: AgentReferenceType;
  version?: string;
  sourceSystem?: string;
  evidenceText: string;
  supports: string;
  linkedObjectIds: string[];
  sourcePage?: "Route Explorer" | "Ontology Explorer" | "Semantic Explorer";
  sourceViews?: Array<"Production View" | "Quality View" | "Engineering View" | "Value Stream View" | "Ontology View" | "Semantic View">;
};

export type AgentRelatedObject = {
  id: string;
  label: string;
  type:
    | "Business Term"
    | "Ontology Object"
    | "Ontology Relationship"
    | "Operation"
    | "Machine"
    | "Quality Characteristic"
    | "Document"
    | "System Field"
    | "Value Stream Metric";
  domain: "production" | "quality" | "engineering" | "valueStream" | "governance";
  description: string;
  sourcePage?: "Route Explorer" | "Ontology Explorer" | "Semantic Explorer";
  sourceViews?: Array<"Production View" | "Quality View" | "Engineering View" | "Value Stream View" | "Ontology View" | "Semantic View">;
};

export type AgentViewIndex = {
  view: "Production View" | "Quality View" | "Engineering View" | "Value Stream View" | "Ontology View" | "Semantic View";
  findings: string[];
  objectIds: string[];
  referenceIds: string[];
};

export type AgentScenario = {
  id: string;
  title: string;
  sidebarLabel: string;
  subtitle?: string;
  domain: AgentDomain;
  userQuestion: string;
  suggestedQuestions?: string[];
  suggestedQuestionOptions?: AgentSuggestedQuestion[];
  exampleQuestions?: string[];
  businessGoal: string;
  expectedOutcome: string;
  steps: AgentReasoningStep[];
  finalAnswer: AgentFinalAnswer;
  references: AgentReference[];
  relatedObjects: AgentRelatedObject[];
  viewIndexes?: AgentViewIndex[];
  tools: AgentToolName[];
  knowledgeSources: AgentReferenceType[];
  initialContext: AgentSharedContext;
};

export type AgentRunStatus = "idle" | "running" | "completed" | "error";

export type AgentUserMessage = {
  id: string;
  content: string;
  intent?: string;
  detectedTerms?: string[];
};

export type AgentResponseMessage = AgentFinalAnswer & {
  id: string;
  confidence: "low" | "medium" | "high" | "approved";
};

export type AgentSharedContext = {
  activeTopic?: string;
  activeOperationId?: string;
  activeMachineId?: string;
  activeQualityCharacteristicId?: string;
  activeProgramId?: string;
  candidateBottleneckId?: string;
  relatedMetricIds?: string[];
  resolvedEntities: AgentRelatedObject[];
  accumulatedReferences: AgentReference[];
  assumptions: string[];
};

export type AgentConversationTurn = {
  id: string;
  order: number;
  userMessage: AgentUserMessage;
  agentResponse: AgentResponseMessage | null;
  trace: AgentReasoningStep[];
  references: AgentReference[];
  relatedObjects: AgentRelatedObject[];
  viewIndexes: AgentViewIndex[];
  status: "pending" | "running" | "completed" | "error";
  confidence?: "low" | "medium" | "high" | "approved";
  createdAt: string;
  completedAt?: string;
};

export type AgentConversationSession = {
  id: string;
  title: string;
  scenarioId: string;
  domain: AgentDomain;
  turns: AgentConversationTurn[];
  sharedContext: AgentSharedContext;
  createdAt: string;
  updatedAt: string;
};
