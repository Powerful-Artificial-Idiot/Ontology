import type {
  GraphViewRequest,
  GraphViewResponse,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRepository,
  OntologyGraphRequest,
  OntologyGraphResponse,
  SemanticSearchRequest,
  SemanticSearchResponse,
} from "../../knowledge-contracts/src/index";

export class HttpKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly baseUrl = "/api",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  getGraphView(request: GraphViewRequest) {
    return this.get<GraphViewResponse>(`/graph/views/${request.viewId}`, request);
  }

  getEntityById(id: string) {
    return this.get<KnowledgeEntity | null>(`/entities/${encodeURIComponent(id)}`);
  }

  getOntologyGraph(request: OntologyGraphRequest) {
    return this.get<OntologyGraphResponse>("/ontology/graph", request);
  }

  searchSemantic(request: SemanticSearchRequest) {
    return this.send<SemanticSearchResponse>("/semantic/search", request);
  }

  getEntityRelations(id: string) {
    return this.get<KnowledgeRelation[]>(`/entities/${encodeURIComponent(id)}/relations`);
  }

  private async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`, globalThis.location?.origin ?? "http://localhost");
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    return this.request<T>(url.toString());
  }

  private send<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(url, init);
    if (!response.ok) throw new Error(`Knowledge API request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }
}
