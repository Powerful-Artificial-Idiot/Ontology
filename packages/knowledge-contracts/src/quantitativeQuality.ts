export type QuantitativeReferencePolicy =
  | "explicit"
  | "latest-governed-observation"
  | "control-center-line"
  | "compare-all-governed-baselines";

export type PercentageChangeAssessmentRequest = {
  characteristicId: string;
  operationId?: string;
  productId?: string;
  referenceValue?: number;
  referenceMetricId?: string;
  referencePolicy: QuantitativeReferencePolicy;
  percentageChange: number;
};

export type QuantitativeBoundaryStatus = "within" | "at-limit" | "exceeded" | "unknown";

export type QuantitativeBoundaryComparison = {
  boundaryId: string;
  boundaryType:
    | "warning-limit"
    | "action-limit"
    | "specification-upper-limit"
    | "measurement-range-upper";
  value: number;
  unit: string;
  status: QuantitativeBoundaryStatus;
  exceedance?: number;
  relativeExceedancePercent?: number;
  evidenceIds: string[];
};

export type PercentageChangeAssessment = {
  assessmentId: string;
  characteristicId: string;
  operationId?: string;
  productId?: string;
  referencePolicy: QuantitativeReferencePolicy;
  referenceValue: number;
  referenceUnit: string;
  referenceSourceId: string;
  referenceEvidenceIds: string[];
  percentageChange: number;
  formula: string;
  roundingPolicy: string;
  projectedValue: number;
  warningLimitStatus: "within" | "exceeded" | "unknown";
  actionLimitStatus: "within" | "exceeded" | "unknown";
  specificationStatus: "within" | "at-limit" | "exceeded" | "unknown";
  measurementCapabilityStatus: "measurable" | "outside-range" | "unknown";
  productStatus: "conforming" | "at-specification-limit" | "nonconforming" | "unknown";
  comparisons: QuantitativeBoundaryComparison[];
  requiredReactionPlanIds: string[];
  evidenceIds: string[];
  limitations: string[];
};

export type QuantitativeAssessmentEnvelope = {
  request: PercentageChangeAssessmentRequest;
  assessments: PercentageChangeAssessment[];
  baselineDisclosureRequired: boolean;
};
