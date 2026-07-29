import type { Driver } from "neo4j-driver";
import neo4j from "neo4j-driver";
import type {
  AuthoringPublicationResult,
  AuthoringStageResult,
  AuthoringVerificationResult,
  KnowledgeChangeSet,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRepository,
} from "../../knowledge-contracts/src/index";
import { clone } from "../../source-sync/src/index";
import { getAuthoringRelation } from "./catalog";
import { stableHash } from "./hash";

export interface KnowledgeAuthoringPublicationStore {
  readonly target: "mock" | "neo4j";
  stage(changeSet: KnowledgeChangeSet): Promise<AuthoringStageResult>;
  publish(changeSetId: string): Promise<AuthoringPublicationResult>;
  verify(changeSetId: string): Promise<AuthoringVerificationResult>;
}

export interface InspectableKnowledgeAuthoringPublicationStore extends KnowledgeAuthoringPublicationStore {
  listPublished(): Promise<{ entities: KnowledgeEntity[]; relations: KnowledgeRelation[] }>;
}

type AuthoringReadRepository = Pick<KnowledgeRepository, "getEntityById" | "getEntityRelations"> & Pick<KnowledgeRepository, "getRelationById">;
type StagedPublication = { changeSet: KnowledgeChangeSet; entities: KnowledgeEntity[]; relations: KnowledgeRelation[]; deactivatedRelations: KnowledgeRelation[] };

export class MockKnowledgeAuthoringPublicationStore implements InspectableKnowledgeAuthoringPublicationStore {
  readonly target = "mock" as const;
  protected readonly staged = new Map<string, StagedPublication>();
  protected readonly entities = new Map<string, KnowledgeEntity>();
  protected readonly relations = new Map<string, KnowledgeRelation>();

  constructor(private readonly repository: AuthoringReadRepository, private readonly maximumWriteCount = 100) {}

  async stage(changeSet: KnowledgeChangeSet): Promise<AuthoringStageResult> {
    const staged = await preparePublication(changeSet, {
      getEntityById: async (id) => this.entities.get(id) ?? await this.repository.getEntityById(id),
      getEntityRelations: (id) => this.repository.getEntityRelations(id),
      getRelationById: async (id) => this.relations.get(id) ?? await this.repository.getRelationById?.(id) ?? null,
    }, this.maximumWriteCount);
    this.staged.set(changeSet.id, clone(staged));
    return { changeSetId: changeSet.id, stagedMutationCount: staged.entities.length + staged.relations.length + staged.deactivatedRelations.length, stageHash: stableHash(staged) };
  }

  async publish(changeSetId: string): Promise<AuthoringPublicationResult> {
    const staged = this.staged.get(changeSetId);
    if (!staged) throw new Error("AUTHORING_PUBLICATION_NOT_STAGED");
    const nextEntities = new Map(this.entities);
    const nextRelations = new Map(this.relations);
    staged.entities.forEach((entity) => nextEntities.set(entity.id, clone(entity)));
    staged.relations.forEach((relation) => nextRelations.set(relation.id, clone(relation)));
    staged.deactivatedRelations.forEach((relation) => nextRelations.set(relation.id, clone(relation)));
    this.entities.clear();
    this.relations.clear();
    nextEntities.forEach((entity, id) => this.entities.set(id, entity));
    nextRelations.forEach((relation, id) => this.relations.set(id, relation));
    return {
      changeSetId,
      status: "published",
      target: this.target,
      publishedEntityIds: staged.entities.map((entity) => entity.id),
      publishedRelationIds: [...staged.relations, ...staged.deactivatedRelations].map((relation) => relation.id),
      publicationHash: stableHash(staged),
      publishedAt: new Date().toISOString(),
      issues: [],
    };
  }

  async verify(changeSetId: string): Promise<AuthoringVerificationResult> {
    const staged = this.staged.get(changeSetId);
    if (!staged) throw new Error("AUTHORING_PUBLICATION_NOT_STAGED");
    const issues = [
      ...staged.entities.filter((entity) => stableHash(this.entities.get(entity.id)) !== stableHash(entity)).map((entity) => `Entity verification failed: ${entity.id}`),
      ...staged.relations.filter((relation) => stableHash(this.relations.get(relation.id)) !== stableHash(relation)).map((relation) => `Relation verification failed: ${relation.id}`),
      ...staged.deactivatedRelations.filter((relation) => this.relations.get(relation.id)?.status !== "inactive").map((relation) => `Relation deactivation verification failed: ${relation.id}`),
    ];
    return {
      changeSetId,
      verified: issues.length === 0,
      verifiedEntityIds: staged.entities.filter((entity) => this.entities.has(entity.id)).map((entity) => entity.id),
      verifiedRelationIds: [...staged.relations, ...staged.deactivatedRelations].filter((relation) => this.relations.has(relation.id)).map((relation) => relation.id),
      verificationHash: stableHash(staged),
      issues,
    };
  }

