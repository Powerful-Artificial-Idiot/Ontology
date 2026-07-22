import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const timestamp = "2026-07-22T00:00:00.000Z";

const sha256 = (value) => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
const slug = (value) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "section";
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function write(relativePath, value) {
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : json(value), "utf8");
}

function entity(id, type, label, domain, properties = {}, description = label) {
  return { id, type, label, description, domain, properties, version: "1", status: "active" };
}

function relation(id, sourceId, targetId, label, predicate) {
  return { id, sourceId, targetId, label, predicate, properties: {}, assertionType: "asserted", confidence: 1 };
}

function graphEvidence(id, title, excerpt, linkedEntityIds, supportsClaimIds, locator) {
  return {
    id,
    kind: "graph",
    title,
    excerpt,
    source: { sourceType: "canonical-knowledge-graph", sourceId: id, sourceSystem: "Manufacturing Knowledge Graph", locator },
    linkedEntityIds,
    supportsClaimIds,
    version: "1.0.0",
    status: "active",
  };
}

function controlledDocument(definition, directory) {
  const payload = json({ schemaVersion: "1.0.0", sections: [{ locator: definition.locator, heading: definition.heading, text: definition.text }] });
  const contentFile = `content/${definition.file}`;
  const contentChecksum = sha256(payload);
  const chunkId = `evidence-chunk.${definition.documentId}.${slug(definition.locator)}`;
  const chunkChecksum = sha256(`${definition.documentId}\n${definition.version}\n${definition.locator}\n${definition.text}`);
  const registry = {
    documentId: definition.documentId,
    logicalDocumentId: definition.logicalDocumentId ?? definition.documentId,
    title: definition.title,
    documentType: definition.documentType,
    version: definition.version,
    approvalStatus: "approved",
    lifecycleStatus: "effective",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    owner: definition.owner,
    sourceSystem: definition.sourceSystem,
    sourceId: definition.sourceId,
    contentFile,
    contentChecksum,
    parserId: "controlled-json",
    parserVersion: "1.0.0",
    linkedEntityIds: definition.linkedEntityIds,
    supportsClaimIds: definition.supportsClaimIds,
    access: {
      classification: definition.classification ?? "internal",
      allowedRoleIds: ["agent-evidence-reader"],
      allowedDomainIds: definition.allowedDomainIds,
    },
  };
  const evidence = {
    id: chunkId,
    kind: definition.kind ?? "document",
    title: `${definition.title} - ${definition.heading}`,
    excerpt: definition.text,
    source: { sourceType: "controlled-document-chunk", sourceId: definition.sourceId, sourceSystem: definition.sourceSystem, documentName: definition.title, locator: definition.locator },
    linkedEntityIds: definition.linkedEntityIds,
    supportsClaimIds: definition.supportsClaimIds,
    version: definition.version,
    effectiveAt: "2026-07-01T00:00:00.000Z",
    status: "active",
    governance: {
      documentId: definition.documentId,
      documentType: definition.documentType,
      approvalStatus: "approved",
      lifecycleStatus: "effective",
      owner: definition.owner,
      contentChecksum,
      chunkChecksum,
      parserId: "controlled-json",
      parserVersion: "1.0.0",
      ingestedAt: timestamp,
      accessClassification: definition.classification ?? "internal",
      accessDecision: "allowed",
    },
  };
  return { directory, contentFile, payload, registry, evidence };
}

function trace(requestId, turnId, traceId, queryPlan, graphPlan, evidencePack, answer) {
  const stages = [
    ["semantic-parsing", [requestId], [queryPlan.planId]],
    ["query-plan-validation", [queryPlan.planId], [queryPlan.planId]],
    ["ontology-validation", [queryPlan.planId], [graphPlan.templateId]],
    ["query-compilation", [queryPlan.planId], [graphPlan.graphPlanId]],
    ["graph-retrieval", [graphPlan.graphPlanId], [...graphPlan.seedEntityIds]],
    ["document-retrieval", [graphPlan.graphPlanId], evidencePack.items.filter((item) => item.kind === "document" || item.kind === "system-record").map((item) => item.id)],
    ["evidence-pack", [queryPlan.planId], [evidencePack.id]],
    ["answer-composition", [evidencePack.id], answer.claims.map((claim) => claim.id)],
    ["citation-validation", answer.claims.map((claim) => claim.id), answer.claims.map((claim) => claim.id)],
  ];
  return {
    traceId,
    requestId,
    stages: stages.map(([stage, inputRefs, outputRefs], index) => ({
      id: `${traceId}.${index + 1}`,
      stage,
      status: "completed",
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
      tool: `phase5b.${stage}.v1`,
      inputRefs,
      outputRefs,
      summary: `${stage} completed against the governed Phase 5B baseline.`,
    })),
  };
}

