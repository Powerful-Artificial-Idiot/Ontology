import type {
  CanonicalKnowledgeBaseline,
  EvidenceItem,
  KnowledgeEntity,
  KnowledgeRelation,
} from "../../knowledge-contracts/src/index";
import fixture from "../canonical/leak-rate-quality-issue-trace.json";

export type LeakRateQualityIssueTraceIds = {
  product: { brakeBooster: string };
  operation: { op10: string; op20: string; op30: string; op40: string };
  machine: { m220: string };
  fixture: { fx002: string };
  program: { leakTestV34: string };
  quality: { leakRate: string; automaticLeakTest: string; internalLeakage: string };
  document: { controlPlan: string; pfmea: string; sopOp30: string };
  evidence: { route: string; recentQualityResults: string };
};

export const leakRateQualityIssueTraceBaseline = fixture as unknown as CanonicalKnowledgeBaseline;
export const leakRateQualityIssueTraceIds = fixture.ids as LeakRateQualityIssueTraceIds;

export const leakRateCanonicalEntityById = new Map<string, KnowledgeEntity>(
  leakRateQualityIssueTraceBaseline.entities.map((entity) => [entity.id, entity]),
);

export const leakRateCanonicalRelationById = new Map<string, KnowledgeRelation>(
  leakRateQualityIssueTraceBaseline.relations.map((relation) => [relation.id, relation]),
);

export const leakRateCanonicalEvidenceById = new Map<string, EvidenceItem>(
  leakRateQualityIssueTraceBaseline.evidencePack.items.map((item) => [item.id, item]),
);

export function getLeakRateCanonicalEntity(id: string): KnowledgeEntity {
  const entity = leakRateCanonicalEntityById.get(id);
  if (!entity) throw new Error(`Canonical Leak Rate entity not found: ${id}`);
  return entity;
}

export function getLeakRateCanonicalEvidence(id: string): EvidenceItem {
  const evidence = leakRateCanonicalEvidenceById.get(id)
    ?? leakRateQualityIssueTraceBaseline.evidencePack.items.find((item) => item.governance?.documentId === id)
    ?? (id === "evidence.qms.leak-rate.recent" ? leakRateCanonicalEvidenceById.get(leakRateQualityIssueTraceIds.evidence.recentQualityResults) : undefined);
  if (!evidence) throw new Error(`Canonical Leak Rate evidence not found: ${id}`);
  return evidence;
}