  async listPublished(): Promise<{ entities: KnowledgeEntity[]; relations: KnowledgeRelation[] }> {
    return { entities: [...this.entities.values()].map(clone), relations: [...this.relations.values()].map(clone) };
  }
}

export type Neo4jAuthoringPublicationOptions = {
  driver: Driver;
  repository: AuthoringReadRepository;
  database?: string;
  maximumWriteCount?: number;
};

export class Neo4jKnowledgeAuthoringPublicationStore implements KnowledgeAuthoringPublicationStore {
  readonly target = "neo4j" as const;
  private readonly staged = new Map<string, StagedPublication>();

  constructor(private readonly options: Neo4jAuthoringPublicationOptions) {}

  async stage(changeSet: KnowledgeChangeSet): Promise<AuthoringStageResult> {
    const staged = await preparePublication(changeSet, this.options.repository, this.options.maximumWriteCount ?? 100);
    this.staged.set(changeSet.id, staged);
    return { changeSetId: changeSet.id, stagedMutationCount: staged.entities.length + staged.relations.length + staged.deactivatedRelations.length, stageHash: stableHash(staged) };
  }

  async publish(changeSetId: string): Promise<AuthoringPublicationResult> {
    const staged = this.staged.get(changeSetId);
    if (!staged) throw new Error("AUTHORING_PUBLICATION_NOT_STAGED");
    const session = this.options.driver.session({ database: this.options.database, defaultAccessMode: neo4j.session.WRITE });
    try {
      await session.executeWrite(async (transaction) => {
        if (staged.entities.length) await transaction.run(NEO4J_AUTHORING_QUERIES.entities, { entities: staged.entities.map((entity) => encodeEntity(entity, staged.changeSet)) });
        if (staged.relations.length) await transaction.run(NEO4J_AUTHORING_QUERIES.relations, { relations: staged.relations.map((relation) => encodeRelation(relation, staged.changeSet)) });
        if (staged.deactivatedRelations.length) await transaction.run(NEO4J_AUTHORING_QUERIES.deactivateRelations, { relations: staged.deactivatedRelations.map((relation) => encodeRelation(relation, staged.changeSet)) });
      });
      return {
        changeSetId,
        status: "published",
        target: this.target,
        publishedEntityIds: staged.entities.map((entity) => entity.id),
        publishedRelationIds: [...staged.relations, ...staged.deactivatedRelations].map((relation) => relation.id),
        publicationHash: stableHash(staged),
        publishedAt: new Date().toISOString(),
        issues: [],
      };
    } finally {
      await session.close();
    }
  }

  async verify(changeSetId: string): Promise<AuthoringVerificationResult> {
    const staged = this.staged.get(changeSetId);
    if (!staged) throw new Error("AUTHORING_PUBLICATION_NOT_STAGED");
    const session = this.options.driver.session({ database: this.options.database, defaultAccessMode: neo4j.session.READ });
    try {
      const entityResult = await session.run(NEO4J_AUTHORING_QUERIES.verifyEntities, { entityIds: staged.entities.map((entity) => entity.id) });
      const relationResult = await session.run(NEO4J_AUTHORING_QUERIES.verifyRelations, { relationIds: staged.relations.map((relation) => relation.id) });
      const deactivatedResult = await session.run(NEO4J_AUTHORING_QUERIES.verifyInactiveRelations, { relationIds: staged.deactivatedRelations.map((relation) => relation.id) });
      const entityIds = entityResult.records.map((record) => String(record.get("id")));
      const relationIds = relationResult.records.map((record) => String(record.get("id")));
      const deactivatedIds = deactivatedResult.records.map((record) => String(record.get("id")));
      const issues = [
        ...staged.entities.filter((entity) => !entityIds.includes(entity.id)).map((entity) => `Entity verification failed: ${entity.id}`),
        ...staged.relations.filter((relation) => !relationIds.includes(relation.id)).map((relation) => `Relation verification failed: ${relation.id}`),
        ...staged.deactivatedRelations.filter((relation) => !deactivatedIds.includes(relation.id)).map((relation) => `Relation deactivation verification failed: ${relation.id}`),
      ];
      return { changeSetId, verified: issues.length === 0, verifiedEntityIds: entityIds, verifiedRelationIds: [...relationIds, ...deactivatedIds], verificationHash: stableHash({ entityIds, relationIds, deactivatedIds }), issues };
    } finally {
      await session.close();
    }
  }
}

