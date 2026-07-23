import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const baselinePath = join(root, "packages/demo-data/canonical/leak-rate-quality-issue-trace.json");
const registryPath = join(root, "packages/demo-data/documents/leak-rate/document-registry.json");
const contentRoot = join(root, "packages/demo-data/documents/leak-rate/content");
const sourceExtractRoot = join(root, "packages/demo-data/source-extracts");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const source = (sourceId, sourceSystem = "Governed Demo Fixture") => [{
  sourceType: "governed-fixture",
  sourceId,
  sourceSystem,
  locator: `synthetic-demo/${sourceId}`,
  recordedAt: "2026-07-23T00:00:00.000Z",
}];

const commonProperties = {
  dataClassification: "synthetic-demo",
  productionUseAllowed: false,
  sourceKind: "governed-fixture",
};

function entity(id, type, label, properties = {}, options = {}) {
  return {
    id,
    type,
    label,
    description: options.description ?? `${label}. Synthetic governed demo fixture; not a production specification.`,
    domain: options.domain ?? "quality",
    properties: { ...commonProperties, ...properties },
    source: source(options.sourceId ?? id, options.sourceSystem),
    validFrom: options.validFrom ?? "2026-07-01T00:00:00.000Z",
    version: options.version ?? "1.0",
    status: options.status ?? "active",
  };
}

function relation(sourceId, label, targetId, properties = {}, index = 0) {
  const suffix = index ? `.${index}` : "";
  return {
    id: `relation.${sourceId}.${label}.${targetId}${suffix}`.replace(/[^a-zA-Z0-9.-]/g, "-"),
    sourceId,
    targetId,
    predicate: relationPredicate(label),
    label,
    properties: { ...commonProperties, ...properties },
    provenance: source(`relation.${sourceId}.${label}.${targetId}`),
    confidence: 1,
    evidenceType: "governed-fixture",
    assertionType: "asserted",
  };
}

function relationPredicate(label) {
  const existingPredicates = {
    hasOperation: "mfg:requiresOperation",
    nextOperation: "mfg:flowsTo",
    performedOn: "mfg:executedBy",
    requiresFixture: "mfg:requiresResource",
    usesProgram: "mfg:usesParameter",
    controls: "qual:controlsCharacteristic",
    controlledBy: "qual:controlledBy",
    hasAction: "qual:hasAction",
    usesReference: "qual:usesReference",
    affectedObject: "eng:affects",
    assessesOperation: "vs:contributesTo",
    feedsBuffer: "vs:affectsFlow",
    feedsOperation: "vs:affectsFlow",
    supersedes: "core:supersedes",
  };
  if (existingPredicates[label]) return existingPredicates[label];
  const quality = new Set([
    "controls", "controlledBy", "hasSpecificationLimit", "hasInternalControlLimit", "measuredBy",
    "implementsControlMethod", "usesMeasurementSystem", "hasSamplingPlan", "triggersReactionPlan",
    "hasMetricSeries", "hasObservation", "observedAtOperation", "observedOnMachine", "hasFailureMode",
    "requiresContainment", "requiresVerification", "hasCapabilityStudy", "hasMsaStudy", "calibratedBy",
  ]);
  if (quality.has(label)) return `qual:${label}`;
  if (["affectedByChange", "validatedBy", "currentVersionOf", "proposedVersionOf", "requiresValidation"].includes(label)) return `eng:${label}`;
  if (["governedBy", "supportedByEvidence", "derivedFromSource", "appliesToProduct", "appliesToOperation", "appliesToCharacteristic"].includes(label)) return `core:${label}`;
  return `mfg:${label}`;
}

const existingById = new Map(baseline.entities.map((item) => [item.id, item]));
function replaceExisting(id, next) {
  existingById.set(id, next);
}

replaceExisting("product.brake-booster", entity("product.brake-booster", "mfg:Product", "Brake Booster Assembly", {
  productCode: "FP-001",
  owner: "Product Engineering",
}, { domain: "production", sourceSystem: "PLM Demo" }));
replaceExisting("operation.op20", entity("operation.op20", "mfg:Operation", "OP20 Diaphragm Assembly", {
  operationCode: "OP20",
  cycleTimeSeconds: 48,
  taktTimeSeconds: 45,
  wipPieces: 32,
  queueTimeMinutes: 18,
  bottleneckStatus: "candidate",
}, { domain: "production", sourceSystem: "MES Demo" }));
replaceExisting("operation.op30", entity("operation.op30", "mfg:Operation", "OP30 Leak Test", {
  operationCode: "OP30",
  cycleTimeSeconds: 42,
  taktTimeSeconds: 45,
  outputWip: "Tested Booster",
  owner: "Production Engineering",
}, { domain: "production", sourceSystem: "MES Demo" }));
replaceExisting("operation.op40", entity("operation.op40", "mfg:Operation", "OP40 Final Inspection", {
  operationCode: "OP40",
  owner: "Quality Operations",
}, { domain: "production", sourceSystem: "MES Demo" }));
replaceExisting("machine.m220", entity("machine.m220", "mfg:Machine", "M220 Leak Test Bench", {
  equipmentCode: "M220",
  calibrationState: "valid",
  lastCalibration: "2026-07-01",
  nextCalibrationDue: "2026-10-01",
  owner: "Maintenance",
}, { domain: "engineering", sourceSystem: "MES Demo" }));
replaceExisting("fixture.fx-002", entity("fixture.fx-002", "mfg:ManufacturingResource", "FX-002 Leak Test Fixture", {
  fixtureCode: "FX-002",
  maintenanceState: "current",
  owner: "Tooling Engineering",
}, { domain: "engineering", sourceSystem: "PLM Demo" }));
replaceExisting("program.leak-test.v3-4", entity("program.leak-test.v3-4", "mfg:ProcessParameter", "LeakTestProgram V3.4", {
  programName: "LeakTestProgram",
  releaseStatus: "released",
  approvalState: "approved",
  effectiveState: "current",
  stabilizationSeconds: 3,
  measurementSeconds: 5,
  testPressureKpa: 500,
  pressureToleranceKpa: 5,
}, { domain: "engineering", sourceSystem: "PLM Demo", version: "3.4" }));
replaceExisting("quality-characteristic.leak-rate", entity("quality-characteristic.leak-rate", "qual:QualityCharacteristic", "Leak Rate", {
  unit: "sccm",
  displayUnitAlias: "cm³/min at standard conditions",
  inspectionFrequency: "100%",
  risk: "High",
  owner: "Quality Engineering",
}, { sourceSystem: "QMS Demo" }));
replaceExisting("control-method.automatic-leak-test", entity("control-method.automatic-leak-test", "qual:ControlMethod", "Automated Air-decay Leak Test", {
  unit: "sccm",
  rangeLower: 0,
  rangeUpper: 0.5,
  resolution: 0.01,
  testPressureKpa: 500,
  pressureToleranceKpa: 5,
  stabilizationSeconds: 3,
  measurementSeconds: 5,
  inspectionRatePercent: 100,
  effectiveState: "current",
}, { sourceSystem: "QMS Demo" }));
replaceExisting("failure-mode.internal-leakage", entity("failure-mode.internal-leakage", "qual:FailureMode", "Internal Leakage", {
  effect: "Reduced brake booster performance",
  severity: "Critical",
  causalEvidenceState: "not-attributed-to-bottleneck",
}, { sourceSystem: "QMS Demo" }));

