import type { KnowledgeEntity, KnowledgeRelation, ProvenanceReference } from "./index";

export const AGENT_CONTRACT_VERSION = "1.0.0" as const;

export type AgentContractVersion = typeof AGENT_CONTRACT_VERSION;
export type AgentMode = "scripted" | "live";
export type AgentLanguage = "zh" | "en";
export type AgentDomain = "production" | "quality" | "engineering" | "valueStream" | "governance";
export type AgentConfidence = "low" | "medium" | "high" | "approved";

export type AgentEntityRole =
  | "subject"
  | "affected"
  | "resource"
  | "risk"
  | "evidence"
  | "context";

export type AgentEntityReference = {
  id: string;
  label?: string;
  type?: string;
  role: AgentEntityRole;
};

export type AgentConversationContext = {
  previousTurnIds: string[];
  resolvedEntityIds: string[];
  activeTopic?: string;
  assumptions: string[];
};

export type AgentTurnRequest = {
  contractVersion: AgentContractVersion;
  requestId: string;
  sessionId?: string;
  scenarioId?: string;
  mode: AgentMode;
  language: AgentLanguage;
  message: string;
  context?: AgentConversationContext;
  requestedAt?: string;
};

export type AgentQueryIntent =
  | "quality_issue_trace"
  | "engineering_change_impact"
  | "bottleneck_analysis"
  | "evidence_lookup"
  | "clarification_required";

export type QueryPlanConstraint = {
  key: string;
  operator: "eq" | "in" | "before" | "after" | "between";
  value: string | number | boolean | string[];
};

export type QueryTemporalScope = {
  asOf?: string;
  from?: string;
  to?: string;
};

export type SemanticQueryPlan = {
  planId: string;
  planVersion: "1.0.0";
  intent: AgentQueryIntent;
  originalQuestion: string;
  entities: AgentEntityReference[];
  relationTypes: string[];
  requestedFacets: AgentDomain[];
  constraints: QueryPlanConstraint[];
  temporalScope?: QueryTemporalScope;
  assumptions: string[];
};

export type QueryPlanValidationMessage = {
  code: string;
  message: string;
  path?: string;
};

export type ValidatedQueryPlan = {
  plan: SemanticQueryPlan;
  status: "valid";
  ontologyVersion: string;
  authorizedEntityIds: string[];
  queryTemplateId: string;
  parameters: Record<string, string | number | boolean | string[]>;
  warnings: QueryPlanValidationMessage[];
};

export type GraphQueryPlan = {
  graphPlanId: string;
  graphPlanVersion: "1.0.0";
  semanticPlanId: string;
  intent: AgentQueryIntent;
  templateId: string;
  readOnly: true;
  seedEntityIds: string[];
  allowedRelationTypes: string[];
  maxDepth: number;
  resultLimit: number;
  parameters: Record<string, string | number | boolean | string[]>;
};

export type AgentErrorCode =
  | "AGENT_CONTRACT_INCOMPATIBLE"
  | "CLARIFICATION_REQUIRED"
  | "QUERY_PLAN_INVALID"
  | "ONTOLOGY_TERM_INVALID"
  | "QUERY_INTENT_UNSUPPORTED"
  | "EVIDENCE_INSUFFICIENT"
  | "CITATION_INVALID"
  | "SESSION_NOT_FOUND"
  | "PIPELINE_CANCELLED"
  | "PIPELINE_FAILED";

export type AgentError = {
  code: AgentErrorCode;
  message: string;
  stage?: AgentTraceStageName;
  details: Record<string, string | number | boolean>;
};

export type EvidenceKind = "semantic" | "ontology" | "graph" | "document" | "system-record";

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  title: string;
  excerpt: string;
  source: ProvenanceReference;
  linkedEntityIds: string[];
  supportsClaimIds: string[];
  version?: string;
  effectiveAt?: string;
  status?: "draft" | "active" | "superseded";
};

export type EvidencePack = {
  id: string;
  queryPlanId: string;
  generatedAt: string;
  ontologyVersion: string;
  dataVersion: string;
  items: EvidenceItem[];
  limitations: string[];
};

export type AgentCitation = {
  evidenceId: string;
  locator?: string;
};

export type AgentClaim = {
  id: string;
  text: string;
  classification: "fact" | "assumption" | "limitation" | "unknown";
  citations: AgentCitation[];
};

export type AgentAnswer = {
  summary: string;
  findings: string[];
  recommendedActions: string[];
  risks: string[];
  assumptions: string[];
  claims: AgentClaim[];
  confidence: AgentConfidence;
};

export type CitationValidationIssue = {
  claimId: string;
  code: "missing-citation" | "unknown-evidence" | "unsupported-claim" | "inactive-evidence";
  message: string;
};

export type CitationValidationResult = {
  status: "passed" | "failed";
  checkedClaimIds: string[];
  issues: CitationValidationIssue[];
};

export type AgentTraceStageName =
  | "semantic-parsing"
  | "query-plan-validation"
  | "ontology-validation"
  | "query-compilation"
  | "graph-retrieval"
  | "document-retrieval"
  | "evidence-pack"
  | "answer-composition"
  | "citation-validation";

export type AgentTraceStage = {
  id: string;
  stage: AgentTraceStageName;
  status: "completed" | "skipped" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tool?: string;
  inputRefs: string[];
  outputRefs: string[];
  summary: string;
  errorCode?: string;
};

export type StructuredAgentTrace = {
  traceId: string;
  requestId: string;
  stages: AgentTraceStage[];
};

export type AgentTurnResponse = {
  contractVersion: AgentContractVersion;
  requestId: string;
  turnId: string;
  sessionId?: string;
  status: "completed" | "clarification-required" | "failed";
  queryPlan: SemanticQueryPlan;
  graphQueryPlan?: GraphQueryPlan;
  evidencePack: EvidencePack;
  answer: AgentAnswer;
  citationValidation: CitationValidationResult;
  trace: StructuredAgentTrace;
  completedAt: string;
};

export type AgentSession = {
  id: string;
  contractVersion: AgentContractVersion;
  mode: AgentMode;
  language: AgentLanguage;
  turnIds: string[];
  context: AgentConversationContext;
  createdAt: string;
  updatedAt: string;
};

export type AgentAuditEvent = {
  id: string;
  traceId: string;
  sessionId?: string;
  turnId?: string;
  actorId: string;
  action: string;
  resourceIds: string[];
  outcome: "allowed" | "denied" | "completed" | "failed";
  occurredAt: string;
  metadata: Record<string, string | number | boolean>;
};

export type CanonicalKnowledgeBaseline = {
  baselineId: string;
  baselineVersion: string;
  agentContractVersion: AgentContractVersion;
  ontologyVersion: string;
  dataVersion: string;
  scenario: {
    id: string;
    title: string;
    question: string;
    intent: AgentQueryIntent;
    seedEntityIds: string[];
  };
  ids: Record<string, unknown>;
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  request: AgentTurnRequest;
  queryPlan: SemanticQueryPlan;
  graphQueryPlan: GraphQueryPlan;
  evidencePack: EvidencePack;
  expectedResponse: AgentTurnResponse;
};

export interface ContractAgentClient {
  runTurn(request: AgentTurnRequest, signal?: AbortSignal): Promise<AgentTurnResponse>;
}