export const NEO4J_AUTHORING_QUERIES = {
  entities: `
UNWIND $entities AS row
MERGE (entity:KnowledgeEntity {id: row.id})
SET entity.type = row.type,
    entity.label = row.label,
    entity.description = row.description,
    entity.domain = row.domain,
    entity.propertiesJson = row.propertiesJson,
    entity.sourceJson = row.sourceJson,
    entity.version = row.version,
    entity.status = row.status,
    entity.tenantId = row.tenantId,
    entity.authoringChangeSetId = row.changeSetId,
    entity.authoringPublishedAt = row.publishedAt`,
  relations: `
UNWIND $relations AS row
MATCH (source:KnowledgeEntity {id: row.sourceId})
MATCH (target:KnowledgeEntity {id: row.targetId})
MERGE (source)-[relation:RELATED_TO {id: row.id}]->(target)
SET relation.businessType = row.businessType,
    relation.predicate = row.predicate,
    relation.propertiesJson = row.propertiesJson,
    relation.provenanceJson = row.provenanceJson,
    relation.assertionType = 'asserted',
    relation.version = row.version,
    relation.status = row.status,
    relation.tenantId = row.tenantId,
    relation.authoringChangeSetId = row.changeSetId`,
  deactivateRelations: `
UNWIND $relations AS row
MATCH ()-[relation:RELATED_TO {id: row.id}]->()
SET relation.version = row.version,
    relation.status = 'inactive',
    relation.validTo = row.validTo,
    relation.propertiesJson = row.propertiesJson,
    relation.authoringChangeSetId = row.changeSetId`,
  verifyEntities: `MATCH (entity:KnowledgeEntity) WHERE entity.id IN $entityIds RETURN entity.id AS id ORDER BY id`,
  verifyRelations: `MATCH ()-[relation:RELATED_TO]->() WHERE relation.id IN $relationIds RETURN relation.id AS id ORDER BY id`,
  verifyInactiveRelations: `MATCH ()-[relation:RELATED_TO]->() WHERE relation.id IN $relationIds AND relation.status = 'inactive' RETURN relation.id AS id ORDER BY id`,
} as const;