const richEntities = [
  entity("unit.sccm", "core:Unit", "sccm", { symbol: "sccm", definition: "Standard cubic centimetres per minute", displayAlias: "cm³/min at standard conditions" }),
  entity("specification.brake-booster.leak-rate.rev-a", "qual:Specification", "Brake Booster Leak Rate Specification Rev.A", {
    unit: "sccm", targetValue: 0.18, lowerSpecificationLimit: 0, upperSpecificationLimit: 0.3,
    revision: "Rev.A", approvalState: "approved", effectiveState: "current", effectiveDate: "2026-07-01",
    productId: "product.brake-booster", characteristicId: "quality-characteristic.leak-rate", operationId: "operation.op30",
    owner: "Product Quality Engineering",
  }),
  entity("specification-limit.leak-rate.lsl", "qual:SpecificationLimit", "Leak Rate Lower Specification Limit", { unit: "sccm", value: 0, limitType: "lower-specification-limit", revision: "Rev.A", approvalState: "approved", effectiveState: "current" }),
  entity("specification-limit.leak-rate.usl", "qual:SpecificationLimit", "Leak Rate Upper Specification Limit", { unit: "sccm", value: 0.3, limitType: "upper-specification-limit", revision: "Rev.A", approvalState: "approved", effectiveState: "current" }),
  entity("control-limit.leak-rate.center-line", "qual:InternalControlLimit", "Leak Rate Control Center Line", { unit: "sccm", value: 0.2, limitType: "control-center-line", approvalState: "approved", effectiveState: "current" }),
  entity("control-limit.leak-rate.warning", "qual:InternalControlLimit", "Leak Rate Warning Limit", { unit: "sccm", value: 0.24, limitType: "warning-limit", approvalState: "approved", effectiveState: "current" }),
  entity("control-limit.leak-rate.action", "qual:InternalControlLimit", "Leak Rate Action Limit", { unit: "sccm", value: 0.27, limitType: "action-limit", approvalState: "approved", effectiveState: "current" }),
  entity("measurement-system.m220-leak-tester", "qual:MeasurementSystem", "M220 Leak Tester Measurement System", {
    unit: "sccm", rangeLower: 0, rangeUpper: 0.5, resolution: 0.01, calibrationState: "valid",
    lastCalibration: "2026-07-01", nextCalibrationDue: "2026-10-01", effectiveState: "current",
  }, { domain: "engineering" }),
  entity("sampling-plan.op30-leak-rate.rev-a", "qual:SamplingPlan", "OP30 Leak Rate Sampling Plan Rev.A", {
    productionInspection: "100% automated inspection", masterLeakFrequency: "once per shift",
    goldenSampleFrequency: "after program or fixture change", layeredAuditSampleSize: 5, approvalState: "approved", effectiveState: "current",
  }),
  entity("reaction-plan.op30-leak-rate.rev-a", "qual:ReactionPlan", "OP30 Leak Rate Reaction Plan Rev.A", {
    trigger: "value > 0.27 sccm", nonconformingTrigger: "value > 0.30 sccm", revision: "Rev.A",
    approvalState: "approved", effectiveState: "current", owner: "Quality Engineering",
  }),
  entity("metric-series.op30-leak-rate.weekly", "qual:MetricSeries", "OP30 Weekly Leak Rate Series", {
    unit: "sccm", aggregation: "weekly", effectiveState: "current", sourceVersion: "QMS-DEMO-2026.07",
  }),
  entity("capability-study.op30-leak-rate.2026-w29", "qual:CapabilityStudy", "OP30 Leak Rate Capability Study 2026-W29", {
    unit: "sccm", cpk: 1.08, sampleCount: 2400, observedPeriod: "2026-W29", approvalState: "approved", effectiveState: "current",
  }),
  entity("msa-study.m220-leak-tester.rev-a", "qual:MeasurementSystemAnalysis", "M220 Leak Tester MSA Rev.A", {
    unit: "sccm", grrPercentOfTolerance: 8.2, bias: 0.004, approvalState: "approved", effectiveState: "current",
  }),
  entity("calibration-record.m220.2026-07", "qual:CalibrationRecord", "M220 Calibration Record 2026-07", {
    unit: "sccm", calibrationState: "valid", lastCalibration: "2026-07-01", nextDueDate: "2026-10-01",
    masterLeakId: "master-leak.ml-050", approvalState: "approved", effectiveState: "current",
  }),
  entity("master-leak.ml-050", "qual:MeasurementReference", "Master Leak ML-050", { unit: "sccm", certifiedValue: 0.05, certificationState: "valid", nextDueDate: "2026-12-01" }),
  entity("golden-sample.op30.pass", "qual:MeasurementReference", "OP30 Golden Pass Sample", { unit: "sccm", nominalValue: 0.18, state: "valid" }),
  entity("quality-issue.op30-leak-rate.demo-001", "qual:QualityIssue", "OP30 Leak Rate Demo Signal", { issueState: "monitoring", observedPeriod: "2026-W29", causalConclusion: "not-established" }),
  entity("deviation.op30-leak-rate.demo-001", "qual:Deviation", "OP30 Leak Rate Demo Deviation", { deviationState: "open-demo", releaseState: "blocked-pending-evidence" }),
  entity("containment-action.hold-current-lot", "qual:ContainmentAction", "Hold Current Lot", { sequence: 1, completionState: "not-started", ownerRole: "Production Supervisor" }),
  entity("containment-action.rescreen", "qual:ContainmentAction", "100% Re-screening", { sequence: 7, completionState: "conditional", ownerRole: "Quality Operations" }),
  entity("program.leak-test.v3-5", "mfg:ProcessParameter", "LeakTestProgram V3.5", {
    releaseStatus: "proposed", approvalState: "pending-validation", effectiveState: "not-effective",
    stabilizationSeconds: 2.5, measurementSeconds: 5, testPressureKpa: 500,
  }, { domain: "engineering", version: "3.5" }),
  entity("engineering-change.m220-program-v3-5", "eng:EngineeringChange", "M220 Program V3.5 Engineering Change", {
    changeStatus: "validation-required", objective: "Reduce stabilization time from 3.0 seconds to 2.5 seconds",
    potentialImpacts: ["measurement bias", "false-pass risk", "false-fail risk", "cycle-time reduction"],
    confirmedImpactState: "not-confirmed", effectiveState: "not-effective",
  }, { domain: "engineering" }),
  entity("validation-plan.m220-program-v3-5", "eng:ValidationPlan", "M220 Program V3.5 Validation Plan", {
    approvalState: "approved-for-validation", completionState: "incomplete", productionReleaseAllowed: false,
  }, { domain: "engineering" }),
  entity("validation-record.program-v3-4.rev-a", "eng:ValidationRecord", "Program V3.4 Validation Record", {
    validationState: "passed", approvalState: "approved", effectiveState: "current",
  }, { domain: "engineering" }),
  entity("bottleneck-assessment.op20.2026-w29", "vs:BottleneckAssessment", "OP20 Bottleneck Candidate Assessment", {
    assessmentState: "candidate", cycleTimeSeconds: 48, taktTimeSeconds: 45, causalLinkToLeakRate: "not-established",
  }, { domain: "valueStream" }),
  entity("wip-buffer.op20-op30", "vs:WIPBuffer", "OP20 to OP30 WIP Buffer", { wipPieces: 32, queueTimeMinutes: 18 }, { domain: "valueStream" }),
];

const validationRequirements = [
  ["msa-confirmation", "MSA Confirmation"],
  ["master-leak-verification", "Master Leak Verification"],
  ["correlation-study-30-piece", "30-piece Correlation Study"],
  ["capability-confirmation", "Capability Confirmation"],
  ["quality-approval", "Quality Approval"],
].map(([suffix, label], index) => entity(`validation-requirement.v3-5.${suffix}`, "eng:ValidationRequirement", label, {
  sequence: index + 1, completionState: "pending", requiredForProductionRelease: true,
}, { domain: "engineering" }));

const reactionActions = [
  ["hold-current-lot", "Hold Current Lot", "Production Supervisor"],
  ["identify-last-known-good", "Identify Last Known Good Verification", "Quality Engineer"],
  ["verify-master-leak", "Verify Master Leak", "Metrology Technician"],
  ["inspect-fixture-seals", "Inspect Fixture Seals", "Tooling Technician"],
  ["verify-program-version", "Verify Released Program Version", "Controls Engineer"],
  ["repeat-golden-sample", "Repeat Golden-sample Test", "Quality Technician"],
  ["rescreen-when-required", "Perform 100% Re-screening When Required", "Quality Operations"],
  ["create-deviation", "Create Deviation Record", "Quality Engineer"],
  ["notify-quality-engineer", "Notify Quality Engineer", "Production Supervisor"],
  ["release-after-approval", "Release Only After Evidence Approval", "Quality Manager"],
].map(([suffix, label, ownerRole], index) => entity(`reaction-action.op30.${suffix}`, "qual:CorrectiveAction", label, {
  sequence: index + 1,
  trigger: index < 9 ? "value > 0.27 sccm" : "all required evidence approved",
  ownerRole,
  requiredEvidence: `evidence.reaction-action.${suffix}`,
  completionState: "not-started",
}));

