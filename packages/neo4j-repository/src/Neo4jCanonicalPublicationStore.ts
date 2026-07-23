import neo4j, { type Driver, type ManagedTransaction } from "neo4j-driver";
import type { CanonicalMutation, PublicationResult, PublicationStageResult, PublicationVerificationResult } from "../../knowledge-contracts/src/index";
import type { InspectableCanonicalPublicationStore } from "../../source-sync/src/publication";
import { sha256 } from "../../source-sync/src/checksum";

const WRITE_ENTITY = `
MERGE (n:SynchronizedKnowledgeEntity {id: $canonicalId, tenantId: $tenantId})
ON CREATE SET n.createdAt = datetime()
SET n.type = $canonicalType, n.domainId = $domainId, n.version = $proposedVersion,
    n.contentHash = $contentHash, n.propertiesJson = $propertiesJson,
    n.lifecycleAction = $kind, n.active = $active, n.updatedAt = datetime()
RETURN n.id AS id`;

const WRITE_RELATION = `
MATCH (source:SynchronizedKnowledgeEntity {id: $sourceId, tenantId: $tenantId})
MATCH (target:SynchronizedKnowledgeEntity {id: $targetId, tenantId: $tenantId})
MERGE (source)-[r:SYNCHRONIZED_RELATION {id: $canonicalId}]->(target)
SET r.predicate = $predicate, r.businessLabel = $label, r.domainId = $domainId,
    r.version = $proposedVersion, r.contentHash = $contentHash,
    r.propertiesJson = $propertiesJson, r.lifecycleAction = $kind,
    r.active = $active, r.updatedAt = datetime()
RETURN r.id AS id`;

const READ_CURRENT = `
OPTIONAL MATCH (n:SynchronizedKnowledgeEntity {id: $canonicalId, tenantId: $tenantId})
RETURN n.version AS entityVersion, n.contentHash AS entityHash, n.lifecycleAction AS lifecycleAction, n.active AS active
UNION
OPTIONAL MATCH (:SynchronizedKnowledgeEntity {tenantId: $tenantId})-[r:SYNCHRONIZED_RELATION {id: $canonicalId}]->(:SynchronizedKnowledgeEntity {tenantId: $tenantId})
RETURN r.version AS entityVersion, r.contentHash AS entityHash, r.lifecycleAction AS lifecycleAction, r.active AS active`;

const VERIFY_MUTATION = `
// governed publication verification
OPTIONAL MATCH (n:SynchronizedKnowledgeEntity {id: $canonicalId, tenantId: $tenantId})
RETURN n.version AS entityVersion, n.contentHash AS entityHash, n.lifecycleAction AS lifecycleAction, n.active AS active
UNION
OPTIONAL MATCH (:SynchronizedKnowledgeEntity {tenantId: $tenantId})-[r:SYNCHRONIZED_RELATION {id: $canonicalId}]->(:SynchronizedKnowledgeEntity {tenantId: $tenantId})
RETURN r.version AS entityVersion, r.contentHash AS entityHash, r.lifecycleAction AS lifecycleAction, r.active AS active`;

const LIST_PUBLISHED = `
MATCH (n:SynchronizedKnowledgeEntity)
RETURN n.id AS canonicalId, n.tenantId AS tenantId, n.domainId AS domainId,
       n.type AS canonicalType, n.version AS proposedVersion, n.contentHash AS contentHash,
       n.lifecycleAction AS kind, n.propertiesJson AS propertiesJson,
       null AS sourceId, null AS targetId, null AS predicate, null AS label
UNION ALL
MATCH (source:SynchronizedKnowledgeEntity)-[r:SYNCHRONIZED_RELATION]->(target:SynchronizedKnowledgeEntity)
RETURN r.id AS canonicalId, source.tenantId AS tenantId, r.domainId AS domainId,
       null AS canonicalType, r.version AS proposedVersion, r.contentHash AS contentHash,
       coalesce(r.lifecycleAction, 'relation-upsert') AS kind, r.propertiesJson AS propertiesJson,
       source.id AS sourceId, target.id AS targetId, r.predicate AS predicate, r.businessLabel AS label`;

