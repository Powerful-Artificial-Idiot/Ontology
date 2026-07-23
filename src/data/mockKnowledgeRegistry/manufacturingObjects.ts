import { getLeakRateCanonicalEntity } from "../../../packages/demo-data/src/index";
import { knowledgeIds as id } from "./ids";
import type { MockKnowledgeObject } from "./types";

export const manufacturingObjects: MockKnowledgeObject[] = [
  canonicalObject(id.product.brakeBooster, "Product", ["Production View", "Quality View", "Engineering View"]),
  object(id.part.aluminumHousing, "Aluminum Housing Blank", "Part", "production", "Aluminum housing blank consumed by OP10 Housing Press Fit.", "Route Explorer", ["Production View"]),
  object(id.part.rubberDiaphragm, "Rubber Diaphragm", "Part", "production", "Rubber diaphragm consumed by OP20 Diaphragm Assembly.", "Route Explorer", ["Production View"]),
  object(id.part.pushRod, "Push Rod", "Part", "production", "Push rod consumed by OP10 Housing Press Fit.", "Route Explorer", ["Production View"]),
  object(id.part.sealRing, "Seal Ring", "Part", "production", "Seal ring consumed by OP20 Diaphragm Assembly.", "Route Explorer", ["Production View"]),
  object(id.operation.op10, "OP10 Housing Press Fit", "Operation", "production", "Housing press-fit operation in the Brake Booster Assembly route.", "Route Explorer", ["Production View", "Engineering View", "Value Stream View"]),
  canonicalObject(id.operation.op20, "Operation", ["Production View", "Quality View", "Engineering View", "Value Stream View"]),
  canonicalObject(id.operation.op30, "Operation", ["Production View", "Quality View", "Engineering View", "Value Stream View"]),
  canonicalObject(id.operation.op40, "Operation", ["Production View", "Quality View", "Engineering View", "Value Stream View"]),
  object(id.machine.m210, "M210 Press Fit Station", "Machine", "engineering", "Press-fit station used by OP10 Housing Press Fit.", "Route Explorer", ["Engineering View"]),
  canonicalObject(id.machine.m220, "Machine", ["Engineering View"]),
  canonicalObject(id.fixture.fx002, "Fixture", ["Engineering View"]),
  canonicalObject(id.program.leakTestV34, "Program", ["Engineering View"]),
  object(id.program.leakTestV35, "LeakTestProgram V3.5", "Program", "engineering", "Proposed M220 test program version requiring controlled validation before release.", "Route Explorer", ["Engineering View"], "Equipment Controller", "3.5"),
  canonicalObject(id.quality.leakRate, "QualityCharacteristic", ["Quality View"]),
  object(id.quality.ctqLeakRate, "CTQ Leak Rate", "CTQ", "quality", "Critical-to-quality classification for the Leak Rate characteristic.", "Route Explorer", ["Quality View"]),
  object(id.quality.visualDefect, "Visual Defect", "QualityCharacteristic", "quality", "Final visual defect characteristic controlled at OP40 Final Inspection.", "Route Explorer", ["Quality View"]),
  canonicalObject(id.quality.sealingLeak, "FailureMode", ["Quality View"]),
  canonicalObject(id.quality.automaticLeakTest, "ControlMethod", ["Quality View"]),
  canonicalObject(id.quality.specification, "Specification", ["Quality View", "Engineering View"]),
  canonicalObject(id.quality.warningLimit, "ControlLimit", ["Quality View"]),
  canonicalObject(id.quality.actionLimit, "ControlLimit", ["Quality View"]),
  canonicalObject(id.quality.measurementSystem, "MeasurementSystem", ["Quality View", "Engineering View"]),
  canonicalObject(id.quality.latestMetric, "MetricObservation", ["Quality View"]),
  canonicalObject(id.quality.reactionPlan, "ReactionPlan", ["Quality View"]),
  canonicalObject(id.quality.samplingPlan, "SamplingPlan", ["Quality View"]),
  canonicalObject(id.document.controlPlan, "Document", ["Quality View"]),
  canonicalObject(id.document.pfmea, "Document", ["Quality View"]),
  canonicalObject(id.document.sopOp30, "Document", ["Engineering View", "Quality View"]),
  document(id.document.routingSheet, "Routing Sheet BB01", "production", "PLM", "Rev.C", ["Production View", "Value Stream View"]),
  document(id.document.validationRecord, "Validation Record M220 Program V3.4", "engineering", "Validation Repository", "Rev.1", ["Engineering View"]),
  document(id.document.validationRecordV35, "Validation Record M220 Program V3.5", "engineering", "Validation Repository", "Draft 1", ["Engineering View"]),
  document(id.document.engineeringChangeM220, "Engineering Change Request M220 Program", "engineering", "PLM Change Control", "ECR-01", ["Engineering View"]),
  document(id.document.engineeringSpec, "PS-030 Leak Test Parameter", "engineering", "PLM", "Rev.4", ["Engineering View"]),
  document(id.document.valueStreamMap, "Value Stream Map BB01", "valueStream", "Lean VSM", "Rev.2", ["Value Stream View"]),
  document(id.document.lineBalanceStudy, "Line Balance Study BB01", "valueStream", "Industrial Engineering", "Rev.1", ["Value Stream View"]),
  document(id.document.standardWorkOp20, "Standard Work OP20 Diaphragm Assembly", "production", "DMS", "Rev.B", ["Production View", "Engineering View", "Value Stream View"]),
  object(id.valueStream.waitingBeforeOp40, "Waiting Time before OP40", "ValueStreamMetric", "valueStream", "Non-value-added waiting between OP30 Leak Test and OP40 Final Inspection.", "Route Explorer", ["Value Stream View"]),
  object(id.valueStream.reworkRetestLoad, "Rework / Retest Load", "ValueStreamMetric", "valueStream", "Additional retest and rework demand caused by Leak Rate abnormalities.", "Route Explorer", ["Value Stream View"]),
  object(id.valueStream.qualityBottleneckRisk, "Temporary Quality Bottleneck Risk", "ValueStreamMetric", "valueStream", "Temporary flow constraint risk created by elevated retest load.", "Route Explorer", ["Value Stream View"]),
  object(id.valueStream.operationCycleTime, "Operation Cycle Time", "ValueStreamMetric", "valueStream", "Comparable processing-time metric for route operations.", "Semantic Explorer", ["Semantic View", "Value Stream View"]),
  object(id.valueStream.op20CycleTime, "OP20 Cycle Time", "ValueStreamMetric", "valueStream", "Observed cycle-time metric for OP20 Diaphragm Assembly.", "Route Explorer", ["Production View", "Value Stream View"]),
  object(id.valueStream.wipBeforeOp20, "WIP before OP20", "WIPBuffer", "valueStream", "Work-in-process buffer feeding OP20 Diaphragm Assembly.", "Route Explorer", ["Value Stream View"]),
  object(id.valueStream.waitingBeforeOp20, "Waiting Time before OP20", "ValueStreamMetric", "valueStream", "Non-value-added waiting accumulated ahead of OP20 Diaphragm Assembly.", "Route Explorer", ["Value Stream View"]),
  object(id.valueStream.lineBottleneckRisk, "Line Bottleneck Risk", "ValueStreamMetric", "valueStream", "Current risk that an operation constrains Brake Booster Assembly route throughput.", "Route Explorer", ["Value Stream View"]),
  semantic(id.semantic.leakRate, "Leak Rate", "Quality characteristic measured during OP30 Leak Test."),
  semantic(id.semantic.cycleTime, "Cycle Time", "Nominal processing time required by an operation."),
  semantic(id.semantic.ctq, "CTQ", "Critical To Quality classification for customer-critical characteristics."),
  semantic(id.semantic.bottleneck, "Bottleneck", "Sustained capacity constraint limiting end-to-end flow."),
  semantic(id.semantic.wip, "WIP", "Work-in-process inventory waiting or moving between operations."),
  semantic(id.semantic.engineeringChange, "Engineering Change", "Governed modification to released equipment, software, parameters or documents."),
  semantic(id.semantic.programVersion, "Program Version", "Released or proposed revision identifier for an equipment program."),
  semantic(id.semantic.validation, "Validation", "Documented evidence that a changed process remains fit for controlled release."),
  semantic(id.semantic.leakRateSpecification, "Leak Rate Specification", "Effective product acceptance criteria for Brake Booster Leak Rate at OP30."),
  semantic(id.semantic.controlThreshold, "Leak Rate Control Threshold", "Internal warning and action boundaries kept separate from product acceptance."),
  semantic(id.semantic.measurementRange, "Measurement Range", "M220 measurement capability boundary; not a product acceptance criterion."),
  semantic(id.semantic.latestQualityMetric, "Latest Quality Metric", "Latest current, valid and governed OP30 Leak Rate observation."),
  semantic(id.semantic.reactionPlan, "Reaction Plan", "Ordered governed response required after the OP30 Leak Rate action limit is exceeded."),
  semantic(id.semantic.airLeak, "Air Leak", "Accepted synonym for Leak Rate."),
  semantic(id.semantic.leakage, "Leakage", "Accepted synonym for Leak Rate."),
  semantic(id.semantic.leakTestResult, "Leak Test Result", "Accepted business phrase mapped to Leak Rate."),
  field(id.semantic.qmsLeakRate, "QMS.inspection_result.leak_rate", "QMS field storing governed Leak Rate inspection results."),
  field(id.semantic.mesOp30Value, "MES.op30_test_value", "MES field storing OP30 measured test values."),
  field(id.semantic.mesOperationCycleTime, "MES.operation_cycle_time", "MES field storing observed operation cycle time."),
  field(id.semantic.mesWipQuantity, "MES.wip_quantity", "MES field storing current WIP quantity by operation boundary."),
  field(id.semantic.ieLineBalanceResult, "IE.line_balance_result", "Industrial Engineering field storing line-balance study results."),
  field(id.semantic.qmsLeakRateUsl, "QMS.specification.leak_rate_usl", "QMS field storing the approved Leak Rate product USL."),
  field(id.semantic.qmsLeakRateActionLimit, "QMS.control_plan.leak_rate_action_limit", "QMS field storing the internal Leak Rate action limit."),
  field(id.semantic.qmsMeasurementRange, "QMS.measurement_system.range_upper", "QMS field storing the M220 measurement range upper boundary."),
  field(id.semantic.qmsWeeklyMean, "QMS.metric.weekly_mean", "QMS field storing the governed weekly Leak Rate mean."),
  ontologyObject(id.ontology.operation, "Operation"), ontologyObject(id.ontology.machine, "Machine"), ontologyObject(id.ontology.qualityCharacteristic, "Quality Characteristic"), ontologyObject(id.ontology.program, "Program"), ontologyObject(id.ontology.controlPlan, "Control Plan"), ontologyObject(id.ontology.pfmea, "PFMEA"), ontologyObject(id.ontology.sop, "SOP"), ontologyObject(id.ontology.valueStreamMetric, "Value Stream Metric"),
  ontologyRelation(id.ontology.controls, "controls"), ontologyRelation(id.ontology.performedOn, "performedOn"), ontologyRelation(id.ontology.usesProgram, "usesProgram"), ontologyRelation(id.ontology.governedBy, "governedBy"), ontologyRelation(id.ontology.riskAnalyzedBy, "riskAnalyzedBy"), ontologyRelation(id.ontology.describedBy, "describedBy"), ontologyRelation(id.ontology.contributesTo, "contributesTo"), ontologyRelation(id.ontology.nextOperation, "nextOperation"), ontologyRelation(id.ontology.affects, "affects"), ontologyRelation(id.ontology.requiresValidation, "requiresValidation"),
];

