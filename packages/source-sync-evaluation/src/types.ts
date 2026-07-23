export type SourceSyncEvaluationDomain = "mes" | "plm" | "qms" | "cross-source-recovery";
export type SourceSyncEvaluationCase = { caseId: string; domain: SourceSyncEvaluationDomain; title: string; assertionIds: string[]; probeId: string; skip?: boolean };
export type SourceSyncEvaluationDataset = { datasetVersion: "1.0.0"; datasetId: string; description: string; cases: SourceSyncEvaluationCase[] };
export type SourceSyncEvaluationObservation = { caseId: string; passed: boolean; detail: string; metrics?: Partial<SourceSyncBlockingMetrics & SourceSyncRateMetrics> };
export type SourceSyncBlockingMetrics = {
  connectorCriticalFailures: number; unauthorizedPublicationCount: number; crossTenantPublicationCount: number;
  canonicalIdViolationCount: number; ontologyInvalidPublicationCount: number; shaclInvalidPublicationCount: number;
  staleOverwriteCount: number; duplicateCanonicalMutationCount: number; sameVersionHashConflictPublicationCount: number;
  partialRunMarkedCompletedCount: number; failedRunCheckpointAdvanceCount: number; cancelledRunCheckpointAdvanceCount: number;
  missingLineageCount: number; unresolvedCriticalReconciliationCount: number; permanentDeleteCount: number;
  secretLeakageCount: number; rawPayloadLeakageCount: number;
};
export type SourceSyncRateMetrics = {
  idempotencyAccuracy: number; checkpointMonotonicity: number; mappingDeterminism: number; publicationVerification: number;
  authorizationEnforcement: number; recoveryDetection: number; lineageCompleteness: number; ssrfEnforcement: number;
};
export type SourceSyncEvaluationReport = {
  reportVersion: "1.0.0"; datasetId: string; datasetVersion: string; generatedAt: string; status: "passed" | "failed";
  fixtureAcceptance: "passed" | "failed"; enterpriseReadiness: "pending";
  coverage: Record<SourceSyncEvaluationDomain | "total", number>;
  results: Array<SourceSyncEvaluationObservation & { domain: SourceSyncEvaluationDomain }>;
  blockingMetrics: SourceSyncBlockingMetrics; rates: SourceSyncRateMetrics; reasons: string[];
};