const observationValues = [
  ["2026-W10", 0.19, 0.25, 0.23, 1.42, 2200],
  ["2026-W11", 0.2, 0.26, 0.24, 1.37, 2250],
  ["2026-W12", 0.2, 0.25, 0.24, 1.39, 2300],
  ["2026-W13", 0.19, 0.24, 0.23, 1.45, 2280],
  ["2026-W14", 0.2, 0.26, 0.24, 1.35, 2310],
  ["2026-W15", 0.2, 0.25, 0.24, 1.38, 2320],
  ["2026-W16", 0.2, 0.26, 0.24, 1.34, 2350],
  ["2026-W17", 0.2, 0.26, 0.24, 1.33, 2360],
  ["2026-W18", 0.2, 0.26, 0.24, 1.31, 2380],
  ["2026-W19", 0.2, 0.27, 0.25, 1.28, 2390],
  ["2026-W20", 0.2, 0.26, 0.25, 1.29, 2400],
  ["2026-W21", 0.21, 0.27, 0.25, 1.25, 2410],
  ["2026-W22", 0.21, 0.27, 0.25, 1.23, 2395],
  ["2026-W23", 0.21, 0.27, 0.26, 1.2, 2405],
  ["2026-W24", 0.21, 0.27, 0.26, 1.18, 2388],
  ["2026-W25", 0.21, 0.28, 0.26, 1.15, 2400],
  ["2026-W26", 0.21, 0.28, 0.26, 1.14, 2412],
  ["2026-W27", 0.22, 0.28, 0.27, 1.1, 2398],
  ["2026-W28", 0.22, 0.28, 0.27, 1.09, 2403],
  ["2026-W29", 0.22, 0.28, 0.27, 1.08, 2400],
];
const observations = observationValues.map(([period, mean, maximum, p95, cpk, sampleCount], index) => entity(
  `metric-observation.leak-rate.${String(period).toLowerCase()}`,
  "qual:MetricObservation",
  `Leak Rate ${period}`,
  {
    unit: "sccm", mean, maximum, p95, cpk, sampleCount, aggregation: "weekly",
    observedPeriod: period, sourceSystem: "QMS Demo", sourceVersion: "QMS-DEMO-2026.07",
    timestamp: `2026-07-${String(Math.min(22, index + 1)).padStart(2, "0")}T08:00:00.000Z`,
    validityState: "valid", effectiveState: period === "2026-W29" ? "current" : "historical",
    lineage: `source-record.qms.leak-rate.${period}`,
  },
  { sourceSystem: "QMS Demo", validFrom: `2026-01-${String(Math.min(28, index + 1)).padStart(2, "0")}T00:00:00.000Z` },
));

const documentEntities = [
  ["document.control-plan.cp-bb01.rev-a", "qual:ControlPlanVersion", "Control Plan CP-BB01 Rev.A", "Rev.A"],
  ["document.pfmea.pf-bb01.rev-b", "core:Document", "PFMEA PF-BB01 Rev.B", "Rev.B"],
  ["document.sop.op30-leak-test", "core:Document", "SOP OP30 Leak Test", "Rev.3"],
  ["document.specification.bb-leak-rate.rev-a", "core:Document", "Product Leak Rate Specification Rev.A", "Rev.A"],
  ["document.reaction-plan.op30-leak-rate.rev-a", "core:Document", "OP30 Reaction Plan Rev.A", "Rev.A"],
  ["document.msa.m220-leak-tester.rev-a", "core:Document", "M220 MSA / GRR Study Rev.A", "Rev.A"],
  ["document.calibration.m220.2026-07", "core:Document", "M220 Calibration Record 2026-07", "2026-07"],
  ["document.validation-report.program-v3-4.rev-a", "core:Document", "Program V3.4 Validation Report Rev.A", "Rev.A"],
  ["document.validation-plan.program-v3-5.rev-a", "core:Document", "Program V3.5 Proposed Validation Plan Rev.A", "Rev.A"],
  ["document.capability-study.op30.2026-w29", "core:Document", "OP30 Capability Study 2026-W29", "2026-W29"],
  ["document.deviation.op30-leak-rate.demo-001", "core:Document", "OP30 Quality Deviation Demo-001", "Demo-001"],
  ["document.fixture-maintenance.fx-002.rev-b", "core:Document", "FX-002 Fixture Maintenance Instruction Rev.B", "Rev.B"],
  ["record.qms.leak-rate.2026-w29-demo", "qual:MeasurementResult", "OP30 Leak Rate Weekly Record 2026-W29", "2026-W29"],
].map(([id, type, label, revision]) => entity(id, type, label, {
  revision, approvalState: "approved", effectiveState: "current", contentGovernance: "checksum-and-stable-locator",
}, { sourceSystem: id.startsWith("record.") ? "QMS Demo" : "DMS Demo", version: revision }));
documentEntities.filter((item) => existingById.has(item.id)).forEach((item) => existingById.set(item.id, item));

const allEntities = [
  ...existingById.values(),
  ...richEntities,
  ...validationRequirements,
  ...reactionActions,
  ...observations,
  ...documentEntities.filter((item) => !existingById.has(item.id)),
];
const uniqueEntities = [...new Map(allEntities.map((item) => [item.id, item])).values()];

