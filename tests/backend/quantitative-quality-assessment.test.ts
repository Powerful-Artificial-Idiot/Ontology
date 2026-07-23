import { describe, expect, it } from "vitest";
import {
  DeterministicQuantitativeQualityAssessor,
  createDeterministicAgentPipeline,
  multiplyByPercentage,
} from "../../packages/agent-core/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import {
  AGENT_CONTRACT_VERSION,
  type CanonicalKnowledgeBaseline,
  type AgentTurnRequest,
  type SemanticQueryPlan,
} from "../../packages/knowledge-contracts/src/index";

describe("rich OP30 Leak Rate quantitative reasoning", () => {
  it.each([
    [0.22, 50, 0.33],
    [0.2, 50, 0.3],
    [0.25, 20, 0.3],
  ])("calculates %s with %s percent as %s using decimal-safe scaling", (value, percentage, expected) => {
    expect(multiplyByPercentage(value, percentage)).toBe(expected);
  });

  it("discloses both governed baselines for an ambiguous 50% increase", async () => {
    const response = await createDeterministicAgentPipeline().run(turn(
      "quantitative.ambiguous",
      "OP30 的 Leak Rate 提升 50% 是否超标？",
      "zh",
    ));

    expect(response.queryPlan.intent).toBe("percentage_change_assessment");
    expect(response.quantitativeAssessment?.baselineDisclosureRequired).toBe(true);
    expect(response.quantitativeAssessment?.assessments.map((assessment) => ({
      policy: assessment.referencePolicy,
      reference: assessment.referenceValue,
      projected: assessment.projectedValue,
      spec: assessment.specificationStatus,
      measurement: assessment.measurementCapabilityStatus,
      reaction: assessment.requiredReactionPlanIds,
    }))).toEqual([
      {
        policy: "latest-governed-observation",
        reference: 0.22,
        projected: 0.33,
        spec: "exceeded",
        measurement: "measurable",
        reaction: ["reaction-plan.op30-leak-rate.rev-a"],
      },
      {
        policy: "control-center-line",
        reference: 0.2,
        projected: 0.3,
        spec: "at-limit",
        measurement: "measurable",
        reaction: ["reaction-plan.op30-leak-rate.rev-a"],
      },
    ]);
    expect(response.quantitativeAssessment?.assessments[0]?.comparisons.find((item) => item.boundaryType === "specification-upper-limit")).toMatchObject({
      exceedance: 0.03,
      relativeExceedancePercent: 10,
    });
    expect(response.trace.stages.map((stage) => stage.stage)).toContain("quantitative-assessment");
    expect(response.citationValidation.status).toBe("passed");
    expect(response.answer.summary).toContain("0.33");
    expect(response.answer.summary).toContain("0.3");
    expect(JSON.stringify(response)).not.toMatch(/chain.of.thought|rawPrompt|reasoning_content/i);
  });

  it("uses an explicit user reference without silently replacing its baseline", async () => {
    const response = await createDeterministicAgentPipeline().run(turn(
      "quantitative.explicit",
      "If OP30 Leak Rate increases 50 percent from 0.22 sccm, what is the result?",
      "en",
    ));
    expect(response.quantitativeAssessment?.request.referencePolicy).toBe("explicit");
    expect(response.quantitativeAssessment?.assessments[0]).toMatchObject({
      referenceValue: 0.22,
      projectedValue: 0.33,
      specificationStatus: "exceeded",
      measurementCapabilityStatus: "measurable",
      productStatus: "nonconforming",
    });
    expect(response.answer.summary).toContain("0.33");
    expect(JSON.stringify(response.answer)).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("classifies exact warning, action, USL and measurement boundaries deterministically", async () => {
    const assessor = new DeterministicQuantitativeQualityAssessor();
    const graph = {
      graphPlanId: "graph.boundaries",
      repositoryType: "canonical-fixture",
      entities: leakRateQualityIssueTraceBaseline.entities,
      relations: leakRateQualityIssueTraceBaseline.relations,
    };
    const assess = async (value: number) => assessor.assess(plan(value), graph, leakRateQualityIssueTraceBaseline);

    expect((await assess(0.24)).assessments[0]).toMatchObject({ warningLimitStatus: "within", actionLimitStatus: "within", specificationStatus: "within" });
    expect((await assess(0.27)).assessments[0]).toMatchObject({ warningLimitStatus: "exceeded", actionLimitStatus: "within", specificationStatus: "within" });
    expect((await assess(0.3)).assessments[0]).toMatchObject({ warningLimitStatus: "exceeded", actionLimitStatus: "exceeded", specificationStatus: "at-limit", measurementCapabilityStatus: "measurable" });
    expect((await assess(0.5)).assessments[0]).toMatchObject({ specificationStatus: "exceeded", measurementCapabilityStatus: "measurable" });
    expect((await assess(0.51)).assessments[0]).toMatchObject({ specificationStatus: "exceeded", measurementCapabilityStatus: "outside-range" });
  });

  it.each([
    ["OP30 的 Leak Rate 容许范围是多少？", "quality_specification", ["claim.specification", "claim.control-thresholds", "claim.measurement-capability"]],
    ["OP30 当前 Leak Rate 水平、最大值和 Cpk 是多少？", "latest_quality_metric", ["claim.latest-metric"]],
    ["超过 0.27 sccm 后需要执行哪些措施？ OP30 Leak Rate", "reaction_plan", ["claim.reaction-plan"]],
    ["M220 程序 v3.5 是否已经可以用于正式生产？ OP30 Leak Rate", "program_change_status", ["claim.version-status", "claim.change-validation"]],
  ])("answers governed intent for %s", async (message, intent, claimIds) => {
    const response = await createDeterministicAgentPipeline().run(turn(`intent.${intent}`, message, "zh"));
    expect(response.queryPlan.intent).toBe(intent);
    expect(response.answer.claims.map((claim) => claim.id)).toEqual(claimIds);
    expect(response.answer.claims.every((claim) => claim.citations.length > 0)).toBe(true);
    expect(response.citationValidation.status).toBe("passed");
  });

  it("keeps the OP20 bottleneck and OP30 Leak Rate causal boundary explicit", async () => {
    const response = await createDeterministicAgentPipeline().run(turn(
      "causal.boundary",
      "OP20 是瓶颈，是否证明它导致了 OP30 Leak Rate 上升？",
      "zh",
    ));
    expect(response.queryPlan.intent).toBe("evidence_lookup");
    expect(response.answer.claims).toEqual([
      expect.objectContaining({ id: "claim.causal-boundary", classification: "limitation" }),
    ]);
    expect(response.answer.summary).toContain("不足以证明");
    expect(response.citationValidation.status).toBe("passed");
  });

  it("keeps the causal boundary explicit in English", async () => {
    const response = await createDeterministicAgentPipeline().run(turn(
      "causal.boundary.en",
      "Does the OP20 bottleneck prove that it caused the OP30 Leak Rate increase?",
      "en",
    ));
    expect(response.queryPlan.intent).toBe("evidence_lookup");
    expect(response.answer.claims).toEqual([
      expect.objectContaining({ id: "claim.causal-boundary", classification: "limitation" }),
    ]);
    expect(response.answer.summary).toContain("insufficient");
    expect(response.citationValidation.status).toBe("passed");
  });

  it.each([
    ["draft specification", (baseline: CanonicalKnowledgeBaseline) => {
      entity(baseline, "specification.brake-booster.leak-rate.rev-a").properties.approvalState = "draft";
    }],
    ["stale latest metric", (baseline: CanonicalKnowledgeBaseline) => {
      entity(baseline, "metric-observation.leak-rate.2026-w29").properties.validityState = "stale";
    }],
    ["invalid canonical unit", (baseline: CanonicalKnowledgeBaseline) => {
      entity(baseline, "control-limit.leak-rate.action").properties.unit = "cfm";
    }],
    ["missing calibration evidence", (baseline: CanonicalKnowledgeBaseline) => {
      entity(baseline, "measurement-system.m220-leak-tester").properties.calibrationState = "expired";
    }],
    ["obsolete control plan", (baseline: CanonicalKnowledgeBaseline) => {
      baseline.evidencePack.items
        .filter((item) => item.governance?.documentId === "document.control-plan.cp-bb01.rev-a")
        .forEach((item) => {
          if (item.governance) item.governance.lifecycleStatus = "superseded";
        });
    }],
    ["conflicting current specification", (baseline: CanonicalKnowledgeBaseline) => {
      baseline.entities.push({
        ...structuredClone(entity(baseline, "specification.brake-booster.leak-rate.rev-a")),
        id: "specification.brake-booster.leak-rate.rev-conflict",
        version: "conflict",
      });
    }],
  ])("blocks quantitative publication for %s", async (label, mutate) => {
    const baseline = structuredClone(leakRateQualityIssueTraceBaseline);
    mutate(baseline);
    const assessor = new DeterministicQuantitativeQualityAssessor();
    const assessmentPlan = label === "stale latest metric" ? latestPlan() : plan(0.22);
    await expect(assessor.assess(assessmentPlan, graph(baseline), baseline)).rejects.toMatchObject({
      detail: { code: "EVIDENCE_INSUFFICIENT", stage: "quantitative-assessment" },
    });
  });

  it("keeps V3.5 proposed and not effective", async () => {
    const response = await createDeterministicAgentPipeline().run(turn(
      "program.proposed",
      "Is M220 program V3.5 approved and effective for production at OP30 Leak Rate?",
      "en",
    ));
    expect(response.answer.summary).toContain("proposed");
    expect(response.answer.summary).toContain("not effective");
    expect(response.answer.summary).not.toContain("approved and effective");
  });
});

function turn(requestId: string, message: string, language: "zh" | "en"): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language,
    message,
    context: { previousTurnIds: [], resolvedEntityIds: [], assumptions: [] },
  };
}

function plan(referenceValue: number): SemanticQueryPlan {
  return {
    ...leakRateQualityIssueTraceBaseline.queryPlan,
    planId: `plan.boundary.${referenceValue}`,
    intent: "value_limit_comparison",
    constraints: [
      { key: "referenceValue", operator: "eq", value: referenceValue },
      { key: "referencePolicy", operator: "eq", value: "explicit" },
      { key: "percentageChange", operator: "eq", value: 0 },
    ],
  };
}

function latestPlan(): SemanticQueryPlan {
  return {
    ...leakRateQualityIssueTraceBaseline.queryPlan,
    planId: "plan.latest-governed",
    intent: "percentage_change_assessment",
    constraints: [
      { key: "referencePolicy", operator: "eq", value: "latest-governed-observation" },
      { key: "percentageChange", operator: "eq", value: 50 },
    ],
  };
}

function graph(baseline: CanonicalKnowledgeBaseline) {
  return {
    graphPlanId: "graph.governance-negative",
    repositoryType: "canonical-fixture",
    entities: baseline.entities,
    relations: baseline.relations,
  };
}

function entity(baseline: CanonicalKnowledgeBaseline, id: string) {
  const value = baseline.entities.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing test entity ${id}`);
  return value;
}
