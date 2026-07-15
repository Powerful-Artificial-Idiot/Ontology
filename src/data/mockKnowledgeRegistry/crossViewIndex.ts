import { knowledgeIds as id } from "./ids";
import type { CrossViewKnowledgeIndex } from "./types";

const productionRoute: CrossViewKnowledgeIndex = {
  view: "Production View",
  findings: ["OP30 Leak Test is downstream of OP20 Diaphragm Assembly and upstream of OP40 Final Inspection in the Brake Booster Assembly route."],
  objectIds: [id.product.brakeBooster, id.operation.op20, id.operation.op30, id.operation.op40],
  referenceIds: [id.document.routingSheet],
};

const qualityControl: CrossViewKnowledgeIndex = {
  view: "Quality View",
  findings: ["OP30 controls Leak Rate / CTQ Leak Rate through 100% Leak Test; Control Plan and PFMEA govern detection and risk response."],
  objectIds: [id.operation.op30, id.quality.leakRate, id.quality.ctqLeakRate, id.quality.automaticLeakTest, id.quality.sealingLeak, id.document.controlPlan, id.document.pfmea],
  referenceIds: [id.document.controlPlan, id.document.pfmea],
};

const engineeringV34: CrossViewKnowledgeIndex = {
  view: "Engineering View",
  findings: ["OP30 is performed on M220 using FX-002, LeakTestProgram V3.4 and the released SOP."],
  objectIds: [id.operation.op30, id.machine.m220, id.fixture.fx002, id.program.leakTestV34, id.document.sopOp30],
  referenceIds: [id.document.routingSheet, id.document.sopOp30],
};

const qualityValueStream: CrossViewKnowledgeIndex = {
  view: "Value Stream View",
  findings: ["Leak Rate abnormalities can increase Rework / Retest Load, Waiting Time before OP40 and Temporary Quality Bottleneck Risk."],
  objectIds: [id.quality.leakRate, id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40, id.valueStream.qualityBottleneckRisk],
  referenceIds: [id.evidence.qmsLeakDistribution, id.document.valueStreamMap],
};

export const qualityImpactViewIndexes: CrossViewKnowledgeIndex[] = [productionRoute, qualityControl, engineeringV34, qualityValueStream];

export const qualityProgramFollowUpViewIndexes: CrossViewKnowledgeIndex[] = [
  {
    view: "Engineering View",
    findings: ["The proposed V3.5 program affects OP30 through M220 and requires the engineering change request plus approved validation record."],
    objectIds: [id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.operation.op30, id.document.engineeringChangeM220, id.document.validationRecordV35],
    referenceIds: [id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30],
  },
  qualityControl,
  productionRoute,
  qualityValueStream,
];

export const qualityValidationViewIndexes: CrossViewKnowledgeIndex[] = [
  {
    view: "Production View",
    findings: ["Validation must compare OP30 output and cycle time while preserving genealogy before release to OP40."],
    objectIds: [id.operation.op30, id.operation.op40, id.valueStream.waitingBeforeOp40],
    referenceIds: [id.evidence.mesOp30History, id.document.routingSheet],
  },
  qualityControl,
  {
    view: "Engineering View",
    findings: ["M220 calibration, FX-002 condition, V3.4/V3.5 identity and the V3.5 validation record are release prerequisites."],
    objectIds: [id.machine.m220, id.fixture.fx002, id.program.leakTestV34, id.program.leakTestV35, id.document.validationRecordV35],
    referenceIds: [id.document.sopOp30, id.document.validationRecordV35, id.document.engineeringChangeM220],
  },
  qualityValueStream,
];

export const engineeringProgramChangeViewIndexes = qualityProgramFollowUpViewIndexes;

export const engineeringEvidenceViewIndexes: CrossViewKnowledgeIndex[] = [
  {
    view: "Engineering View",
    findings: ["Engineering Change Request, V3.4/V3.5 comparison, SOP confirmation and Validation Record V3.5 form the controlled engineering evidence package."],
    objectIds: [id.document.engineeringChangeM220, id.program.leakTestV34, id.program.leakTestV35, id.document.sopOp30, id.document.validationRecordV35],
    referenceIds: [id.document.engineeringChangeM220, id.document.sopOp30, id.document.validationRecordV35],
  },
  qualityControl,
  {
    view: "Production View",
    findings: ["The OP30 trial run must record output, reject rate and genealogy under the proposed program."],
    objectIds: [id.operation.op30, id.product.brakeBooster],
    referenceIds: [id.evidence.mesOp30History, id.document.routingSheet],
  },
];