function baseline(definition) {
  const requestId = `canonical.${definition.scenarioId}.001`;
  const queryPlan = {
    planId: `query-plan.${definition.scenarioId}.001`,
    planVersion: "1.0.0",
    intent: definition.intent,
    originalQuestion: definition.question,
    entities: definition.seeds.map((id) => {
      const item = definition.entities.find((candidate) => candidate.id === id);
      return { id, label: item.label, type: item.type, role: "subject" };
    }),
    relationTypes: definition.queryRelationTypes,
    requestedFacets: definition.facets,
    constraints: [{ key: "entity.status", operator: "eq", value: "active" }],
    assumptions: definition.assumptions,
  };
  const graphPlan = {
    graphPlanId: `graph-query-plan.${definition.scenarioId}.001`,
    graphPlanVersion: "1.0.0",
    semanticPlanId: queryPlan.planId,
    intent: definition.intent,
    templateId: definition.templateId,
    readOnly: true,
    seedEntityIds: definition.seeds,
    allowedRelationTypes: definition.graphRelationTypes,
    maxDepth: definition.maxDepth,
    resultLimit: 80,
    parameters: { status: "active" },
  };
  const evidencePack = {
    id: `evidence-pack.${definition.scenarioId}.001`,
    queryPlanId: queryPlan.planId,
    generatedAt: timestamp,
    ontologyVersion: "1.2.0",
    dataVersion: "0.6.0",
    items: definition.evidence,
    claimPolicies: definition.claims.map((claim) => ({ claimId: claim.id, classification: claim.classification, required: true })),
    limitations: definition.limitations,
  };
  const answer = {
    summary: definition.summary,
    findings: definition.findings,
    recommendedActions: definition.actions,
    risks: definition.risks,
    assumptions: definition.assumptions,
    limitations: definition.limitations,
    claims: definition.claims,
    confidence: "high",
  };
  const turnId = `turn.${requestId}`;
  const traceId = `trace.${requestId}`;
  return {
    baselineId: `canonical-baseline.${definition.scenarioId}`,
    baselineVersion: "1.0.0",
    agentContractVersion: "1.0.0",
    ontologyVersion: "1.2.0",
    dataVersion: "0.6.0",
    scenario: { id: definition.scenarioId, title: definition.title, question: definition.question, intent: definition.intent, seedEntityIds: definition.seeds },
    ids: definition.ids,
    semanticAliases: definition.aliases,
    entities: definition.entities,
    relations: definition.relations,
    request: { contractVersion: "1.0.0", requestId, scenarioId: definition.scenarioId, mode: "live", language: "en", message: definition.question, requestedAt: timestamp },
    queryPlan,
    graphQueryPlan: graphPlan,
    evidencePack,
    expectedResponse: {
      contractVersion: "1.0.0",
      requestId,
      turnId,
      status: "completed",
      queryPlan,
      graphQueryPlan: graphPlan,
      evidencePack,
      answer,
      citationValidation: { status: "passed", checkedClaimIds: definition.claims.map((claim) => claim.id), issues: [] },
      trace: trace(requestId, turnId, traceId, queryPlan, graphPlan, evidencePack, answer),
      completedAt: timestamp,
    },
  };
}

function citedClaim(id, text, evidenceIds, classification = "fact") {
  return { id, text, classification, citations: evidenceIds.map((evidenceId) => ({ evidenceId })) };
}

