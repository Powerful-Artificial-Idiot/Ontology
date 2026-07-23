import type {
  CanonicalKnowledgeBaseline,
  KnowledgeEntity,
  PercentageChangeAssessment,
  PercentageChangeAssessmentRequest,
  QuantitativeAssessmentEnvelope,
  QuantitativeBoundaryComparison,
  SemanticQueryPlan,
} from "../../knowledge-contracts/src/index";
import { AgentPipelineError, assertPipeline } from "./errors";
import type { GraphRetrievalResult, QuantitativeQualityAssessor } from "./types";

const QUANTITATIVE_INTENTS = new Set([
  "percentage_change_assessment",
  "value_limit_comparison",
]);

const IDS = {
  characteristic: "quality-characteristic.leak-rate",
  operation: "operation.op30",
  product: "product.brake-booster",
  specification: "specification.brake-booster.leak-rate.rev-a",
  warning: "control-limit.leak-rate.warning",
  action: "control-limit.leak-rate.action",
  controlCenter: "control-limit.leak-rate.center-line",
  measurementSystem: "measurement-system.m220-leak-tester",
  latestMetric: "metric-observation.leak-rate.2026-w29",
  reactionPlan: "reaction-plan.op30-leak-rate.rev-a",
} as const;

export class DeterministicQuantitativeQualityAssessor implements QuantitativeQualityAssessor {
  readonly toolName = "deterministic-quantitative-quality-assessment.v1";

  supports(plan: SemanticQueryPlan): boolean {
    return QUANTITATIVE_INTENTS.has(plan.intent);
  }

  async assess(
    plan: SemanticQueryPlan,
    graph: GraphRetrievalResult,
    baseline: CanonicalKnowledgeBaseline,
  ): Promise<QuantitativeAssessmentEnvelope> {
    assertPipeline(this.supports(plan), "QUERY_INTENT_UNSUPPORTED", `Quantitative assessment does not support ${plan.intent}.`, "quantitative-assessment");
    const entities = new Map([...baseline.entities, ...graph.entities].map((entity) => [entity.id, entity]));
    validateQuantitativeGovernance(entities, baseline);
    const percentageChange = numericConstraint(plan, "percentageChange");
    assertPipeline(percentageChange !== undefined, "QUERY_PLAN_INVALID", "A percentage change is required for quantitative assessment.", "quantitative-assessment");
    const explicitReference = numericConstraint(plan, "referenceValue");
    const requestedPolicy = stringConstraint(plan, "referencePolicy");
    const referencePolicy: PercentageChangeAssessmentRequest["referencePolicy"] = explicitReference !== undefined
      ? "explicit"
      : requestedPolicy === "control-center-line" || requestedPolicy === "latest-governed-observation"
        ? requestedPolicy
        : "compare-all-governed-baselines";
    const request: PercentageChangeAssessmentRequest = {
      characteristicId: IDS.characteristic,
      operationId: IDS.operation,
      productId: IDS.product,
      referenceValue: explicitReference,
      referencePolicy,
      percentageChange,
    };

    const references = referencePolicy === "compare-all-governed-baselines"
      ? [
          governedReference(entities, IDS.latestMetric, "latest-governed-observation", "mean"),
          governedReference(entities, IDS.controlCenter, "control-center-line", "value"),
        ]
      : referencePolicy === "explicit"
        ? [{ value: explicitReference as number, sourceId: "user-input.reference-value", policy: referencePolicy, evidenceIds: [] }]
        : [referencePolicy === "latest-governed-observation"
            ? governedReference(entities, IDS.latestMetric, referencePolicy, "mean")
            : governedReference(entities, IDS.controlCenter, referencePolicy, "value")];

    return {
      request,
      assessments: references.map((reference, index) => this.assessReference(reference, percentageChange, entities, index)),
      baselineDisclosureRequired: referencePolicy === "compare-all-governed-baselines",
    };
  }

