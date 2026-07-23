import type {
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
import type { GovernedSyncStore } from "./types";

export class SynchronizedKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly delegate: KnowledgeRepository, private readonly syncStore: GovernedSyncStore) {}

  async traverseGraph(request: GraphTraversalRequest): Promise<GraphTraversalResult> {
    const base = await this.delegate.traverseGraph(request);
    const snapshot = await this.syncStore.getSnapshot();
    const tombstonedIds = new Set(snapshot.entities.filter((item) => !active(item)).map((item) => item.id));
    const synchronized = new Map(snapshot.entities.filter(active).map((item) => [item.id, item as KnowledgeEntity]));
    const entities = base.entities.filter((entity) => !tombstonedIds.has(entity.id)).map((entity) => synchronized.get(entity.id) ?? entity);
    const entityIds = new Set(entities.map((entity) => entity.id));
    const relations = mergeRelations(base.relations.filter((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)), snapshot.relations.filter((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)));
    return { ...base, entities, relations };
  }

  async getGraphView(request: GraphViewRequest): Promise<GraphViewResponse> {
    const base = await this.delegate.getGraphView(request);
    const snapshot = await this.syncStore.getSnapshot();
    const tombstonedIds = new Set(snapshot.entities.filter((item) => !active(item)).map((item) => item.id));
    const synchronized = new Map(snapshot.entities.filter(active).map((item) => [item.id, item as KnowledgeEntity]));
    const entities = base.entities.filter((entity) => !tombstonedIds.has(entity.id)).map((entity) => synchronized.get(entity.id) ?? entity);
    const entityIds = new Set(entities.map((entity) => entity.id));
    const nodes = base.nodes.filter((node) => entityIds.has(node.entityId));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const relations = mergeRelations(base.relations.filter((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)), snapshot.relations.filter((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)));
    return { ...base, entities, nodes, relations, edges: base.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)) };
  }

  async getEntityById(id: string): Promise<KnowledgeEntity | null> {
    const base = await this.delegate.getEntityById(id);
    if (!base) return null;
    const item = (await this.syncStore.getSnapshot()).entities.find((entity) => entity.id === id);
    if (item) return active(item) ? item : null;
    return base;
  }

  getOntologyGraph(request: OntologyGraphRequest): Promise<OntologyGraphResponse> {
    return this.delegate.getOntologyGraph(request);
  }

  getSemanticCatalog(): Promise<SemanticCatalogResponse> {
    return this.delegate.getSemanticCatalog();
  }

  searchSemantic(request: SemanticSearchRequest): Promise<SemanticSearchResponse> {
    return this.delegate.searchSemantic(request);
  }

  async getEntityRelations(id: string): Promise<KnowledgeRelation[]> {
    const snapshot = await this.syncStore.getSnapshot();
    const tombstonedIds = new Set(snapshot.entities.filter((item) => !active(item)).map((item) => item.id));
    if (tombstonedIds.has(id)) return [];
    const base = (await this.delegate.getEntityRelations(id)).filter((relation) => !tombstonedIds.has(relation.sourceId) && !tombstonedIds.has(relation.targetId));
    const synchronized = snapshot.relations.filter((relation) => (relation.sourceId === id || relation.targetId === id) && !tombstonedIds.has(relation.sourceId) && !tombstonedIds.has(relation.targetId));
    return mergeRelations(base, synchronized);
  }
}

function active(entity: { status?: string }): boolean {
  return entity.status !== "tombstoned";
}

function mergeRelations(base: KnowledgeRelation[], synchronized: KnowledgeRelation[]): KnowledgeRelation[] {
  const result = new Map(base.map((item) => [item.id, item]));
  synchronized.forEach((item) => result.set(item.id, item));
  return [...result.values()];
}