const relations = [];
const add = (sourceId, label, targetId, properties) => relations.push(relation(sourceId, label, targetId, properties, relations.length + 1));
[
  ["relation.product.brake-booster.has-operation.op30", "product.brake-booster", "operation.op30", "mfg:requiresOperation", "hasOperation"],
  ["relation.operation.op20.next-operation.op30", "operation.op20", "operation.op30", "mfg:flowsTo", "nextOperation"],
  ["relation.operation.op30.next-operation.op40", "operation.op30", "operation.op40", "mfg:flowsTo", "nextOperation"],
  ["relation.operation.op30.performed-on.machine.m220", "operation.op30", "machine.m220", "mfg:executedBy", "performedOn"],
  ["relation.operation.op30.requires-fixture.fx-002", "operation.op30", "fixture.fx-002", "mfg:requiresResource", "requiresFixture"],
  ["relation.operation.op30.uses-program.v3-4", "operation.op30", "program.leak-test.v3-4", "mfg:usesParameter", "usesProgram"],
  ["relation.operation.op30.controls.leak-rate", "operation.op30", "quality-characteristic.leak-rate", "qual:controlsCharacteristic", "controls"],
  ["relation.leak-rate.controlled-by.automatic-leak-test", "quality-characteristic.leak-rate", "control-method.automatic-leak-test", "qual:controlledBy", "controlledBy"],
  ["relation.leak-rate.governed-by.control-plan", "quality-characteristic.leak-rate", "document.control-plan.cp-bb01.rev-a", "core:governedBy", "governedBy"],
  ["relation.leak-rate.risk-analyzed-by.pfmea", "quality-characteristic.leak-rate", "document.pfmea.pf-bb01.rev-b", "core:governedBy", "riskAnalyzedBy"],
  ["relation.pfmea.identifies.internal-leakage", "document.pfmea.pf-bb01.rev-b", "failure-mode.internal-leakage", "qual:hasFailureMode", "identifiesFailureMode"],
  ["relation.operation.op30.described-by.sop", "operation.op30", "document.sop.op30-leak-test", "core:governedBy", "describedBy"],
].forEach(([id, sourceId, targetId, predicate, label]) => relations.push({
  ...relation(sourceId, label, targetId, { compatibilityAlias: true }),
  id,
  predicate,
}));
add("product.brake-booster", "hasOperation", "operation.op30");
add("operation.op20", "nextOperation", "operation.op30", { causalEvidenceToLeakRate: "not-established" });
add("operation.op30", "nextOperation", "operation.op40");
add("operation.op30", "performedOn", "machine.m220");
add("operation.op30", "requiresFixture", "fixture.fx-002");
add("operation.op30", "usesProgram", "program.leak-test.v3-4");
add("operation.op30", "controls", "quality-characteristic.leak-rate");
add("quality-characteristic.leak-rate", "controlledBy", "control-method.automatic-leak-test");
add("control-method.automatic-leak-test", "usesMeasurementSystem", "measurement-system.m220-leak-tester");
add("operation.op30", "implementsControlMethod", "control-method.automatic-leak-test");
add("quality-characteristic.leak-rate", "measuredBy", "measurement-system.m220-leak-tester");
add("specification.brake-booster.leak-rate.rev-a", "appliesToProduct", "product.brake-booster");
add("specification.brake-booster.leak-rate.rev-a", "appliesToOperation", "operation.op30");
add("specification.brake-booster.leak-rate.rev-a", "appliesToCharacteristic", "quality-characteristic.leak-rate");
add("specification.brake-booster.leak-rate.rev-a", "hasSpecificationLimit", "specification-limit.leak-rate.lsl");
add("specification.brake-booster.leak-rate.rev-a", "hasSpecificationLimit", "specification-limit.leak-rate.usl");
for (const id of ["control-limit.leak-rate.center-line", "control-limit.leak-rate.warning", "control-limit.leak-rate.action"]) {
  add("quality-characteristic.leak-rate", "hasInternalControlLimit", id);
}
add("operation.op30", "hasSamplingPlan", "sampling-plan.op30-leak-rate.rev-a");
add("quality-characteristic.leak-rate", "triggersReactionPlan", "reaction-plan.op30-leak-rate.rev-a");
add("quality-characteristic.leak-rate", "hasMetricSeries", "metric-series.op30-leak-rate.weekly");
add("quality-characteristic.leak-rate", "hasFailureMode", "failure-mode.internal-leakage");
add("measurement-system.m220-leak-tester", "hasMsaStudy", "msa-study.m220-leak-tester.rev-a");
add("measurement-system.m220-leak-tester", "calibratedBy", "calibration-record.m220.2026-07");
add("calibration-record.m220.2026-07", "usesReference", "master-leak.ml-050");
add("quality-characteristic.leak-rate", "hasCapabilityStudy", "capability-study.op30-leak-rate.2026-w29");
add("quality-issue.op30-leak-rate.demo-001", "requiresContainment", "containment-action.hold-current-lot");
add("quality-issue.op30-leak-rate.demo-001", "requiresContainment", "containment-action.rescreen");
add("quality-issue.op30-leak-rate.demo-001", "requiresVerification", "reaction-plan.op30-leak-rate.rev-a");
observations.forEach((observation) => {
  add("metric-series.op30-leak-rate.weekly", "hasObservation", observation.id);
  add(observation.id, "observedAtOperation", "operation.op30");
  add(observation.id, "observedOnMachine", "machine.m220");
  add(observation.id, "appliesToProduct", "product.brake-booster");
  add(observation.id, "derivedFromSource", "record.qms.leak-rate.2026-w29-demo");
});
reactionActions.forEach((action) => {
  add("reaction-plan.op30-leak-rate.rev-a", "hasAction", action.id, { sequence: action.properties.sequence });
  add(action.id, "governedBy", "document.reaction-plan.op30-leak-rate.rev-a");
  add(action.id, "requiresVerification", "document.reaction-plan.op30-leak-rate.rev-a", { requiredEvidenceId: action.properties.requiredEvidence });
});
add("program.leak-test.v3-4", "currentVersionOf", "control-method.automatic-leak-test");
add("program.leak-test.v3-5", "proposedVersionOf", "control-method.automatic-leak-test");
add("program.leak-test.v3-5", "supersedes", "program.leak-test.v3-4");
add("program.leak-test.v3-5", "affectedByChange", "engineering-change.m220-program-v3-5");
add("engineering-change.m220-program-v3-5", "requiresValidation", "validation-plan.m220-program-v3-5");
validationRequirements.forEach((requirement) => add("validation-plan.m220-program-v3-5", "requiresValidation", requirement.id));
add("program.leak-test.v3-4", "validatedBy", "validation-record.program-v3-4.rev-a");
add("engineering-change.m220-program-v3-5", "affectedObject", "machine.m220");
add("engineering-change.m220-program-v3-5", "affectedObject", "operation.op30");
add("engineering-change.m220-program-v3-5", "affectedObject", "measurement-system.m220-leak-tester");
add("bottleneck-assessment.op20.2026-w29", "assessesOperation", "operation.op20", { causalEvidenceToLeakRate: "insufficient" });
add("operation.op20", "feedsBuffer", "wip-buffer.op20-op30");
add("wip-buffer.op20-op30", "feedsOperation", "operation.op30");

const documentLinks = {
  "document.control-plan.cp-bb01.rev-a": ["quality-characteristic.leak-rate", "sampling-plan.op30-leak-rate.rev-a", "reaction-plan.op30-leak-rate.rev-a"],
  "document.pfmea.pf-bb01.rev-b": ["failure-mode.internal-leakage", "quality-issue.op30-leak-rate.demo-001"],
  "document.sop.op30-leak-test": ["operation.op30", "control-method.automatic-leak-test", "program.leak-test.v3-4"],
  "document.specification.bb-leak-rate.rev-a": ["specification.brake-booster.leak-rate.rev-a", "product.brake-booster"],
  "document.reaction-plan.op30-leak-rate.rev-a": ["reaction-plan.op30-leak-rate.rev-a", "deviation.op30-leak-rate.demo-001"],
  "document.msa.m220-leak-tester.rev-a": ["msa-study.m220-leak-tester.rev-a", "measurement-system.m220-leak-tester"],
  "document.calibration.m220.2026-07": ["calibration-record.m220.2026-07", "machine.m220"],
  "document.validation-report.program-v3-4.rev-a": ["validation-record.program-v3-4.rev-a", "program.leak-test.v3-4"],
  "document.validation-plan.program-v3-5.rev-a": ["validation-plan.m220-program-v3-5", "program.leak-test.v3-5"],
  "document.capability-study.op30.2026-w29": ["capability-study.op30-leak-rate.2026-w29", "metric-observation.leak-rate.2026-w29"],
  "document.deviation.op30-leak-rate.demo-001": ["deviation.op30-leak-rate.demo-001", "quality-issue.op30-leak-rate.demo-001"],
  "document.fixture-maintenance.fx-002.rev-b": ["fixture.fx-002", "reaction-action.op30.inspect-fixture-seals"],
  "record.qms.leak-rate.2026-w29-demo": ["metric-series.op30-leak-rate.weekly", "metric-observation.leak-rate.2026-w29"],
};
Object.entries(documentLinks).forEach(([documentId, linkedIds]) => linkedIds.forEach((targetId) => add(targetId, "governedBy", documentId)));

const aliases = {
  "quality-characteristic.leak-rate": ["Leak Rate", "leakage rate", "air leak", "internal leakage", "泄漏率", "泄漏量", "漏气量", "气密性", "泄漏值"],
  "specification.brake-booster.leak-rate.rev-a": ["allowable range", "acceptance range", "specification range", "acceptance criteria", "product upper limit", "USL", "spec limit", "容许范围", "允许范围", "规格范围", "接受标准", "产品上限"],
  "control-method.automatic-leak-test": ["control method", "inspection method", "test method", "air-decay", "气密测试", "泄漏测试", "控制方法", "检测方法", "测试方法"],
  "measurement-system.m220-leak-tester": ["measurement range", "equipment range", "检测范围", "设备范围", "量程"],
  "control-limit.leak-rate.warning": ["warning limit", "warning threshold", "预警限", "警戒线"],
  "control-limit.leak-rate.action": ["action limit", "reaction limit", "行动限", "反应限"],
  "operation.op30": ["OP30", "OP 30", "Leak Test Operation", "泄漏测试工序"],
  "machine.m220": ["M220", "M220 Leak Tester", "Leak Test Bench"],
  "program.leak-test.v3-5": ["V3.5", "LeakTestProgram V3.5", "proposed leak test program"],
};

