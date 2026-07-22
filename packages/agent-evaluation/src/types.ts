import type {
  AgentConversationContext,
  AgentLanguage,
  AgentPipelineEvent,
  AgentRunEvent,
  AgentTurnResponse,
} from "../../knowledge-contracts/src/index";

export type EvaluationSeverity = "blocker" | "critical" | "major" | "minor";
export type EvaluationCategory = "semantic" | "graph-retrieval" | "document-retrieval" | "evidence" | "answer-grounding" | "citation" | "context" | "runtime";
export type ProviderAcceptanceStatus = "pending" | "passed" | "failed";

export type EvaluationDataset = {
  datasetId: string;
  version: string;
  domain: string;
  description: string;
  cases: EvaluationCase[];
};

export type EvaluationCase = {
  caseId: string;
  title: string;
  severity: EvaluationSeverity;
  tags: string[];
  executionProfile?: "default" | "no-document-access";
  turns: EvaluationTurnCase[];
  expectedContext?: {
    turnCount: number;
    resolvedEntityIds: string[];
    activeTopic?: string;
  };
};

export type EvaluationTurnCase = {
  turnId: string;
  input: {
    message: string;
    language: AgentLanguage;
    context?: AgentConversationContext;
  };
  expected: EvaluationTurnExpectation;
};

export type EvaluationTurnExpectation = {
  errorCode?: string;
  semantic?: {
    intent: string;
    entityIds: string[];
    forbiddenEntityIds?: string[];
  };
  graph?: {
    templateId: string;
    seedEntityIds: string[];
    requiredObjectIds: string[];
    requiredRelationIds: string[];
    maxDepth?: number;
  };
  evidence?: {
    requiredEvidenceIds: string[];
    forbiddenEvidenceIds?: string[];
    requiredDocuments?: Array<{ documentId: string; version: string; chunkId: string }>;
    requireGovernedAccess?: boolean;
  };
  answer?: {
    requiredClaimIds: string[];
    forbiddenClaimIds?: string[];
    forbiddenTerms?: string[];
    minimumLimitations?: number;
    minimumCitationCoverage?: number;
  };
  runtime?: {
    maxLatencyMs?: number;
    expectedPipelineStages?: number;
  };
};

export type EvaluationTurnExecution = {
  turnId: string;
  startedAt: string;
  completedAt: string;
  response?: AgentTurnResponse;
  errorCode?: string;
  pipelineEvents: AgentPipelineEvent[];
  runEvents?: AgentRunEvent[];
};

export type EvaluationCaseExecution = {
  caseId: string;
  turns: EvaluationTurnExecution[];
  finalContext?: AgentConversationContext;
};

export interface EvaluationCaseExecutor {
  execute(testCase: EvaluationCase): Promise<EvaluationCaseExecution>;
}

export type EvaluationCheck = {
  id: string;
  category: EvaluationCategory;
  severity: EvaluationSeverity;
  passed: boolean;
  message: string;
  expected?: string | number | boolean;
  actual?: string | number | boolean;
};

export type EvaluationMetric = {
  id: string;
  category: "business" | "technical";
  unit: "ratio" | "count" | "milliseconds" | "status";
  value: number | string;
};

export type EvaluationCaseResult = {
  caseId: string;
  title: string;
  severity: EvaluationSeverity;
  status: "passed" | "failed";
  checks: EvaluationCheck[];
  metrics: EvaluationMetric[];
};

export type RuntimeProbeResult = {
  id: string;
  status: "passed" | "failed";
  checks: EvaluationCheck[];
  metrics: EvaluationMetric[];
};

export type EvaluationProviderAcceptance = {
  semanticParser: ProviderAcceptanceStatus;
  answerComposer: ProviderAcceptanceStatus;
  modelIds?: string[];
  checkedAt?: string;
  details: string[];
};

export type EvaluationReport = {
  reportVersion: "1.0.0";
  reportId: string;
  datasetId: string;
  datasetVersion: string;
  generatedAt: string;
  environment: {
    repositoryMode: string;
    documentIndexMode: string;
    semanticParserMode: string;
    answerComposerMode: string;
  };
  providerAcceptance: EvaluationProviderAcceptance;
  cases: EvaluationCaseResult[];
  runtimeProbes: RuntimeProbeResult[];
  aggregate: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    blockerFailures: number;
    criticalFailures: number;
    citationCoverage: number;
    p95LatencyMs: number;
  };
};

export type ReleaseGatePolicy = {
  policyId: string;
  version: string;
  minimumCasePassRate: number;
  minimumCitationCoverage: number;
  maximumP95LatencyMs: number;
  allowBlockerFailures: number;
  allowCriticalFailures: number;
  requireRuntimeProbes: boolean;
  requireSemanticProviderAcceptance: boolean;
  requireAnswerProviderAcceptance: boolean;
};

export type ReleaseGateResult = {
  status: "passed" | "failed";
  policyId: string;
  policyVersion: string;
  evaluatedAt: string;
  reasons: string[];
};

export type EvaluationRegression = {
  status: "improved" | "unchanged" | "regressed";
  baselineReportId: string;
  currentReportId: string;
  deltas: Array<{ metric: string; baseline: number; current: number; delta: number }>;
  newFailedCaseIds: string[];
  recoveredCaseIds: string[];
};

export type AgentTelemetryEvent = {
  eventVersion: "1.0.0";
  id: string;
  type: "pipeline" | "run" | "evaluation" | "provider";
  occurredAt: string;
  traceId?: string;
  runId?: string;
  caseId?: string;
  stage?: string;
  durationMs?: number;
  status: string;
  attributes: Record<string, string | number | boolean>;
};

export interface AgentTelemetrySink {
  record(event: AgentTelemetryEvent): void | Promise<void>;
}