async function buildEngineeringChange() {
  const directory = "packages/demo-data/documents/engineering-change";
  const documents = [
    controlledDocument({
      file: "ecr-m220-program-v3-5.json", documentId: "doc.engineering-change-request-m220-program", title: "Engineering Change Request M220 Program", documentType: "engineering-change-request", version: "ECR-01", owner: "Manufacturing Engineering", sourceSystem: "PLM Change Control", sourceId: "ECR-M220-01", locator: "Section 2 / Change Scope", heading: "M220 Program V3.5 Change Scope",
      text: "ECR-M220-01 proposes changing LeakTestProgram V3.4 to V3.5 on M220 for OP30. The scope includes OP30 execution logic, Leak Rate judgement, SOP consistency and rollback to V3.4. V3.5 is not released until validation and approval are complete.",
      linkedEntityIds: ["engineering-change.m220-program-v3-5", "machine.m220", "program.leak-test.v3-4", "program.leak-test.v3-5", "operation.op30"], supportsClaimIds: ["claim.change-scope", "claim.release-governance"], allowedDomainIds: ["engineering", "manufacturing", "quality"],
    }, directory),
    controlledDocument({
      file: "validation-record-m220-v3-5.json", documentId: "doc.validation-record-m220-program-v3-5", title: "Validation Record M220 Program V3.5", documentType: "validation-record", version: "Protocol Rev.1", owner: "Validation Engineering", sourceSystem: "Validation Repository", sourceId: "VAL-M220-V35", locator: "Section 4 / Required Validation and Release", heading: "Required Regression Evidence",
      text: "The approved validation protocol requires golden-part, reject-part, repeatability, threshold comparison and rollback checks for V3.5. No completed V3.5 validation result is present in the demo baseline, so production release remains prohibited.",
      linkedEntityIds: ["program.leak-test.v3-5", "machine.m220", "operation.op30", "quality-characteristic.leak-rate"], supportsClaimIds: ["claim.validation-required", "claim.release-limitation"], allowedDomainIds: ["engineering", "quality"],
    }, directory),
    controlledDocument({
      file: "control-plan-op30.json", documentId: "document.control-plan.cp-bb01.rev-a", logicalDocumentId: "document.control-plan.cp-bb01", title: "Control Plan CP-BB01 Rev.A", documentType: "control-plan", version: "Rev.A", owner: "Quality Engineering", sourceSystem: "QMS", sourceId: "CP-BB01", locator: "Sheet Process Control / Row OP30-Leak Rate", heading: "OP30 Leak Rate Release Control",
      text: "Leak Rate remains a 100% controlled characteristic. A program change cannot alter released thresholds or reaction rules without approved Control Plan review and validation evidence.",
      linkedEntityIds: ["operation.op30", "quality-characteristic.leak-rate", "program.leak-test.v3-5"], supportsClaimIds: ["claim.quality-control-impact", "claim.release-governance"], allowedDomainIds: ["engineering", "quality", "manufacturing"],
    }, directory),
    controlledDocument({
      file: "sop-op30-current.json", documentId: "document.sop.op30-leak-test", title: "SOP OP30 Leak Test", documentType: "sop", version: "Rev.3", owner: "Process Documentation", sourceSystem: "DMS", sourceId: "SOP-OP30", locator: "Page 4 / Section 3.2 Current Released Setup", heading: "Current Released Program",
      text: "The current released OP30 setup uses M220, FX-002 and LeakTestProgram V3.4. Any V3.5 deployment requires an approved change, completed validation and updated controlled work instructions.",
      linkedEntityIds: ["operation.op30", "machine.m220", "program.leak-test.v3-4", "program.leak-test.v3-5"], supportsClaimIds: ["claim.change-scope", "claim.validation-required"], allowedDomainIds: ["engineering", "manufacturing", "quality"],
    }, directory),
  ];
  const graph = graphEvidence("evidence.graph.m220-program-change-scope", "M220 Program Change Dependency Graph", "M220 executes OP30, OP30 uses the released V3.4 program and controls Leak Rate; proposed V3.5 requires governed validation before release.", ["machine.m220", "operation.op30", "program.leak-test.v3-4", "program.leak-test.v3-5", "quality-characteristic.leak-rate"], ["claim.change-scope", "claim.quality-control-impact"], "M220 -> OP30 -> Program / Leak Rate");
  const claims = [
    citedClaim("claim.change-scope", "The proposed V3.5 change directly affects M220 and OP30 while V3.4 remains the released program.", [graph.id, documents[0].evidence.id, documents[3].evidence.id]),
    citedClaim("claim.validation-required", "V3.5 requires governed regression validation before release.", [documents[1].evidence.id, documents[3].evidence.id]),
    citedClaim("claim.quality-control-impact", "Leak Rate thresholds and reaction rules remain governed by the released Control Plan.", [graph.id, documents[2].evidence.id]),
    citedClaim("claim.release-governance", "Release requires approved ECR, validation evidence and controlled-document alignment.", [documents[0].evidence.id, documents[2].evidence.id]),
    citedClaim("claim.release-limitation", "The demo has no completed V3.5 validation result, so it cannot recommend production release.", [documents[1].evidence.id], "limitation"),
  ];
  const entities = [
    entity("machine.m220", "mfg:Machine", "M220 Leak Test Bench", "engineering"),
    entity("operation.op30", "mfg:Operation", "OP30 Leak Test", "production"),
    entity("program.leak-test.v3-4", "mfg:ProcessParameter", "LeakTestProgram V3.4", "engineering", { releaseStatus: "released" }),
    entity("program.leak-test.v3-5", "mfg:ProcessParameter", "LeakTestProgram V3.5", "engineering", { releaseStatus: "proposed" }),
    entity("quality-characteristic.leak-rate", "qual:QualityCharacteristic", "Leak Rate", "quality"),
    entity("engineering-change.m220-program-v3-5", "eng:EngineeringChange", "M220 Program V3.5 Engineering Change", "engineering", { changeStatus: "validation-required" }),
    entity("doc.engineering-change-request-m220-program", "eng:EngineeringChangeRecord", "Engineering Change Request M220 Program", "engineering"),
    entity("doc.validation-record-m220-program-v3-5", "eng:ValidationRecord", "Validation Record M220 Program V3.5", "engineering", { releaseDecision: "not-released" }),
    entity("document.control-plan.cp-bb01.rev-a", "qual:ControlPlanVersion", "Control Plan CP-BB01 Rev.A", "quality"),
    entity("document.sop.op30-leak-test", "core:Document", "SOP OP30 Leak Test", "engineering"),
  ];
  const relations = [
    relation("relation.operation.op30.performed-on.machine.m220", "operation.op30", "machine.m220", "performedOn", "mfg:executedBy"),
    relation("relation.operation.op30.uses-program.v3-4", "operation.op30", "program.leak-test.v3-4", "usesProgram", "mfg:usesParameter"),
    relation("relation.change.m220-v3-5.affects.program.v3-5", "engineering-change.m220-program-v3-5", "program.leak-test.v3-5", "affects", "eng:affects"),
    relation("relation.change.m220-v3-5.affects.operation.op30", "engineering-change.m220-program-v3-5", "operation.op30", "affects", "eng:affects"),
    relation("relation.program.v3-5.requires-validation", "program.leak-test.v3-5", "doc.validation-record-m220-program-v3-5", "requiresValidation", "eng:requiresValidation"),
    relation("relation.program.v3-5.supersedes.v3-4", "program.leak-test.v3-5", "program.leak-test.v3-4", "supersedes", "core:supersedes"),
    relation("relation.operation.op30.controls.leak-rate", "operation.op30", "quality-characteristic.leak-rate", "controls", "qual:controlsCharacteristic"),
    relation("relation.leak-rate.governed-by.control-plan", "quality-characteristic.leak-rate", "document.control-plan.cp-bb01.rev-a", "governedBy", "qual:governedBy"),
    relation("relation.operation.op30.described-by.sop", "operation.op30", "document.sop.op30-leak-test", "describedBy", "mfg:flowsTo"),
  ];
  const fixture = baseline({
    scenarioId: "engineering-change-impact", title: "Engineering Change Impact Analysis", intent: "engineering_change_impact",
    question: "What operations, quality controls, documents and release gates are affected by changing M220 from LeakTestProgram V3.4 to V3.5?",
    seeds: ["machine.m220", "program.leak-test.v3-4", "program.leak-test.v3-5"], entities, relations,
    ids: { machine: { m220: "machine.m220" }, operation: { op30: "operation.op30" }, program: { released: "program.leak-test.v3-4", proposed: "program.leak-test.v3-5" }, change: { m220V35: "engineering-change.m220-program-v3-5" } },
    aliases: {
      "machine.m220": ["M220", "leak test bench"], "program.leak-test.v3-4": ["V3.4", "current program"], "program.leak-test.v3-5": ["V3.5", "proposed program", "程序版本变更"],
    },
    queryRelationTypes: ["ontology.relationship.performed-on", "ontology.relationship.uses-program", "ontology.relationship.affects", "ontology.relationship.requires-validation", "ontology.relationship.controls", "ontology.relationship.governed-by", "ontology.relationship.described-by"],
    graphRelationTypes: ["performedOn", "usesProgram", "affects", "requiresValidation", "supersedes", "controls", "governedBy", "describedBy"], facets: ["engineering", "production", "quality", "governance"], maxDepth: 3,
    templateId: "engineering-change-impact.dependency-scope.v1", evidence: [graph, ...documents.map((item) => item.evidence)], claims,
    assumptions: ["V3.5 is a proposed demo change and V3.4 remains the released production baseline."],
    limitations: ["No completed V3.5 validation result or live deployment history is connected."],
    summary: "The proposed V3.5 program change affects M220 and OP30, but release remains blocked until validation and controlled quality/document alignment are complete.",
    findings: ["V3.4 remains released while V3.5 is proposed.", "OP30 and Leak Rate controls are in scope.", "ECR, validation, SOP and Control Plan evidence are required."],
    actions: ["Complete the approved V3.5 validation protocol.", "Review Control Plan and SOP alignment.", "Keep V3.4 as the rollback baseline until release approval."],
    risks: ["Unvalidated program logic could change Leak Rate judgement or false-reject behavior."],
  });
  await emitScenario(directory, documents, fixture, "engineering-change-impact.json");
  await write("packages/demo-data/evaluations/engineering-change-impact.v1.json", engineeringEvaluation(documents, relations));
}