  private assessReference(
    reference: { value: number; sourceId: string; policy: PercentageChangeAssessmentRequest["referencePolicy"]; evidenceIds: string[] },
    percentageChange: number,
    entities: Map<string, KnowledgeEntity>,
    index: number,
  ): PercentageChangeAssessment {
    const unit = "sccm";
    const warning = numericProperty(requiredEntity(entities, IDS.warning), "value");
    const action = numericProperty(requiredEntity(entities, IDS.action), "value");
    const specification = numericProperty(requiredEntity(entities, IDS.specification), "upperSpecificationLimit");
    const measurementMaximum = numericProperty(requiredEntity(entities, IDS.measurementSystem), "rangeUpper");
    const projectedValue = multiplyByPercentage(reference.value, percentageChange, 3);
    const warningStatus = compareScaled(projectedValue, warning) > 0 ? "exceeded" : "within";
    const actionStatus = compareScaled(projectedValue, action) > 0 ? "exceeded" : "within";
    const specificationComparison = compareScaled(projectedValue, specification);
    const specificationStatus = specificationComparison > 0 ? "exceeded" : specificationComparison === 0 ? "at-limit" : "within";
    const measurementCapabilityStatus = compareScaled(projectedValue, measurementMaximum) > 0 ? "outside-range" : "measurable";
    const requiredReactionPlanIds = compareScaled(projectedValue, action) > 0
      ? [IDS.reactionPlan]
      : [];
    const comparisons: QuantitativeBoundaryComparison[] = [
      boundary(IDS.warning, "warning-limit", warning, projectedValue, unit),
      boundary(IDS.action, "action-limit", action, projectedValue, unit),
      boundary(IDS.specification, "specification-upper-limit", specification, projectedValue, unit),
      boundary(IDS.measurementSystem, "measurement-range-upper", measurementMaximum, projectedValue, unit),
    ];
    const evidenceIds = [
      ...reference.evidenceIds,
      "evidence.specification.leak-rate.rev-a",
      "evidence.control-limits.leak-rate",
      "evidence.measurement-system.m220",
      ...(requiredReactionPlanIds.length ? ["evidence.reaction-plan.op30"] : []),
    ];
    return {
      assessmentId: `assessment.leak-rate.${reference.policy}.${index + 1}`,
      characteristicId: IDS.characteristic,
      operationId: IDS.operation,
      productId: IDS.product,
      referencePolicy: reference.policy,
      referenceValue: reference.value,
      referenceUnit: unit,
      referenceSourceId: reference.sourceId,
      referenceEvidenceIds: reference.evidenceIds,
      percentageChange,
      formula: `${formatNumber(reference.value)} × ${formatNumber(1 + percentageChange / 100)} = ${formatNumber(projectedValue)} ${unit}`,
      roundingPolicy: "Decimal-safe integer scaling; result rounded half-up to 0.001 sccm.",
      projectedValue,
      warningLimitStatus: warningStatus,
      actionLimitStatus: actionStatus,
      specificationStatus,
      measurementCapabilityStatus,
      productStatus: specificationStatus === "exceeded"
        ? "nonconforming"
        : specificationStatus === "at-limit"
          ? "at-specification-limit"
          : "conforming",
      comparisons,
      requiredReactionPlanIds,
      evidenceIds: [...new Set(evidenceIds)],
      limitations: reference.policy === "explicit"
        ? ["The reference value was supplied by the user and is not independently governed process evidence."]
        : [],
    };
  }
}

function governedReference(
  entities: Map<string, KnowledgeEntity>,
  entityId: string,
  policy: PercentageChangeAssessmentRequest["referencePolicy"],
  property: string,
) {
  const entity = requiredEntity(entities, entityId);
  assertPipeline(
    entity.status === "active"
      && entity.properties.effectiveState === "current"
      && (entity.type !== "qual:MetricObservation" || entity.properties.validityState === "valid"),
    "EVIDENCE_INSUFFICIENT",
    `Reference ${entityId} is not the current governed baseline.`,
    "quantitative-assessment",
  );
  return {
    value: numericProperty(entity, property),
    sourceId: entity.id,
    policy,
    evidenceIds: policy === "latest-governed-observation"
      ? ["evidence.metric.latest-2026-w29"]
      : ["evidence.control-limits.leak-rate"],
  };
}

function validateQuantitativeGovernance(
  entities: Map<string, KnowledgeEntity>,
  baseline: CanonicalKnowledgeBaseline,
): void {
  const applicableSpecifications = [...entities.values()].filter((entity) =>
    entity.type === "qual:Specification"
    && entity.properties.productId === IDS.product
    && entity.properties.characteristicId === IDS.characteristic
    && entity.properties.operationId === IDS.operation
    && entity.status === "active"
    && entity.properties.approvalState === "approved"
    && entity.properties.effectiveState === "current");
  assertPipeline(
    applicableSpecifications.length === 1 && applicableSpecifications[0]?.id === IDS.specification,
    "EVIDENCE_INSUFFICIENT",
    "Quantitative assessment requires exactly one approved, current and applicable Leak Rate specification.",
    "quantitative-assessment",
    { specificationCount: applicableSpecifications.length },
  );

  [IDS.controlCenter, IDS.warning, IDS.action].forEach((id) => {
    const limit = requiredEntity(entities, id);
    assertPipeline(
      limit.status === "active"
        && limit.properties.approvalState === "approved"
        && limit.properties.effectiveState === "current",
      "EVIDENCE_INSUFFICIENT",
      `Control limit ${id} is not approved and current.`,
      "quantitative-assessment",
    );
  });

  const measurementSystem = requiredEntity(entities, IDS.measurementSystem);
  assertPipeline(
    measurementSystem.status === "active"
      && measurementSystem.properties.effectiveState === "current"
      && measurementSystem.properties.calibrationState === "valid"
      && typeof measurementSystem.properties.lastCalibration === "string",
    "EVIDENCE_INSUFFICIENT",
    "The M220 measurement system does not have current valid calibration evidence.",
    "quantitative-assessment",
  );

  const controlPlanEvidence = baseline.evidencePack.items.filter((item) =>
    item.governance?.documentId === "document.control-plan.cp-bb01.rev-a");
  assertPipeline(
    controlPlanEvidence.some((item) =>
      item.status === "active"
      && item.governance?.approvalStatus === "approved"
      && item.governance.lifecycleStatus === "effective"
      && item.governance.accessDecision === "allowed"),
    "EVIDENCE_INSUFFICIENT",
    "No approved and effective OP30 Control Plan evidence is available.",
    "quantitative-assessment",
  );
}