const evidenceItems = [
  graphEvidence("evidence.route.brake-booster.rev-c", "Released Brake Booster Route", "Brake Booster Assembly includes OP30 between OP20 and OP40.", ["product.brake-booster", "operation.op20", "operation.op30", "operation.op40"], ["claim.affected-product"]),
  graphEvidence("evidence.equipment.op30", "OP30 Released Resources", "OP30 uses M220, FX-002 and current released LeakTestProgram V3.4.", ["operation.op30", "machine.m220", "fixture.fx-002", "program.leak-test.v3-4"], ["claim.affected-equipment"]),
  graphEvidence("evidence.quality-risk.internal-leakage", "Internal Leakage Risk", "Leak Rate is inspected at 100% and linked to Internal Leakage risk.", ["quality-characteristic.leak-rate", "failure-mode.internal-leakage"], ["claim.quality-risk"]),
  graphEvidence("evidence.documents.op30-governance", "OP30 Governed Documents", "Control Plan, PFMEA and SOP govern the OP30 quality control.", ["document.control-plan.cp-bb01.rev-a", "document.pfmea.pf-bb01.rev-b", "document.sop.op30-leak-test"], ["claim.governed-documents"]),
  graphEvidence("evidence.signal-limitation", "Demo Scope Limitation", "Synthetic aggregated observations do not identify real affected serial numbers or prove a causal source.", ["quality-issue.op30-leak-rate.demo-001"], ["claim.signal-limitation", "claim.causal-boundary"]),
  graphEvidence("evidence.specification.leak-rate.rev-a", "Effective Product Leak Rate Specification", "Target 0.18 sccm; LSL 0.00 sccm; USL 0.30 sccm; Rev.A approved and current.", ["specification.brake-booster.leak-rate.rev-a", "specification-limit.leak-rate.lsl", "specification-limit.leak-rate.usl"], ["claim.specification", "claim.percentage-projection"]),
  graphEvidence("evidence.control-limits.leak-rate", "Internal Leak Rate Control Thresholds", "Center 0.20 sccm; warning 0.24 sccm; action 0.27 sccm. These are not product specification limits.", ["control-limit.leak-rate.center-line", "control-limit.leak-rate.warning", "control-limit.leak-rate.action"], ["claim.control-thresholds", "claim.percentage-projection"]),
  graphEvidence("evidence.measurement-system.m220", "M220 Measurement Capability", "Range 0.00–0.50 sccm; resolution 0.01 sccm; GRR 8.2%; bias 0.004 sccm; calibration valid.", ["measurement-system.m220-leak-tester", "msa-study.m220-leak-tester.rev-a", "calibration-record.m220.2026-07"], ["claim.measurement-capability", "claim.measurement-system", "claim.percentage-projection"]),
  graphEvidence("evidence.metric.latest-2026-w29", "Latest Governed Leak Rate Metric", "2026-W29 mean 0.22 sccm; maximum 0.28; P95 0.27; Cpk 1.08; n=2400.", ["metric-observation.leak-rate.2026-w29", "capability-study.op30-leak-rate.2026-w29"], ["claim.latest-metric", "claim.percentage-projection"]),
  graphEvidence("evidence.reaction-plan.op30", "OP30 Reaction Plan", "Values above 0.27 sccm trigger ten ordered containment and verification actions before release.", ["reaction-plan.op30-leak-rate.rev-a", ...reactionActions.map((item) => item.id)], ["claim.reaction-plan", "claim.percentage-projection"]),
  graphEvidence("evidence.program-version-status", "Leak Test Program Version Status", "V3.4 is approved and current. V3.5 is proposed, pending validation and not effective.", ["program.leak-test.v3-4", "program.leak-test.v3-5"], ["claim.version-status"]),
  graphEvidence("evidence.change-validation-v3-5", "V3.5 Validation Requirements", "MSA, master-leak, 30-piece correlation, capability and Quality approval remain pending.", ["engineering-change.m220-program-v3-5", "validation-plan.m220-program-v3-5", ...validationRequirements.map((item) => item.id)], ["claim.change-validation"]),
  graphEvidence("evidence-chunk.document.control-plan.cp-bb01.rev-a.sheet-process-control-row-op30-leak-rate", "Control Plan Compatibility Evidence", "Compatibility evidence ID for the governed OP30 Control Plan chunk.", ["operation.op30", "quality-characteristic.leak-rate", "document.control-plan.cp-bb01.rev-a"], ["claim.quality-risk", "claim.governed-documents"]),
  graphEvidence("evidence-chunk.document.pfmea.pf-bb01.rev-b.sheet-process-fmea-row-op30-internal-leakage", "PFMEA Compatibility Evidence", "Compatibility evidence ID for the governed Internal Leakage PFMEA chunk.", ["quality-characteristic.leak-rate", "failure-mode.internal-leakage", "document.pfmea.pf-bb01.rev-b"], ["claim.quality-risk", "claim.governed-documents"]),
  graphEvidence("evidence-chunk.document.sop.op30-leak-test.page-4-section-3-2-setup-and-golden-part-verification", "SOP Compatibility Evidence", "Compatibility evidence ID for the governed OP30 setup chunk.", ["operation.op30", "machine.m220", "fixture.fx-002", "program.leak-test.v3-4"], ["claim.affected-equipment", "claim.governed-documents"]),
  graphEvidence("evidence-chunk.record.qms.leak-rate.2026-07-demo.record-qms-lr-2026-0716-signal-summary", "QMS Compatibility Evidence", "Compatibility evidence ID retained for legacy scripted and evaluation references.", ["operation.op30", "quality-characteristic.leak-rate", "machine.m220"], ["claim.signal-limitation"]),
];
[
  ["evidence-chunk.document.control-plan.cp-bb01.rev-a.sheet-process-control-row-op30-leak-rate", "document.control-plan.cp-bb01.rev-a", "control-plan", "Rev.A", "Sheet Process Control / Row OP30-Leak Rate"],
  ["evidence-chunk.document.pfmea.pf-bb01.rev-b.sheet-process-fmea-row-op30-internal-leakage", "document.pfmea.pf-bb01.rev-b", "pfmea", "Rev.B", "Sheet Process FMEA / Row OP30-Internal Leakage"],
  ["evidence-chunk.document.sop.op30-leak-test.page-4-section-3-2-setup-and-golden-part-verification", "document.sop.op30-leak-test", "sop", "Rev.3", "Page 4 / Section 3.2 Setup and Golden-Part Verification"],
].forEach(([evidenceId, documentId, documentType, version, locator]) => {
  const item = evidenceItems.find((candidate) => candidate.id === evidenceId);
  item.kind = "document";
  item.version = version;
  item.source.locator = locator;
  item.governance = {
    documentId,
    documentType,
    approvalStatus: "approved",
    lifecycleStatus: "effective",
    owner: "Quality Engineering",
    contentChecksum: sha256(`compatibility-content:${documentId}:${version}`),
    chunkChecksum: sha256(`compatibility-chunk:${evidenceId}`),
    parserId: "controlled-json",
    parserVersion: "1.0.0",
    ingestedAt: "2026-07-23T00:00:00.000Z",
    accessClassification: "internal",
    accessDecision: "allowed",
  };
});

function graphEvidence(id, title, excerpt, linkedEntityIds, supportsClaimIds) {
  return {
    id,
    kind: "graph",
    title,
    excerpt,
    source: {
      sourceType: "canonical-graph",
      sourceId: id,
      sourceSystem: "Governed Demo Fixture",
      locator: `canonical/${id}`,
      recordedAt: "2026-07-23T00:00:00.000Z",
    },
    linkedEntityIds,
    supportsClaimIds,
    version: "1.0",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    status: "active",
  };
}

const claimPolicies = [
  ["claim.affected-product", "fact", true],
  ["claim.affected-equipment", "fact", true],
  ["claim.quality-risk", "fact", true],
  ["claim.governed-documents", "fact", true],
  ["claim.signal-limitation", "limitation", true],
  ["claim.specification", "fact", false],
  ["claim.control-thresholds", "fact", false],
  ["claim.measurement-capability", "fact", false],
  ["claim.measurement-system", "fact", false],
  ["claim.latest-metric", "fact", false],
  ["claim.percentage-projection", "fact", false],
  ["claim.reaction-plan", "fact", false],
  ["claim.version-status", "fact", false],
  ["claim.change-validation", "fact", false],
  ["claim.causal-boundary", "limitation", false],
].map(([claimId, classification, required]) => ({ claimId, classification, required }));

