import type { AgentReference, AgentRelatedObject, AgentScenario, AgentViewIndex } from "../../features/agent-demo/agentDemoTypes";
import { bottleneckViewIndexes, engineeringChangeViewIndexes, qualityTraceViewIndexes } from "./crossViewIndex";
import { evidenceDocumentById } from "./evidenceDocuments";
import { knowledgeIds as id } from "./ids";
import { manufacturingObjectById } from "./manufacturingObjects";
import type { MockKnowledgeObject } from "./types";

const relationIdsByScenario: Record<string, string[]> = {
  "quality-issue-trace": [id.ontology.controls, id.ontology.performedOn, id.ontology.governedBy, id.ontology.riskAnalyzedBy, id.ontology.describedBy, id.ontology.affects],
  "engineering-change-impact": [id.ontology.performedOn, id.ontology.usesProgram, id.ontology.controls, id.ontology.describedBy, id.ontology.affects, id.ontology.requiresValidation],
  "bottleneck-analysis": [id.ontology.nextOperation, id.ontology.contributesTo, id.ontology.affects],
};

const indexesByScenario: Record<string, AgentViewIndex[]> = {
  "quality-issue-trace": qualityTraceViewIndexes,
  "engineering-change-impact": engineeringChangeViewIndexes,
  "bottleneck-analysis": bottleneckViewIndexes,
};

export function agentReference(referenceId: string): AgentReference {
  const reference = evidenceDocumentById.get(referenceId);
  if (!reference) throw new Error(`Mock knowledge reference not found: ${referenceId}`);
  return { id: reference.id, title: reference.title, type: reference.type, version: reference.version, sourceSystem: reference.sourceSystem, evidenceText: reference.evidenceText, supports: reference.supports, linkedObjectIds: reference.linkedObjectIds, sourcePage: reference.sourcePage === "Agent Demo" ? undefined : reference.sourcePage, sourceViews: reference.sourceViews };
}

export function agentRelatedObject(objectId: string): AgentRelatedObject {
  const object = manufacturingObjectById.get(objectId);
  if (!object) throw new Error(`Mock knowledge object not found: ${objectId}`);
  return { id: object.id, label: object.label, type: agentObjectType(object.type), domain: agentDomain(object.domain), description: object.description, sourcePage: object.sourcePage === "Agent Demo" ? undefined : object.sourcePage, sourceViews: object.sourceViews };
}

export function canonicalizeAgentScenario(scenario: AgentScenario): AgentScenario {
  const relationIds = relationIdsByScenario[scenario.id] ?? [];
  const steps = scenario.steps.map((step) => step.layer === "ontology" ? { ...step, referencedObjectIds: [...new Set([...(step.referencedObjectIds ?? []), ...relationIds])] } : step);
  const objectIds = new Set([...scenario.relatedObjects.map((object) => object.id), ...steps.flatMap((step) => step.referencedObjectIds ?? []), ...(indexesByScenario[scenario.id] ?? []).flatMap((item) => item.objectIds)]);
  return { ...scenario, steps, references: scenario.references.map((reference) => agentReference(reference.id)), relatedObjects: [...objectIds].map(agentRelatedObject), viewIndexes: indexesByScenario[scenario.id] ?? [] };
}

function agentObjectType(type: MockKnowledgeObject["type"]): AgentRelatedObject["type"] {
  if (type === "QualityCharacteristic" || type === "CTQ") return "Quality Characteristic";
  if (type === "SemanticTerm") return "Business Term";
  if (type === "SystemField") return "System Field";
  if (type === "ValueStreamMetric") return "Value Stream Metric";
  if (type === "OntologyRelationshipType") return "Ontology Relationship";
  if (type === "OntologyObjectType" || type === "Product" || type === "Program" || type === "Fixture" || type === "WIPBuffer") return "Ontology Object";
  if (type === "FailureMode" || type === "ControlMethod" || type === "Document") return "Document";
  if (type === "Part") return "Ontology Object";
  return type;
}

function agentDomain(domain: import("./types").MockKnowledgeDomain): AgentRelatedObject["domain"] { return domain === "semantic" || domain === "ontology" ? "governance" : domain; }
