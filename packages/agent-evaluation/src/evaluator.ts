import type { AgentClaim, AgentConversationContext, AgentTurnResponse } from "../../knowledge-contracts/src/index";
import type {
  EvaluationCase,
  EvaluationCaseExecution,
  EvaluationCaseResult,
  EvaluationCheck,
  EvaluationMetric,
  EvaluationTurnCase,
  EvaluationTurnExecution,
} from "./types";

export function evaluateCase(testCase: EvaluationCase, execution: EvaluationCaseExecution): EvaluationCaseResult {
  const checks: EvaluationCheck[] = [];
  const metrics: EvaluationMetric[] = [];
  testCase.turns.forEach((turnCase, index) => {
    const turn = execution.turns[index];
    if (!turn) {
      checks.push(check(`${turnCase.turnId}.execution`, "runtime", testCase, false, "Evaluation turn did not execute."));
      return;
    }
    evaluateTurn(testCase, turnCase, turn, checks, metrics);
  });
  evaluateContext(testCase, execution.finalContext, checks);
  return {
    caseId: testCase.caseId,
    title: testCase.title,
    severity: testCase.severity,
    status: checks.every((item) => item.passed) ? "passed" : "failed",
    checks,
    metrics,
  };
}

function evaluateTurn(testCase: EvaluationCase, expected: EvaluationTurnCase, execution: EvaluationTurnExecution, checks: EvaluationCheck[], metrics: EvaluationMetric[]): void {
  const prefix = `${testCase.caseId}.${expected.turnId}`;
  if (expected.expected.errorCode) {
    checks.push(check(`${prefix}.expected-error`, "runtime", testCase, execution.errorCode === expected.expected.errorCode, "Expected failure code is returned.", expected.expected.errorCode, execution.errorCode ?? "none"));
    return;
  }
  checks.push(check(`${prefix}.completed`, "runtime", testCase, Boolean(execution.response) && !execution.errorCode, "Turn completed without an unexpected error.", "completed", execution.errorCode ?? "completed"));
  if (!execution.response) return;
  const response = execution.response;
  evaluateSemantic(prefix, testCase, expected, response, checks, metrics);
  evaluateGraph(prefix, testCase, expected, response, checks, metrics);
  evaluateEvidence(prefix, testCase, expected, response, checks, metrics);
  evaluateAnswer(prefix, testCase, expected, response, checks, metrics);
  evaluateRuntime(prefix, testCase, expected, execution, response, checks, metrics);
}

function evaluateSemantic(prefix: string, testCase: EvaluationCase, expected: EvaluationTurnCase, response: AgentTurnResponse, checks: EvaluationCheck[], metrics: EvaluationMetric[]): void {
  const semantic = expected.expected.semantic;
  if (!semantic) return;
  const actualIds = response.queryPlan.entities.map((entity) => entity.id);
  checks.push(check(`${prefix}.intent`, "semantic", testCase, response.queryPlan.intent === semantic.intent, "Semantic intent matches the governed expectation.", semantic.intent, response.queryPlan.intent));
  addSetChecks(`${prefix}.entities`, "semantic", testCase, semantic.entityIds, actualIds, checks, metrics, "semantic.entity");
  const forbidden = semantic.forbiddenEntityIds ?? [];
  checks.push(check(`${prefix}.forbidden-entities`, "semantic", testCase, forbidden.every((id) => !actualIds.includes(id)), "No forbidden canonical entity was resolved.", 0, forbidden.filter((id) => actualIds.includes(id)).length));
}

function evaluateGraph(prefix: string, testCase: EvaluationCase, expected: EvaluationTurnCase, response: AgentTurnResponse, checks: EvaluationCheck[], metrics: EvaluationMetric[]): void {
  const graph = expected.expected.graph;
  if (!graph) return;
  const plan = response.graphQueryPlan;
  checks.push(check(`${prefix}.graph-template`, "graph-retrieval", testCase, plan?.templateId === graph.templateId, "Safe graph template matches.", graph.templateId, plan?.templateId ?? "missing"));
  checks.push(check(`${prefix}.graph-seeds`, "graph-retrieval", testCase, setEqual(graph.seedEntityIds, plan?.seedEntityIds ?? []), "Graph seed IDs match exactly."));
  if (graph.maxDepth !== undefined) checks.push(check(`${prefix}.graph-depth`, "graph-retrieval", testCase, Boolean(plan && plan.maxDepth <= graph.maxDepth), "Graph traversal stays within the expected depth.", graph.maxDepth, plan?.maxDepth ?? -1));
  const outputRefs = response.trace.stages.find((stage) => stage.stage === "graph-retrieval")?.outputRefs ?? [];
  addRecallCheck(`${prefix}.graph-objects`, "graph-retrieval", testCase, graph.requiredObjectIds, outputRefs, checks, metrics, "graph.object.recall");
  addRecallCheck(`${prefix}.graph-relations`, "graph-retrieval", testCase, graph.requiredRelationIds, outputRefs, checks, metrics, "graph.relation.recall");
}