export const manufacturingObjectById = new Map(manufacturingObjects.map((item) => [item.id, item]));

function canonicalObject(id: string, type: MockKnowledgeObject["type"], sourceViews: NonNullable<MockKnowledgeObject["sourceViews"]>): MockKnowledgeObject {
  const entity = getLeakRateCanonicalEntity(id);
  const source = entity.source?.[0];
  return {
    id: entity.id,
    label: entity.label,
    type,
    domain: entity.domain as MockKnowledgeObject["domain"],
    description: entity.description ?? entity.label,
    sourcePage: "Route Explorer",
    sourceViews,
    sourceSystem: source?.sourceSystem,
    version: entity.version,
    attributes: entity.properties as MockKnowledgeObject["attributes"],
  };
}

function object(id: string, label: string, type: MockKnowledgeObject["type"], domain: MockKnowledgeObject["domain"], description: string, sourcePage: MockKnowledgeObject["sourcePage"], sourceViews: NonNullable<MockKnowledgeObject["sourceViews"]>, sourceSystem?: string, version?: string): MockKnowledgeObject {
  return { id, label, type, domain, description, sourcePage, sourceViews, sourceSystem, version };
}
function document(id: string, label: string, domain: MockKnowledgeObject["domain"], sourceSystem: string, version: string, sourceViews: NonNullable<MockKnowledgeObject["sourceViews"]>) { return object(id, label, "Document", domain, `Governed ${label} evidence artifact.`, "Route Explorer", sourceViews, sourceSystem, version); }
function semantic(id: string, label: string, description: string) { return object(id, label, "SemanticTerm", "semantic", description, "Semantic Explorer", ["Semantic View"]); }
function field(id: string, label: string, description: string) { return object(id, label, "SystemField", "semantic", description, "Semantic Explorer", ["Semantic View"]); }
function ontologyObject(id: string, label: string) { return object(id, label, "OntologyObjectType", "ontology", `Canonical ontology object type: ${label}.`, "Ontology Explorer", ["Ontology View"]); }
function ontologyRelation(id: string, label: string) { return object(id, label, "OntologyRelationshipType", "ontology", `Canonical ontology relationship type: ${label}.`, "Ontology Explorer", ["Ontology View"]); }