async function buildBottleneck() {
  const directory = "packages/demo-data/documents/bottleneck";
  const documents = [
    controlledDocument({
      file: "line-balance-study.json", documentId: "doc.line-balance-study-lb-bb01", title: "Line Balance Study BB01", documentType: "line-balance-study", version: "Rev.1", owner: "Industrial Engineering", sourceSystem: "IE Repository", sourceId: "LB-BB01", locator: "Section 3 / OP20 Capacity Comparison", heading: "OP20 Capacity Comparison",
      text: "The governed sample records OP20 median cycle time at 48 seconds against a 45 second takt. OP10 and OP30 nominal cycle times are lower, making OP20 the current bounded bottleneck candidate rather than a confirmed live constraint.",
      linkedEntityIds: ["operation.op20", "value-stream.metric.op20-cycle-time", "value-stream.metric.line-bottleneck-risk"], supportsClaimIds: ["claim.bottleneck-candidate", "claim.route-impact"], allowedDomainIds: ["valueStream", "manufacturing", "engineering"],
    }, directory),
    controlledDocument({
      file: "value-stream-map.json", documentId: "doc.value-stream-map-vs-bb01", title: "Value Stream Map BB01", documentType: "value-stream-map", version: "Rev.2", owner: "Lean Office", sourceSystem: "Lean VSM", sourceId: "VS-BB01", locator: "Current State / OP20 Buffer", heading: "OP20 WIP and Waiting",
      text: "The current-state demo map shows 36 pieces of WIP and approximately 18 minutes waiting before OP20. OP30 retest load and waiting before OP40 are tracked separately as a possible bottleneck-shift signal.",
      linkedEntityIds: ["operation.op20", "operation.op30", "value-stream.wip-before-op20", "value-stream.metric.waiting-time-before-op20", "value-stream.metric.waiting-time-before-op40", "value-stream.metric.rework-retest-load"], supportsClaimIds: ["claim.bottleneck-candidate", "claim.route-impact", "claim.shift-risk"], allowedDomainIds: ["valueStream", "manufacturing", "quality"],
    }, directory),
    controlledDocument({
      file: "standard-work-op20.json", documentId: "doc.standard-work-op20", title: "Standard Work OP20 Diaphragm Assembly", documentType: "standard-work", version: "Rev.B", owner: "Production Engineering", sourceSystem: "DMS", sourceId: "SW-OP20", locator: "Section 2 / Work Sequence", heading: "Manual Assembly Work Content",
      text: "The released OP20 sequence includes manual diaphragm positioning and fixture reset. These elements must be time-observed before assigning a corrective action or capacity commitment.",
      linkedEntityIds: ["operation.op20", "value-stream.metric.op20-cycle-time"], supportsClaimIds: ["claim.verification-required"], allowedDomainIds: ["engineering", "manufacturing", "valueStream"],
    }, directory),
    controlledDocument({
      file: "mes-op20-shift.json", documentId: "record.mes.op20-shift.2026-07-demo", title: "MES OP20 Shift Sample", documentType: "mes-record", kind: "system-record", version: "2026-07 Demo", owner: "Manufacturing Systems", sourceSystem: "MES Mock", sourceId: "MES-OP20-DEMO", locator: "Shift Sample / OP20 Metrics", heading: "Bounded Shift Sample",
      text: "The local fixture contains a bounded OP20 sample with median cycle time 48 seconds. It is not a live or statistically complete production history and cannot establish a sustained enterprise bottleneck by itself.",
      linkedEntityIds: ["operation.op20", "value-stream.metric.op20-cycle-time"], supportsClaimIds: ["claim.verification-required", "claim.live-data-limitation"], allowedDomainIds: ["manufacturing", "valueStream"], classification: "restricted",
    }, directory),
    controlledDocument({
      file: "qms-op30-retest.json", documentId: "record.qms.op30-retest.2026-07-demo", title: "QMS OP30 Retest Signal", documentType: "qms-record", kind: "system-record", version: "2026-07 Demo", owner: "Quality Systems", sourceSystem: "QMS Mock", sourceId: "QMS-OP30-RETEST", locator: "Signal Summary / OP30 Retest", heading: "Potential Bottleneck Shift Signal",
      text: "The demo signal indicates that elevated Leak Rate retest could reduce effective OP30 capacity and increase waiting before OP40. No live retest distribution or confirmed shift event is connected.",
      linkedEntityIds: ["operation.op30", "quality-characteristic.leak-rate", "value-stream.metric.rework-retest-load", "value-stream.metric.waiting-time-before-op40"], supportsClaimIds: ["claim.shift-risk", "claim.live-data-limitation"], allowedDomainIds: ["quality", "valueStream", "manufacturing"], classification: "restricted",
    }, directory),
  ];
  const graph = graphEvidence("evidence.graph.brake-booster-value-stream", "Brake Booster Value Stream Graph", "The released route flows OP10 to OP20 to OP30 to OP40 and connects OP20/OP30 to governed capacity, WIP, waiting and retest metrics.", ["product.brake-booster", "operation.op10", "operation.op20", "operation.op30", "operation.op40"], ["claim.route-impact", "claim.shift-risk"], "OP10 -> OP20 -> OP30 -> OP40");
  const claims = [
    citedClaim("claim.bottleneck-candidate", "OP20 is the current bounded bottleneck candidate because its 48 second sample exceeds 45 second takt and coincides with upstream WIP and waiting.", [documents[0].evidence.id, documents[1].evidence.id]),
    citedClaim("claim.route-impact", "An OP20 constraint can limit flow into OP30 on the released Brake Booster route.", [graph.id, documents[0].evidence.id, documents[1].evidence.id]),
    citedClaim("claim.shift-risk", "Elevated OP30 Leak Rate retest could shift or extend the active constraint toward OP30.", [graph.id, documents[1].evidence.id, documents[4].evidence.id]),
    citedClaim("claim.verification-required", "A live decision requires current cycle, downtime, WIP, waiting and resource-state observations.", [documents[2].evidence.id, documents[3].evidence.id]),
    citedClaim("claim.live-data-limitation", "The local MES/QMS fixtures do not prove a sustained live bottleneck or an actual bottleneck shift.", [documents[3].evidence.id, documents[4].evidence.id], "limitation"),
  ];
  const entities = [
    entity("product.brake-booster", "mfg:Product", "Brake Booster Assembly", "production"),
    entity("operation.op10", "mfg:Operation", "OP10 Housing Press Fit", "production", { cycleTimeSeconds: 35 }),
    entity("operation.op20", "mfg:Operation", "OP20 Diaphragm Assembly", "production", { cycleTimeSeconds: 48, taktSeconds: 45 }),
    entity("operation.op30", "mfg:Operation", "OP30 Leak Test", "production", { cycleTimeSeconds: 42 }),
    entity("operation.op40", "mfg:Operation", "OP40 Final Inspection", "production", { cycleTimeSeconds: 25 }),
    entity("quality-characteristic.leak-rate", "qual:QualityCharacteristic", "Leak Rate", "quality"),
    entity("value-stream.metric.op20-cycle-time", "vs:ValueStreamMetric", "OP20 Cycle Time", "valueStream", { metricValue: 48, unit: "seconds", asOf: timestamp }),
    entity("value-stream.wip-before-op20", "vs:WIPBuffer", "WIP before OP20", "valueStream", { quantity: 36, unit: "pieces" }),
    entity("value-stream.metric.waiting-time-before-op20", "vs:ValueStreamMetric", "Waiting Time before OP20", "valueStream", { metricValue: 18, unit: "minutes", asOf: timestamp }),
    entity("value-stream.metric.line-bottleneck-risk", "vs:BottleneckRisk", "Line Bottleneck Risk", "valueStream", { metricValue: 0.7, unit: "bounded-score", asOf: timestamp }),
    entity("value-stream.metric.rework-retest-load", "vs:ValueStreamMetric", "Rework / Retest Load", "valueStream", { metricValue: 0, unit: "unconnected-live-count", asOf: timestamp }),
    entity("value-stream.metric.waiting-time-before-op40", "vs:ValueStreamMetric", "Waiting Time before OP40", "valueStream", { metricValue: 0, unit: "unconnected-live-minutes", asOf: timestamp }),
  ];
  const relations = [
    relation("relation.product.brake-booster.has-operation.op20", "product.brake-booster", "operation.op20", "hasOperation", "mfg:requiresOperation"),
    relation("relation.operation.op10.next-operation.op20", "operation.op10", "operation.op20", "nextOperation", "mfg:flowsTo"),
    relation("relation.operation.op20.next-operation.op30", "operation.op20", "operation.op30", "nextOperation", "mfg:flowsTo"),
    relation("relation.operation.op30.next-operation.op40", "operation.op30", "operation.op40", "nextOperation", "mfg:flowsTo"),
    relation("relation.operation.op20.contributes-to.cycle-time", "operation.op20", "value-stream.metric.op20-cycle-time", "contributesTo", "vs:contributesTo"),
    relation("relation.operation.op20.affects.wip-before-op20", "operation.op20", "value-stream.wip-before-op20", "affectsFlow", "vs:affectsFlow"),
    relation("relation.operation.op20.contributes-to.waiting", "operation.op20", "value-stream.metric.waiting-time-before-op20", "contributesTo", "vs:contributesTo"),
    relation("relation.operation.op20.contributes-to.bottleneck-risk", "operation.op20", "value-stream.metric.line-bottleneck-risk", "contributesTo", "vs:contributesTo"),
    relation("relation.leak-rate.affects.retest-load", "quality-characteristic.leak-rate", "value-stream.metric.rework-retest-load", "affectsFlow", "vs:affectsFlow"),
    relation("relation.retest-load.contributes-to.op40-waiting", "value-stream.metric.rework-retest-load", "value-stream.metric.waiting-time-before-op40", "contributesTo", "vs:contributesTo"),
    relation("relation.op30-retest.contributes-to.bottleneck-risk", "value-stream.metric.rework-retest-load", "value-stream.metric.line-bottleneck-risk", "contributesTo", "vs:contributesTo"),
  ];
  const fixture = baseline({
    scenarioId: "bottleneck-analysis", title: "Bottleneck Analysis", intent: "bottleneck_analysis",
    question: "Is OP20 the current bottleneck, and could OP30 Leak Rate retest shift the constraint downstream?",
    seeds: ["operation.op20"], entities, relations,
    ids: { product: { brakeBooster: "product.brake-booster" }, operation: { op20: "operation.op20", op30: "operation.op30" }, metrics: { cycleTime: "value-stream.metric.op20-cycle-time", wip: "value-stream.wip-before-op20", waiting: "value-stream.metric.waiting-time-before-op20" } },
    aliases: { "operation.op20": ["OP20", "Diaphragm Assembly", "瓶颈", "bottleneck"] },
    queryRelationTypes: ["ontology.relationship.next-operation", "ontology.relationship.contributes-to", "ontology.relationship.affects"],
    graphRelationTypes: ["hasOperation", "nextOperation", "contributesTo", "affectsFlow"], facets: ["production", "valueStream", "quality", "engineering"], maxDepth: 3,
    templateId: "bottleneck-analysis.flow-metrics.v1", evidence: [graph, ...documents.map((item) => item.evidence)], claims,
    assumptions: ["The local OP20 and OP30 samples are bounded demo signals, not live enterprise telemetry."],
    limitations: ["No live shift history, downtime distribution, staffing state or confirmed OP30 retest population is connected."],
    summary: "OP20 is the current bounded bottleneck candidate; elevated OP30 retest could shift or extend the constraint, but live confirmation requires current flow and quality data.",
    findings: ["OP20 sample cycle time is 48 seconds against 45 second takt.", "WIP and waiting accumulate before OP20.", "OP30 retest is a governed downstream shift risk, not a confirmed event."],
    actions: ["Collect current cycle and downtime distributions.", "Observe OP20 work content and resource availability.", "Monitor OP30 retest load and waiting before OP40."],
    risks: ["Treating a bounded sample as a confirmed bottleneck could misdirect capacity investment."],
  });
  await emitScenario(directory, documents, fixture, "bottleneck-analysis.json");
  await write("packages/demo-data/evaluations/bottleneck-analysis.v1.json", bottleneckEvaluation(documents, relations));
}

