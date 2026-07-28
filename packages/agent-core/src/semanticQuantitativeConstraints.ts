import type {
  AgentQueryIntent,
  QueryPlanConstraint,
  QuantitativeReferencePolicy,
} from "../../knowledge-contracts/src/index";

export function deriveQuantitativeConstraints(
  message: string,
  intent: AgentQueryIntent,
): QueryPlanConstraint[] {
  if (intent !== "percentage_change_assessment" && intent !== "value_limit_comparison") return [];

  const normalized = message.normalize("NFKC").toLowerCase();
  const percentageChange = extractPercentage(normalized);
  const referenceValue = extractReferenceValue(normalized);
  const constraints: QueryPlanConstraint[] = [];

  if (percentageChange !== undefined || intent === "value_limit_comparison") {
    constraints.push({ key: "percentageChange", operator: "eq", value: percentageChange ?? 0 });
  }
  if (referenceValue !== undefined) {
    constraints.push({ key: "referenceValue", operator: "eq", value: referenceValue });
  }
  constraints.push({
    key: "referencePolicy",
    operator: "eq",
    value: referencePolicy(normalized, referenceValue),
  });
  return constraints;
}

export function resolveQuantitativeIntent(
  message: string,
  proposedIntent: AgentQueryIntent,
  allowedIntents: AgentQueryIntent[],
): AgentQueryIntent {
  const normalized = message.normalize("NFKC").toLowerCase();
  if (extractPercentage(normalized) !== undefined && allowedIntents.includes("percentage_change_assessment")) {
    return "percentage_change_assessment";
  }
  return proposedIntent;
}

export function mergeDeterministicConstraints(
  modelConstraints: QueryPlanConstraint[],
  deterministicConstraints: QueryPlanConstraint[],
): QueryPlanConstraint[] {
  const deterministicKeys = new Set(deterministicConstraints.map((constraint) => constraint.key));
  return [
    ...modelConstraints.filter((constraint) => !deterministicKeys.has(constraint.key)),
    ...deterministicConstraints,
  ].map((constraint) => ({
    ...constraint,
    value: Array.isArray(constraint.value) ? [...constraint.value] : constraint.value,
  }));
}

function referencePolicy(normalized: string, referenceValue?: number): QuantitativeReferencePolicy {
  if (referenceValue !== undefined) return "explicit";
  if (/control center|center line|中心线|中心值/u.test(normalized)) return "control-center-line";
  if (/latest|current mean|最新|当前均值/u.test(normalized)) return "latest-governed-observation";
  return "compare-all-governed-baselines";
}

function extractPercentage(normalized: string): number | undefined {
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent|百分)/u);
  return match ? Number(match[1]) : undefined;
}

function extractReferenceValue(normalized: string): number | undefined {
  const explicit = normalized.match(/(?:from|reference|baseline|从|基准(?:为|是)?)\s*(\d+(?:\.\d+)?)\s*(?:sccm)?/u);
  if (explicit) return Number(explicit[1]);
  const values = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*sccm/gu)].map((match) => Number(match[1]));
  return values.length === 1 ? values[0] : undefined;
}