const allowedRelationTypes = [...new Set(relations.map((item) => item.label))].sort();
baseline.baselineVersion = "2.0.0";
baseline.ontologyVersion = "1.2.0";
baseline.dataVersion = "rich-demo-1.0.0";
baseline.scenario.supportedIntents = [
  "quality_issue_trace", "quality_specification", "quality_control_threshold", "control_method_capability",
  "latest_quality_metric", "percentage_change_assessment", "value_limit_comparison", "reaction_plan",
  "measurement_system_capability", "program_change_status", "evidence_lookup",
];
baseline.ids = {
  ...baseline.ids,
  specification: { leakRateRevA: "specification.brake-booster.leak-rate.rev-a" },
  controlLimit: {
    centerLine: "control-limit.leak-rate.center-line",
    warning: "control-limit.leak-rate.warning",
    action: "control-limit.leak-rate.action",
  },
  measurementSystem: { m220: "measurement-system.m220-leak-tester" },
  metric: { latest: "metric-observation.leak-rate.2026-w29", series: "metric-series.op30-leak-rate.weekly" },
  reactionPlan: { op30: "reaction-plan.op30-leak-rate.rev-a" },
};
baseline.semanticAliases = aliases;
baseline.entities = uniqueEntities.sort((left, right) => left.id.localeCompare(right.id));
baseline.relations = relations.sort((left, right) => left.id.localeCompare(right.id));
baseline.queryPlan.relationTypes = allowedRelationTypes;
baseline.queryPlan.requestedFacets = ["quality", "engineering", "production", "valueStream", "governance"];
baseline.graphQueryPlan.templateId = "quality-issue-trace.direct-neighborhood.v1";
baseline.graphQueryPlan.allowedRelationTypes = [
  "hasOperation",
  "nextOperation",
  "performedOn",
  "requiresFixture",
  "usesProgram",
  "controls",
  "controlledBy",
  "governedBy",
  "riskAnalyzedBy",
  "identifiesFailureMode",
  "describedBy",
];
baseline.graphQueryPlan.maxDepth = 2;
baseline.graphQueryPlan.resultLimit = 50;
baseline.evidencePack = {
  id: "evidence-pack.quality-issue-trace.rich-demo",
  queryPlanId: baseline.queryPlan.planId,
  generatedAt: "2026-07-23T00:00:01.000Z",
  ontologyVersion: baseline.ontologyVersion,
  dataVersion: baseline.dataVersion,
  items: evidenceItems,
  claimPolicies,
  limitations: [
    "The dataset is synthetic and intended only for demonstrating governed knowledge retrieval and quantitative reasoning.",
    "No real production system, serial genealogy or causal experiment is connected.",
  ],
};
baseline.expectedResponse.evidencePack = baseline.evidencePack;
baseline.expectedResponse.queryPlan = baseline.queryPlan;
baseline.expectedResponse.graphQueryPlan = baseline.graphQueryPlan;
baseline.expectedResponse.answer.claims = [
  ["claim.affected-product", "OP30 belongs to the released Brake Booster Assembly route.", "fact", "evidence.route.brake-booster.rev-c"],
  ["claim.affected-equipment", "OP30 uses M220, FX-002 and LeakTestProgram V3.4.", "fact", "evidence-chunk.document.sop.op30-leak-test.page-4-section-3-2-setup-and-golden-part-verification"],
  ["claim.quality-risk", "Leak Rate is controlled at 100% frequency and is linked to Internal Leakage risk.", "fact", "evidence-chunk.document.control-plan.cp-bb01.rev-a.sheet-process-control-row-op30-leak-rate"],
  ["claim.governed-documents", "Control Plan, PFMEA and SOP govern this investigation.", "fact", "evidence-chunk.document.pfmea.pf-bb01.rev-b.sheet-process-fmea-row-op30-internal-leakage"],
  ["claim.signal-limitation", "Synthetic aggregated data cannot identify a real affected population or prove causality.", "limitation", "evidence-chunk.record.qms.leak-rate.2026-07-demo.record-qms-lr-2026-0716-signal-summary"],
].map(([id, text, classification, evidenceId]) => ({ id, text, classification, citations: [{ evidenceId }] }));
baseline.expectedResponse.citationValidation.checkedClaimIds = baseline.expectedResponse.answer.claims.map((item) => item.id);
baseline.expectedResponse.trace.stages = baseline.expectedResponse.trace.stages.map((stage) => ({
  ...stage,
  outputRefs: stage.stage === "graph-retrieval" ? baseline.entities.slice(0, 8).map((item) => item.id) : stage.outputRefs,
}));

