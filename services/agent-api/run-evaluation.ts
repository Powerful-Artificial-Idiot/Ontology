import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AgentEvaluationRunner,
  InMemoryAgentTelemetrySink,
  RedactingAgentTelemetrySink,
  compareEvaluationReports,
  evaluateReleaseGate,
  pendingProviderAcceptance,
  validateEvaluationDataset,
  validateProviderAcceptanceArtifact,
  validateReleaseGatePolicy,
  type EvaluationDataset,
  type EvaluationProviderAcceptance,
  type EvaluationReport,
  type ReleaseGatePolicy,
} from "../../packages/agent-evaluation/src/index";
import { DeterministicEvaluationCaseExecutor } from "./evaluationExecutor";
import { runAgentRuntimeProbes } from "./evaluationRuntimeProbes";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { Neo4jKnowledgeRepository } from "../../packages/neo4j-repository/src/index";
import { neo4jOptionsFromEnvironment } from "./runtime";
import { runtimeDataPath } from "../runtimePaths";

const datasetPath = resolve(process.env.MKG_EVALUATION_DATASET_PATH ?? "packages/demo-data/evaluations/leak-rate-quality-trace.v1.json");
const policyPath = resolve(process.env.MKG_RELEASE_POLICY_PATH ?? "packages/demo-data/evaluations/release-policy.v1.json");
const outputPath = runtimeDataPath(process.env, "evaluations/latest-report.json", process.env.MKG_EVALUATION_REPORT_PATH);
const acceptanceProvider = process.env.MKG_LLM_PROVIDER === "deepseek" ? "deepseek" : "openai";
const acceptancePath = runtimeDataPath(process.env, `evaluations/${acceptanceProvider}-provider-acceptance.json`, process.env.MKG_PROVIDER_ACCEPTANCE_PATH);

await main();

async function main(): Promise<void> {
  const repositoryMode = process.env.MKG_EVALUATION_REPOSITORY_MODE === "neo4j" ? "neo4j" : "mock";
  const repository = repositoryMode === "neo4j"
    ? new Neo4jKnowledgeRepository(neo4jOptionsFromEnvironment(process.env))
    : new MockKnowledgeRepository();
  try {
    if (repository instanceof Neo4jKnowledgeRepository) await repository.verifyConnectivity();
    const datasetValue = await readJson<unknown>(datasetPath);
    validateEvaluationDataset(datasetValue);
    const dataset: EvaluationDataset = datasetValue;
    const policyValue = await readJson<unknown>(policyPath);
    validateReleaseGatePolicy(policyValue);
    const policy: ReleaseGatePolicy = policyValue;
    const providerAcceptance = await loadProviderAcceptance(acceptancePath);
    const telemetry = new InMemoryAgentTelemetrySink();
    const redactedTelemetry = new RedactingAgentTelemetrySink(telemetry);
    const runner = new AgentEvaluationRunner({
      executor: new DeterministicEvaluationCaseExecutor({ repository, telemetry: redactedTelemetry }),
      telemetry: redactedTelemetry,
      runtimeProbes: runAgentRuntimeProbes,
      environment: {
        repositoryMode,
        documentIndexMode: "deterministic-full-text",
        semanticParserMode: "deterministic",
        answerComposerMode: "template",
      },
      providerAcceptance,
    });
    const report = await runner.run(dataset);
    const releaseGate = evaluateReleaseGate(report, policy);
    const baselinePath = process.env.MKG_EVALUATION_BASELINE_PATH;
    const regression = baselinePath ? compareEvaluationReports(await readJson<EvaluationReport>(resolve(baselinePath)), report) : undefined;
    await atomicWriteJson(outputPath, { report, releaseGate, regression, telemetry: telemetry.list() });

    console.log(JSON.stringify({
      reportId: report.reportId,
      dataset: `${report.datasetId}@${report.datasetVersion}`,
      cases: `${report.aggregate.passedCases}/${report.aggregate.totalCases}`,
      citationCoverage: report.aggregate.citationCoverage,
      p95LatencyMs: report.aggregate.p95LatencyMs,
      runtimeProbes: report.runtimeProbes.map((probe) => ({ id: probe.id, status: probe.status })),
      providerAcceptance: report.providerAcceptance,
      releaseGate,
      regression,
      outputPath,
    }, null, 2));

    if (releaseGate.status !== "passed" || regression?.status === "regressed") process.exitCode = 1;
  } finally {
    if (repository instanceof Neo4jKnowledgeRepository) await repository.close();
  }
}

async function loadProviderAcceptance(path: string): Promise<EvaluationProviderAcceptance> {
  try {
    return validateProviderAcceptanceArtifact(await readJson<unknown>(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return pendingProviderAcceptance();
  }
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
