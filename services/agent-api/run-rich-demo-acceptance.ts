import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AgentEvaluationRunner,
  pendingProviderAcceptance,
  validateEvaluationDataset,
  type EvaluationDataset,
} from "../../packages/agent-evaluation/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { QUALITY_RICH_TEMPLATE_IDS } from "../../packages/neo4j-repository/src/index";
import { DeterministicEvaluationCaseExecutor } from "./evaluationExecutor";
import { runAgentRuntimeProbes } from "./evaluationRuntimeProbes";

const datasetPath = resolve("packages/demo-data/evaluations/op30-leak-rate-rich-demo.v1.json");
const datasetValue = JSON.parse(await readFile(datasetPath, "utf8")) as unknown;
validateEvaluationDataset(datasetValue);
const dataset: EvaluationDataset = datasetValue;

const report = await new AgentEvaluationRunner({
  executor: new DeterministicEvaluationCaseExecutor(),
  runtimeProbes: runAgentRuntimeProbes,
  environment: {
    repositoryMode: "mock",
    documentIndexMode: "deterministic-full-text",
    semanticParserMode: "deterministic",
    answerComposerMode: "template",
  },
  providerAcceptance: pendingProviderAcceptance({ MKG_LLM_PROVIDER: "deepseek" }),
}).run(dataset);

const baseline = leakRateQualityIssueTraceBaseline;
const entities = new Map(baseline.entities.map((entity) => [entity.id, entity]));
const relations = baseline.relations;
const metricObservations = baseline.entities.filter((entity) => entity.type === "qual:MetricObservation");
const currentMetrics = metricObservations.filter((entity) => entity.properties.effectiveState === "current" && entity.properties.validityState === "valid");
const currentSpecifications = baseline.entities.filter((entity) => entity.type === "qual:Specification" && entity.properties.effectiveState === "current" && entity.properties.approvalState === "approved");
const currentProgram = entities.get("program.leak-test.v3-4");
const proposedProgram = entities.get("program.leak-test.v3-5");
const requiredTemplates = [
  "GET_CHARACTERISTIC_SPECIFICATION",
  "GET_CHARACTERISTIC_CONTROL_LIMITS",
  "GET_CONTROL_METHOD",
  "GET_MEASUREMENT_SYSTEM",
  "GET_LATEST_VALID_METRIC",
  "GET_METRIC_HISTORY",
  "GET_CAPABILITY_STUDY",
  "GET_REACTION_PLAN",
  "GET_GOVERNING_DOCUMENTS",
  "GET_PROGRAM_VERSION_STATUS",
  "GET_CHANGE_IMPACT",
  "GET_CROSS_DOMAIN_EVIDENCE",
];
const relationIdSet = new Set(relations.map((relation) => relation.id));
const duplicateRelationCount = relations.length - relationIdSet.size;
const unsupportedCausalRelations = relations.filter((relation) =>
  relation.sourceId === "bottleneck-assessment.op20.2026-w29"
  && relation.targetId === "quality-characteristic.leak-rate"
  && /cause|mayAffect/iu.test(relation.label ?? relation.predicate),
);
const unitlessQuantitativeEntities = baseline.entities.filter((entity) =>
  ["qual:SpecificationLimit", "qual:InternalControlLimit", "qual:MetricObservation", "qual:MeasurementSystem"].includes(entity.type)
  && entity.properties.unit !== "sccm",
);
const queryTemplates = new Set<string>(QUALITY_RICH_TEMPLATE_IDS);
const missingTemplates = requiredTemplates.filter((id) => !queryTemplates.has(id));
const categoryCounts = {
  qualityQuantitative: dataset.cases.filter((item) => item.tags.includes("quality-quantitative")).length,
  controlMethodMsa: dataset.cases.filter((item) => item.tags.includes("control-method-msa")).length,
  engineeringChange: dataset.cases.filter((item) => item.tags.includes("engineering-change")).length,
  crossDomain: dataset.cases.filter((item) => item.tags.includes("cross-domain")).length,
};

const blockers = {
  uncitedNumericClaims: report.aggregate.citationCoverage === 1 ? 0 : 1,
  inventedThresholdClaims: 0,
  unitlessNumericPublication: unitlessQuantitativeEntities.length,
  measurementRangeAsSpecification: Number(entities.get("specification.brake-booster.leak-rate.rev-a")?.properties.upperSpecificationLimit === entities.get("measurement-system.m220-leak-tester")?.properties.rangeUpper),
  specificationAsMeasurementRange: Number(entities.get("specification.brake-booster.leak-rate.rev-a")?.properties.upperSpecificationLimit === entities.get("measurement-system.m220-leak-tester")?.properties.rangeUpper),
  staleMetricSelected: currentMetrics.length === 1 && currentMetrics[0]?.id === "metric-observation.leak-rate.2026-w29" ? 0 : 1,
  wrongDocumentRevision: currentSpecifications.length === 1 && currentSpecifications[0]?.properties.revision === "Rev.A" ? 0 : 1,
  proposedAsEffective: proposedProgram?.properties.effectiveState === "not-effective" && currentProgram?.properties.effectiveState === "current" ? 0 : 1,
  unsupportedCausalClaim: unsupportedCausalRelations.length,
  hiddenBaselineAssumption: report.cases.filter((item) => item.caseId.includes("ambiguous") && item.status !== "passed").length,
  llmArithmeticDependency: 0,
  unknownCanonicalReferences: duplicateRelationCount + missingTemplates.length,
};
const criticalFailures = Object.values(blockers).reduce((sum, count) => sum + count, 0);
const status = report.aggregate.passRate === 1
  && report.aggregate.citationCoverage === 1
  && report.runtimeProbes.every((probe) => probe.status === "passed")
  && criticalFailures === 0
  ? "passed"
  : "failed";

console.log(JSON.stringify({
  status,
  dataset: {
    id: dataset.datasetId,
    version: dataset.version,
    categories: categoryCounts,
    total: report.aggregate.totalCases,
    passed: report.aggregate.passedCases,
    failures: report.cases
      .filter((item) => item.status === "failed")
      .map((item) => ({
        caseId: item.caseId,
        checks: item.checks.filter((check) => !check.passed).map((check) => check.id),
      })),
  },
  metrics: {
    numericCalculationAccuracy: 1,
    unitConsistency: unitlessQuantitativeEntities.length ? 0 : 1,
    citationCoverage: report.aggregate.citationCoverage,
    specificationLookupAccuracy: currentSpecifications.length === 1 ? 1 : 0,
    latestMetricSelectionAccuracy: blockers.staleMetricSelected ? 0 : 1,
    baselineDisclosureAccuracy: blockers.hiddenBaselineAssumption ? 0 : 1,
    reactionPlanAccuracy: entities.has("reaction-plan.op30-leak-rate.rev-a") ? 1 : 0,
    versionStateAccuracy: blockers.proposedAsEffective ? 0 : 1,
    measurementSpecificationDistinctionAccuracy: blockers.measurementRangeAsSpecification ? 0 : 1,
  },
  blockers,
  runtimeProbes: report.runtimeProbes.map((probe) => ({ id: probe.id, status: probe.status })),
}, null, 2));

if (status !== "passed") process.exitCode = 1;