function boundary(
  boundaryId: string,
  boundaryType: QuantitativeBoundaryComparison["boundaryType"],
  boundaryValue: number,
  projectedValue: number,
  unit: string,
): QuantitativeBoundaryComparison {
  const result = compareScaled(projectedValue, boundaryValue);
  const exceedance = result > 0 ? subtractDecimal(projectedValue, boundaryValue, 3) : undefined;
  return {
    boundaryId,
    boundaryType,
    value: boundaryValue,
    unit,
    status: result > 0 ? "exceeded" : result === 0 ? "at-limit" : "within",
    exceedance,
    relativeExceedancePercent: exceedance === undefined || boundaryValue === 0
      ? undefined
      : percentageOf(exceedance, boundaryValue, 1),
    evidenceIds: boundaryType === "specification-upper-limit"
      ? ["evidence.specification.leak-rate.rev-a"]
      : boundaryType === "measurement-range-upper"
        ? ["evidence.measurement-system.m220"]
        : ["evidence.control-limits.leak-rate"],
  };
}

function requiredEntity(entities: Map<string, KnowledgeEntity>, id: string): KnowledgeEntity {
  const entity = entities.get(id);
  if (!entity) throw new AgentPipelineError("EVIDENCE_INSUFFICIENT", `Required governed quantitative entity is missing: ${id}`, "quantitative-assessment");
  return entity;
}

function numericProperty(entity: KnowledgeEntity, key: string): number {
  const value = entity.properties[key];
  assertPipeline(typeof value === "number" && Number.isFinite(value), "EVIDENCE_INSUFFICIENT", `Entity ${entity.id} is missing numeric property ${key}.`, "quantitative-assessment");
  assertPipeline(entity.properties.unit === "sccm", "EVIDENCE_INSUFFICIENT", `Entity ${entity.id} does not use canonical unit sccm.`, "quantitative-assessment");
  return value;
}

function numericConstraint(plan: SemanticQueryPlan, key: string): number | undefined {
  const value = plan.constraints.find((constraint) => constraint.key === key)?.value;
  return typeof value === "number" ? value : undefined;
}

function stringConstraint(plan: SemanticQueryPlan, key: string): string | undefined {
  const value = plan.constraints.find((constraint) => constraint.key === key)?.value;
  return typeof value === "string" ? value : undefined;
}

export function multiplyByPercentage(value: number, percentageChange: number, decimals = 3): number {
  const scale = 10n ** BigInt(decimals);
  const valueScaled = toScaledInteger(value, decimals);
  const percentScaled = toScaledInteger(100 + percentageChange, decimals);
  const denominator = 100n * scale;
  const numerator = valueScaled * percentScaled;
  const rounded = (numerator + denominator / 2n) / denominator;
  return Number(rounded) / Number(scale);
}

function subtractDecimal(left: number, right: number, decimals: number): number {
  const scale = 10n ** BigInt(decimals);
  return Number(toScaledInteger(left, decimals) - toScaledInteger(right, decimals)) / Number(scale);
}

function compareScaled(left: number, right: number): number {
  const leftScaled = toScaledInteger(left, 6);
  const rightScaled = toScaledInteger(right, 6);
  return leftScaled === rightScaled ? 0 : leftScaled > rightScaled ? 1 : -1;
}

function percentageOf(numeratorValue: number, denominatorValue: number, decimals: number): number {
  const numerator = toScaledInteger(numeratorValue, 6);
  const denominator = toScaledInteger(denominatorValue, 6);
  const resultScale = 10n ** BigInt(decimals);
  const scaled = (numerator * 100n * resultScale + denominator / 2n) / denominator;
  return Number(scaled) / Number(resultScale);
}

function toScaledInteger(value: number, decimals: number): bigint {
  assertPipeline(Number.isFinite(value), "QUERY_PLAN_INVALID", "Quantitative values must be finite.", "quantitative-assessment");
  return BigInt(Math.round(value * 10 ** decimals));
}

function formatNumber(value: number): string {
  return value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}
