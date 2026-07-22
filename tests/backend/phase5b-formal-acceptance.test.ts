import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AgentEvaluationRunner,
  evaluateEvaluationCoverage,
  evaluateReleaseGate,
  validateEvaluationDataset,
  validateReleaseGatePolicy,
  type EvaluationDataset,
  type EvaluationProviderAcceptance,
  type ReleaseGatePolicy,
} from "../../packages/agent-evaluation/src/index";
import { DeterministicEvaluationCaseExecutor } from "../../services/agent-api/evaluationExecutor";

const datasetExpectations = [
  ["packages/demo-data/evaluations/leak-rate-quality-trace.v1.json", 6],
  ["packages/demo-data/evaluations/engineering-change-impact.v1.json", 12],
  ["packages/demo-data/evaluations/bottleneck-analysis.v1.json", 13],
  ["packages/demo-data/evaluations/phase5b-cross-domain.v1.json", 7],
] as const;

describe("Phase 5B formal acceptance", () => {
  it.each(datasetExpectations)("passes every deterministic case in %s", async (path, expectedCases) => {
    const dataset = await fixture<EvaluationDataset>(path);
    validateEvaluationDataset(dataset);
    const report = await new AgentEvaluationRunner({
      executor: new DeterministicEvaluationCaseExecutor(),
      environment: {
        repositoryMode: "mock",
        documentIndexMode: "deterministic-full-text",
        semanticParserMode: "deterministic",
        answerComposerMode: "template",
      },
      providerAcceptance: passingProviderAcceptance(),
    }).run(dataset);

    expect(report.aggregate, JSON.stringify(report.cases.filter((result) => result.status === "failed"), null, 2)).toMatchObject({
      totalCases: expectedCases,
      passedCases: expectedCases,
      failedCases: 0,
      passRate: 1,
      citationCoverage: 1,
      blockerFailures: 0,
      criticalFailures: 0,
    });
  });

  it("enforces all required DeepSeek domain scenarios in the Phase 5B release policy", async () => {
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.phase5b.v1.json");
    validateReleaseGatePolicy(policy);
    const dataset = await fixture<EvaluationDataset>("packages/demo-data/evaluations/phase5b-cross-domain.v1.json");
    const runtimeProbes = [{ id: "runtime.acceptance", status: "passed" as const, checks: [], metrics: [] }];
    const runner = (providerAcceptance: EvaluationProviderAcceptance) => new AgentEvaluationRunner({
      executor: new DeterministicEvaluationCaseExecutor(),
      runtimeProbes: async () => runtimeProbes,
      environment: {
        repositoryMode: "mock",
        documentIndexMode: "deterministic-full-text",
        semanticParserMode: "deterministic",
        answerComposerMode: "template",
      },
      providerAcceptance,
    }).run(dataset);

    expect(evaluateReleaseGate(await runner(passingProviderAcceptance()), policy)).toMatchObject({ status: "passed", reasons: [] });

    const missing = passingProviderAcceptance();
    missing.scenarios = missing.scenarios?.filter((scenario) => scenario.scenarioId !== "bottleneck-analysis");
    expect(evaluateReleaseGate(await runner(missing), policy).reasons).toContain("Required provider scenario acceptance is missing: bottleneck-analysis.");

    const fallback = passingProviderAcceptance();
    const bottleneck = fallback.scenarios?.find((scenario) => scenario.scenarioId === "bottleneck-analysis");
    if (bottleneck) bottleneck.fallbackUsed = true;
    expect(evaluateReleaseGate(await runner(fallback), policy).reasons).toContain("Provider scenario bottleneck-analysis used fallback.");

    const underCited = passingProviderAcceptance();
    const crossDomain = underCited.scenarios?.find((scenario) => scenario.scenarioId === "cross-domain-engineering-quality-bottleneck");
    if (crossDomain) crossDomain.citationCoverage = 0.8;
    expect(evaluateReleaseGate(await runner(underCited), policy).reasons).toContain("Provider scenario cross-domain-engineering-quality-bottleneck citation coverage 0.8 is below the required threshold.");
  });

  it("passes coverage at the exact domain and total minimums", async () => {
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.phase5b.v1.json");
    expect(evaluateEvaluationCoverage(exactMinimumDatasets(), policy)).toMatchObject({
      status: "passed",
      counts: { quality: 6, engineeringChange: 12, bottleneck: 12, crossDomain: 6, total: 36 },
      reasons: [],
    });
  });

  it.each([
    ["Engineering Change", "manufacturing-engineering", "minimumEngineeringChangeCaseCount"],
    ["Bottleneck", "manufacturing-value-stream", "minimumBottleneckCaseCount"],
    ["Cross-domain", "manufacturing-cross-domain", "minimumCrossDomainCaseCount"],
  ] as const)("fails when %s coverage is one case short", async (_label, domain, policyKey) => {
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.phase5b.v1.json");
    const datasets = exactMinimumDatasets();
    const dataset = datasets.find((item) => item.domain === domain);
    dataset?.cases.pop();
    const result = evaluateEvaluationCoverage(datasets, { ...policy, minimumTotalCaseCount: 0 });
    expect(result.status).toBe("failed");
    expect(result.reasons.some((reason) => reason.includes(String(policy[policyKey])))).toBe(true);
  });

  it("fails an independently higher total minimum", async () => {
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.phase5b.v1.json");
    const result = evaluateEvaluationCoverage(exactMinimumDatasets(), { ...policy, minimumTotalCaseCount: 37 });
    expect(result.reasons).toContain("Total case count 36 is below 37.");
  });

  it("does not count duplicate, empty-assertion, or skipped cases", async () => {
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.phase5b.v1.json");
    const datasets = exactMinimumDatasets();
    const quality = datasets.find((item) => item.domain === "manufacturing-quality");
    const engineering = datasets.find((item) => item.domain === "manufacturing-engineering");
    const bottleneck = datasets.find((item) => item.domain === "manufacturing-value-stream");
    quality?.cases.push(structuredClone(quality.cases[0]!));
    if (engineering?.cases[0]?.turns[0]) engineering.cases[0].turns[0].expected = {};
    if (bottleneck?.cases[0]) bottleneck.cases[0].skip = true;
    const result = evaluateEvaluationCoverage(datasets, policy);
    expect(result.status).toBe("failed");
    expect(result.duplicateCaseIds).toEqual(["manufacturing-quality.case-1"]);
    expect(result.invalidCaseIds).toEqual(["manufacturing-engineering.case-1"]);
    expect(result.skippedCaseIds).toEqual(["manufacturing-value-stream.case-1"]);
    expect(result.counts).toMatchObject({ quality: 6, engineeringChange: 11, bottleneck: 11, crossDomain: 6, total: 34 });
  });

  it("fails when a required domain dataset is missing", async () => {
    const policy = await fixture<ReleaseGatePolicy>("packages/demo-data/evaluations/release-policy.phase5b.v1.json");
    const datasets = exactMinimumDatasets().filter((dataset) => dataset.domain !== "manufacturing-quality");
    const result = evaluateEvaluationCoverage(datasets, policy);
    expect(result.missingDomains).toContain("manufacturing-quality");
    expect(result.status).toBe("failed");
  });
});

