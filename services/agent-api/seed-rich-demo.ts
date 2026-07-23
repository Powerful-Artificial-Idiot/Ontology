import neo4j from "neo4j-driver";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { neo4jOptionsFromEnvironment } from "./runtime";

const apply = process.argv.includes("--apply");
const tenantId = process.env.MKG_DEMO_TENANT_ID;
const baseline = leakRateQualityIssueTraceBaseline;
const summary = {
  baselineId: baseline.baselineId,
  tenantId: "tenant.demo-manufacturing",
  scenarioId: baseline.scenario.id,
  entities: baseline.entities.length,
  relations: baseline.relations.length,
  canonicalIds: baseline.scenario.seedEntityIds,
};

if (!apply) {
  console.info(JSON.stringify({ status: "dry-run", ...summary, applyCommand: "npm run demo-data:rich:seed -- --apply" }, null, 2));
  process.exit(0);
}
if (tenantId !== "tenant.demo-manufacturing") {
  throw new Error("Rich demo seed is restricted to MKG_DEMO_TENANT_ID=tenant.demo-manufacturing.");
}

const options = neo4jOptionsFromEnvironment({ ...process.env, MKG_AGENT_KNOWLEDGE_MODE: "neo4j" });
const driver = neo4j.driver(
  options.uri ?? "bolt://127.0.0.1:7687",
  neo4j.auth.basic(options.username ?? "neo4j", options.password ?? ""),
  { disableLosslessIntegers: true },
);
const session = driver.session({ database: options.database });
try {
  await driver.verifyConnectivity({ database: options.database });
  await session.run("CREATE CONSTRAINT knowledge_entity_id IF NOT EXISTS FOR (entity:KnowledgeEntity) REQUIRE entity.id IS UNIQUE");
  await session.executeWrite(async (transaction) => {
    await transaction.run(`
UNWIND $entities AS row
MERGE (entity:KnowledgeEntity {id: row.id})
SET entity.baselineId = row.baselineId,
    entity.type = row.type,
    entity.label = row.label,
    entity.description = row.description,
    entity.domain = row.domain,
    entity.propertiesJson = row.propertiesJson,
    entity.sourceJson = row.sourceJson,
    entity.validFrom = row.validFrom,
    entity.validTo = row.validTo,
    entity.version = row.version,
    entity.status = row.status,
    entity.ontologyVersion = row.ontologyVersion,
    entity.dataVersion = row.dataVersion,
    entity.scenarioIds = CASE
      WHEN entity.scenarioIds IS NULL THEN [row.scenarioId]
      WHEN row.scenarioId IN entity.scenarioIds THEN entity.scenarioIds
      ELSE entity.scenarioIds + row.scenarioId
    END`, {
      entities: baseline.entities.map((entity) => ({
        id: entity.id,
        baselineId: baseline.baselineId,
        type: entity.type,
        label: entity.label,
        description: entity.description ?? null,
        domain: entity.domain ?? null,
        propertiesJson: JSON.stringify(entity.properties),
        sourceJson: JSON.stringify(entity.source ?? []),
        validFrom: entity.validFrom ?? null,
        validTo: entity.validTo ?? null,
        version: entity.version ?? null,
        status: entity.status ?? null,
        ontologyVersion: baseline.ontologyVersion,
        dataVersion: baseline.dataVersion,
        scenarioId: baseline.scenario.id,
      })),
    });
    for (const relation of baseline.relations) {
      await transaction.run(`
MATCH (source:KnowledgeEntity {id: $sourceId}), (target:KnowledgeEntity {id: $targetId})
MERGE (source)-[edge:RELATED_TO {id: $id}]->(target)
SET edge.businessType = $businessType,
    edge.predicate = $predicate,
    edge.propertiesJson = $propertiesJson,
    edge.provenanceJson = $provenanceJson,
    edge.validFrom = $validFrom,
    edge.validTo = $validTo,
    edge.confidence = $confidence,
    edge.evidenceType = $evidenceType,
    edge.assertionType = $assertionType,
    edge.baselineId = $baselineId,
    edge.scenarioIds = CASE
      WHEN edge.scenarioIds IS NULL THEN [$scenarioId]
      WHEN $scenarioId IN edge.scenarioIds THEN edge.scenarioIds
      ELSE edge.scenarioIds + $scenarioId
    END`, {
        id: relation.id,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        businessType: relation.label ?? relation.predicate,
        predicate: relation.predicate,
        propertiesJson: JSON.stringify(relation.properties ?? {}),
        provenanceJson: JSON.stringify(relation.provenance ?? []),
        validFrom: relation.validFrom ?? null,
        validTo: relation.validTo ?? null,
        confidence: relation.confidence ?? null,
        evidenceType: relation.evidenceType ?? null,
        assertionType: relation.assertionType ?? "asserted",
        baselineId: baseline.baselineId,
        scenarioId: baseline.scenario.id,
      });
    }
  });
  console.info(JSON.stringify({ status: "applied", ...summary }, null, 2));
} finally {
  await session.close();
  await driver.close();
}
