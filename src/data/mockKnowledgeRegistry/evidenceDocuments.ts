import { getLeakRateCanonicalEvidence } from "../../../packages/demo-data/src/index";
import { knowledgeIds as id } from "./ids";
import type { MockEvidenceDocument } from "./types";

export const evidenceDocuments: MockEvidenceDocument[] = [
  evidence(id.evidence.semanticLeakRate, "Semantic Catalog — Leak Rate", "Semantic Catalog", "v0.5", "Semantic Catalog", "Leak Rate resolves to QualityCharacteristic.LeakRate; Air Leak, Leakage and Leak Test Result are governed synonyms.", "Resolves user language to the governed Leak Rate concept.", [id.semantic.leakRate, id.semantic.airLeak, id.semantic.leakage, id.semantic.leakTestResult], "Semantic Explorer", ["Semantic View"]),
  evidence(id.evidence.semanticEngineeringChange, "Semantic Catalog — Engineering Change", "Semantic Catalog", "v0.5", "Semantic Catalog", "Program version changes are governed engineering changes affecting dependent processes and controls; validation is required before release.", "Resolves engineering change, program version and validation intent.", [id.semantic.engineeringChange, id.semantic.programVersion, id.semantic.validation, id.program.leakTestV34, id.program.leakTestV35], "Semantic Explorer", ["Semantic View"]),
  evidence(id.evidence.semanticBottleneck, "Semantic Catalog — Bottleneck", "Semantic Catalog", "v0.5", "Semantic Catalog", "A bottleneck is a sustained capacity constraint; cycle time, WIP and waiting are supporting evidence and must be evaluated together.", "Defines bottleneck semantics and prevents overclaiming.", [id.semantic.bottleneck, id.semantic.cycleTime, id.semantic.wip, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20], "Semantic Explorer", ["Semantic View"]),
  evidence(id.evidence.ontologyQuality, "Manufacturing Ontology — Quality Control Relations", "Ontology", "v1.1", "Ontology Repository", "Operation controls Quality Characteristic, is performed on Machine, and quality controls are governed by approved evidence.", "Defines the allowed OP30 quality-impact traversal.", [id.ontology.controls, id.ontology.performedOn, id.ontology.governedBy, id.operation.op30, id.machine.m220, id.quality.leakRate], "Ontology Explorer", ["Ontology View"]),
  evidence(id.evidence.ontologyProgram, "Manufacturing Ontology — Program Dependencies", "Ontology", "v1.1", "Ontology Repository", "Operation uses Program, is performed on Machine, controls Quality Characteristic and is described by SOP.", "Defines the governed program-change dependency traversal.", [id.ontology.usesProgram, id.ontology.performedOn, id.ontology.controls, id.ontology.describedBy], "Ontology Explorer", ["Ontology View"]),
  evidence(id.evidence.ontologyValueStream, "Manufacturing Ontology — Value Stream Flow", "Ontology", "v1.1", "Ontology Repository", "Operations follow nextOperation order and contribute to WIP, waiting and value-stream metrics.", "Defines valid route-flow and value-stream relationships.", [id.ontology.nextOperation, id.ontology.contributesTo, id.operation.op20, id.valueStream.wipBeforeOp20], "Ontology Explorer", ["Ontology View"]),
  evidence(id.document.routingSheet, "Routing Sheet BB01", "Route Graph", "Rev.C", "PLM / MES", "The released route is OP10 → OP20 → OP30 → OP40. OP30 uses M220, FX-002 and LeakTestProgram V3.4.", "Supports route order, operation membership and engineering dependencies.", [id.product.brakeBooster, id.operation.op10, id.operation.op20, id.operation.op30, id.operation.op40, id.machine.m220, id.fixture.fx002, id.program.leakTestV34], "Route Explorer", ["Production View", "Engineering View"]),
  canonicalEvidence(id.document.controlPlan, "Control Plan", "Supports Leak Rate inspection frequency and reaction plan.", ["Quality View"]),
  canonicalEvidence(id.document.pfmea, "PFMEA", "Supports internal-leakage risk and regression checks.", ["Quality View"]),
  canonicalEvidence(id.document.sopOp30, "SOP", "Supports the approved OP30 setup and validation procedure.", ["Engineering View", "Quality View"]),
  evidence(id.document.engineeringSpec, "PS-030 Leak Test Parameter", "Engineering Spec", "Rev.4", "PLM", "Approved leak-test pressure is 2.5 bar; program parameters and checksum require controlled release.", "Defines engineering parameters and program release controls.", [id.program.leakTestV34, id.machine.m220, id.operation.op30], "Route Explorer", ["Engineering View"]),
  evidence(id.document.validationRecord, "Validation Record M220 Program V3.4", "Validation Record", "Rev.1", "Validation Repository", "Golden-part, reject-part and repeatability checks are required after a controlled leak-test program deployment.", "Defines the minimum M220 program regression evidence.", [id.machine.m220, id.program.leakTestV34, id.operation.op30], "Route Explorer", ["Engineering View"]),
  evidence(id.document.validationRecordV35, "Validation Record M220 Program V3.5", "Validation Record", "Draft 1", "Validation Repository", "Records golden-part, reject-part, repeatability, threshold comparison and approval results for the proposed V3.5 release.", "Supports the controlled validation and release decision for LeakTestProgram V3.5.", [id.machine.m220, id.program.leakTestV35, id.operation.op30, id.quality.leakRate], "Route Explorer", ["Engineering View", "Quality View"]),
  evidence(id.document.engineeringChangeM220, "Engineering Change Request M220 Program", "Engineering Change Request", "ECR-01", "PLM Change Control", "Defines the proposed LeakTestProgram V3.4 to V3.5 change, affected M220 deployment scope and required approvals.", "Supports engineering-change scope and release governance.", [id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.operation.op30], "Route Explorer", ["Engineering View"]),
  evidence(id.evidence.mesOp30History, "MES OP30 Test History", "MES Mock Data", "2026-07 Demo", "MES Mock", "Contains M220 program identifier, OP30 test timestamp, batch genealogy and measured values.", "Supports program-version comparison and trial-run traceability.", [id.machine.m220, id.operation.op30, id.program.leakTestV34], "Route Explorer", ["Production View", "Engineering View"]),
  canonicalEvidence(id.evidence.qmsLeakDistribution, "QMS Mock Data", "Supports the bounded abnormal-signal finding and records the missing live-data limitation.", ["Quality View", "Value Stream View"]),
  evidence(id.evidence.mesShift, "MES Shift Sample — OP10 to OP30", "MES Mock Data", "2026-07 Demo", "MES Mock", "OP20 median cycle time is 48s and 90th percentile is 53s in the scripted sample.", "Supports OP20 timing loss and variability.", [id.operation.op20, id.valueStream.operationCycleTime], "Route Explorer", ["Production View", "Value Stream View"]),
  evidence(id.document.valueStreamMap, "Value Stream Map BB01", "Value Stream Map", "Rev.2", "Lean VSM", "The pre-OP20 WIP buffer contains 36 pieces and approximately 18 minutes of waiting; OP30 retest load is tracked before OP40.", "Supports OP20 flow accumulation and OP30 quality-bottleneck analysis.", [id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.waitingBeforeOp40, id.valueStream.reworkRetestLoad, id.operation.op20, id.operation.op30], "Route Explorer", ["Value Stream View"]),
  evidence(id.document.lineBalanceStudy, "Line Balance Study BB01", "Line Balance Study", "Rev.1", "Industrial Engineering", "OP20 median cycle time is 48s against 45s takt; manual diaphragm positioning and fixture reset account for the largest observed losses.", "Supports OP20 cycle-time comparison and plausible loss drivers.", [id.operation.op20, id.valueStream.op20CycleTime, id.valueStream.lineBottleneckRisk, id.semantic.ieLineBalanceResult], "Route Explorer", ["Production View", "Value Stream View"]),
  evidence(id.document.standardWorkOp20, "Standard Work OP20 Diaphragm Assembly", "Standard Work", "Rev.B", "DMS", "Defines the approved OP20 manual sequence, fixture reset method and expected 48s work cycle.", "Supports OP20 work-content and resource verification.", [id.operation.op20, id.valueStream.op20CycleTime], "Route Explorer", ["Production View", "Engineering View", "Value Stream View"]),
];

export const evidenceDocumentById = new Map(evidenceDocuments.map((item) => [item.id, item]));

function canonicalEvidence(id: string, type: MockEvidenceDocument["type"], supports: string, sourceViews: MockEvidenceDocument["sourceViews"]): MockEvidenceDocument {
  const item = getLeakRateCanonicalEvidence(id);
  return {
    id: item.id,
    title: item.title,
    type,
    version: item.version,
    sourceSystem: item.source.sourceSystem,
    evidenceText: item.excerpt,
    supports,
    linkedObjectIds: item.linkedEntityIds,
    sourcePage: "Route Explorer",
    sourceViews,
  };
}

function evidence(id: string, title: string, type: MockEvidenceDocument["type"], version: string, sourceSystem: string, evidenceText: string, supports: string, linkedObjectIds: string[], sourcePage: MockEvidenceDocument["sourcePage"], sourceViews: MockEvidenceDocument["sourceViews"]): MockEvidenceDocument {
  return { id, title, type, version, sourceSystem, evidenceText, supports, linkedObjectIds, sourcePage, sourceViews };
}
