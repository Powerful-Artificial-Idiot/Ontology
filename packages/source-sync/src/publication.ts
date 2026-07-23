import type {
  CanonicalMutation,
  DocumentPublicationResult,
  DocumentPublicationStageResult,
  DocumentPublicationVerificationResult,
  GovernedDocumentChange,
  PublicationResult,
  PublicationStageResult,
  PublicationVerificationResult,
} from "../../knowledge-contracts/src/index";
import { sha256 } from "./checksum";
import { AtomicJsonFile, clone } from "./persistence";

export interface CanonicalPublicationStore {
  readonly target: "mock" | "neo4j";
  stage(runId: string, mutations: CanonicalMutation[]): Promise<PublicationStageResult>;
  publish(runId: string): Promise<PublicationResult>;
  verify(runId: string): Promise<PublicationVerificationResult>;
}

export interface InspectableCanonicalPublicationStore extends CanonicalPublicationStore {
  listPublished(): Promise<CanonicalMutation[]>;
}

export interface DocumentPublicationStore {
  readonly target: "document-registry";
  stage(runId: string, documentChanges: GovernedDocumentChange[]): Promise<DocumentPublicationStageResult>;
  publish(runId: string): Promise<DocumentPublicationResult>;
  verify(runId: string): Promise<DocumentPublicationVerificationResult>;
}

export class MockCanonicalPublicationStore implements InspectableCanonicalPublicationStore {
  readonly target = "mock" as const;
  protected staged = new Map<string, CanonicalMutation[]>();
  protected published = new Map<string, CanonicalMutation>();
  constructor(private readonly options: { maximumWriteCount?: number; allowedTypes?: string[]; allowedPredicates?: string[] } = {}) {}

  async stage(runId: string, mutations: CanonicalMutation[]): Promise<PublicationStageResult> {
    if (mutations.length > (this.options.maximumWriteCount ?? 1_000)) throw new Error("PUBLICATION_WRITE_LIMIT_EXCEEDED");
    const unique = new Map<string, CanonicalMutation>();
    for (const mutation of mutations) {
      validateCanonicalMutation(mutation, this.options);
      const existing = this.published.get(mutation.canonicalId);
      if (existing && existing.tenantId !== mutation.tenantId) throw new Error("CROSS_TENANT_PUBLICATION_DENIED");
      if (existing && mutation.expectedCurrentVersion && existing.proposedVersion !== mutation.expectedCurrentVersion) throw new Error("PUBLICATION_VERSION_CONFLICT");
      if (existing?.proposedVersion === mutation.proposedVersion && existing.contentHash !== mutation.contentHash) throw new Error("SAME_VERSION_HASH_CONFLICT");
      if (existing?.proposedVersion === mutation.proposedVersion && existing.contentHash === mutation.contentHash) continue;
      unique.set(mutation.canonicalId, clone(mutation));
    }
    const values = [...unique.values()];
    this.staged.set(runId, values);
    return { runId, staged: values.length, stageHash: hash(values) };
  }

  async publish(runId: string): Promise<PublicationResult> {
    const staged = this.staged.get(runId);
    if (!staged) throw new Error("PUBLICATION_NOT_STAGED");
    const next = new Map(this.published);
    staged.forEach((mutation) => next.set(mutation.canonicalId, clone(mutation)));
    this.published = next;
    return { runId, published: staged.length, publicationHash: hash(staged) };
  }

  async verify(runId: string): Promise<PublicationVerificationResult> {
    const staged = this.staged.get(runId) ?? [];
    const issues = staged.filter((item) => this.published.get(item.canonicalId)?.contentHash !== item.contentHash).map((item) => `Missing or mismatched mutation: ${item.canonicalId}`);
    return { runId, verified: issues.length === 0, verifiedCount: staged.length - issues.length, verificationHash: hash(staged), issues };
  }

  async listPublished(): Promise<CanonicalMutation[]> { return [...this.published.values()].map(clone); }
}

export class MockDocumentPublicationStore implements DocumentPublicationStore {
  readonly target = "document-registry" as const;
  protected staged = new Map<string, GovernedDocumentChange[]>();
  protected published = new Map<string, GovernedDocumentChange>();
  constructor(private readonly maximumWriteCount = 1_000) {}