async function emitScenario(directory, documents, fixture, file) {
  for (const document of documents) await write(`${directory}/${document.contentFile}`, document.payload);
  await write(`${directory}/document-registry.json`, { registryVersion: "1.0.0", documents: documents.map((item) => item.registry) });
  await write(`packages/demo-data/canonical/${file}`, fixture);
}

function commonExpected(scenarioId, intent, entityIds, templateId, requiredObjectIds, requiredRelationIds, evidenceIds, claimIds, documents) {
  return {
    semantic: { intent, entityIds },
    graph: { templateId, seedEntityIds: entityIds, requiredObjectIds, requiredRelationIds, maxDepth: 3 },
    evidence: {
      requiredEvidenceIds: evidenceIds,
      requiredDocuments: documents.map((item) => ({ documentId: item.registry.documentId, version: item.registry.version, chunkId: item.evidence.id })),
      requireGovernedAccess: true,
    },
    answer: { requiredClaimIds: claimIds, minimumLimitations: 1, minimumCitationCoverage: 1 },
    runtime: { maxLatencyMs: 5000, expectedPipelineStages: 9 },
  };
}

function engineeringEvaluation(documents, relations) {
  const scenarioId = "engineering-change-impact";
  const entityIds = ["machine.m220", "program.leak-test.v3-4", "program.leak-test.v3-5"];
  const evidenceIds = ["evidence.graph.m220-program-change-scope", ...documents.map((item) => item.evidence.id)];
  const claimIds = ["claim.change-scope", "claim.validation-required", "claim.quality-control-impact", "claim.release-governance", "claim.release-limitation"];
  const expected = commonExpected(scenarioId, "engineering_change_impact", entityIds, "engineering-change-impact.dependency-scope.v1", ["operation.op30", "quality-characteristic.leak-rate", "doc.validation-record-m220-program-v3-5"], relations.slice(2, 8).map((item) => item.id), evidenceIds, claimIds, documents);
  return {
    datasetId: "evaluation.engineering-change-impact", version: "1.0.0", domain: "manufacturing-engineering", description: "Governed regression set for M220 program engineering-change impact analysis.",
    cases: [
      { caseId: "engineering-change.en.direct", scenarioId, title: "English engineering change impact", severity: "blocker", tags: ["english", "engineering", "documents", "citations"], turns: [{ turnId: "turn-1", input: { message: "What operations, quality controls, documents and release gates are affected by changing M220 from LeakTestProgram V3.4 to V3.5?", language: "en" }, expected }], expectedContext: { turnCount: 1, resolvedEntityIds: entityIds, activeTopic: "engineering_change_impact" } },
      { caseId: "engineering-change.zh.alias", scenarioId, title: "Chinese program change aliases", severity: "critical", tags: ["chinese", "engineering", "semantic"], turns: [{ turnId: "turn-1", input: { message: "M220 的程序版本从 V3.4 变更到 V3.5，会影响哪些工序、质量控制和放行文件？", language: "zh" }, expected: { semantic: expected.semantic, evidence: { requiredEvidenceIds: evidenceIds.slice(0, 3), requireGovernedAccess: true }, answer: expected.answer, runtime: expected.runtime } }] },
      { caseId: "engineering-change.ambiguous", scenarioId, title: "Unresolved change requires clarification", severity: "critical", tags: ["negative", "clarification"], turns: [{ turnId: "turn-1", input: { message: "Assess the proposed change.", language: "en" }, expected: { errorCode: "CLARIFICATION_REQUIRED" } }], expectedContext: { turnCount: 0, resolvedEntityIds: [] } },
      { caseId: "engineering-change.document-access-denied", scenarioId, title: "Engineering evidence access denial blocks publication", severity: "critical", tags: ["negative", "access-control", "citation-gate"], executionProfile: "no-document-access", turns: [{ turnId: "turn-1", input: { message: "What operations, quality controls, documents and release gates are affected by changing M220 from LeakTestProgram V3.4 to V3.5?", language: "en" }, expected: { errorCode: "CITATION_INVALID" } }], expectedContext: { turnCount: 0, resolvedEntityIds: [] } },
    ],
  };
}

