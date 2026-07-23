export const QUALITY_TRACE_TEMPLATE_ID = "quality-issue-trace.direct-neighborhood.v1";
export const ENGINEERING_CHANGE_TEMPLATE_ID = "engineering-change-impact.dependency-scope.v1";
export const BOTTLENECK_ANALYSIS_TEMPLATE_ID = "bottleneck-analysis.flow-metrics.v1";
export const QUALITY_RICH_TEMPLATE_IDS = [
  "GET_CHARACTERISTIC_SPECIFICATION",
  "GET_CHARACTERISTIC_CONTROL_LIMITS",
  "GET_CONTROL_METHOD",
  "GET_MEASUREMENT_SYSTEM",
  "GET_LATEST_VALID_METRIC",
  "GET_METRIC_HISTORY",
  "GET_CAPABILITY_STUDY",
  "GET_REACTION_PLAN",
  "GET_GOVERNING_DOCUMENTS",
  "GET_PROGRAM_VERSION_STATUS",
  "GET_CHANGE_IMPACT",
  "GET_CROSS_DOMAIN_EVIDENCE",
] as const;
export const NEO4J_ALLOWLISTED_TEMPLATE_IDS = new Set([
  QUALITY_TRACE_TEMPLATE_ID,
  ENGINEERING_CHANGE_TEMPLATE_ID,
  BOTTLENECK_ANALYSIS_TEMPLATE_ID,
  ...QUALITY_RICH_TEMPLATE_IDS,
]);
export const NEO4J_SCENARIO_BY_TEMPLATE_ID: Record<string, string> = {
  [QUALITY_TRACE_TEMPLATE_ID]: "quality-issue-trace",
  [ENGINEERING_CHANGE_TEMPLATE_ID]: "engineering-change-impact",
  [BOTTLENECK_ANALYSIS_TEMPLATE_ID]: "bottleneck-analysis",
  ...Object.fromEntries(QUALITY_RICH_TEMPLATE_IDS.map((templateId) => [templateId, "quality-issue-trace"])),
};

const CANONICAL_TRAVERSAL_QUERY = `
UNWIND $seedEntityIds AS seedId
MATCH (seed:KnowledgeEntity {id: seedId})
WHERE $scenarioId IN seed.scenarioIds
MATCH path = (seed)-[:RELATED_TO*0..3]-(entity:KnowledgeEntity)
WHERE length(path) <= $maxDepth
  AND all(node IN nodes(path) WHERE $scenarioId IN node.scenarioIds)
  AND all(relation IN relationships(path) WHERE relation.businessType IN $allowedRelationTypes AND $scenarioId IN relation.scenarioIds)
  AND ($status IS NULL OR entity.status = $status)
WITH DISTINCT entity
ORDER BY entity.id
LIMIT $resultLimit
RETURN entity`;

export const NEO4J_READ_QUERIES = {
  traverseCanonicalNodes: CANONICAL_TRAVERSAL_QUERY,
  traverseQualityIssueNodes: CANONICAL_TRAVERSAL_QUERY,
  relationsForEntities: `
MATCH (source:KnowledgeEntity)-[relation:RELATED_TO]->(target:KnowledgeEntity)
WHERE source.id IN $entityIds
  AND target.id IN $entityIds
  AND relation.businessType IN $allowedRelationTypes
  AND $scenarioId IN relation.scenarioIds
RETURN source.id AS sourceId, relation, target.id AS targetId
ORDER BY relation.id`,
  entityById: `
MATCH (entity:KnowledgeEntity {id: $entityId})
RETURN entity
LIMIT 1`,
  entityRelations: `
MATCH (source:KnowledgeEntity)-[relation:RELATED_TO]->(target:KnowledgeEntity)
WHERE source.id = $entityId OR target.id = $entityId
RETURN source.id AS sourceId, relation, target.id AS targetId
ORDER BY relation.id`,
} as const;

export const NEO4J_SEED_QUERIES = {
  constraint: "CREATE CONSTRAINT knowledge_entity_id IF NOT EXISTS FOR (entity:KnowledgeEntity) REQUIRE entity.id IS UNIQUE",
  clearBaseline: "MATCH (entity:KnowledgeEntity {baselineId: $baselineId}) DETACH DELETE entity",
  entities: `
UNWIND $entities AS row
CREATE (entity:KnowledgeEntity {
  id: row.id,
  baselineId: row.baselineId,
  type: row.type,
  label: row.label,
  description: row.description,
  domain: row.domain,
  propertiesJson: row.propertiesJson,
  sourceJson: row.sourceJson,
  validFrom: row.validFrom,
  validTo: row.validTo,
  version: row.version,
  status: row.status,
  ontologyVersion: row.ontologyVersion,
  dataVersion: row.dataVersion,
  scenarioIds: row.scenarioIds
})`,
  relations: `
UNWIND $relations AS row
MATCH (source:KnowledgeEntity {id: row.sourceId})
MATCH (target:KnowledgeEntity {id: row.targetId})
CREATE (source)-[relation:RELATED_TO {
  id: row.id,
  businessType: row.businessType,
  predicate: row.predicate,
  propertiesJson: row.propertiesJson,
  provenanceJson: row.provenanceJson,
  validFrom: row.validFrom,
  validTo: row.validTo,
  confidence: row.confidence,
  evidenceType: row.evidenceType,
  assertionType: row.assertionType,
  baselineId: row.baselineId,
  scenarioIds: row.scenarioIds
}]->(target)`,
} as const;