  async stage(runId: string, changes: GovernedDocumentChange[]): Promise<DocumentPublicationStageResult> {
    if (changes.length > this.maximumWriteCount) throw new Error("DOCUMENT_PUBLICATION_WRITE_LIMIT_EXCEEDED");
    const unique = new Map<string, GovernedDocumentChange>();
    for (const change of changes) {
      validateDocumentChange(change);
      const key = `${change.documentId}|${change.version}`;
      const existing = this.published.get(key);
      if (existing && existing.tenantId !== change.tenantId) throw new Error("CROSS_TENANT_PUBLICATION_DENIED");
      if (existing && existing.contentHash !== change.contentHash) throw new Error("DOCUMENT_SAME_VERSION_HASH_CONFLICT");
      if (!existing) unique.set(key, clone(change));
    }
    const values = [...unique.values()];
    this.staged.set(runId, values);
    return { runId, staged: values.length, stageHash: hash(values) };
  }

  async publish(runId: string): Promise<DocumentPublicationResult> {
    const staged = this.staged.get(runId);
    if (!staged) throw new Error("DOCUMENT_PUBLICATION_NOT_STAGED");
    const next = new Map(this.published);
    staged.forEach((change) => next.set(`${change.documentId}|${change.version}`, clone(change)));
    this.published = next;
    return { runId, published: staged.length, publicationHash: hash(staged) };
  }

  async verify(runId: string): Promise<DocumentPublicationVerificationResult> {
    const staged = this.staged.get(runId) ?? [];
    const issues = staged.filter((item) => this.published.get(`${item.documentId}|${item.version}`)?.contentHash !== item.contentHash).map((item) => `Missing or mismatched document: ${item.documentId}`);
    return { runId, verified: issues.length === 0, verifiedCount: staged.length - issues.length, verificationHash: hash(staged), issues };
  }

  async listPublished(): Promise<GovernedDocumentChange[]> { return [...this.published.values()].map(clone); }
}

type DocumentFile = { schemaVersion: "1.0.0"; documents: GovernedDocumentChange[] };
export class FileDocumentPublicationStore extends MockDocumentPublicationStore {
  private readonly file: AtomicJsonFile<DocumentFile>;
  constructor(path: string) { super(); this.file = new AtomicJsonFile(path, validateDocumentFile, () => ({ schemaVersion: "1.0.0", documents: [] })); }
  async initialize(): Promise<void> { const value = await this.file.initialize(); this.published = new Map(value.documents.map((item) => [`${item.documentId}|${item.version}`, clone(item)])); }
  override async publish(runId: string): Promise<DocumentPublicationResult> { const result = await super.publish(runId); await this.file.write({ schemaVersion: "1.0.0", documents: await this.listPublished() }); return result; }
}

function validateCanonicalMutation(mutation: CanonicalMutation, options: { allowedTypes?: string[]; allowedPredicates?: string[] }): void {
  if (!mutation.id || !mutation.canonicalId || !mutation.tenantId || !mutation.domainId || !mutation.proposedVersion || !/^sha256:[a-f0-9]{64}$/u.test(mutation.contentHash)) throw new Error("CANONICAL_MUTATION_INVALID");
  if (mutation.kind === "entity-upsert" && (!mutation.canonicalType || (options.allowedTypes && !options.allowedTypes.includes(mutation.canonicalType)))) throw new Error("CANONICAL_TYPE_DENIED");
  if (mutation.kind === "relation-upsert") {
    if (!mutation.relation?.sourceId || !mutation.relation.targetId || !mutation.relation.predicate) throw new Error("RELATION_MUTATION_INVALID");
    if (options.allowedPredicates && !options.allowedPredicates.includes(mutation.relation.predicate)) throw new Error("RELATION_TYPE_DENIED");
  }
  if ((mutation.kind as string) === "delete") throw new Error("PERMANENT_DELETE_DISABLED");
}

function validateDocumentChange(change: GovernedDocumentChange): void {
  if (change.approvalStatus !== "approved") throw new Error("DOCUMENT_NOT_APPROVED");
  if (change.lifecycleStatus !== "effective") throw new Error("DOCUMENT_NOT_EFFECTIVE");
  if (!/^sha256:[a-f0-9]{64}$/u.test(change.contentHash)) throw new Error("DOCUMENT_HASH_INVALID");
  if (!change.locator || change.locator.startsWith("/") || change.locator.includes("..")) throw new Error("DOCUMENT_LOCATOR_INVALID");
}

function hash(value: unknown): string { return sha256(JSON.stringify(value)); }
function validateDocumentFile(value: unknown): DocumentFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Document publication store is corrupt.");
  const item = value as Partial<DocumentFile>;
  if (item.schemaVersion !== "1.0.0" || !Array.isArray(item.documents)) throw new Error("Document publication store schema is invalid.");
  return clone(item as DocumentFile);
}
