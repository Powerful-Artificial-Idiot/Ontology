import type {
  ContractMetadata,
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

export type HttpKnowledgeRepositoryOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  expectedVersions?: {
    contractMajor: number;
    ontologyVersion: string;
    dataVersion: string;
  };
};

export class KnowledgeApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "KnowledgeApiError";
  }
}

export class HttpKnowledgeRepository implements KnowledgeRepository {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly expectedVersions: NonNullable<HttpKnowledgeRepositoryOptions["expectedVersions"]>;

  constructor(options: HttpKnowledgeRepositoryOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.expectedVersions = options.expectedVersions ?? { contractMajor: 1, ontologyVersion: "1.1.0", dataVersion: "0.5.0" };
  }

  getGraphView(request: GraphViewRequest) {
    return this.get<GraphViewResponse>(`/graph/views/${request.viewId}`, request);
  }

  async getEntityById(id: string) {
    try {
      return await this.get<KnowledgeEntity | null>(`/entities/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof KnowledgeApiError && error.status === 404 && error.code === "ENTITY_NOT_FOUND") return null;
      throw error;
    }
  }

  getOntologyGraph(request: OntologyGraphRequest) {
    return this.get<OntologyGraphResponse>("/ontology/graph", request);
  }

  getSemanticCatalog() {
    return this.get<SemanticCatalogResponse>("/semantic/catalog");
  }

  searchSemantic(request: SemanticSearchRequest) {
    return this.send<SemanticSearchResponse>("/semantic/search", request);
  }

  getEntityRelations(id: string) {
    return this.get<KnowledgeRelation[]>(`/entities/${encodeURIComponent(id)}/relations`);
  }

  private async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const url = this.resolveUrl(path);
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    return this.request<T>(url.toString());
  }

  private send<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(this.resolveUrl(path).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private resolveUrl(path: string) {
    const origin = globalThis.location?.origin ?? "http://127.0.0.1";
    return new URL(`${this.baseUrl}${path}`, origin);
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new KnowledgeApiError(`Knowledge API request timed out after ${this.timeoutMs} ms.`, "TIMEOUT");
      throw new KnowledgeApiError(error instanceof Error ? error.message : "Knowledge API network request failed.", "NETWORK_ERROR");
    } finally {
      globalThis.clearTimeout(timeout);
    }

    const payload = await parseJson(response);
    if (!response.ok) {
      const apiError = readApiError(payload);
      throw new KnowledgeApiError(apiError.message ?? `Knowledge API request failed with status ${response.status}.`, apiError.code ?? "HTTP_ERROR", response.status, apiError.details);
    }
    this.assertCompatiblePayload(payload);
    return payload as T;
  }

  private assertCompatiblePayload(payload: unknown) {
    if (!isRecord(payload) || !isRecord(payload.metadata)) return;
    const metadata = payload.metadata as ContractMetadata;
    const contractMajor = Number(String(metadata.contractVersion).split(".")[0]);
    if (contractMajor !== this.expectedVersions.contractMajor
      || metadata.ontologyVersion !== this.expectedVersions.ontologyVersion
      || metadata.dataVersion !== this.expectedVersions.dataVersion) {
      throw new KnowledgeApiError(
        `Knowledge payload version mismatch: contract ${metadata.contractVersion}, ontology ${metadata.ontologyVersion}, data ${metadata.dataVersion}.`,
        "VERSION_MISMATCH",
        409,
        { expected: this.expectedVersions, received: metadata },
      );
    }
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new KnowledgeApiError("Knowledge API returned invalid JSON.", "INVALID_JSON", response.status);
  }
}

function readApiError(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return { details: {} };
  return {
    code: typeof payload.error.code === "string" ? payload.error.code : undefined,
    message: typeof payload.error.message === "string" ? payload.error.message : undefined,
    details: isRecord(payload.error.details) ? payload.error.details : {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
