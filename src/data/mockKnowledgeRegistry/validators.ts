import type { AgentScenario } from "../../features/agent-demo/agentDemoTypes";
import type { ScriptedTurnTemplate } from "../../features/agent-demo/agentConversationData";
import type { OntologyLinkType, OntologyObjectType, StackNode } from "../../types";
import type { SemanticEntity } from "../../features/semantic/semanticTypes";
import { evidenceDocuments } from "./evidenceDocuments";
import { knowledgeIds as id } from "./ids";
import { manufacturingObjects } from "./manufacturingObjects";
import { ontologyRelations } from "./ontologyRelations";
import { semanticMappings } from "./semanticMappings";
import type { MockKnowledgeValidationIssue, MockKnowledgeValidationReport } from "./types";

export type MockKnowledgeValidationInput = { scenarios: AgentScenario[]; scriptedTurns?: ScriptedTurnTemplate[]; routeNodes: StackNode[]; semanticEntities: SemanticEntity[]; ontologyObjectTypes: OntologyObjectType[]; ontologyLinkTypes: OntologyLinkType[] };

export function validateMockKnowledgeRegistry(input: MockKnowledgeValidationInput): MockKnowledgeValidationReport {
  const issues: MockKnowledgeValidationIssue[] = [];
  const objectIds = uniqueIds(manufacturingObjects, "object", issues);
  const evidenceIds = uniqueIds(evidenceDocuments, "evidence", issues);
  uniqueIds(ontologyRelations, "relation", issues);
  uniqueIds(semanticMappings, "semantic mapping", issues);

  for (const document of evidenceDocuments) {
    document.linkedObjectIds.forEach((objectId) => requireId(objectIds, objectId, "evidence linked object", document.id, issues));
  }
  for (const relation of ontologyRelations) {
    requireId(objectIds, relation.sourceId, "relation source", relation.id, issues);
    requireId(objectIds, relation.targetId, "relation target", relation.id, issues);
    relation.evidenceIds?.forEach((evidenceId) => requireId(evidenceIds, evidenceId, "relation evidence", relation.id, issues));
  }
  for (const mapping of semanticMappings) {
    requireId(objectIds, mapping.sourceId, "semantic mapping source", mapping.id, issues);
    requireId(objectIds, mapping.targetId, "semantic mapping target", mapping.id, issues);
  }

  for (const scenario of input.scenarios) {
    validateAgentPayload(scenario.id, scenario.relatedObjects, scenario.references, scenario.steps, scenario.viewIndexes ?? [], scenario.finalAnswer.citations, objectIds, evidenceIds, issues);
  }
  for (const turn of input.scriptedTurns ?? []) {
    validateAgentPayload(turn.id, turn.relatedObjects, turn.references, turn.trace, turn.viewIndexes, turn.response.citations, objectIds, evidenceIds, issues);
  }

  function validateAgentPayload(owner: string, relatedObjects: AgentScenario["relatedObjects"], references: AgentScenario["references"], steps: AgentScenario["steps"], viewIndexes: NonNullable<AgentScenario["viewIndexes"]>, citations: AgentScenario["finalAnswer"]["citations"], registryObjectIds: Set<string>, registryEvidenceIds: Set<string>, validationIssues: MockKnowledgeValidationIssue[]) {
    relatedObjects.forEach((object) => requireId(registryObjectIds, object.id, "Agent related object", owner, validationIssues));
    references.forEach((reference) => requireId(registryEvidenceIds, reference.id, "Agent reference", owner, validationIssues));
    steps.forEach((step) => {
      step.referencedObjectIds?.forEach((objectId) => requireId(registryObjectIds, objectId, "Agent trace object", step.id, validationIssues));
      step.referenceIds?.forEach((referenceId) => requireId(registryEvidenceIds, referenceId, "Agent trace reference", step.id, validationIssues));
    });
    viewIndexes.forEach((viewIndex) => {
      viewIndex.objectIds.forEach((objectId) => requireId(registryObjectIds, objectId, "Agent view index object", `${owner}/${viewIndex.view}`, validationIssues));
      viewIndex.referenceIds.forEach((referenceId) => requireId(registryEvidenceIds, referenceId, "Agent view index reference", `${owner}/${viewIndex.view}`, validationIssues));
    });
    citations.forEach((citation) => citation.referenceIds.forEach((referenceId) => requireId(registryEvidenceIds, referenceId, "Agent citation", owner, validationIssues)));
  }

  const routeObjects = input.routeNodes.flatMap((node) => node.stackObjects);
  const routeObjectIds = new Set(routeObjects.map((object) => object.id));
  const requiredRouteIds = [id.operation.op10, id.operation.op20, id.operation.op30, id.operation.op40, id.machine.m220, id.fixture.fx002, id.program.leakTestV34, id.program.leakTestV35, id.quality.leakRate, id.document.controlPlan, id.document.pfmea, id.document.sopOp30, id.document.validationRecord, id.document.validationRecordV35, id.document.engineeringChangeM220, id.document.standardWorkOp20, id.document.valueStreamMap, id.document.lineBalanceStudy, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.lineBottleneckRisk, id.valueStream.waitingBeforeOp40, id.valueStream.reworkRetestLoad, id.valueStream.qualityBottleneckRisk];
  requiredRouteIds.forEach((objectId) => requireId(routeObjectIds, objectId, "Route Explorer object", "route graph", issues));
  for (const routeObject of routeObjects) {
    const canonical = manufacturingObjects.find((object) => object.id === routeObject.id);
    if (!canonical) continue;
    if (canonical.label !== routeObject.label) error("label-mismatch", `${routeObject.id} label is '${routeObject.label}' in Route Explorer but '${canonical.label}' in the registry.`, issues);
    if (canonical.version && canonical.version !== routeObject.version) error("version-mismatch", `${routeObject.id} version is '${routeObject.version}' in Route Explorer but '${canonical.version}' in the registry.`, issues);
  }

  const semanticIds = new Set(input.semanticEntities.map((entity) => entity.id));
  [id.semantic.leakRate, id.semantic.airLeak, id.semantic.leakage, id.semantic.leakTestResult, id.semantic.ctq, id.semantic.cycleTime, id.semantic.bottleneck, id.semantic.wip, id.semantic.engineeringChange, id.semantic.programVersion, id.semantic.validation, id.semantic.qmsLeakRate, id.semantic.mesOp30Value, id.semantic.mesOperationCycleTime, id.semantic.mesWipQuantity, id.semantic.ieLineBalanceResult].forEach((semanticId) => requireId(semanticIds, semanticId, "Semantic Explorer entity", "semantic catalog", issues));

  const ontologyLinkIds = new Set(input.ontologyLinkTypes.map((link) => link.id));
  [id.ontology.controls, id.ontology.performedOn, id.ontology.usesProgram, id.ontology.governedBy, id.ontology.riskAnalyzedBy, id.ontology.describedBy, id.ontology.contributesTo, id.ontology.nextOperation, id.ontology.affects, id.ontology.requiresValidation].forEach((relationId) => requireId(ontologyLinkIds, relationId, "Ontology Explorer relation", "ontology model", issues));
  const ontologyLabels = new Set(input.ontologyObjectTypes.map((item) => item.label));
  ["Operation", "Machine", "Quality Characteristic", "Program", "Control Plan", "PFMEA", "SOP", "Value Stream Metric"].forEach((label) => requireId(ontologyLabels, label, "Ontology Explorer object type", "ontology model", issues));

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return { passed: errors === 0, errors, warnings, issues };
}

function uniqueIds(items: Array<{ id: string }>, kind: string, issues: MockKnowledgeValidationIssue[]) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) error("duplicate-id", `Duplicate ${kind} ID: ${item.id}.`, issues);
    ids.add(item.id);
  }
  return ids;
}
function requireId(ids: Set<string>, id: string, kind: string, owner: string, issues: MockKnowledgeValidationIssue[]) { if (!ids.has(id)) error("missing-id", `Missing ${kind} '${id}' referenced by ${owner}.`, issues); }
function error(code: string, message: string, issues: MockKnowledgeValidationIssue[]) { issues.push({ severity: "error", code, message }); }