export type Neo4jCanonicalPublicationStoreOptions = {
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  driver?: Driver;
  authDisabled?: boolean;
  maximumWriteCount?: number;
  allowedTypes: string[];
  allowedPredicates: string[];
};

export class Neo4jCanonicalPublicationStore implements InspectableCanonicalPublicationStore {
  readonly target = "neo4j" as const;
  private readonly driver: Driver;
  private readonly ownsDriver: boolean;
  private readonly database?: string;
  private readonly staged = new Map<string, CanonicalMutation[]>();

  constructor(private readonly options: Neo4jCanonicalPublicationStoreOptions) {
    if (options.driver) {
      this.driver = options.driver;
      this.ownsDriver = false;
    } else {
      if (!options.authDisabled && !options.password) throw new Error("MKG_NEO4J_PASSWORD is required for authenticated Neo4j publication.");
      const authentication = options.authDisabled ? undefined : neo4j.auth.basic(options.username ?? "neo4j", options.password!);
      this.driver = neo4j.driver(options.uri ?? "bolt://127.0.0.1:7687", authentication, { disableLosslessIntegers: true });
      this.ownsDriver = true;
    }
    this.database = options.database;
  }

  async close(): Promise<void> { if (this.ownsDriver) await this.driver.close(); }

  async stage(runId: string, mutations: CanonicalMutation[]): Promise<PublicationStageResult> {
    if (mutations.length > (this.options.maximumWriteCount ?? 1_000)) throw new Error("PUBLICATION_WRITE_LIMIT_EXCEEDED");
    const unique = new Map<string, CanonicalMutation>();
    for (const mutation of mutations) {
      validateMutation(mutation, this.options.allowedTypes, this.options.allowedPredicates);
      if (unique.has(mutation.canonicalId)) throw new Error("DUPLICATE_CANONICAL_MUTATION");
      unique.set(mutation.canonicalId, structuredClone(mutation));
    }
    const values = [...unique.values()];
    this.staged.set(runId, values);
    return { runId, staged: values.length, stageHash: hash(values) };
  }

  async publish(runId: string): Promise<PublicationResult> {
    const staged = this.staged.get(runId);
    if (!staged) throw new Error("PUBLICATION_NOT_STAGED");
    const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.WRITE });
    try {
      const published = await session.executeWrite(async (transaction) => {
        let count = 0;
        for (const mutation of staged) if (await publishMutation(transaction, mutation)) count += 1;
        return count;
      });
      return { runId, published, publicationHash: hash(staged) };
    } finally {
      await session.close();
    }
  }

  async verify(runId: string): Promise<PublicationVerificationResult> {
    const staged = this.staged.get(runId) ?? [];
    const issues: string[] = [];
    const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
    try {
      for (const mutation of staged) {
        const result = await session.run(VERIFY_MUTATION, { canonicalId: mutation.canonicalId, tenantId: mutation.tenantId });
        const expectedActive = !["deactivate", "supersede", "expire"].includes(mutation.kind);
        const matched = result.records.some((record) => record.get("entityVersion") === mutation.proposedVersion && record.get("entityHash") === mutation.contentHash && record.get("lifecycleAction") === mutation.kind && record.get("active") === expectedActive);
        if (!matched) issues.push(`Missing or mismatched mutation: ${mutation.canonicalId}`);
      }
    } finally {
      await session.close();
    }
    return { runId, verified: issues.length === 0, verifiedCount: staged.length - issues.length, verificationHash: hash(staged), issues };
  }

  async listPublished(): Promise<CanonicalMutation[]> {
    const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(LIST_PUBLISHED, {});
      return result.records.map((record) => ({
        id: `mutation.${String(record.get("canonicalId"))}.${String(record.get("proposedVersion"))}`,
        kind: String(record.get("kind")) as CanonicalMutation["kind"],
        tenantId: String(record.get("tenantId")),
        domainId: String(record.get("domainId")),
        canonicalId: String(record.get("canonicalId")),
        canonicalType: optional(record.get("canonicalType")),
        relation: record.get("sourceId") ? { sourceId: String(record.get("sourceId")), targetId: String(record.get("targetId")), predicate: String(record.get("predicate")), label: optional(record.get("label")) } : undefined,
        proposedVersion: String(record.get("proposedVersion")),
        contentHash: String(record.get("contentHash")),
        properties: parseObject(record.get("propertiesJson")),
      }));
    } finally {
      await session.close();
    }
  }
}

