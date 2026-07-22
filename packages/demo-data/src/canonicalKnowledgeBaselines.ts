import type { CanonicalKnowledgeBaseline } from "../../knowledge-contracts/src/index";
import bottleneckFixture from "../canonical/bottleneck-analysis.json";
import engineeringChangeFixture from "../canonical/engineering-change-impact.json";
import { leakRateQualityIssueTraceBaseline } from "./leakRateQualityIssueTrace";

export const engineeringChangeImpactBaseline = engineeringChangeFixture as unknown as CanonicalKnowledgeBaseline;
export const bottleneckAnalysisBaseline = bottleneckFixture as unknown as CanonicalKnowledgeBaseline;

export const canonicalKnowledgeBaselines: CanonicalKnowledgeBaseline[] = [
  leakRateQualityIssueTraceBaseline,
  engineeringChangeImpactBaseline,
  bottleneckAnalysisBaseline,
];

export const canonicalKnowledgeBaselineByScenarioId = new Map(
  canonicalKnowledgeBaselines.map((baseline) => [baseline.scenario.id, baseline]),
);

export function getCanonicalKnowledgeBaseline(scenarioId = leakRateQualityIssueTraceBaseline.scenario.id): CanonicalKnowledgeBaseline {
  const baseline = canonicalKnowledgeBaselineByScenarioId.get(scenarioId);
  if (!baseline) throw new Error(`Canonical knowledge baseline not found: ${scenarioId}`);
  return baseline;
}
