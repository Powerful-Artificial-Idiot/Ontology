import type {
  AuthoringAuditEvent,
  AuthoringDiff,
  AuthoringObjectTypeDefinition,
  AuthoringRelationOption,
  EntityMutation,
  KnowledgeChangeSet,
  RelationMutation,
} from "../../../packages/knowledge-contracts/src/index";

export type PublicKnowledgeChangeSet = Omit<KnowledgeChangeSet, "authorizationSnapshot">;
export type CanonicalIdAvailability = { canonicalId?: string; syntaxValid: boolean; available: boolean; issues: Array<{ code: string; message: string }> };

export class KnowledgeAuthoringClient {
  constructor(private readonly baseUrl = defaultBaseUrl(), private readonly bearerToken?: string) {}

  async getCatalog(): Promise<{ objectTypes: AuthoringObjectTypeDefinition[]; relationOptions: AuthoringRelationOption[] }> {
    const [types, relations] = await Promise.all([
      this.request<{ objectTypes: AuthoringObjectTypeDefinition[] }>("/object-types"),
      this.request<{ relationOptions: AuthoringRelationOption[] }>("/relation-options"),
    ]);
    return { objectTypes: types.objectTypes, relationOptions: relations.relationOptions };
  }

  async list(domain?: string): Promise<PublicKnowledgeChangeSet[]> {
    return (await this.request<{ changeSets: PublicKnowledgeChangeSet[] }>(`/change-sets${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`)).changeSets;
  }

  checkIdAvailability(type: string, input: { canonicalId?: string; label?: string }): Promise<CanonicalIdAvailability> {
    const query = new URLSearchParams({ type });
    if (input.canonicalId) query.set("canonicalId", input.canonicalId);
    if (input.label) query.set("label", input.label);
    return this.request(`/id-availability?${query.toString()}`);
  }

  create(input: { title: string; description?: string; domain: string; entityMutations: EntityMutation[]; relationMutations: RelationMutation[] }): Promise<PublicKnowledgeChangeSet> {
    return this.request("/change-sets", { method: "POST", body: input, idempotencyKey: key("create") });
  }

  update(id: string, input: { title?: string; description?: string; entityMutations?: EntityMutation[]; relationMutations?: RelationMutation[] }): Promise<PublicKnowledgeChangeSet> {
    return this.request(`/change-sets/${encodeURIComponent(id)}`, { method: "PATCH", body: input, idempotencyKey: key("update") });
  }

  action(id: string, action: "validate" | "submit" | "request-changes" | "reject" | "approve" | "withdraw-approval" | "publish" | "withdraw", comment?: string): Promise<PublicKnowledgeChangeSet> {
    return this.request(`/change-sets/${encodeURIComponent(id)}/${action}`, { method: "POST", body: { comment }, idempotencyKey: key(action) });
  }

  diff(id: string): Promise<AuthoringDiff> { return this.request(`/change-sets/${encodeURIComponent(id)}/diff`); }
  async audit(id: string): Promise<AuthoringAuditEvent[]> { return (await this.request<{ events: AuthoringAuditEvent[] }>(`/change-sets/${encodeURIComponent(id)}/audit`)).events; }

  private async request<T>(path: string, options: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Knowledge authoring request failed (${response.status}).`);
    return payload;
  }
}

function defaultBaseUrl(): string {
  if (import.meta.env.VITE_KNOWLEDGE_AUTHORING_API_BASE_URL) return import.meta.env.VITE_KNOWLEDGE_AUTHORING_API_BASE_URL;
  const agentBase = import.meta.env.VITE_AGENT_API_BASE_URL;
  return agentBase ? agentBase.replace(/\/api\/agent\/?$/u, "/api/knowledge-authoring") : "/api/knowledge-authoring";
}

function key(action: string): string {
  return `authoring-ui.${action}.${crypto.randomUUID()}`;
}