function evaluateEvidence(prefix: string, testCase: EvaluationCase, expected: EvaluationTurnCase, response: AgentTurnResponse, checks: EvaluationCheck[], metrics: EvaluationMetric[]): void {
  const evidenceExpectation = expected.expected.evidence;
  if (!evidenceExpectation) return;
  const evidenceIds = response.evidencePack.items.map((item) => item.id);
  addRecallCheck(`${prefix}.evidence`, "evidence", testCase, evidenceExpectation.requiredEvidenceIds, evidenceIds, checks, metrics, "evidence.recall");
  const forbidden = evidenceExpectation.forbiddenEvidenceIds ?? [];
  checks.push(check(`${prefix}.forbidden-evidence`, "evidence", testCase, forbidden.every((id) => !evidenceIds.includes(id)), "No forbidden evidence entered the Evidence Pack.", 0, forbidden.filter((id) => evidenceIds.includes(id)).length));
  for (const document of evidenceExpectation.requiredDocuments ?? []) {
    const item = response.evidencePack.items.find((evidence) => evidence.id === document.chunkId);
    const matches = Boolean(item && item.version === document.version && item.governance?.documentId === document.documentId);
    checks.push(check(`${prefix}.document.${document.documentId}`, "document-retrieval", testCase, matches, "Required governed document version and chunk were retrieved."));
  }
  if (evidenceExpectation.requireGovernedAccess) {
    const governed = response.evidencePack.items.filter((item) => item.kind === "document" || item.kind === "system-record");
    const allowed = governed.every((item) => item.governance?.approvalStatus === "approved" && item.governance.lifecycleStatus === "effective" && item.governance.accessDecision === "allowed");
    checks.push(check(`${prefix}.governed-access`, "evidence", testCase, allowed && governed.length > 0, "Every document item is approved, effective, and access-allowed."));
  }
}

function evaluateAnswer(prefix: string, testCase: EvaluationCase, expected: EvaluationTurnCase, response: AgentTurnResponse, checks: EvaluationCheck[], metrics: EvaluationMetric[]): void {
  const answerExpectation = expected.expected.answer;
  if (!answerExpectation) return;
  const claimIds = response.answer.claims.map((claim) => claim.id);
  addRecallCheck(`${prefix}.claims`, "answer-grounding", testCase, answerExpectation.requiredClaimIds, claimIds, checks, metrics, "answer.claim.recall");
  const forbiddenClaims = answerExpectation.forbiddenClaimIds ?? [];
  checks.push(check(`${prefix}.forbidden-claims`, "answer-grounding", testCase, forbiddenClaims.every((id) => !claimIds.includes(id)), "No forbidden claim was generated."));
  const answerText = JSON.stringify(response.answer).toLowerCase();
  const forbiddenTerms = answerExpectation.forbiddenTerms ?? [];
  checks.push(check(`${prefix}.forbidden-terms`, "answer-grounding", testCase, forbiddenTerms.every((term) => !answerText.includes(term.toLowerCase())), "No unsupported target was asserted in the answer."));
  const limitations = response.answer.limitations ?? [];
  const minimumLimitations = answerExpectation.minimumLimitations ?? 0;
  checks.push(check(`${prefix}.limitations`, "answer-grounding", testCase, limitations.length >= minimumLimitations, "Required limitations remain explicit.", minimumLimitations, limitations.length));
  const citationCoverage = factualCitationCoverage(response.answer.claims, response.evidencePack.items.map((item) => item.id));
  metrics.push(metric(`${prefix}.citation-coverage`, "business", "ratio", citationCoverage));
  checks.push(check(`${prefix}.citation-coverage`, "citation", testCase, citationCoverage >= (answerExpectation.minimumCitationCoverage ?? 1), "Factual claims have valid Evidence Pack citations.", answerExpectation.minimumCitationCoverage ?? 1, citationCoverage));
  checks.push(check(`${prefix}.citation-gate`, "citation", testCase, response.citationValidation.status === "passed" && response.citationValidation.issues.length === 0, "Deterministic citation publication gate passed."));
}

