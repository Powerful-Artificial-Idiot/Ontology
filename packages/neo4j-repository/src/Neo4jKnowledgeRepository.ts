import neo4j, { type Driver, type Node, type Relationship } from "neo4j-driver";
import type {
  ContractMetadata,
  GraphTraversalRequest,
  GraphTraversalResult,
  GraphViewRequest,
  GraphViewResponse,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRepository,
  OntologyGraphRequest,
  OntologyGraphResponse,
  SemanticCatalogResponse,
  SemanticSearchRequest,
  SemanticSearchResponse,
} from "../../knowledge-contracts/src/index";
import { NEO4J_READ_QUERIES, QUALITY_TRACE_TEMPLATE_ID } from "./queries";

export type Neo4jKnowledgeRepositoryOptions = {
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  driver?: Driver;
  contractVersion?: string;
  ontologyVersion?: string;
  dataVersion?: string;
};

export class Neo4jKnowledgeRepository implements KnowledgeRepository {
  private readonly driver: Driver;
  private readonly ownsDriver: boolean;
  private readonly database?: string;
  private readonly contractVersion: string;
  private readonly ontologyVersion: string;
  private readonly dataVersion: string;

  constructor(options: Neo4jKnowledgeRepositoryOptions = {}) {
    if (options.driver) {
      this.driver = options.driver;
      this.ownsDriver = false;
    } else {
      if (!options.password) throw new Error("MKG_NEO4J_PASSWORD is required for Neo4j repository mode.");
      this.driver = neo4j.driver(
        options.uri ?? "bolt://127.0.0.1:7687",
        neo4j.auth.basic(options.username ?? "neo4j", options.password),
        { disableLosslessIntegers: true },
      );
      this.ownsDriver = true;
    }
    this.database = options.database;
    this.contractVersion = options.contractVersion ?? "1.1.0";
    this.ontologyVersion = options.ontologyVersion ?? "1.1.0";
    this.dataVersion = options.dataVersion ?? "1.0.0";
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity({ database: this.database });
  }

  async close(): Promise<void> {
    if (this.ownsDriver) await this.driver.close();
  }

  async traverseGraph(request: GraphTraversalRequest): Promise<GraphTraversalResult> {
    assertTraversal(request);
    return this.withReadSession(async (session) => {
      const nodeResult = await session.run(NEO4J_READ_QUERIES.traverseQualityIssueNodes, {
        seedEntityIds: request.seedEntityIds,
        allowedRelationTypes: request.allowedRelationTypes,
        status: request.status ?? null,
        resultLimit: neo4j.int(request.resultLimit),
      });
      const entities = nodeResult.records.map((record) => decodeEntity(record.get("entity") as Node));
      const entityIds = entities.map((entity) => entity.id);
      const relationResult = entityIds.length
        ? await session.run(NEO4J_READ_QUERIES.relationsForEntities, { entityIds, allowedRelationTypes: request.allowedRelationTypes })
        : { records: [] };
      const relations = relationResult.records.map((record) => decodeRelation(
        record.get("sourceId") as string,
        record.get("relation") as Relationship,
        record.get("targetId") as string,
      ));
      return {
        metadata: this.metadata(),
        graphPlanId: request.graphPlanId,
        templateId: request.templateId,
        repositoryType: "neo4j",
        entities,
        relations,
      };
    });
  }

  async getEntityById(id: string): Promise<KnowledgeEntity | null> {
    return this.withReadSession(async (session) => {
      const result = await session.run(NEO4J_READ_QUERIES.entityById, { entityId: id });
      return result.records[0] ? decodeEntity(result.records[0].get("entity") as Node) : null;
    });
  }

  async getEntityRelations(id: string): Promise<KnowledgeRelation[]> {
    return this.withReadSession(async (session) => {
      const result = await session.run(NEO4J_READ_QUERIES.entityRelations, { entityId: id });
      return result.records.map((record) => decodeRelation(
        record.get("sourceId") as string,
        record.get("relation") as Relationship,
        record.get("targetId") as string,
      ));
    });
  }

  async getGraphView(_request: GraphViewRequest): Promise<GraphViewResponse> {
    throw new Neo4jRepositoryCapabilityError("Graph view projection is not part of the Phase 3B Neo4j pilot.");
  }

