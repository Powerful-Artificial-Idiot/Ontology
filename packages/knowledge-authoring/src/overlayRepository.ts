import type {
  GraphTraversalRequest,
  GraphTraversalResult,
  GraphViewRequest,
  GraphViewResponse,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRepository,
  OntologyGraphRequest,
  SemanticSearchRequest,
} from "../../knowledge-contracts/src/index";

export type PublishedKnowledgeSnapshot = { entities: KnowledgeEntity[]; relations: KnowledgeRelation[] };

export class PublishedKnowledgeOverlayRepository implements KnowledgeRepository {
  constructor(private readonly base: KnowledgeRepository, private readonly published: () => Promise<PublishedKnowledgeSnapshot>) {}

  async getEntityById(id: string): Promise<KnowledgeEntity | null> {
    const snapshot = await this.published();
    return snapshot.entities.find((entity) => entity.id === id) ?? this.base.getEntityById(id);
  }

  async getEntityRelations(id: string): Promise<KnowledgeRelation[]> {
    const [base, snapshot] = await Promise.all([this.base.getEntityRelations(id), this.published()]);
    return mergeRelations(base, snapshot.relations.filter((relation) => relation.sourceId === id || relation.targetId === id));
  }

  async getRelationById(id: string): Promise<KnowledgeRelation | null> {
    const snapshot = await this.published();
    return snapshot.relations.find((relation) => relation.id === id) ?? await this.base.getRelationById?.(id) ?? null;
  }

  async traverseGraph(request: GraphTraversalRequest): Promise<GraphTraversalResult> {
    const [result, snapshot] = await Promise.all([this.base.traverseGraph(request), this.published()]);
    const ids = new Set(result.entities.map((entity) => entity.id));
    const related = snapshot.relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId));
    related.forEach((relation) => { ids.add(relation.sourceId); ids.add(relation.targetId); });
    return {
      ...result,
      entities: mergeEntities(result.entities, snapshot.entities.filter((entity) => ids.has(entity.id))).slice(0, request.resultLimit),
      relations: mergeRelations(result.relations, related),
    };
  }

  async getGraphView(request: GraphViewRequest): Promise<GraphViewResponse> {
    const [result, snapshot] = await Promise.all([this.base.getGraphView(request), this.published()]);
    return { ...result, entities: mergeEntities(result.entities, snapshot.entities), relations: mergeRelations(result.relations, snapshot.relations) };
  }

  getOntologyGraph(request: OntologyGraphRequest) { return this.base.getOntologyGraph(request); }
  getSemanticCatalog() { return this.base.getSemanticCatalog(); }
  searchSemantic(request: SemanticSearchRequest) { return this.base.searchSemantic(request); }
}

function mergeEntities(base: KnowledgeEntity[], overlay: KnowledgeEntity[]): KnowledgeEntity[] {
  const values = new Map(base.map((entity) => [entity.id, entity]));
  overlay.forEach((entity) => values.set(entity.id, entity));
  return [...values.values()];
}
function mergeRelations(base: KnowledgeRelation[], overlay: KnowledgeRelation[]): KnowledgeRelation[] {
  const values = new Map(base.map((relation) => [relation.id, relation]));
  overlay.forEach((relation) => values.set(relation.id, relation));
  return [...values.values()];
}
