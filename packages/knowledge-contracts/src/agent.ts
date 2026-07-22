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
  | "AGENT_REQUEST_INVALID"
  | "CLARIFICATION_REQUIRED"
  | "QUERY_PLAN_INVALID"
  | "ONTOLOGY_TERM_INVALID"
  | "QUERY_INTENT_UNSUPPORTED"
  | "EVIDENCE_INSUFFICIENT"
  | "CITATION_INVALID"
  | "SCENARIO_NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "SESSION_ALREADY_EXISTS"
  | "TURN_NOT_FOUND"
  | "TURN_ALREADY_EXISTS"
  | "RUN_NOT_FOUND"
  | "RUN_NOT_RETRYABLE"
  | "RUN_INTERRUPTED"
  | "LLM_PROVIDER_UNAVAILABLE"
  | "LLM_RESPONSE_INVALID"
  | "LLM_ENTITY_UNRESOLVED"
  | "REQUEST_TIMEOUT"
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

export type EvidenceClaimPolicy = {
  claimId: string;
  classification: AgentClaim["classification"];
  required: boolean;
};

export type EvidencePack = {
  id: string;
  queryPlanId: string;
  generatedAt: string;
  ontologyVersion: string;
  dataVersion: string;
  items: EvidenceItem[];
  claimPolicies?: EvidenceClaimPolicy[];
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
  limitations?: string[];
  claims: AgentClaim[];
  confidence: AgentConfidence;
};

export type CitationValidationIssue = {
  claimId: string;
  code: "missing-citation" | "unknown-evidence" | "unsupported-claim" | "inactive-evidence" | "unknown-claim" | "duplicate-claim" | "missing-required-claim" | "claim-classification-mismatch";
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

export type AgentPipelineStageStart = {
  id: string;
  stage: AgentTraceStageName;
  startedAt: string;
  tool?: string;
  inputRefs: string[];
};

export type AgentPipelineEvent =
  | {
      type: "pipeline-started";
      requestId: string;
      turnId: string;
      traceId: string;
      occurredAt: string;
    }
  | {
      type: "stage-started";
      requestId: string;
      turnId: string;
      traceId: string;
      stage: AgentPipelineStageStart;
      occurredAt: string;
    }
  | {
      type: "stage-completed" | "stage-failed";
      requestId: string;
      turnId: string;
      traceId: string;
      stage: AgentTraceStage;
      occurredAt: string;
    }
  | {
      type: "pipeline-completed";
      requestId: string;
      turnId: string;
      traceId: string;
      occurredAt: string;
    };

export type AgentPipelineEventHandler = (event: AgentPipelineEvent) => void | Promise<void>;

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
  scenarioId: string;
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

export type AgentScenarioDescriptor = {
  id: string;
  title: string;
  description: string;
  domain: AgentDomain;
  supportedModes: AgentMode[];
  supportedLanguages: AgentLanguage[];
  suggestedQuestions: Array<{
    zh: string;
    en: string;
  }>;
};

export type AgentScenarioListResource = {
  scenarios: AgentScenarioDescriptor[];
};

export type CreateAgentSessionRequest = {
  contractVersion: AgentContractVersion;
  scenarioId: string;
  mode: AgentMode;
  language: AgentLanguage;
};

export type AgentSessionResource = {
  session: AgentSession;
};

export type AgentTurnRecord = {
  sessionId: string;
  request: AgentTurnRequest;
  response: AgentTurnResponse;
  auditEventIds: string[];
  createdAt: string;
  persistedAt: string;
};

export type AgentTurnRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type AgentTurnRun = {
  id: string;
  sessionId: string;
  requestId: string;
  turnId: string;
  request: AgentTurnRequest;
  status: AgentTurnRunStatus;
  attempt: number;
  retryOfRunId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: AgentError;
};

export type AgentRunEventType =
  | "run-queued"
  | "run-started"
  | "pipeline-event"
  | "run-completed"
  | "run-failed"
  | "run-cancelled";

export type AgentRunEvent = {
  id: string;
  sequence: number;
  runId: string;
  sessionId: string;
  turnId: string;
  type: AgentRunEventType;
  occurredAt: string;
  pipelineEvent?: AgentPipelineEvent;
  error?: AgentError;
};

export type AgentTurnRunResource = {
  run: AgentTurnRun;
};

export type AgentTurnRunListResource = {
  sessionId: string;
  runs: AgentTurnRun[];
};

export type AgentRunEventListResource = {
  runId: string;
  events: AgentRunEvent[];
};

export type AgentTurnResource = {
  turn: AgentTurnRecord;
};

export type AgentTurnListResource = {
  sessionId: string;
  turns: AgentTurnRecord[];
};

export type AgentTraceResource = {
  turnId: string;
  trace: StructuredAgentTrace;
};

export type AgentEvidenceResource = {
  turnId: string;
  evidencePack: EvidencePack;
  citationValidation: CitationValidationResult;
};

export type AgentAuditResource = {
  sessionId?: string;
  turnId?: string;
  events: AgentAuditEvent[];
};

export type AgentApiErrorResponse = {
  error: AgentError;
  requestId?: string;
  traceId?: string;
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
  semanticAliases?: Record<string, string[]>;
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  request: AgentTurnRequest;
  queryPlan: SemanticQueryPlan;
  graphQueryPlan: GraphQueryPlan;
  evidencePack: EvidencePack;
  expectedResponse: AgentTurnResponse;
};

export interface ContractAgentClient {
  runTurn(request: AgentTurnRequest, signal?: AbortSignal, onEvent?: AgentPipelineEventHandler): Promise<AgentTurnResponse>;
}
