import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AgentEvaluationRunner,
  InMemoryAgentTelemetrySink,
  RedactingAgentTelemetrySink,
  evaluateReleaseGate,
  evaluateEvaluationCoverage,
  pendingProviderAcceptance,
  validateEvaluationDataset,
  validateProviderAcceptanceArtifact,
  validateReleaseGatePolicy,
  type EvaluationDataset,
  type EvaluationCaseResult,
  type EvaluationProviderAcceptance,
  type EvaluationReport,
  type ReleaseGatePolicy,
  type ReleaseGateResult,
  type RuntimeProbeResult,
} from "../../packages/agent-evaluation/src/index";
import { Neo4jKnowledgeRepository } from "../../packages/neo4j-repository/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { DeterministicEvaluationCaseExecutor } from "./evaluationExecutor";
import { runAgentRuntimeProbes } from "./evaluationRuntimeProbes";
import { neo4jOptionsFromEnvironment } from "./runtime";
import { runtimeDataPath } from "../runtimePaths";

const datasetPaths = [
  "packages/demo-data/evaluations/leak-rate-quality-trace.v1.json",
  "packages/demo-data/evaluations/engineering-change-impact.v1.json",
  "packages/demo-data/evaluations/bottleneck-analysis.v1.json",
  "packages/demo-data/evaluations/phase5b-cross-domain.v1.json",
].map((path) => resolve(path));
const policyPath = resolve(process.env.MKG_RELEASE_POLICY_PATH ?? "packages/demo-data/evaluations/release-policy.phase5b.v1.json");
const acceptancePath = runtimeDataPath(process.env, "evaluations/deepseek-provider-acceptance.json", process.env.MKG_PROVIDER_ACCEPTANCE_PATH);
const outputPath = runtimeDataPath(process.env, "evaluations/phase5b-formal-acceptance.json", process.env.MKG_PHASE5B_ACCEPTANCE_REPORT_PATH);

await main();

async function main(): Promise<void> {
  const repositoryMode = process.env.MKG_EVALUATION_REPOSITORY_MODE === "neo4j" ? "neo4j" : "mock";
  const repository = repositoryMode === "neo4j"
    ? new Neo4jKnowledgeRepository(neo4jOptionsFromEnvironment(process.env))
    : new MockKnowledgeRepository();

  try {
    if (repository instanceof Neo4jKnowledgeRepository) await repository.verifyConnectivity();
    const providerAcceptance = await loadProviderAcceptance(acceptancePath);
    const policyValue = await readJson<unknown>(policyPath);
    validateReleaseGatePolicy(policyValue);
    const policy: ReleaseGatePolicy = policyValue;
    const runtimeProbes = await runAgentRuntimeProbes();
    const telemetry = new InMemoryAgentTelemetrySink();
    const redactedTelemetry = new RedactingAgentTelemetrySink(telemetry);
    const results: Array<{ report: EvaluationReport; releaseGate: ReleaseGateResult }> = [];
    const datasets: EvaluationDataset[] = [];

    for (const path of datasetPaths) {
      const datasetValue = await readJson<unknown>(path);
      validateEvaluationDataset(datasetValue);
      const dataset: EvaluationDataset = datasetValue;
      datasets.push(dataset);
      const runner = new AgentEvaluationRunner({
        executor: new DeterministicEvaluationCaseExecutor({ repository, telemetry: redactedTelemetry }),
        telemetry: redactedTelemetry,
        runtimeProbes: async () => cloneRuntimeProbes(runtimeProbes),
        environment: {
          repositoryMode,
          documentIndexMode: "deterministic-full-text",
          semanticParserMode: "deterministic",
          answerComposerMode: "template",
        },
        providerAcceptance,
      });
      const report = await runner.run(dataset);
      results.push({ report, releaseGate: evaluateReleaseGate(report, policy) });
    }

    const coverageGate = evaluateEvaluationCoverage(datasets, policy);

    const totalCases = results.reduce((sum, result) => sum + result.report.aggregate.totalCases, 0);
    const passedCases = results.reduce((sum, result) => sum + result.report.aggregate.passedCases, 0);
    const citationTotal = results.reduce(
      (sum, result) => sum + result.report.aggregate.citationCoverage * result.report.aggregate.totalCases,
      0,
    );
    const status = coverageGate.status === "passed" && results.every((result) => result.releaseGate.status === "passed") ? "passed" : "failed";
    const caseResults = results.flatMap((result) => result.report.cases);
    const domainGovernance = buildDomainGovernanceMetrics(caseResults, runtimeProbes);
    const artifact = {
      artifactVersion: "1.0.0",
      phase: "5B",
      generatedAt: new Date().toISOString(),
      status,
      repositoryMode,
      providerAcceptance,
      coverageGate,
      domainGovernance,
      datasets: results,
      aggregate: {
        datasetCount: results.length,
        totalCases,
        passedCases,
        failedCases: totalCases - passedCases,
        passRate: totalCases ? passedCases / totalCases : 1,
        citationCoverage: totalCases ? citationTotal / totalCases : 1,
        runtimeProbes: runtimeProbes.map((probe) => ({ id: probe.id, status: probe.status })),
        telemetryEventCount: telemetry.list().length,
      },
    };
    await atomicWriteJson(outputPath, artifact);

    console.log(JSON.stringify({
      status,
      repositoryMode,
      provider: {
        providerId: providerAcceptance.providerId,
        transport: providerAcceptance.transport,
        modelIds: providerAcceptance.modelIds,
        semanticParser: providerAcceptance.semanticParser,
        answerComposer: providerAcceptance.answerComposer,
        fullPipeline: providerAcceptance.fullPipeline,
        fallbackUsed: providerAcceptance.fallbackUsed,
        scenarios: providerAcceptance.scenarios?.map((scenario) => ({
          scenarioId: scenario.scenarioId,
          semanticParser: scenario.semanticParser,
          answerComposer: scenario.answerComposer,
          fullPipeline: scenario.fullPipeline,
          fallbackUsed: scenario.fallbackUsed,
          citationCoverage: scenario.citationCoverage,
        })),
      },
      coverageGate,
      domainGovernance,
      datasets: results.map(({ report, releaseGate }) => ({
        dataset: `${report.datasetId}@${report.datasetVersion}`,
        cases: `${report.aggregate.passedCases}/${report.aggregate.totalCases}`,
        citationCoverage: report.aggregate.citationCoverage,
        releaseGate: releaseGate.status,
        reasons: releaseGate.reasons,
      })),
      outputPath,
    }, null, 2));

    if (status !== "passed") process.exitCode = 1;
  } finally {
    if (repository instanceof Neo4jKnowledgeRepository) await repository.close();
  }
}