  async getOntologyGraph(_request: OntologyGraphRequest): Promise<OntologyGraphResponse> {
    throw new Neo4jRepositoryCapabilityError("Ontology registry retrieval is not part of the Phase 3B Neo4j pilot.");
  }

  async getSemanticCatalog(): Promise<SemanticCatalogResponse> {
    throw new Neo4jRepositoryCapabilityError("Semantic Catalog retrieval is not part of the Phase 3B Neo4j pilot.");
  }

  async searchSemantic(_request: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    throw new Neo4jRepositoryCapabilityError("Semantic search is not part of the Phase 3B Neo4j pilot.");
  }

  private withReadSession<T>(execute: (session: ReturnType<Driver["session"]>) => Promise<T>): Promise<T> {
    const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
    return execute(session).finally(() => session.close());
  }

  private metadata(): ContractMetadata {
    return {
      contractVersion: this.contractVersion,
      ontologyVersion: this.ontologyVersion,
      dataVersion: this.dataVersion,
      traceId: `neo4j-${Date.now()}`,
      generatedAt: new Date().toISOString(),
    };
  }
}

export class Neo4jRepositoryCapabilityError extends Error {
  readonly code = "CAPABILITY_NOT_IMPLEMENTED";

  constructor(message: string) {
    super(message);
    this.name = "Neo4jRepositoryCapabilityError";
  }
}

function assertTraversal(request: GraphTraversalRequest) {
  if (request.templateId !== QUALITY_TRACE_TEMPLATE_ID) throw new Error(`Neo4j query template is not allowlisted: ${request.templateId}`);
  if (request.readOnly !== true) throw new Error("Neo4j traversal requires readOnly=true.");
  if (request.maxDepth !== 2) throw new Error("The Phase 3B Neo4j template supports exactly maxDepth=2.");
  if (request.resultLimit < 1 || request.resultLimit > 200) throw new Error("Neo4j traversal resultLimit must be between 1 and 200.");
  if (!request.seedEntityIds.length || !request.allowedRelationTypes.length) throw new Error("Neo4j traversal requires seeds and allowed relationship types.");
  if (!request.allowedRelationTypes.every((value) => /^[A-Za-z][A-Za-z0-9.-]*$/u.test(value))) throw new Error("Neo4j traversal contains an invalid relationship type.");
}

function decodeEntity(node: Node): KnowledgeEntity {
  const properties = node.properties as Record<string, unknown>;
  return {
    id: requiredString(properties.id, "entity.id"),
    type: requiredString(properties.type, "entity.type"),
    label: requiredString(properties.label, "entity.label"),
    description: optionalString(properties.description),
    domain: optionalString(properties.domain),
    properties: parseJsonObject(properties.propertiesJson),
    source: parseJsonArray(properties.sourceJson),
    validFrom: optionalString(properties.validFrom),
    validTo: optionalString(properties.validTo),
    version: optionalString(properties.version),
    status: optionalString(properties.status),
  };
}

function decodeRelation(sourceId: string, relationship: Relationship, targetId: string): KnowledgeRelation {
  const properties = relationship.properties as Record<string, unknown>;
  return {
    id: requiredString(properties.id, "relation.id"),
    sourceId,
    targetId,
    predicate: requiredString(properties.predicate, "relation.predicate"),
    label: optionalString(properties.businessType),
    properties: parseJsonObject(properties.propertiesJson),
    provenance: parseJsonArray(properties.provenanceJson),
    validFrom: optionalString(properties.validFrom),
    validTo: optionalString(properties.validTo),
    confidence: typeof properties.confidence === "number" ? properties.confidence : undefined,
    evidenceType: optionalString(properties.evidenceType),
    assertionType: properties.assertionType === "asserted" || properties.assertionType === "inferred" ? properties.assertionType : undefined,
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Neo4j record is missing ${field}.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Neo4j JSON property must contain an object.");
  return parsed as Record<string, unknown>;
}

function parseJsonArray<T>(value: unknown): T[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Neo4j JSON property must contain an array.");
  return parsed as T[];
}
