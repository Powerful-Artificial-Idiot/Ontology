import { knowledgeIds as id } from "./ids";
import type { MockSemanticMapping } from "./types";

export const semanticMappings: MockSemanticMapping[] = [
  mapping("semantic.mapping.air-leak", id.semantic.airLeak, id.semantic.leakRate, "synonymOf", "Air Leak is an approved synonym of Leak Rate."),
  mapping("semantic.mapping.leakage", id.semantic.leakage, id.semantic.leakRate, "synonymOf", "Leakage is an approved synonym of Leak Rate."),
  mapping("semantic.mapping.leak-test-result", id.semantic.leakTestResult, id.semantic.leakRate, "synonymOf", "Leak Test Result resolves to Leak Rate in OP30 context."),
  mapping("semantic.mapping.leak-rate-property", id.semantic.leakRate, id.quality.leakRate, "mapsToProperty", "Leak Rate maps to the canonical quality characteristic."),
  mapping("semantic.mapping.qms-leak-rate", id.semantic.qmsLeakRate, id.quality.leakRate, "storedIn", "QMS inspection results store Leak Rate values."),
  mapping("semantic.mapping.mes-op30-value", id.semantic.mesOp30Value, id.quality.leakRate, "storedIn", "MES OP30 test values store execution measurements for Leak Rate."),
  mapping("semantic.mapping-cycle-time", id.semantic.cycleTime, id.valueStream.operationCycleTime, "mapsToProperty", "Cycle Time maps to the canonical operation cycle-time metric."),
  mapping("semantic.mapping-bottleneck", id.semantic.bottleneck, id.valueStream.qualityBottleneckRisk, "mapsToObject", "Bottleneck language can map to a governed value-stream constraint risk when evidence supports it."),
  mapping("semantic.mapping-wip", id.semantic.wip, id.valueStream.wipBeforeOp20, "mapsToObject", "WIP maps to the governed work-in-process buffer at the requested operation boundary."),
  mapping("semantic.mapping-engineering-change", id.semantic.engineeringChange, id.document.engineeringChangeM220, "mapsToObject", "Engineering Change maps to the governed M220 program change request."),
  mapping("semantic.mapping-program-version", id.semantic.programVersion, id.program.leakTestV35, "mapsToObject", "Program Version resolves to the proposed governed LeakTestProgram release in the active context."),
  mapping("semantic.mapping-validation", id.semantic.validation, id.document.validationRecordV35, "mapsToObject", "Validation maps to the controlled V3.5 validation record."),
  mapping("semantic.mapping-leak-rate-specification", id.semantic.leakRateSpecification, id.quality.specification, "mapsToObject", "Leak Rate specification language resolves to the current governed Brake Booster product specification."),
  mapping("semantic.mapping-control-threshold", id.semantic.controlThreshold, id.quality.actionLimit, "mapsToObject", "Control threshold language resolves to internal process limits rather than the product specification."),
  mapping("semantic.mapping-measurement-range", id.semantic.measurementRange, id.quality.measurementSystem, "mapsToObject", "Measurement range resolves to M220 capability and never substitutes for product acceptance."),
  mapping("semantic.mapping-latest-quality-metric", id.semantic.latestQualityMetric, id.quality.latestMetric, "mapsToObject", "Latest quality metric resolves only to the current valid governed observation."),
  mapping("semantic.mapping-reaction-plan", id.semantic.reactionPlan, id.quality.reactionPlan, "mapsToObject", "Reaction Plan resolves to the approved ordered OP30 response plan."),
  mapping("semantic.mapping-qms-usl", id.semantic.qmsLeakRateUsl, id.quality.specification, "storedIn", "QMS stores the approved product USL."),
  mapping("semantic.mapping-qms-action-limit", id.semantic.qmsLeakRateActionLimit, id.quality.actionLimit, "storedIn", "QMS stores the internal process action limit."),
  mapping("semantic.mapping-qms-measurement-range", id.semantic.qmsMeasurementRange, id.quality.measurementSystem, "storedIn", "QMS stores the M220 measurement capability range."),
  mapping("semantic.mapping-qms-weekly-mean", id.semantic.qmsWeeklyMean, id.quality.latestMetric, "storedIn", "QMS stores the latest governed weekly Leak Rate mean."),
  mapping("semantic.mapping-mes-cycle-time", id.semantic.mesOperationCycleTime, id.valueStream.op20CycleTime, "storedIn", "MES operation cycle-time values support the OP20 cycle-time metric."),
  mapping("semantic.mapping-mes-wip", id.semantic.mesWipQuantity, id.valueStream.wipBeforeOp20, "storedIn", "MES WIP quantity supports the WIP before OP20 buffer metric."),
  mapping("semantic.mapping-ie-line-balance", id.semantic.ieLineBalanceResult, id.valueStream.lineBottleneckRisk, "storedIn", "IE line-balance results support the line bottleneck risk assessment."),
];

function mapping(id: string, sourceId: string, targetId: string, relation: MockSemanticMapping["relation"], description: string): MockSemanticMapping { return { id, sourceId, targetId, relation, description }; }