function passingProviderAcceptance(): EvaluationProviderAcceptance {
  const checkedAt = "2026-07-22T00:00:00.000Z";
  return {
    providerId: "deepseek-chat-completions",
    transport: "chat-completions",
    fallbackUsed: false,
    semanticParser: "passed",
    answerComposer: "passed",
    fullPipeline: "passed",
    modelIds: ["deepseek-v4-flash"],
    checkedAt,
    details: [],
    scenarios: [
      "quality-issue-trace",
      "engineering-change-impact",
      "bottleneck-analysis",
      "cross-domain-engineering-quality-bottleneck",
    ].map((scenarioId) => ({
      scenarioId,
      semanticParser: "passed" as const,
      answerComposer: "passed" as const,
      fullPipeline: "passed" as const,
      fallbackUsed: false,
      citationCoverage: 1,
      checkedAt,
      details: [],
    })),
  };
}

async function fixture<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function exactMinimumDatasets(): EvaluationDataset[] {
  return [
    syntheticDataset("manufacturing-quality", 6),
    syntheticDataset("manufacturing-engineering", 12),
    syntheticDataset("manufacturing-value-stream", 12),
    syntheticDataset("manufacturing-cross-domain", 6),
  ];
}

function syntheticDataset(domain: string, count: number): EvaluationDataset {
  return {
    datasetId: `evaluation.${domain}`,
    version: "test",
    domain,
    description: `${domain} coverage fixture`,
    cases: Array.from({ length: count }, (_, index) => ({
      caseId: `${domain}.case-${index + 1}`,
      title: `Case ${index + 1}`,
      severity: "critical" as const,
      tags: ["coverage"],
      turns: [{
        turnId: "turn-1",
        input: { message: "Governed evaluation case", language: "en" as const },
        expected: { errorCode: "CLARIFICATION_REQUIRED" },
      }],
    })),
  };
}
