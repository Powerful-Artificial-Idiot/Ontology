import { evaluateCase } from "./evaluator";
import type {
  AgentTelemetrySink,
  EvaluationCaseExecutor,
  EvaluationCaseResult,
  EvaluationDataset,
  EvaluationMetric,
  EvaluationProviderAcceptance,
  EvaluationReport,
  RuntimeProbeResult,
} from "./types";

export type AgentEvaluationRunnerOptions = {
  executor: EvaluationCaseExecutor;
  now?: () => Date;
  telemetry?: AgentTelemetrySink;
  environment: EvaluationReport["environment"];
  providerAcceptance: EvaluationProviderAcceptance;
  runtimeProbes?: () => Promise<RuntimeProbeResult[]>;
};

export class AgentEvaluationRunner {
  private readonly now: () => Date;

  constructor(private readonly options: AgentEvaluationRunnerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async run(dataset: EvaluationDataset): Promise<EvaluationReport> {
    validateEvaluationDataset(dataset);
    const results: EvaluationCaseResult[] = [];
    for (const testCase of dataset.cases) {
      if (testCase.skip) continue;
      const execution = await this.options.executor.execute(testCase);
      const result = evaluateCase(testCase, execution);
      results.push(result);
      await this.options.telemetry?.record({
        eventVersion: "1.0.0",
        id: `telemetry.evaluation.${testCase.caseId}`,
        type: "evaluation",
        occurredAt: this.now().toISOString(),
        caseId: testCase.caseId,
        status: result.status,
        attributes: {
          severity: testCase.severity,
          checks: result.checks.length,
          failedChecks: result.checks.filter((check) => !check.passed).length,
        },
      });
    }
    const runtimeProbes = await this.options.runtimeProbes?.() ?? [];
    const generatedAt = this.now().toISOString();
    const latencyValues = results.flatMap((result) => numericMetrics(result.metrics, ".latency"));
    const citationValues = results.flatMap((result) => numericMetrics(result.metrics, "citation-coverage"));
    const failed = results.filter((result) => result.status === "failed");
    return {
      reportVersion: "1.0.0",
      reportId: `evaluation-report.${dataset.datasetId}.${dataset.version}.${generatedAt.replace(/[^0-9]/gu, "")}`,
      datasetId: dataset.datasetId,
      datasetVersion: dataset.version,
      generatedAt,
      environment: { ...this.options.environment },
      providerAcceptance: {
        providerId: this.options.providerAcceptance.providerId,
        transport: this.options.providerAcceptance.transport,
        fallbackUsed: this.options.providerAcceptance.fallbackUsed,
        semanticParser: this.options.providerAcceptance.semanticParser,
        answerComposer: this.options.providerAcceptance.answerComposer,
        fullPipeline: this.options.providerAcceptance.fullPipeline,
        modelIds: this.options.providerAcceptance.modelIds ? [...this.options.providerAcceptance.modelIds] : undefined,
        checkedAt: this.options.providerAcceptance.checkedAt,
        details: [...this.options.providerAcceptance.details],
        scenarios: this.options.providerAcceptance.scenarios?.map((scenario) => ({ ...scenario, details: [...scenario.details] })),
      },
      cases: results,
      runtimeProbes,
      aggregate: {
        totalCases: results.length,
        passedCases: results.length - failed.length,
        failedCases: failed.length,
        passRate: ratio(results.length - failed.length, results.length),
        blockerFailures: failed.filter((result) => result.severity === "blocker").length,
        criticalFailures: failed.filter((result) => result.severity === "critical").length,
        citationCoverage: citationValues.length ? average(citationValues) : 1,
        p95LatencyMs: percentile95(latencyValues),
      },
    };
  }
}

export function validateEvaluationDataset(dataset: unknown): asserts dataset is EvaluationDataset {
  if (!isRecord(dataset) || !isString(dataset.datasetId) || !isString(dataset.version) || !isString(dataset.domain) || !isString(dataset.description) || !Array.isArray(dataset.cases) || !dataset.cases.length) {
    throw new Error("Evaluation dataset identity, domain, description, and cases are required.");
  }
  const caseIds = dataset.cases.map((testCase) => testCase.caseId);
  if (new Set(caseIds).size !== caseIds.length) throw new Error("Evaluation dataset contains duplicate case IDs.");
  dataset.cases.forEach((testCase) => {
    if (!isRecord(testCase) || !isString(testCase.caseId) || !isString(testCase.title) || !isSeverity(testCase.severity) || !stringArray(testCase.tags) || !testCase.tags.length || !Array.isArray(testCase.turns) || !testCase.turns.length) {
      throw new Error("Each evaluation case requires an ID, title, severity, tags, and turns.");
    }
    if (testCase.scenarioId !== undefined && !isString(testCase.scenarioId)) throw new Error(`Evaluation case ${testCase.caseId} has an invalid scenario ID.`);
    if (testCase.skip !== undefined && typeof testCase.skip !== "boolean") throw new Error(`Evaluation case ${testCase.caseId} has an invalid skip flag.`);
    const turnIds = testCase.turns.map((turn) => turn.turnId);
    if (new Set(turnIds).size !== turnIds.length) throw new Error(`Evaluation case ${testCase.caseId} contains duplicate turn IDs.`);
    testCase.turns.forEach((turn) => {
      if (!isRecord(turn) || !isString(turn.turnId) || !isRecord(turn.input) || !isString(turn.input.message) || (turn.input.language !== "zh" && turn.input.language !== "en") || !isRecord(turn.expected)) {
        throw new Error(`Evaluation case ${testCase.caseId} contains an invalid turn.`);
      }
      if (turn.input.scenarioId !== undefined && !isString(turn.input.scenarioId)) throw new Error(`Evaluation case ${testCase.caseId} has an invalid turn scenario ID.`);
      if (turn.expected.errorCode !== undefined && !isString(turn.expected.errorCode)) throw new Error(`Evaluation case ${testCase.caseId} has an invalid expected error code.`);
      if (turn.expected.semantic !== undefined) {
        const semantic = turn.expected.semantic;
        if (!isRecord(semantic) || !isString(semantic.intent) || !stringArray(semantic.entityIds) || (semantic.forbiddenEntityIds !== undefined && !stringArray(semantic.forbiddenEntityIds))) {
          throw new Error(`Evaluation case ${testCase.caseId} has an invalid semantic expectation.`);
        }
      }
      if (turn.expected.graph !== undefined) {
        const graph = turn.expected.graph;
        if (!isRecord(graph) || !isString(graph.templateId) || !stringArray(graph.seedEntityIds) || !stringArray(graph.requiredObjectIds) || !stringArray(graph.requiredRelationIds)) {
          throw new Error(`Evaluation case ${testCase.caseId} has an invalid graph expectation.`);
        }
      }
      if (turn.expected.evidence !== undefined) {
        const evidence = turn.expected.evidence;
        if (!isRecord(evidence) || !stringArray(evidence.requiredEvidenceIds) || (evidence.forbiddenEvidenceIds !== undefined && !stringArray(evidence.forbiddenEvidenceIds))) {
          throw new Error(`Evaluation case ${testCase.caseId} has an invalid evidence expectation.`);
        }
      }
      if (turn.expected.answer !== undefined) {
        const answer = turn.expected.answer;
        if (!isRecord(answer) || !stringArray(answer.requiredClaimIds) || (answer.forbiddenClaimIds !== undefined && !stringArray(answer.forbiddenClaimIds)) || (answer.forbiddenTerms !== undefined && !stringArray(answer.forbiddenTerms))) {
          throw new Error(`Evaluation case ${testCase.caseId} has an invalid answer expectation.`);
        }
      }
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString) && new Set(value).size === value.length;
}

function isSeverity(value: unknown): value is EvaluationCaseResult["severity"] {
  return value === "blocker" || value === "critical" || value === "major" || value === "minor";
}

function numericMetrics(metrics: EvaluationMetric[], suffix: string): number[] {
  return metrics.filter((metric) => metric.id.includes(suffix) && typeof metric.value === "number").map((metric) => metric.value as number);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
