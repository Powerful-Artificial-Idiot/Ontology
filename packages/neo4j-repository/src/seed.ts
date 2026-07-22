import neo4j, { type Driver } from "neo4j-driver";
import { leakRateQualityIssueTraceBaseline } from "../../demo-data/src/index";
import { NEO4J_SEED_QUERIES } from "./queries";

export async function seedLeakRateCanonicalBaseline(driver: Driver, database?: string): Promise<void> {
  const baseline = leakRateQualityIssueTraceBaseline;
  const session = driver.session({ database });
  try {
    await session.run(NEO4J_SEED_QUERIES.constraint);
    await session.executeWrite(async (transaction) => {
      await transaction.run(NEO4J_SEED_QUERIES.clearBaseline, { baselineId: baseline.baselineId });
      await transaction.run(NEO4J_SEED_QUERIES.entities, {
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
        })),
      });
      await transaction.run(NEO4J_SEED_QUERIES.relations, {
        relations: baseline.relations.map((relation) => ({
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
        })),
      });
    });
  } finally {
    await session.close();
  }
}

export type Neo4jSeedOptions = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

export async function seedLeakRateCanonicalBaselineWithCredentials(options: Neo4jSeedOptions): Promise<void> {
  const driver = neo4j.driver(options.uri, neo4j.auth.basic(options.username, options.password), { disableLosslessIntegers: true });
  try {
    await driver.verifyConnectivity({ database: options.database });
    await seedLeakRateCanonicalBaseline(driver, options.database);
  } finally {
    await driver.close();
  }
}