async function preparePublication(changeSet: KnowledgeChangeSet, repository: AuthoringReadRepository, maximumWriteCount: number): Promise<StagedPublication> {
  const count = changeSet.entityMutations.length + changeSet.relationMutations.length;
  if (count > maximumWriteCount) throw new Error("AUTHORING_PUBLICATION_WRITE_LIMIT_EXCEEDED");
  const publishedAt = new Date().toISOString();
  const entities: KnowledgeEntity[] = [];
  for (const mutation of changeSet.entityMutations) {
    const existing = await repository.getEntityById(mutation.canonicalId);
    if (mutation.operation === "create") {
      entities.push({
        id: mutation.canonicalId,
        type: mutation.canonicalType,
        label: requiredLabel(mutation.properties),
        description: optionalText(mutation.properties.description),
        domain: changeSet.domain,
        properties: withoutCoreProperties(mutation.properties),
        source: [{ sourceType: "manual-authoring", sourceId: changeSet.id, sourceSystem: "Knowledge Authoring", recordedAt: publishedAt }],
        version: mutation.proposedVersion,
        status: optionalText(mutation.properties.status) ?? "active",
      });
    } else if (mutation.operation === "update") {
      if (!existing) throw new Error(`AUTHORING_PUBLICATION_TARGET_MISSING:${mutation.canonicalId}`);
      entities.push(mergeEntity(existing, mutation.changedProperties, mutation.proposedVersion, changeSet.id, publishedAt));
    } else {
      if (!existing) throw new Error(`AUTHORING_PUBLICATION_TARGET_MISSING:${mutation.canonicalId}`);
      entities.push({ ...existing, version: mutation.proposedVersion, status: "inactive", properties: { ...existing.properties, deactivationReason: mutation.reason } });
    }
  }
  const relations: KnowledgeRelation[] = [];
  const deactivatedRelations: KnowledgeRelation[] = [];
  for (const mutation of changeSet.relationMutations) {
    if (mutation.operation === "create") {
      const option = getAuthoringRelation(mutation.relationType);
      if (!option) throw new Error(`AUTHORING_RELATION_NOT_ALLOWLISTED:${mutation.relationType}`);
      relations.push({
        id: mutation.canonicalId,
        sourceId: mutation.sourceCanonicalId,
        targetId: mutation.targetCanonicalId,
        predicate: option.ontologyIri,
        label: mutation.relationType,
        properties: mutation.properties ?? {},
        provenance: [{ sourceType: "manual-authoring", sourceId: changeSet.id, sourceSystem: "Knowledge Authoring", recordedAt: publishedAt }],
        assertionType: "asserted",
        version: mutation.proposedVersion,
        status: "active",
      });
    } else if (mutation.operation === "deactivate") {
      const existing = await repository.getRelationById?.(mutation.canonicalId);
      if (!existing) throw new Error(`AUTHORING_PUBLICATION_RELATION_MISSING:${mutation.canonicalId}`);
      deactivatedRelations.push({ ...existing, version: mutation.proposedVersion, status: "inactive", validTo: publishedAt, properties: { ...existing.properties, deactivationReason: mutation.reason } });
    } else {
      const existing = await repository.getRelationById?.(mutation.canonicalId);
      if (!existing) throw new Error(`AUTHORING_PUBLICATION_RELATION_MISSING:${mutation.canonicalId}`);
      relations.push({ ...existing, version: mutation.proposedVersion, properties: { ...existing.properties, ...mutation.changedProperties } });
    }
  }
  return { changeSet: clone(changeSet), entities, relations, deactivatedRelations };
}

function mergeEntity(existing: KnowledgeEntity, changed: Record<string, unknown>, version: string, changeSetId: string, publishedAt: string): KnowledgeEntity {
  return {
    ...existing,
    label: optionalText(changed.label) ?? existing.label,
    description: optionalText(changed.description) ?? existing.description,
    status: optionalText(changed.status) ?? existing.status,
    version,
    properties: { ...existing.properties, ...withoutCoreProperties(changed) },
    source: [...(existing.source ?? []), { sourceType: "manual-authoring", sourceId: changeSetId, sourceSystem: "Knowledge Authoring", recordedAt: publishedAt }],
  };
}

function requiredLabel(properties: Record<string, unknown>): string {
  const label = optionalText(properties.label);
  if (!label) throw new Error("AUTHORING_PUBLICATION_LABEL_REQUIRED");
  return label;
}

function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function withoutCoreProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !["label", "description", "status"].includes(key)));
}
function encodeEntity(entity: KnowledgeEntity, changeSet: KnowledgeChangeSet) {
  const authoringSource = entity.source?.find((source) => source.sourceType === "manual-authoring");
  return { id: entity.id, type: entity.type, label: entity.label, description: entity.description ?? null, domain: entity.domain ?? null, propertiesJson: JSON.stringify(entity.properties), sourceJson: JSON.stringify(entity.source ?? []), version: entity.version ?? null, status: entity.status ?? "active", tenantId: changeSet.tenantId, changeSetId: authoringSource?.sourceId ?? changeSet.id, publishedAt: authoringSource?.recordedAt ?? null };
}
function encodeRelation(relation: KnowledgeRelation, changeSet: KnowledgeChangeSet) {
  const authoringSource = relation.provenance?.find((source) => source.sourceType === "manual-authoring");
  return { id: relation.id, sourceId: relation.sourceId, targetId: relation.targetId, businessType: relation.label ?? relation.predicate, predicate: relation.predicate, propertiesJson: JSON.stringify(relation.properties ?? {}), provenanceJson: JSON.stringify(relation.provenance ?? []), version: relation.version ?? "1", status: relation.status ?? "active", validTo: relation.validTo ?? null, tenantId: changeSet.tenantId, changeSetId: authoringSource?.sourceId ?? changeSet.id };
}