async function publishMutation(transaction: ManagedTransaction, mutation: CanonicalMutation): Promise<boolean> {
  const current = await transaction.run(READ_CURRENT, { canonicalId: mutation.canonicalId, tenantId: mutation.tenantId });
  const existing = current.records.find((record) => record.get("entityVersion"));
  const version = existing?.get("entityVersion") as string | undefined;
  const contentHash = existing?.get("entityHash") as string | undefined;
  const expectedActive = !["deactivate", "supersede", "expire"].includes(mutation.kind);
  const lifecycleMatches = existing?.get("lifecycleAction") === mutation.kind && existing?.get("active") === expectedActive;
  if (mutation.expectedCurrentVersion && version && version !== mutation.expectedCurrentVersion) throw new Error("PUBLICATION_VERSION_CONFLICT");
  if (version === mutation.proposedVersion && contentHash !== mutation.contentHash) throw new Error("SAME_VERSION_HASH_CONFLICT");
  if (version === mutation.proposedVersion && contentHash === mutation.contentHash && lifecycleMatches) return false;
  const parameters = {
    canonicalId: mutation.canonicalId, tenantId: mutation.tenantId, domainId: mutation.domainId,
    canonicalType: mutation.canonicalType ?? "Relation", proposedVersion: mutation.proposedVersion,
    contentHash: mutation.contentHash, propertiesJson: JSON.stringify(mutation.properties), kind: mutation.kind,
    active: expectedActive, sourceId: mutation.relation?.sourceId,
    targetId: mutation.relation?.targetId, predicate: mutation.relation?.predicate, label: mutation.relation?.label ?? null,
  };
  const isRelation = Boolean(mutation.relation);
  const result = await transaction.run(isRelation ? WRITE_RELATION : WRITE_ENTITY, parameters);
  if (!result.records.length) throw new Error(isRelation ? "RELATION_ENDPOINT_MISSING" : "PUBLICATION_WRITE_FAILED");
  return true;
}

function validateMutation(mutation: CanonicalMutation, types: string[], predicates: string[]): void {
  if (!/^[-a-z0-9.]+$/u.test(mutation.canonicalId) || !mutation.tenantId || !mutation.domainId || !mutation.proposedVersion || !/^sha256:[a-f0-9]{64}$/u.test(mutation.contentHash)) throw new Error("CANONICAL_MUTATION_INVALID");
  if (mutation.kind === "entity-upsert" && (!mutation.canonicalType || !types.includes(mutation.canonicalType))) throw new Error("CANONICAL_TYPE_DENIED");
  if ((mutation.kind === "relation-upsert" || mutation.relation) && (!mutation.relation || !predicates.includes(mutation.relation.predicate) || mutation.relation.sourceId === mutation.relation.targetId)) throw new Error("RELATION_MUTATION_INVALID");
  if ((mutation.kind as string) === "delete") throw new Error("PERMANENT_DELETE_DISABLED");
}

function hash(value: unknown): string { return sha256(JSON.stringify(value)); }
function optional(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function parseObject(value: unknown): Record<string, unknown> { if (typeof value !== "string") return {}; const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }

export const NEO4J_PUBLICATION_QUERIES = Object.freeze({ WRITE_ENTITY, WRITE_RELATION, READ_CURRENT, VERIFY_MUTATION, LIST_PUBLISHED });
