import { describe, expect, it } from "vitest";
import dataset from "../../packages/demo-data/authoring/phase5e-evaluation.v1.json";
import { evaluateKnowledgeAuthoringDataset, type KnowledgeAuthoringEvaluationDataset } from "../../packages/knowledge-authoring/src/index";

describe("Phase 5E release gate", () => {
  it("requires complete non-skipped deterministic coverage and zero blocking metrics", () => {
    const report = evaluateKnowledgeAuthoringDataset(dataset as KnowledgeAuthoringEvaluationDataset);
    expect(report).toMatchObject({
      status: "passed",
      total: 36,
      passed: 36,
      coverage: { workflow: 9, "entity-relation": 9, "authorization-governance": 10, "integration-ui": 8 },
    });
    expect(Object.values(report.blockingMetrics).every((value) => value === 0)).toBe(true);
    expect(Object.values(report.accuracy).every((value) => value === 1)).toBe(true);
  });
});