function bottleneckEvaluation(documents, relations) {
  const scenarioId = "bottleneck-analysis";
  const entityIds = ["operation.op20"];
  const evidenceIds = ["evidence.graph.brake-booster-value-stream", ...documents.map((item) => item.evidence.id)];
  const claimIds = ["claim.bottleneck-candidate", "claim.route-impact", "claim.shift-risk", "claim.verification-required", "claim.live-data-limitation"];
  const expected = commonExpected(scenarioId, "bottleneck_analysis", entityIds, "bottleneck-analysis.flow-metrics.v1", ["operation.op30", "value-stream.metric.op20-cycle-time", "value-stream.metric.line-bottleneck-risk"], relations.map((item) => item.id), evidenceIds, claimIds, documents);
  return {
    datasetId: "evaluation.bottleneck-analysis", version: "1.0.0", domain: "manufacturing-value-stream", description: "Governed regression set for OP20 bottleneck and OP30 shift-risk analysis.",
    cases: [
      { caseId: "bottleneck.en.direct", scenarioId, title: "English bottleneck analysis", severity: "blocker", tags: ["english", "value-stream", "documents", "citations"], turns: [{ turnId: "turn-1", input: { message: "Is OP20 the current bottleneck, and could OP30 Leak Rate retest shift the constraint downstream?", language: "en" }, expected }], expectedContext: { turnCount: 1, resolvedEntityIds: entityIds, activeTopic: "bottleneck_analysis" } },
      { caseId: "bottleneck.zh.alias", scenarioId, title: "Chinese bottleneck alias", severity: "critical", tags: ["chinese", "value-stream", "semantic"], turns: [{ turnId: "turn-1", input: { message: "OP20 是当前瓶颈吗？如果 OP30 漏率复测增加，瓶颈会不会转移？", language: "zh" }, expected: { semantic: expected.semantic, evidence: { requiredEvidenceIds: evidenceIds.slice(0, 3), requireGovernedAccess: true }, answer: expected.answer, runtime: expected.runtime } }] },
      { caseId: "bottleneck.cross-domain-multi-turn", scenarioId, title: "Bottleneck and quality shift multi-turn", severity: "major", tags: ["multi-turn", "cross-domain", "quality", "value-stream"], turns: [
        { turnId: "turn-1", input: { message: "Is OP20 the current bottleneck?", language: "en" }, expected: { semantic: expected.semantic, answer: { requiredClaimIds: ["claim.bottleneck-candidate", "claim.live-data-limitation"], minimumLimitations: 1, minimumCitationCoverage: 1 }, runtime: expected.runtime } },
        { turnId: "turn-2", input: { message: "For OP20, could OP30 Leak Rate retest shift the bottleneck downstream?", language: "en" }, expected: { semantic: expected.semantic, evidence: { requiredEvidenceIds: [documents[4].evidence.id], requireGovernedAccess: true }, answer: { requiredClaimIds: ["claim.shift-risk", "claim.live-data-limitation"], minimumLimitations: 1, minimumCitationCoverage: 1 }, runtime: expected.runtime } },
      ], expectedContext: { turnCount: 2, resolvedEntityIds: entityIds, activeTopic: "bottleneck_analysis" } },
      { caseId: "bottleneck.ambiguous", scenarioId, title: "Unresolved line question requires clarification", severity: "critical", tags: ["negative", "clarification"], turns: [{ turnId: "turn-1", input: { message: "Where is the problem?", language: "en" }, expected: { errorCode: "CLARIFICATION_REQUIRED" } }], expectedContext: { turnCount: 0, resolvedEntityIds: [] } },
      { caseId: "bottleneck.document-access-denied", scenarioId, title: "Value-stream evidence access denial blocks publication", severity: "critical", tags: ["negative", "access-control", "citation-gate"], executionProfile: "no-document-access", turns: [{ turnId: "turn-1", input: { message: "Is OP20 the current bottleneck, and could OP30 Leak Rate retest shift the constraint downstream?", language: "en" }, expected: { errorCode: "CITATION_INVALID" } }], expectedContext: { turnCount: 0, resolvedEntityIds: [] } },
    ],
  };
}

await buildEngineeringChange();
await buildBottleneck();
console.log("Generated Phase 5B canonical baselines, governed documents, and evaluation datasets.");
