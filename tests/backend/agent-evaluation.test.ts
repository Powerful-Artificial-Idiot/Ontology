import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AgentEvaluationRunner,
  InMemoryAgentTelemetrySink,
  RedactingAgentTelemetrySink,
  compareEvaluationReports,
  evaluateReleaseGate,
  pendingProviderAcceptance,
  validateEvaluationDataset,
  type EvaluationDataset,
  type EvaluationReport,
  type ReleaseGatePolicy,
} from "../../packages/agent-evaluation/src/index";
import { DeterministicEvaluationCaseExecutor } from "../../services/agent-api/evaluationExecutor";
import { runAgentRuntimeProbes } from "../../services/agent-api/evaluationRuntimeProbes";

describe("Phase 5A deterministic Agent evaluation", () => {
  it("evaluates the versioned Leak Rate dataset and passes the local release gate", async () => {
    const dataset = await fixture<EvaluationDataset>("packages/demo-data/evaluations/leak-rate-quality-trace.v1.json");
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.v1.json");
    validateEvaluationDataset(dataset);
    const telemetry = new InMemoryAgentTelemetrySink();
    const runner = new AgentEvaluationRunner({
      executor: new DeterministicEvaluationCaseExecutor({ telemetry: new RedactingAgentTelemetrySink(telemetry) }),
      runtimeProbes: runAgentRuntimeProbes,
      telemetry: new RedactingAgentTelemetrySink(telemetry),
      environment: { repositoryMode: "mock", documentIndexMode: "deterministic-full-text", semanticParserMode: "deterministic", answerComposerMode: "template" },
      providerAcceptance: pendingProviderAcceptance({}),
    });

    const report = await runner.run(dataset);

    expect(report.aggregate).toMatchObject({ totalCases: 6, passedCases: 6, passRate: 1, citationCoverage: 1, blockerFailures: 0, criticalFailures: 0 });
    expect(report.runtimeProbes).toHaveLength(5);
    expect(report.runtimeProbes.every((probe) => probe.status === "passed")).toBe(true);
    expect(report.providerAcceptance).toMatchObject({ semanticParser: "pending", answerComposer: "pending" });
    expect(evaluateReleaseGate(report, policy).status).toBe("passed");
    expect(evaluateReleaseGate(report, { ...policy, requireSemanticProviderAcceptance: true, requireAnswerProviderAcceptance: true })).toMatchObject({
      status: "failed",
      reasons: expect.arrayContaining([
        "Semantic Parser live provider acceptance is pending.",
        "Answer Composer live provider acceptance is pending.",
      ]),
    });
    expect(telemetry.list().some((event) => event.type === "pipeline" && event.stage === "citation-validation")).toBe(true);
    expect(JSON.stringify(telemetry.list())).not.toMatch(/raw.?output|chain.?of.?thought|authorization/iu);
  });

  it("detects a new case failure as a release regression", () => {
    const baseline = report("baseline", "passed");
    const current = report("current", "failed");
    const regression = compareEvaluationReports(baseline, current);
    expect(regression.status).toBe("regressed");
    expect(regression.newFailedCaseIds).toEqual(["case-1"]);
  });

  it("redacts sensitive telemetry attribute names before delegating", async () => {
    const memory = new InMemoryAgentTelemetrySink();
    const sink = new RedactingAgentTelemetrySink(memory);
    await sink.record({
      eventVersion: "1.0.0",
      id: "telemetry.redaction",
      type: "provider",
      occurredAt: "2026-07-22T00:00:00.000Z",
      status: "completed",
      attributes: { model: "test-model", apiKey: "sensitive", rawOutput: "sensitive", inputTokens: 10 },
    });
    expect(memory.list()[0]?.attributes).toEqual({ model: "test-model", apiKey: "[REDACTED]", rawOutput: "[REDACTED]", inputTokens: 10 });
  });
});

async function fixture<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function report(id: string, status: "passed" | "failed"): EvaluationReport {
  const passed = status === "passed";
  return {
    reportVersion: "1.0.0",
    reportId: id,
    datasetId: "dataset",
    datasetVersion: "1.0.0",
    generatedAt: "2026-07-22T00:00:00.000Z",
    environment: { repositoryMode: "mock", documentIndexMode: "full-text", semanticParserMode: "deterministic", answerComposerMode: "template" },
    providerAcceptance: { semanticParser: "pending", answerComposer: "pending", details: [] },
    cases: [{ caseId: "case-1", title: "Case", severity: "critical", status, checks: [], metrics: [] }],
    runtimeProbes: [],
    aggregate: { totalCases: 1, passedCases: passed ? 1 : 0, failedCases: passed ? 0 : 1, passRate: passed ? 1 : 0, blockerFailures: 0, criticalFailures: passed ? 0 : 1, citationCoverage: passed ? 1 : 0, p95LatencyMs: 1 },
  };
}