function evaluateRuntime(prefix: string, testCase: EvaluationCase, expected: EvaluationTurnCase, execution: EvaluationTurnExecution, response: AgentTurnResponse, checks: EvaluationCheck[], metrics: EvaluationMetric[]): void {
  const totalLatency = Math.max(0, Date.parse(execution.completedAt) - Date.parse(execution.startedAt));
  metrics.push(metric(`${prefix}.latency`, "technical", "milliseconds", totalLatency));
  metrics.push(metric(`${prefix}.trace-stage-count`, "technical", "count", response.trace.stages.length));
  if (expected.expected.runtime?.maxLatencyMs !== undefined) checks.push(check(`${prefix}.latency`, "runtime", testCase, totalLatency <= expected.expected.runtime.maxLatencyMs, "Turn latency stays within the case budget.", expected.expected.runtime.maxLatencyMs, totalLatency));
  if (expected.expected.runtime?.expectedPipelineStages !== undefined) checks.push(check(`${prefix}.stage-count`, "runtime", testCase, response.trace.stages.length === expected.expected.runtime.expectedPipelineStages, "Structured trace contains every expected stage.", expected.expected.runtime.expectedPipelineStages, response.trace.stages.length));
  const eventTypes = execution.pipelineEvents.map((event) => event.type);
  checks.push(check(`${prefix}.pipeline-events`, "runtime", testCase, eventTypes[0] === "pipeline-started" && eventTypes.at(-1) === "pipeline-completed", "Pipeline event lifecycle is complete."));
}

function evaluateContext(testCase: EvaluationCase, context: AgentConversationContext | undefined, checks: EvaluationCheck[]): void {
  if (!testCase.expectedContext) return;
  checks.push(check(`${testCase.caseId}.context-turns`, "context", testCase, context?.previousTurnIds.length === testCase.expectedContext.turnCount, "Session context contains the expected completed turns.", testCase.expectedContext.turnCount, context?.previousTurnIds.length ?? 0));
  checks.push(check(`${testCase.caseId}.context-entities`, "context", testCase, Boolean(context && testCase.expectedContext.resolvedEntityIds.every((id) => context.resolvedEntityIds.includes(id))), "Session context preserves expected canonical entities."));
  const forbidden = testCase.expectedContext.forbiddenResolvedEntityIds ?? [];
  checks.push(check(`${testCase.caseId}.context-forbidden-entities`, "context", testCase, Boolean(context && forbidden.every((id) => !context.resolvedEntityIds.includes(id))), "Session context does not retain stale canonical entities.", 0, context?.resolvedEntityIds.filter((id) => forbidden.includes(id)).length ?? 0));
  if (testCase.expectedContext.activeTopic) checks.push(check(`${testCase.caseId}.context-topic`, "context", testCase, context?.activeTopic === testCase.expectedContext.activeTopic, "Session active topic is stable.", testCase.expectedContext.activeTopic, context?.activeTopic ?? "missing"));
}

function addSetChecks(prefix: string, category: EvaluationCheck["category"], testCase: EvaluationCase, expected: string[], actual: string[], checks: EvaluationCheck[], metrics: EvaluationMetric[], metricPrefix: string): void {
  const recall = ratio(expected.filter((id) => actual.includes(id)).length, expected.length);
  const precision = ratio(actual.filter((id) => expected.includes(id)).length, actual.length);
  checks.push(check(`${prefix}.exact`, category, testCase, setEqual(expected, actual), "Canonical ID set matches exactly."));
  metrics.push(metric(`${metricPrefix}.recall`, "business", "ratio", recall), metric(`${metricPrefix}.precision`, "business", "ratio", precision));
  metrics.push(metric(`${metricPrefix}.unexpected-count`, "business", "count", actual.filter((id) => !expected.includes(id)).length));
}

function addRecallCheck(id: string, category: EvaluationCheck["category"], testCase: EvaluationCase, expected: string[], actual: string[], checks: EvaluationCheck[], metrics: EvaluationMetric[], metricId: string): void {
  const matched = expected.filter((item) => actual.includes(item)).length;
  const recall = ratio(matched, expected.length);
  checks.push(check(id, category, testCase, recall === 1, "All required governed IDs were retrieved.", expected.length, matched));
  metrics.push(metric(metricId, "business", "ratio", recall));
}

function factualCitationCoverage(claims: AgentClaim[], evidenceIds: string[]): number {
  const facts = claims.filter((claim) => claim.classification === "fact");
  return ratio(facts.filter((claim) => claim.citations.length > 0 && claim.citations.every((citation) => evidenceIds.includes(citation.evidenceId))).length, facts.length);
}

function check(id: string, category: EvaluationCheck["category"], testCase: EvaluationCase, passed: boolean, message: string, expected?: string | number | boolean, actual?: string | number | boolean): EvaluationCheck {
  return { id, category, severity: testCase.severity, passed, message, expected, actual };
}

function metric(id: string, category: EvaluationMetric["category"], unit: EvaluationMetric["unit"], value: number | string): EvaluationMetric {
  return { id, category, unit, value };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function setEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