const documents = createDocuments();
for (const document of documents) {
  const content = `${JSON.stringify({ schemaVersion: "1.0.0", sections: document.sections }, null, 2)}\n`;
  writeFileSync(join(contentRoot, document.contentFile.replace(/^content\//u, "")), content);
  document.contentChecksum = sha256(content);
}
const governedEvidenceById = new Map(baseline.evidencePack.items.map((item) => [item.id, item]));
documents.forEach((document) => {
  document.sections.forEach((documentSection) => {
    const id = `evidence-chunk.${document.documentId}.${slugifyStableId(documentSection.locator)}`;
    governedEvidenceById.set(id, {
      id,
      kind: document.documentType === "qms-record" ? "system-record" : "document",
      title: `${document.title} - ${documentSection.heading}`,
      excerpt: documentSection.text,
      source: {
        sourceType: "controlled-document-chunk",
        sourceId: document.sourceId,
        sourceSystem: document.sourceSystem,
        documentName: document.title,
        locator: documentSection.locator,
        recordedAt: "2026-07-23T00:00:00.000Z",
      },
      linkedEntityIds: [...document.linkedEntityIds],
      supportsClaimIds: [...document.supportsClaimIds],
      version: document.version,
      effectiveAt: document.effectiveFrom,
      status: "active",
      governance: {
        documentId: document.documentId,
        documentType: document.documentType,
        approvalStatus: document.approvalStatus,
        lifecycleStatus: document.lifecycleStatus,
        owner: document.owner,
        contentChecksum: document.contentChecksum,
        chunkChecksum: sha256(`${document.documentId}\n${document.version}\n${documentSection.locator}\n${documentSection.text}`),
        parserId: document.parserId,
        parserVersion: document.parserVersion,
        ingestedAt: "2026-07-23T00:00:00.000Z",
        accessClassification: document.access.classification,
        accessDecision: "allowed",
      },
    });
  });
});
baseline.evidencePack.items = [...governedEvidenceById.values()].sort((left, right) => left.id.localeCompare(right.id));
baseline.expectedResponse.evidencePack = baseline.evidencePack;
const registry = {
  registryVersion: "1.0.0",
  documents: documents.map(({ sections, ...document }) => document),
};
writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
writeControlledSourceExtracts();

const counts = {
  entities: baseline.entities.length,
  relations: baseline.relations.length,
  documents: registry.documents.length,
  chunks: documents.reduce((sum, document) => sum + document.sections.length, 0),
  metricObservations: observations.length,
  validationRequirements: validationRequirements.length,
  reactionActions: reactionActions.length,
  semanticAliases: Object.values(aliases).flat().length,
};
console.info(JSON.stringify({ status: "built", baselineId: baseline.baselineId, counts }, null, 2));

function createDocuments() {
  const specs = [
    doc("document.specification.bb-leak-rate.rev-a", "document.specification.bb-leak-rate", "Product Leak Rate Specification Rev.A", "product-specification", "Rev.A", "PS-BB-LR", ["specification.brake-booster.leak-rate.rev-a", "product.brake-booster", "quality-characteristic.leak-rate"], ["claim.specification"], [
      section("Section 4.1 / Acceptance Criteria", "Acceptance Criteria", "Synthetic demo acceptance values for Brake Booster at OP30 are target 0.18 sccm, LSL 0.00 sccm and USL 0.30 sccm. These values are demo-only and are not a production specification."),
      section("Section 4.2 / Applicability", "Applicability", "Rev.A applies to product.brake-booster, operation.op30 and quality-characteristic.leak-rate from 2026-07-01."),
      section("Section 4.3 / Governance", "Version Governance", "Revision Rev.A is approved, effective and current. Internal warning/action limits and equipment measurement range do not replace this product acceptance criterion."),
    ]),
    doc("document.control-plan.cp-bb01.rev-a", "document.control-plan.cp-bb01", "Control Plan CP-BB01 Rev.A", "control-plan", "Rev.A", "CP-BB01", ["operation.op30", "quality-characteristic.leak-rate", "control-method.automatic-leak-test", "sampling-plan.op30-leak-rate.rev-a"], ["claim.quality-risk", "claim.governed-documents", "claim.control-thresholds"], [
      section("Sheet Process Control / Row OP30-Leak Rate", "OP30 Leak Rate Control", "Automated air-decay inspection is performed at 100%. The internal center is 0.20 sccm, warning limit 0.24 sccm and action limit 0.27 sccm."),
      section("Sheet Process Control / Sampling", "Sampling Frequency", "Production units receive 100% inspection; master leak verification occurs once per shift; golden sample verification follows program or fixture changes; layered audit uses 5 pieces."),
      section("Sheet Process Control / Reaction", "Reaction Link", "Values above 0.27 sccm invoke Reaction Plan RP-OP30-LR Rev.A. Values above product USL 0.30 sccm are nonconforming."),
    ]),
    doc("document.sop.op30-leak-test", "document.sop.op30-leak-test", "SOP OP30 Leak Test", "sop", "Rev.3", "SOP-OP30", ["operation.op30", "machine.m220", "fixture.fx-002", "program.leak-test.v3-4", "control-method.automatic-leak-test"], ["claim.affected-equipment", "claim.governed-documents", "claim.measurement-capability"], [
      section("Page 4 / Section 3.2 Setup and Golden-Part Verification", "Leak Test Setup", "Use M220, fixture FX-002 and released LeakTestProgram V3.4. Verify the master leak and golden sample before production."),
      section("Page 5 / Section 4.1 Test Parameters", "Control Method and Equipment", "Apply 500 ± 5 kPa test pressure, stabilize for 3.0 seconds and measure for 5.0 seconds. The method range is 0.00–0.50 sccm with 0.01 sccm resolution."),
      section("Page 6 / Section 5 Reaction", "Abnormal Result Handling", "A result can be measurable but nonconforming. Product acceptance uses the effective product specification; abnormal results use the reaction plan."),
    ]),
    doc("document.pfmea.pf-bb01.rev-b", "document.pfmea.pf-bb01", "PFMEA PF-BB01 Rev.B", "pfmea", "Rev.B", "PF-BB01", ["operation.op30", "quality-characteristic.leak-rate", "failure-mode.internal-leakage"], ["claim.quality-risk", "claim.governed-documents", "claim.causal-boundary"], [
      section("Sheet Process FMEA / Row OP30-Internal Leakage", "Internal Leakage Failure Mode", "Internal Leakage can reduce brake booster performance. Automatic leak testing at OP30 is the detection control."),
      section("Sheet Process FMEA / Cause Boundary", "Causal Evidence Boundary", "The OP20 bottleneck candidate does not establish that queue or cycle time caused an OP30 Leak Rate increase. Correlated time-series, controlled trials and equipment/fixture evidence are required."),
      section("Sheet Process FMEA / Actions", "Risk Actions", "Containment, master-leak verification, fixture inspection and program-version verification are required after action-limit exceedance."),
    ]),
    doc("document.reaction-plan.op30-leak-rate.rev-a", "document.reaction-plan.op30-leak-rate", "OP30 Reaction Plan Rev.A", "reaction-plan", "Rev.A", "RP-OP30-LR", ["reaction-plan.op30-leak-rate.rev-a", ...reactionActions.map((item) => item.id)], ["claim.reaction-plan", "claim.percentage-projection"], [
      section("Section 2 / Trigger", "Reaction Trigger", "Values above 0.27 sccm trigger the plan. Values above 0.30 sccm are product nonconforming. Measurement range remains a separate concept."),
      section("Section 3 / Containment", "Containment Sequence", "Hold the current lot, identify the last known good verification, verify the master leak, inspect fixture seals and verify the released program version."),
      section("Section 4 / Verification and Release", "Verification and Release", "Repeat the golden sample, perform 100% re-screening when required, create a deviation, notify Quality Engineering and release only after evidence approval."),
    ]),
    doc("document.msa.m220-leak-tester.rev-a", "document.msa.m220-leak-tester", "M220 MSA / GRR Study Rev.A", "msa-study", "Rev.A", "MSA-M220-LR", ["measurement-system.m220-leak-tester", "msa-study.m220-leak-tester.rev-a"], ["claim.measurement-system", "claim.measurement-capability"], [
      section("Section 3 / GRR", "Measurement-System Capability", "Synthetic demo GRR is 8.2% of tolerance. The study is approved and current for the demo measurement system."),
      section("Section 4 / Bias", "Bias Study", "Synthetic demo bias is 0.004 sccm against the governed master leak."),
      section("Section 5 / Applicability", "Study Applicability", "The study applies to M220 automated air-decay measurement within 0.00–0.50 sccm. It does not define product acceptance."),
    ]),
    doc("document.calibration.m220.2026-07", "document.calibration.m220", "M220 Calibration Record 2026-07", "calibration-record", "2026-07", "CAL-M220-202607", ["measurement-system.m220-leak-tester", "calibration-record.m220.2026-07", "master-leak.ml-050"], ["claim.measurement-system", "claim.measurement-capability"], [
      section("Record / Calibration Result", "Calibration Result", "M220 calibration state is valid. Last calibration was 2026-07-01 and next due date is 2026-10-01."),
      section("Record / Reference", "Master Leak Reference", "Master Leak ML-050 has a synthetic certified value of 0.05 sccm and valid certification."),
      section("Record / Scope", "Calibration Scope", "Calibration covers the 0.00–0.50 sccm measurement range and 0.01 sccm resolution."),
    ]),
    doc("document.validation-report.program-v3-4.rev-a", "document.validation-report.program-v3-4", "Program V3.4 Validation Report Rev.A", "validation-record", "Rev.A", "VAL-V34", ["program.leak-test.v3-4", "validation-record.program-v3-4.rev-a"], ["claim.version-status"], [
      section("Section 1 / Release Status", "Released Baseline", "LeakTestProgram V3.4 is approved, effective and current for the synthetic demo route."),
      section("Section 2 / Parameters", "Validated Parameters", "Validated settings are 500 ± 5 kPa, 3.0 second stabilization and 5.0 second measurement."),
      section("Section 3 / Approval", "Quality Approval", "The governed validation record is complete and supports current release status."),
    ]),
    doc("document.validation-plan.program-v3-5.rev-a", "document.validation-plan.program-v3-5", "Program V3.5 Proposed Validation Plan Rev.A", "validation-plan", "Rev.A", "VALPLAN-V35", ["program.leak-test.v3-5", "engineering-change.m220-program-v3-5", "validation-plan.m220-program-v3-5"], ["claim.version-status", "claim.change-validation"], [
      section("Section 1 / Proposed Change", "Proposed Change", "V3.5 proposes reducing stabilization time from 3.0 seconds to 2.5 seconds. The program remains not effective for production."),
      section("Section 2 / Potential Impact", "Potential Impact", "Potential impacts are measurement bias, false-pass risk, false-fail risk and cycle-time reduction. No improvement is confirmed."),
      section("Section 3 / Required Validation", "Validation Requirements", "Pending evidence includes MSA confirmation, master-leak verification, a 30-piece correlation study, capability confirmation and Quality approval."),
    ]),
    doc("document.capability-study.op30.2026-w29", "document.capability-study.op30", "OP30 Capability Study 2026-W29", "capability-study", "2026-W29", "CAP-OP30-W29", ["capability-study.op30-leak-rate.2026-w29", "metric-observation.leak-rate.2026-w29"], ["claim.latest-metric", "claim.percentage-projection"], [
      section("Study / Summary", "Capability Summary", "For 2026-W29, mean is 0.22 sccm, maximum 0.28 sccm, P95 0.27 sccm and Cpk 1.08."),
      section("Study / Population", "Observed Population", "The governed weekly aggregation contains 2400 synthetic demo measurements from OP30 on M220."),
      section("Study / Baseline", "Comparison Baseline", "The governed process center baseline is 0.20 sccm. This is an internal process baseline, not the product target or USL."),
    ]),
    doc("document.deviation.op30-leak-rate.demo-001", "document.deviation.op30-leak-rate", "OP30 Quality Deviation Demo-001", "deviation-record", "Demo-001", "DEV-OP30-001", ["deviation.op30-leak-rate.demo-001", "quality-issue.op30-leak-rate.demo-001"], ["claim.signal-limitation", "claim.reaction-plan"], [
      section("Record / Scope", "Deviation Scope", "This synthetic deviation is open for demonstration and does not identify real products, lots or serial numbers."),
      section("Record / Containment", "Containment Status", "Release remains blocked until the governed reaction evidence is approved."),
      section("Record / Causality", "Causal Status", "No causal source has been confirmed. Bottleneck correlation is insufficient evidence."),
    ]),
    doc("document.fixture-maintenance.fx-002.rev-b", "document.fixture-maintenance.fx-002", "FX-002 Fixture Maintenance Instruction Rev.B", "maintenance-instruction", "Rev.B", "MI-FX002", ["fixture.fx-002", "reaction-action.op30.inspect-fixture-seals"], ["claim.reaction-plan", "claim.affected-equipment"], [
      section("Section 2 / Seal Inspection", "Fixture Seal Inspection", "Inspect FX-002 seals for damage, contamination and incorrect seating after action-limit exceedance."),
      section("Section 3 / Verification", "Post-maintenance Verification", "Complete master-leak and golden-sample verification after seal maintenance."),
      section("Section 4 / Evidence", "Maintenance Evidence", "Record technician, timestamp, replaced parts and verification result before return to service."),
    ]),
    doc("record.qms.leak-rate.2026-w29-demo", "record.qms.leak-rate", "OP30 Leak Rate Weekly Record 2026-W29", "qms-record", "2026-W29", "QMS-LR-W29", ["metric-series.op30-leak-rate.weekly", "metric-observation.leak-rate.2026-w29", "operation.op30", "machine.m220"], ["claim.latest-metric", "claim.signal-limitation"], [
      section("Record / Aggregate", "Weekly Aggregate", "Synthetic governed record 2026-W29 reports mean 0.22 sccm, maximum 0.28 sccm, P95 0.27 sccm and sample count 2400."),
      section("Record / Lineage", "Source Lineage", "Source is QMS Demo version QMS-DEMO-2026.07 linked to OP30, M220, Brake Booster and Leak Rate."),
      section("Record / Validity", "Validity State", "This record is approved, valid and current. Historical and stale observations are excluded from latest-value selection."),
    ]),
    doc("record.qms.leak-rate.2026-07-demo", "record.qms.leak-rate.legacy", "Recent Leak Rate Results", "qms-record", "2026-07 Demo", "QMS-DEMO-LEAK-RATE", ["operation.op30", "quality-characteristic.leak-rate", "machine.m220"], ["claim.signal-limitation"], [
      section("Record QMS-LR-2026-0716 / Signal Summary", "Recent Leak Rate Signal", "Compatibility chunk retained for the governed scripted quality trace. The data is synthetic and does not identify a real affected population."),
      section("Record QMS-LR-2026-0716 / Governance", "Governance", "This compatibility record is approved and effective only for the synthetic demonstration tenant."),
      section("Record QMS-LR-2026-0716 / Limitation", "Limitation", "No live QMS genealogy or real equipment telemetry is connected."),
    ]),
  ];
  return specs;
}

function doc(documentId, logicalDocumentId, title, documentType, version, sourceId, linkedEntityIds, supportsClaimIds, sections) {
  const contentFile = `${documentId.replace(/^(document|record)\./, "").replace(/\./g, "-")}.json`;
  return {
    documentId,
    logicalDocumentId,
    title,
    documentType,
    version,
    approvalStatus: "approved",
    lifecycleStatus: "effective",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    owner: documentType.includes("validation") ? "Engineering Governance" : "Quality Engineering",
    sourceSystem: documentType === "qms-record" ? "QMS Demo" : "DMS Demo",
    sourceId,
    contentFile: `content/${contentFile}`,
    contentChecksum: "",
    parserId: "controlled-json",
    parserVersion: "1.0.0",
    linkedEntityIds,
    supportsClaimIds,
    access: {
      classification: documentType === "qms-record" ? "restricted" : "internal",
      allowedRoleIds: ["agent-evidence-reader"],
      allowedDomainIds: ["quality", "engineering", "manufacturing"],
    },
    sections,
  };
}

function section(locator, heading, text) {
  return { locator, heading, text };
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function slugifyStableId(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return slug || "section";
}

function writeControlledSourceExtracts() {
  const extracts = [
    {
      directory: "mes",
      manifest: {
        manifestVersion: "1.0.0",
        extractId: "source-extract.mes.operations.20260722.100",
        sourceSystem: "MES",
        schemaVersion: "1.0.0",
        mappingId: "MES-OPERATION-1",
        mappingVersion: "1.0.0",
        tenantId: "tenant.demo-manufacturing",
        domainId: "production",
        generatedAt: "2026-07-22T08:06:00.000Z",
        approvalStatus: "approved",
        lifecycleStatus: "effective",
        cursor: 100,
      },
      records: [{
        id: "source-record.mes.operation.op30.20260722",
        sourceSystem: "MES",
        sourceType: "operation",
        sourceId: "OP-030",
        operation: "upsert",
        tenantId: "tenant.demo-manufacturing",
        domainId: "production",
        version: "2026.07.22.1",
        recordedAt: "2026-07-22T08:05:00.000Z",
        validFrom: "2026-07-22T08:05:00.000Z",
        payload: {
          operation_id: "OP-030",
          operation_name: "OP30 Leak Test",
          actual_cycle_time: 42,
          machine_id: "EQ-M220",
          program_id: "LEAKTEST-V3.4",
          leak_rate_mean: 0.22,
          leak_rate_unit: "sccm",
          wip_quantity: 20,
          process_period: "2026-W29",
          source_version: "MES-DEMO-2026.07.23",
          event_time: "2026-07-22T08:05:00.000Z",
          status: "active",
        },
      }],
    },
    {
      directory: "qms",
      manifest: {
        manifestVersion: "1.0.0",
        extractId: "source-extract.qms.quality.20260722.200",
        sourceSystem: "QMS",
        schemaVersion: "1.0.0",
        mappingId: "QMS-QUALITY-1",
        mappingVersion: "1.0.0",
        tenantId: "tenant.demo-manufacturing",
        domainId: "quality",
        generatedAt: "2026-07-22T08:11:00.000Z",
        approvalStatus: "approved",
        lifecycleStatus: "effective",
        cursor: 200,
      },
      records: [{
        id: "source-record.qms.quality-characteristic.leak-rate.20260722",
        sourceSystem: "QMS",
        sourceType: "quality-characteristic",
        sourceId: "CTQ-OP30-LEAK-RATE",
        operation: "upsert",
        tenantId: "tenant.demo-manufacturing",
        domainId: "quality",
        version: "2026.07.22.1",
        recordedAt: "2026-07-22T08:10:00.000Z",
        validFrom: "2026-07-22T08:10:00.000Z",
        payload: {
          characteristic_id: "CTQ-OP30-LEAK-RATE",
          characteristic_name: "Leak Rate",
          is_ctq: true,
          latest_value: 0.22,
          latest_maximum: 0.28,
          latest_p95: 0.27,
          cpk: 1.08,
          sample_count: 2400,
          observed_period: "2026-W29",
          baseline_mean: 0.2,
          warning_limit: 0.24,
          action_limit: 0.27,
          product_usl: 0.3,
          measurement_range_upper: 0.5,
          measurement_resolution: 0.01,
          unit: "sccm",
          specification_revision: "Rev.A",
          control_plan_revision: "Rev.A",
          reaction_plan_revision: "Rev.A",
          msa_revision: "Rev.A",
          calibration_state: "valid",
          source_version: "QMS-DEMO-2026.07",
          validity_state: "valid",
          effective_state: "current",
          inspection_time: "2026-07-22T08:10:00.000Z",
          operation_id: "OP-030",
        },
      }],
    },
    {
      directory: "plm",
      manifest: {
        manifestVersion: "1.0.0",
        extractId: "source-extract.plm.products.20260722.300",
        sourceSystem: "PLM",
        schemaVersion: "1.0.0",
        mappingId: "PLM-PRODUCT-1",
        mappingVersion: "1.0.0",
        tenantId: "tenant.demo-manufacturing",
        domainId: "production",
        generatedAt: "2026-07-22T08:16:00.000Z",
        approvalStatus: "approved",
        lifecycleStatus: "effective",
        cursor: 300,
      },
      records: [{
        id: "source-record.plm.product.brake-booster.20260722",
        sourceSystem: "PLM",
        sourceType: "product",
        sourceId: "FP-001",
        operation: "upsert",
        tenantId: "tenant.demo-manufacturing",
        domainId: "production",
        version: "Rev.C",
        recordedAt: "2026-07-22T08:15:00.000Z",
        validFrom: "2026-07-22T08:15:00.000Z",
        payload: {
          part_number: "FP-001",
          part_name: "Brake Booster Assembly",
          revision: "Rev.C",
          lifecycle_status: "released",
          leak_specification_id: "specification.brake-booster.leak-rate.rev-a",
          leak_specification_revision: "Rev.A",
          current_program_id: "program.leak-test.v3-4",
          proposed_program_id: "program.leak-test.v3-5",
          engineering_change_id: "engineering-change.m220-program-v3-5",
          change_approval_state: "pending-validation",
          validation_state: "incomplete",
        },
      }],
    },
  ];

  for (const extract of extracts) {
    const records = extract.records.map((record) => {
      const content = JSON.stringify(record, Object.keys(record).sort());
      void content;
      return {
        ...record,
        recordChecksum: sha256(JSON.stringify(record, sortKeys)),
      };
    });
    const recordsText = `${JSON.stringify(records, null, 2)}\n`;
    const manifest = {
      ...extract.manifest,
      recordsFile: "records.json",
      recordsChecksum: sha256(recordsText),
      recordCount: records.length,
    };
    writeFileSync(join(sourceExtractRoot, extract.directory, "records.json"), recordsText);
    writeFileSync(join(sourceExtractRoot, extract.directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function sortKeys(_key, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
