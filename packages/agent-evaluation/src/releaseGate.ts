import type { EvaluationRegression, EvaluationReport, ReleaseGatePolicy, ReleaseGateResult } from "./types";

export function validateReleaseGatePolicy(value: unknown): asserts value is ReleaseGatePolicy {
  if (!isRecord(value) || !isString(value.policyId) || !isString(value.version)) throw new Error("Release gate policy identity is required.");
  for (const key of ["minimumCasePassRate", "minimumCitationCoverage"] as const) {
    if (typeof value[key] !== "number" || value[key] < 0 || value[key] > 1) throw new Error(`${key} must be a ratio between 0 and 1.`);
  }
  if (typeof value.maximumP95LatencyMs !== "number" || value.maximumP95LatencyMs < 0) throw new Error("maximumP95LatencyMs must be non-negative.");
  for (const key of ["allowBlockerFailures", "allowCriticalFailures"] as const) {
    if (!Number.isInteger(value[key]) || (value[key] as number) < 0) throw new Error(`${key} must be a non-negative integer.`);
  }
  for (const key of ["requireRuntimeProbes", "requireSemanticProviderAcceptance", "requireAnswerProviderAcceptance"] as const) {
    if (typeof value[key] !== "boolean") throw new Error(`${key} must be boolean.`);
  }
}

export function evaluateReleaseGate(report: EvaluationReport, policy: ReleaseGatePolicy, evaluatedAt = new Date().toISOString()): ReleaseGateResult {
  const reasons: string[] = [];
  if (report.aggregate.passRate < policy.minimumCasePassRate) reasons.push(`Case pass rate ${report.aggregate.passRate} is below ${policy.minimumCasePassRate}.`);
  if (report.aggregate.citationCoverage < policy.minimumCitationCoverage) reasons.push(`Citation coverage ${report.aggregate.citationCoverage} is below ${policy.minimumCitationCoverage}.`);
  if (report.aggregate.p95LatencyMs > policy.maximumP95LatencyMs) reasons.push(`P95 latency ${report.aggregate.p95LatencyMs}ms exceeds ${policy.maximumP95LatencyMs}ms.`);
  if (report.aggregate.blockerFailures > policy.allowBlockerFailures) reasons.push(`Blocker failures ${report.aggregate.blockerFailures} exceed ${policy.allowBlockerFailures}.`);
  if (report.aggregate.criticalFailures > policy.allowCriticalFailures) reasons.push(`Critical failures ${report.aggregate.criticalFailures} exceed ${policy.allowCriticalFailures}.`);
  if (policy.requireRuntimeProbes && (report.runtimeProbes.length === 0 || report.runtimeProbes.some((probe) => probe.status !== "passed"))) reasons.push("Required runtime probes did not all pass.");
  if (policy.requireSemanticProviderAcceptance && report.providerAcceptance.semanticParser !== "passed") reasons.push(`Semantic Parser live provider acceptance is ${report.providerAcceptance.semanticParser}.`);
  if (policy.requireAnswerProviderAcceptance && report.providerAcceptance.answerComposer !== "passed") reasons.push(`Answer Composer live provider acceptance is ${report.providerAcceptance.answerComposer}.`);
  return { status: reasons.length ? "failed" : "passed", policyId: policy.policyId, policyVersion: policy.version, evaluatedAt, reasons };
}

export function compareEvaluationReports(baseline: EvaluationReport, current: EvaluationReport): EvaluationRegression {
  if (baseline.datasetId !== current.datasetId || baseline.datasetVersion !== current.datasetVersion) throw new Error("Evaluation reports must use the same dataset and version.");
  const deltas = [
    delta("passRate", baseline.aggregate.passRate, current.aggregate.passRate),
    delta("citationCoverage", baseline.aggregate.citationCoverage, current.aggregate.citationCoverage),
    delta("p95LatencyMs", baseline.aggregate.p95LatencyMs, current.aggregate.p95LatencyMs),
    delta("blockerFailures", baseline.aggregate.blockerFailures, current.aggregate.blockerFailures),
    delta("criticalFailures", baseline.aggregate.criticalFailures, current.aggregate.criticalFailures),
  ];
  const baselineFailed = new Set(baseline.cases.filter((result) => result.status === "failed").map((result) => result.caseId));
  const currentFailed = new Set(current.cases.filter((result) => result.status === "failed").map((result) => result.caseId));
  const newFailedCaseIds = [...currentFailed].filter((id) => !baselineFailed.has(id));
  const recoveredCaseIds = [...baselineFailed].filter((id) => !currentFailed.has(id));
  const regressed = newFailedCaseIds.length > 0
    || current.aggregate.passRate < baseline.aggregate.passRate
    || current.aggregate.citationCoverage < baseline.aggregate.citationCoverage
    || current.aggregate.blockerFailures > baseline.aggregate.blockerFailures
    || current.aggregate.criticalFailures > baseline.aggregate.criticalFailures;
  const improved = !regressed && (recoveredCaseIds.length > 0 || current.aggregate.passRate > baseline.aggregate.passRate || current.aggregate.citationCoverage > baseline.aggregate.citationCoverage);
  return {
    status: regressed ? "regressed" : improved ? "improved" : "unchanged",
    baselineReportId: baseline.reportId,
    currentReportId: current.reportId,
    deltas,
    newFailedCaseIds,
    recoveredCaseIds,
  };
}

function delta(metric: string, baseline: number, current: number) {
  return { metric, baseline, current, delta: current - baseline };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