export const engineeringFailureViewIndexes: CrossViewKnowledgeIndex[] = [
  {
    view: "Engineering View",
    findings: ["A failed validation blocks V3.5 release and requires a controlled rollback to validated V3.4."],
    objectIds: [id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.document.validationRecordV35],
    referenceIds: [id.document.validationRecordV35, id.document.engineeringChangeM220],
  },
  productionRoute,
  qualityControl,
  qualityValueStream,
];

export const bottleneckHypothesisViewIndexes: CrossViewKnowledgeIndex[] = [
  {
    view: "Production View",
    findings: ["OP20 Cycle Time is 48s against a 45s takt and is higher than adjacent OP10 and OP30 operations."],
    objectIds: [id.operation.op10, id.operation.op20, id.operation.op30, id.valueStream.op20CycleTime],
    referenceIds: [id.document.routingSheet, id.evidence.mesShift, id.document.standardWorkOp20],
  },
  {
    view: "Value Stream View",
    findings: ["WIP before OP20 and Waiting Time before OP20 support the OP20 bottleneck hypothesis and Line Bottleneck Risk."],
    objectIds: [id.operation.op20, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.lineBottleneckRisk],
    referenceIds: [id.document.valueStreamMap, id.document.lineBalanceStudy],
  },
  {
    view: "Engineering View",
    findings: ["Standard work, fixture reset and operator availability are the primary OP20 resource checks."],
    objectIds: [id.operation.op20, id.document.standardWorkOp20],
    referenceIds: [id.document.standardWorkOp20, id.document.lineBalanceStudy],
  },
  {
    view: "Quality View",
    findings: ["OP20 assembly variation can propagate to downstream OP30 Leak Rate failures."],
    objectIds: [id.operation.op20, id.operation.op30, id.quality.leakRate],
    referenceIds: [id.document.pfmea],
  },
];

export const bottleneckShiftViewIndexes: CrossViewKnowledgeIndex[] = [
  productionRoute,
  qualityControl,
  qualityValueStream,
  engineeringV34,
];

export const bottleneckDataPlanViewIndexes: CrossViewKnowledgeIndex[] = [
  {
    view: "Production View",
    findings: ["Actual cycle time, hourly output, downtime and resource availability are required for OP10 through OP40."],
    objectIds: [id.operation.op10, id.operation.op20, id.operation.op30, id.operation.op40, id.valueStream.op20CycleTime, id.semantic.mesOperationCycleTime],
    referenceIds: [id.evidence.mesShift, id.document.routingSheet],
  },
  {
    view: "Value Stream View",
    findings: ["WIP, waiting and retest load must be compared to distinguish the persistent OP20 constraint from a temporary OP30 quality bottleneck."],
    objectIds: [id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40, id.valueStream.lineBottleneckRisk, id.semantic.mesWipQuantity],
    referenceIds: [id.document.valueStreamMap, id.document.lineBalanceStudy],
  },
  {
    view: "Quality View",
    findings: ["OP30 first-pass fail rate, retest count, rework count and containment quantity are required."],
    objectIds: [id.operation.op30, id.quality.leakRate, id.valueStream.reworkRetestLoad],
    referenceIds: [id.evidence.qmsLeakDistribution, id.document.controlPlan],
  },
  {
    view: "Engineering View",
    findings: ["M220 version and calibration plus OP20 standard-work adherence are needed to explain capacity loss."],
    objectIds: [id.machine.m220, id.program.leakTestV34, id.operation.op20, id.document.standardWorkOp20, id.semantic.ieLineBalanceResult],
    referenceIds: [id.document.sopOp30, id.document.standardWorkOp20, id.document.lineBalanceStudy],
  },
];

// Backward-compatible names used by existing consumers.
export const qualityTraceViewIndexes = qualityImpactViewIndexes;
export const engineeringChangeViewIndexes = engineeringProgramChangeViewIndexes;
export const validationPlanViewIndexes = qualityValidationViewIndexes;
export const bottleneckViewIndexes = bottleneckHypothesisViewIndexes;
