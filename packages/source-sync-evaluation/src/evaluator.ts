import type { SourceSyncBlockingMetrics, SourceSyncEvaluationDataset, SourceSyncEvaluationDomain, SourceSyncEvaluationObservation, SourceSyncEvaluationReport, SourceSyncRateMetrics } from "./types";

const domains: SourceSyncEvaluationDomain[] = ["mes", "plm", "qms", "cross-source-recovery"];
const zeroBlocking: SourceSyncBlockingMetrics = { connectorCriticalFailures: 0, unauthorizedPublicationCount: 0, crossTenantPublicationCount: 0, canonicalIdViolationCount: 0, ontologyInvalidPublicationCount: 0, shaclInvalidPublicationCount: 0, staleOverwriteCount: 0, duplicateCanonicalMutationCount: 0, sameVersionHashConflictPublicationCount: 0, partialRunMarkedCompletedCount: 0, failedRunCheckpointAdvanceCount: 0, cancelledRunCheckpointAdvanceCount: 0, missingLineageCount: 0, unresolvedCriticalReconciliationCount: 0, permanentDeleteCount: 0, secretLeakageCount: 0, rawPayloadLeakageCount: 0 };
const perfectRates: SourceSyncRateMetrics = { idempotencyAccuracy: 1, checkpointMonotonicity: 1, mappingDeterminism: 1, publicationVerification: 1, authorizationEnforcement: 1, recoveryDetection: 1, lineageCompleteness: 1, ssrfEnforcement: 1 };

export function evaluateSourceSyncRelease(dataset: SourceSyncEvaluationDataset, observations: SourceSyncEvaluationObservation[], now = new Date()): SourceSyncEvaluationReport {
  validateDataset(dataset);
  const reasons: string[] = [];
  const observationById = new Map(observations.map((item) => [item.caseId, item]));
  if (observationById.size !== observations.length) reasons.push("Duplicate observation case IDs are forbidden.");
  const coverage = { mes: 0, plm: 0, qms: 0, "cross-source-recovery": 0, total: 0 };
  const results = dataset.cases.filter((item) => !item.skip).map((testCase) => {
    coverage[testCase.domain] += 1; coverage.total += 1;
    const observed = observationById.get(testCase.caseId) ?? { caseId: testCase.caseId, passed: false, detail: "Missing observation." };
    if (!observed.passed) reasons.push(`${testCase.caseId}: ${observed.detail}`);
    return { ...observed, domain: testCase.domain };
  });
  for (const domain of domains) if (coverage[domain] < 8) reasons.push(`${domain} coverage ${coverage[domain]} is below 8.`);
  if (coverage.total < 32) reasons.push(`Total coverage ${coverage.total} is below 32.`);
  const blockingMetrics = aggregateBlocking(observations);
  const rates = aggregateRates(observations);
  for (const [name, value] of Object.entries(blockingMetrics)) if (value !== 0) reasons.push(`${name} must be zero; received ${value}.`);
  for (const [name, value] of Object.entries(rates)) if (value !== 1) reasons.push(`${name} must be 100%; received ${value * 100}%.`);
  return { reportVersion: "1.0.0", datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, generatedAt: now.toISOString(), status: reasons.length ? "failed" : "passed", fixtureAcceptance: reasons.length ? "failed" : "passed", enterpriseReadiness: "pending", coverage, results, blockingMetrics, rates, reasons };
}

export function validateDataset(dataset: SourceSyncEvaluationDataset): void {
  if (dataset.datasetVersion !== "1.0.0" || !dataset.datasetId || !dataset.description || !Array.isArray(dataset.cases)) throw new Error("Source synchronization evaluation dataset is invalid.");
  const ids = dataset.cases.map((item) => item.caseId);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate source synchronization evaluation case IDs are forbidden.");
  dataset.cases.forEach((item) => { if (!domains.includes(item.domain) || !item.caseId || !item.title || !item.probeId || !item.assertionIds.length) throw new Error(`Evaluation case ${item.caseId || "<unknown>"} has no effective assertion.`); });
}

function aggregateBlocking(observations: SourceSyncEvaluationObservation[]): SourceSyncBlockingMetrics { const result = { ...zeroBlocking }; for (const item of observations) for (const key of Object.keys(result) as (keyof SourceSyncBlockingMetrics)[]) result[key] += item.metrics?.[key] ?? 0; return result; }
function aggregateRates(observations: SourceSyncEvaluationObservation[]): SourceSyncRateMetrics { const result = { ...perfectRates }; for (const key of Object.keys(result) as (keyof SourceSyncRateMetrics)[]) { const values = observations.map((item) => item.metrics?.[key]).filter((value): value is number => typeof value === "number"); if (!values.length) { result[key] = 0; continue; } result[key] = Math.min(...values); } return result; }
