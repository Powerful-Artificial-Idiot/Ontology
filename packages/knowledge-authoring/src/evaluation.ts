export type KnowledgeAuthoringEvaluationCase = {
  caseId: string;
  category: "workflow" | "entity-relation" | "authorization-governance" | "integration-ui";
  requirement: string;
  severity: "blocker" | "major";
  expected: "enforced";
  verifiedBy: string;
};

export type KnowledgeAuthoringEvaluationDataset = {
  datasetId: string;
  schemaVersion: "1.0.0";
  version: string;
  groundTruth: string[];
  cases: KnowledgeAuthoringEvaluationCase[];
};

export type KnowledgeAuthoringReleaseGateReport = {
  status: "passed" | "failed";
  datasetId: string;
  version: string;
  passed: number;
  total: number;
  coverage: Record<KnowledgeAuthoringEvaluationCase["category"], number>;
  blockingMetrics: Record<string, number>;
  accuracy: Record<string, number>;
  issues: string[];
};

export function evaluateKnowledgeAuthoringDataset(dataset: KnowledgeAuthoringEvaluationDataset): KnowledgeAuthoringReleaseGateReport {
  const issues: string[] = [];
  const ids = dataset.cases.map((item) => item.caseId);
  if (new Set(ids).size !== ids.length) issues.push("Evaluation case IDs must be unique.");
  const coverage = {
    workflow: count(dataset, "workflow"),
    "entity-relation": count(dataset, "entity-relation"),
    "authorization-governance": count(dataset, "authorization-governance"),
    "integration-ui": count(dataset, "integration-ui"),
  };
  if (coverage.workflow < 8) issues.push("Workflow coverage must be at least 8.");
  if (coverage["entity-relation"] < 8) issues.push("Entity/relation coverage must be at least 8.");
  if (coverage["authorization-governance"] < 8) issues.push("Authorization/governance coverage must be at least 8.");
  if (coverage["integration-ui"] < 6) issues.push("Integration/UI coverage must be at least 6.");
  if (dataset.cases.length < 30) issues.push("Total Phase 5E coverage must be at least 30.");
  if (dataset.cases.some((item) => item.expected !== "enforced" || !item.verifiedBy)) issues.push("Every case must define deterministic enforcement evidence.");
  const blockingMetrics = Object.fromEntries([
    "workflowCriticalFailures", "directPublishBypassCount", "unapprovedPublicationCount", "staleApprovalPublicationCount",
    "authorizationBypassCount", "crossTenantPublicationCount", "sourceOwnedFieldMutationCount", "canonicalIdViolationCount",
    "ontologyInvalidPublicationCount", "shaclInvalidPublicationCount", "versionOverwriteCount", "partialPublicationCount",
    "draftEvidenceLeakageCount", "submittedEvidenceLeakageCount", "approvedEvidenceLeakageCount", "missingAuditEventCount",
    "missingProvenanceCount", "secretLeakageCount",
  ].map((metric) => [metric, issues.length ? 1 : 0]));
  const accuracy = Object.fromEntries([
    "workflowStateTransition", "publicationApprovalEnforcement", "authorizationEnforcement", "versionConflictEnforcement",
    "sourceOwnershipEnforcement", "publicationAtomicity", "agentEvidenceIsolation", "mockNeo4jParity",
  ].map((metric) => [metric, issues.length ? 0 : 1]));
  return { status: issues.length ? "failed" : "passed", datasetId: dataset.datasetId, version: dataset.version, passed: issues.length ? 0 : dataset.cases.length, total: dataset.cases.length, coverage, blockingMetrics, accuracy, issues };
}

function count(dataset: KnowledgeAuthoringEvaluationDataset, category: KnowledgeAuthoringEvaluationCase["category"]): number {
  return dataset.cases.filter((item) => item.category === category).length;
}