function buildDomainGovernanceMetrics(cases: EvaluationCaseResult[], runtimeProbes: RuntimeProbeResult[]) {
  const failures = (caseIds: string[]) => caseIds.filter((caseId) => cases.find((result) => result.caseId === caseId)?.status !== "passed").length;
  const failedChecks = cases.flatMap((result) => result.checks.filter((check) => !check.passed));
  const publicationCaseIds = [
    "engineering-change.proposed-not-effective",
    "engineering-change.pending-not-released",
    "engineering-change.version-direction-mismatch",
    "engineering-change.document-access-denied",
    "bottleneck.bounded-limitation",
    "bottleneck.metric-unit-governance",
    "bottleneck.document-access-denied",
  ];
  const publicationFailures = failures(publicationCaseIds);
  return {
    proposedAsEffective: failures(["engineering-change.proposed-not-effective"]),
    unapprovedAsReleased: failures(["engineering-change.pending-not-released"]),
    currentProposedMismatch: failures(["engineering-change.version-direction-mismatch"]),
    potentialAsConfirmed: failures(["engineering-change.unsupported-customer-impact"]),
    unsupportedBottleneckConfirmation: failures(["bottleneck.bounded-limitation", "bottleneck.largest-cycle-not-confirmation"]),
    metricWithoutUnitPublication: failures(["bottleneck.metric-unit-governance"]),
    wrongMetricVersion: failures(["bottleneck.stale-metric-limitation"]),
    unsupportedCalculatedBenefit: failures(["bottleneck.unsupported-benefit-root-cause"]),
    unsupportedRootCause: failures(["bottleneck.unsupported-benefit-root-cause"]),
    staleContextLeakage: failures([
      "cross-domain.quality-to-engineering-switch",
      "cross-domain.engineering-to-bottleneck-switch",
      "cross-domain.bottleneck-to-quality-switch",
    ]),
    unknownReferenceRate: ratio(failedChecks.filter((check) => check.id.includes("forbidden-evidence") || check.id.includes("citation")).length, cases.length),
    unknownObjectRate: ratio(failedChecks.filter((check) => check.id.includes("forbidden-entities") || check.id.includes("entities.exact")).length, cases.length),
    draftLeakage: failedChecks.filter((check) => check.id.includes("governed-access")).length,
    obsoleteLeakage: failedChecks.filter((check) => check.id.includes("governed-access")).length,
    publicationGateAccuracy: ratio(publicationCaseIds.length - publicationFailures, publicationCaseIds.length),
    ontologyRelationValidity: failedChecks.some((check) => check.id.includes("graph-relations")) ? 0 : 1,
    sseSequenceIntegrity: runtimeProbes.find((probe) => probe.id === "runtime.sse-sequence-replay")?.status === "passed" ? 1 : 0,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

async function loadProviderAcceptance(path: string): Promise<EvaluationProviderAcceptance> {
  try {
    return validateProviderAcceptanceArtifact(await readJson<unknown>(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return pendingProviderAcceptance({ MKG_LLM_PROVIDER: "deepseek" });
  }
}

function cloneRuntimeProbes(probes: RuntimeProbeResult[]): RuntimeProbeResult[] {
  return probes.map((probe) => ({
    ...probe,
    checks: probe.checks.map((check) => ({ ...check })),
    metrics: probe.metrics.map((metric) => ({ ...metric })),
  }));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
