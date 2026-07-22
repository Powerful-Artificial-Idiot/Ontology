import type {
  EvaluationCase,
  EvaluationCoverageCounts,
  EvaluationCoverageResult,
  EvaluationDataset,
  ReleaseGatePolicy,
} from "./types";

const DOMAIN_KEYS = {
  "manufacturing-quality": "quality",
  "manufacturing-engineering": "engineeringChange",
  "manufacturing-value-stream": "bottleneck",
  "manufacturing-cross-domain": "crossDomain",
} as const;

export function evaluateEvaluationCoverage(datasets: EvaluationDataset[], policy: ReleaseGatePolicy): EvaluationCoverageResult {
  const reasons: string[] = [];
  const counts: EvaluationCoverageCounts = { quality: 0, engineeringChange: 0, bottleneck: 0, crossDomain: 0, total: 0 };
  const seenCaseIds = new Set<string>();
  const duplicateCaseIds = new Set<string>();
  const invalidCaseIds: string[] = [];
  const skippedCaseIds: string[] = [];
  const presentDomains = new Set<string>();

  for (const dataset of datasets) {
    const domainKey = DOMAIN_KEYS[dataset.domain as keyof typeof DOMAIN_KEYS];
    if (!domainKey) continue;
    presentDomains.add(dataset.domain);
    for (const testCase of dataset.cases) {
      if (testCase.skip) {
        skippedCaseIds.push(testCase.caseId);
        continue;
      }
      if (!hasEffectiveAssertion(testCase)) {
        invalidCaseIds.push(testCase.caseId);
        continue;
      }
      if (seenCaseIds.has(testCase.caseId)) {
        duplicateCaseIds.add(testCase.caseId);
        continue;
      }
      seenCaseIds.add(testCase.caseId);
      counts[domainKey] += 1;
      counts.total += 1;
    }
  }

  const missingDomains = Object.keys(DOMAIN_KEYS).filter((domain) => !presentDomains.has(domain));
  if (missingDomains.length) reasons.push(`Required evaluation domains are missing: ${missingDomains.join(", ")}.`);
  if (duplicateCaseIds.size) reasons.push(`Duplicate evaluation case IDs are not valid coverage: ${[...duplicateCaseIds].sort().join(", ")}.`);
  if (invalidCaseIds.length) reasons.push(`Evaluation cases without effective assertions are not valid coverage: ${invalidCaseIds.sort().join(", ")}.`);
  if (counts.quality < (policy.minimumQualityCaseCount ?? 0)) reasons.push(`Quality case count ${counts.quality} is below ${policy.minimumQualityCaseCount}.`);
  if (counts.engineeringChange < (policy.minimumEngineeringChangeCaseCount ?? 0)) reasons.push(`Engineering Change case count ${counts.engineeringChange} is below ${policy.minimumEngineeringChangeCaseCount}.`);
  if (counts.bottleneck < (policy.minimumBottleneckCaseCount ?? 0)) reasons.push(`Bottleneck case count ${counts.bottleneck} is below ${policy.minimumBottleneckCaseCount}.`);
  if (counts.crossDomain < (policy.minimumCrossDomainCaseCount ?? 0)) reasons.push(`Cross-domain case count ${counts.crossDomain} is below ${policy.minimumCrossDomainCaseCount}.`);
  if (counts.total < (policy.minimumTotalCaseCount ?? 0)) reasons.push(`Total case count ${counts.total} is below ${policy.minimumTotalCaseCount}.`);

  return {
    status: reasons.length ? "failed" : "passed",
    counts,
    duplicateCaseIds: [...duplicateCaseIds].sort(),
    invalidCaseIds: invalidCaseIds.sort(),
    skippedCaseIds: skippedCaseIds.sort(),
    missingDomains,
    reasons,
  };
}

export function hasEffectiveAssertion(testCase: EvaluationCase): boolean {
  return testCase.turns.some((turn) => {
    const expected = turn.expected;
    if (expected.errorCode) return true;
    const semantic = expected.semantic;
    const graph = expected.graph;
    const evidence = expected.evidence;
    const answer = expected.answer;
    const runtime = expected.runtime;
    return Boolean(
      (semantic && (semantic.intent || semantic.entityIds.length || semantic.forbiddenEntityIds?.length))
      || (graph && (graph.templateId || graph.seedEntityIds.length || graph.requiredObjectIds.length || graph.requiredRelationIds.length))
      || (evidence && (evidence.requiredEvidenceIds.length || evidence.forbiddenEvidenceIds?.length || evidence.requiredDocuments?.length || evidence.requireGovernedAccess))
      || (answer && (answer.requiredClaimIds.length || answer.forbiddenClaimIds?.length || answer.forbiddenTerms?.length || answer.minimumLimitations !== undefined || answer.minimumCitationCoverage !== undefined))
      || (runtime && (runtime.maxLatencyMs !== undefined || runtime.expectedPipelineStages !== undefined))
    );
  }) || Boolean(testCase.expectedContext && (
    testCase.expectedContext.turnCount > 0
    || testCase.expectedContext.resolvedEntityIds.length
    || testCase.expectedContext.forbiddenResolvedEntityIds?.length
    || testCase.expectedContext.activeTopic
  ));
}
