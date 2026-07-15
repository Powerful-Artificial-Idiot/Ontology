import { knowledgeIds as id } from "./ids";
import type { MockKnowledgeRelation } from "./types";

export const ontologyRelations: MockKnowledgeRelation[] = [
  ...[id.operation.op10, id.operation.op20, id.operation.op30, id.operation.op40].map((operationId, index) => relation(`relation.product-has-operation-${index + 10}`, id.product.brakeBooster, operationId, "hasOperation", "hasOperation", "Brake Booster Assembly contains this released operation.", "Production View", [id.document.routingSheet])),
  relation("relation.op10-next-op20", id.operation.op10, id.operation.op20, "nextOperation", "nextOperation", "OP10 precedes OP20.", "Production View", [id.document.routingSheet]),
  relation("relation.op20-next-op30", id.operation.op20, id.operation.op30, "nextOperation", "nextOperation", "OP20 precedes OP30.", "Production View", [id.document.routingSheet]),
  relation("relation.op30-next-op40", id.operation.op30, id.operation.op40, "nextOperation", "nextOperation", "OP30 precedes OP40.", "Production View", [id.document.routingSheet]),
  relation(id.ontology.controls, id.operation.op30, id.quality.leakRate, "controls", "controls", "OP30 Leak Test controls Leak Rate.", "Quality View", [id.document.controlPlan]),
  relation(id.ontology.performedOn, id.operation.op30, id.machine.m220, "performedOn", "performedOn", "OP30 Leak Test is performed on M220 Leak Test Bench.", "Engineering View", [id.document.routingSheet]),
  relation(id.ontology.usesProgram, id.operation.op30, id.program.leakTestV34, "usesProgram", "usesProgram", "OP30 Leak Test uses LeakTestProgram V3.4.", "Engineering View", [id.document.routingSheet, id.document.engineeringSpec]),
  relation("relation.op30-proposed-program-v3-5", id.operation.op30, id.program.leakTestV35, "usesProgram", "usesProgram", "OP30 Leak Test is the proposed deployment scope for LeakTestProgram V3.5.", "Engineering View", [id.document.engineeringChangeM220]),
  relation(id.ontology.requiresValidation, id.program.leakTestV35, id.document.validationRecordV35, "requiresValidation", "requiresValidation", "LeakTestProgram V3.5 requires an approved validation record before release.", "Engineering View", [id.document.engineeringChangeM220, id.document.validationRecordV35]),
  relation(id.ontology.affects, id.document.engineeringChangeM220, id.operation.op30, "affects", "affects", "The M220 program engineering change affects OP30 Leak Test.", "Engineering View", [id.document.engineeringChangeM220]),
  relation("relation.op30-requires-fx002", id.operation.op30, id.fixture.fx002, "requiresFixture", "requiresFixture", "OP30 Leak Test requires FX-002 Leak Test Fixture.", "Engineering View", [id.document.sopOp30]),
  relation(id.ontology.describedBy, id.operation.op30, id.document.sopOp30, "describedBy", "describedBy", "OP30 Leak Test is described by SOP OP30 Leak Test.", "Engineering View", [id.document.sopOp30]),
  relation(id.ontology.governedBy, id.quality.leakRate, id.document.controlPlan, "governedBy", "governedBy", "Leak Rate is governed by Control Plan CP-BB01 Rev.A.", "Quality View", [id.document.controlPlan]),
  relation(id.ontology.riskAnalyzedBy, id.quality.leakRate, id.document.pfmea, "riskAnalyzedBy", "riskAnalyzedBy", "Leak Rate risk is analyzed by PFMEA PF-BB01 Rev.B.", "Quality View", [id.document.pfmea]),
  relation("relation.leak-rate-evidenced-control-plan", id.quality.leakRate, id.document.controlPlan, "evidencedBy", "evidencedBy", "Control Plan evidence supports the Leak Rate control claim.", "Quality View", [id.document.controlPlan]),
  relation("relation.leak-rate-evidenced-pfmea", id.quality.leakRate, id.document.pfmea, "evidencedBy", "evidencedBy", "PFMEA evidence supports the Leak Rate risk claim.", "Quality View", [id.document.pfmea]),
  relation(id.ontology.contributesTo, id.operation.op30, id.valueStream.waitingBeforeOp40, "contributesTo", "contributesTo", "OP30 processing and retest demand contribute to waiting before OP40.", "Value Stream View", [id.document.valueStreamMap]),
  relation("relation.op20-contributes-cycle-time", id.operation.op20, id.valueStream.op20CycleTime, "contributesTo", "contributesTo", "OP20 execution contributes its cycle time to route capacity.", "Value Stream View", [id.document.lineBalanceStudy]),
  relation("relation.op20-contributes-waiting", id.operation.op20, id.valueStream.waitingBeforeOp20, "contributesTo", "contributesTo", "OP20 capacity constraints contribute to waiting before OP20.", "Value Stream View", [id.document.valueStreamMap]),
  relation("relation.op20-described-standard-work", id.operation.op20, id.document.standardWorkOp20, "describedBy", "describedBy", "OP20 Diaphragm Assembly is described by its released standard work.", "Engineering View", [id.document.standardWorkOp20]),
  relation("relation.leak-abnormality-affects-retest", id.quality.leakRate, id.valueStream.reworkRetestLoad, "affects", "affects", "Leak Rate abnormalities increase rework and retest demand.", "Value Stream View", [id.evidence.qmsLeakDistribution]),
  relation("relation-retest-contributes-quality-bottleneck", id.valueStream.reworkRetestLoad, id.valueStream.qualityBottleneckRisk, "contributesTo", "contributesTo", "Rework / Retest Load contributes to Temporary Quality Bottleneck Risk.", "Value Stream View", [id.evidence.qmsLeakDistribution]),
  relation("relation-air-leak-synonym-leak-rate", id.semantic.airLeak, id.semantic.leakRate, "synonymOf", "synonymOf", "Air Leak is a governed synonym of Leak Rate.", "Semantic View"),
  relation("relation-leak-rate-maps-property", id.semantic.leakRate, id.quality.leakRate, "mapsToProperty", "mapsToProperty", "Leak Rate maps to QualityCharacteristic.LeakRate.", "Semantic View"),
  relation("relation-qms-leak-stored-in", id.semantic.qmsLeakRate, id.quality.leakRate, "storedIn", "storedIn", "QMS inspection field stores Leak Rate results.", "Semantic View"),
  relation("relation-mes-op30-stored-in", id.semantic.mesOp30Value, id.quality.leakRate, "storedIn", "storedIn", "MES OP30 field stores Leak Rate test values.", "Semantic View"),
];

function relation(id: string, sourceId: string, targetId: string, relationType: MockKnowledgeRelation["relationType"], label: string, description: string, sourceView: MockKnowledgeRelation["sourceView"], evidenceIds: string[] = []): MockKnowledgeRelation {
  return { id, sourceId, targetId, relationType, label, description, sourcePage: sourceView === "Ontology View" ? "Ontology Explorer" : sourceView === "Semantic View" ? "Semantic Explorer" : "Route Explorer", sourceView, evidenceIds };
}
