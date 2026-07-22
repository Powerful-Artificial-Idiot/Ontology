import neo4j, { type Driver } from "neo4j-driver";
import { canonicalKnowledgeBaselines } from "../../demo-data/src/index";
import { NEO4J_SEED_QUERIES } from "./queries";

export async function seedCanonicalKnowledgeBaselines(driver: Driver, database?: string): Promise<void> {
  const baselines = canonicalKnowledgeBaselines;
  const entities = [...new Map(baselines.flatMap((baseline) => baseline.entities).map((entity) => [entity.id, entity])).values()];
  const relations = [...new Map(baselines.flatMap((baseline) => baseline.relations).map((relation) => [relation.id, relation])).values()];
  const entityScenarioIds = membershipById(baselines.flatMap((baseline) => baseline.entities.map((entity) => ({ id: entity.id, scenarioId: baseline.scenario.id }))));
  const relationScenarioIds = membershipById(baselines.flatMap((baseline) => baseline.relations.map((relation) => ({ id: relation.id, scenarioId: baseline.scenario.id }))));
  const baselineId = "canonical.phase-5b";
  const session = driver.session({ database });
  try {
    await session.run(NEO4J_SEED_QUERIES.constraint);
    await session.executeWrite(async (transaction) => {
      for (const existingBaselineId of [...baselines.map((baseline) => baseline.baselineId), baselineId]) {
        await transaction.run(NEO4J_SEED_QUERIES.clearBaseline, { baselineId: existingBaselineId });
      }
      await transaction.run(NEO4J_SEED_QUERIES.entities, {
        entities: entities.map((entity) => ({
          id: entity.id,
          baselineId,
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
          ontologyVersion: baselines[0]?.ontologyVersion ?? "1.1.0",
          dataVersion: baselines[0]?.dataVersion ?? "1.0.0",
          scenarioIds: entityScenarioIds.get(entity.id) ?? [],
        })),
      });
      await transaction.run(NEO4J_SEED_QUERIES.relations, {
        relations: relations.map((relation) => ({
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
          baselineId,
          scenarioIds: relationScenarioIds.get(relation.id) ?? [],
        })),
      });
    });
  } finally {
    await session.close();
  }
}

export const seedLeakRateCanonicalBaseline = seedCanonicalKnowledgeBaselines;

export type Neo4jSeedOptions = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

export async function seedCanonicalKnowledgeBaselinesWithCredentials(options: Neo4jSeedOptions): Promise<void> {
  const driver = neo4j.driver(options.uri, neo4j.auth.basic(options.username, options.password), { disableLosslessIntegers: true });
  try {
    await driver.verifyConnectivity({ database: options.database });
    await seedCanonicalKnowledgeBaselines(driver, options.database);
  } finally {
    await driver.close();
  }
}

export const seedLeakRateCanonicalBaselineWithCredentials = seedCanonicalKnowledgeBaselinesWithCredentials;

function membershipById(values: Array<{ id: string; scenarioId: string }>): Map<string, string[]> {
  const membership = new Map<string, Set<string>>();
  values.forEach(({ id, scenarioId }) => {
    const scenarioIds = membership.get(id) ?? new Set<string>();
    scenarioIds.add(scenarioId);
    membership.set(id, scenarioIds);
  });
  return new Map([...membership].map(([id, scenarioIds]) => [id, [...scenarioIds].sort()]));
}
