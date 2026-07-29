import { randomUUID } from "node:crypto";
import type {
  AgentAuthorizationContext,
  AgentSecurityAction,
  AuthoringApprovalPolicy,
  AuthoringAuditAction,
  AuthoringAuditEvent,
  AuthoringProvenanceRecord,
  EntityMutation,
  KnowledgeChangeSet,
  RelationMutation,
  SanitizedAuthorizationSnapshot,
} from "../../knowledge-contracts/src/index";
import { DefaultAgentAuthorizer } from "../../agent-security/src/index";
import { clone } from "../../source-sync/src/index";
import { authoringContentHash, KnowledgeAuthoringValidator } from "./validation";
import type { KnowledgeAuthoringPublicationStore } from "./publication";
import type { KnowledgeAuthoringState, KnowledgeAuthoringStore } from "./store";

export const DEFAULT_AUTHORING_APPROVAL_POLICY: AuthoringApprovalPolicy = {
  policyVersion: "phase-5e.1",
  requireSubmission: true,
  requireApproval: true,
  requirePublication: true,
  requireDistinctSubmitterAndApprover: false,
  requireDistinctApproverAndPublisher: false,
  requireValidationBeforeSubmit: true,
  requireRevalidationBeforeApprove: true,
  requireRevalidationBeforePublish: true,
};

export type CreateKnowledgeChangeSetInput = {
  title: string;
  description?: string;
  domain: string;
  entityMutations?: EntityMutation[];
  relationMutations?: RelationMutation[];
  expectedVersions?: Record<string, string>;
};

export type UpdateKnowledgeChangeSetInput = Partial<Pick<KnowledgeChangeSet, "title" | "description" | "entityMutations" | "relationMutations" | "expectedVersions">>;

export type WorkflowCommand = {
  authorization: AgentAuthorizationContext;
  idempotencyKey: string;
  comment?: string;
};

export type KnowledgeAuthoringServiceOptions = {
  store: KnowledgeAuthoringStore;
  validator: KnowledgeAuthoringValidator;
  publication: KnowledgeAuthoringPublicationStore;
  authorizer?: DefaultAgentAuthorizer;
  policy?: AuthoringApprovalPolicy;
  now?: () => Date;
};

export class KnowledgeAuthoringService {
  private readonly authorizer: DefaultAgentAuthorizer;
  private readonly policy: AuthoringApprovalPolicy;
  private readonly now: () => Date;

  constructor(private readonly options: KnowledgeAuthoringServiceOptions) {
    this.authorizer = options.authorizer ?? new DefaultAgentAuthorizer();
    this.policy = options.policy ?? DEFAULT_AUTHORING_APPROVAL_POLICY;
    this.now = options.now ?? (() => new Date());
  }

  async createDraft(input: CreateKnowledgeChangeSetInput, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    requireIdempotency(command.idempotencyKey);
    await this.authorize(command.authorization, "knowledge-authoring:edit", {
      id: "new-change-set",
      tenantId: command.authorization.principal.tenantId,
      domain: input.domain,
      ownerPrincipalId: command.authorization.principal.id,
    });
    return this.options.store.transact((state) => {
      const replay = findReplay(state, command.idempotencyKey, "create");
      if (replay) return { state, result: replay };
      const now = this.now().toISOString();
      const changeSet: KnowledgeChangeSet = {
        id: `knowledge-change-set.${randomUUID()}`,
        schemaVersion: "1.0.0",
        revision: "rev-1",
        tenantId: command.authorization.principal.tenantId,
        domain: input.domain,
        title: requiredText(input.title, "title"),
        description: optionalText(input.description),
        status: "draft",
        entityMutations: clone(input.entityMutations ?? []),
        relationMutations: clone(input.relationMutations ?? []),
        expectedVersions: clone(input.expectedVersions ?? {}),
        authorizationSnapshot: sanitizeAuthorization(command.authorization),
        createdBy: command.authorization.principal.id,
        createdAt: now,
        updatedAt: now,
      };
      state.changeSets.push(changeSet);
      appendAudit(state, changeSet, command.authorization.principal.id, "AUTHORING_DRAFT_CREATED", "completed", now);
      remember(state, command.idempotencyKey, "create", changeSet, now);
      return { state, result: changeSet };
    });
  }

  async checkIdAvailability(canonicalType: string, canonicalId: string, authorization: AgentAuthorizationContext) {
    await this.authorize(authorization, "knowledge-authoring:read", {
      id: canonicalId,
      tenantId: authorization.principal.tenantId,
      domain: undefined,
      ownerPrincipalId: authorization.principal.id,
    });
    return this.options.validator.checkCanonicalId(canonicalType, canonicalId, authorization.principal.tenantId);
  }

  async updateDraft(id: string, input: UpdateKnowledgeChangeSetInput, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const current = await this.requiredChangeSet(id);
    await this.authorize(command.authorization, "knowledge-authoring:edit", resource(current));
    return this.options.store.transact((state) => {
      const replay = findReplay(state, command.idempotencyKey, `update:${id}`);
      if (replay) return { state, result: replay };
      const changeSet = requiredFromState(state, id);
      if (!["draft", "changes-requested", "approved"].includes(changeSet.status)) throw workflowError("INVALID_AUTHORING_STATE_TRANSITION", `Cannot edit a ${changeSet.status} change set.`, 409);
      const now = this.now().toISOString();
      const wasApproved = changeSet.status === "approved";
      const next: KnowledgeChangeSet = {
        ...changeSet,
        ...definedFields(input),
        revision: nextRevision(changeSet.revision),
        status: "draft",
        updatedAt: now,
        validationResult: undefined,
        approvalRevision: undefined,
        approvalContentHash: undefined,
        approvedBy: undefined,
        approvedAt: undefined,
        approvalComment: undefined,
      };
      replaceChangeSet(state, next);
      if (wasApproved) appendAudit(state, next, command.authorization.principal.id, "AUTHORING_APPROVAL_INVALIDATED", "completed", now, "Content changed after approval.");
      appendAudit(state, next, command.authorization.principal.id, "AUTHORING_DRAFT_UPDATED", "completed", now);
      remember(state, command.idempotencyKey, `update:${id}`, next, now);
      return { state, result: next };
    });
  }

  async validate(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const current = await this.requiredChangeSet(id);
    await this.authorize(command.authorization, "knowledge-authoring:edit", resource(current));
    const validationResult = await this.options.validator.validate(current);
    return this.options.store.transact((state) => {
      const replay = findReplay(state, command.idempotencyKey, `validate:${id}`);
      if (replay) return { state, result: replay };
      const next = { ...requiredFromState(state, id), validationResult, updatedAt: this.now().toISOString() };
      replaceChangeSet(state, next);
      appendAudit(state, next, command.authorization.principal.id, "AUTHORING_VALIDATED", validationResult.valid ? "completed" : "failed", next.updatedAt);
      remember(state, command.idempotencyKey, `validate:${id}`, next, next.updatedAt);
      return { state, result: next };
    });
  }

  async submit(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    return this.transitionWithValidation(id, command, "knowledge-authoring:submit", ["draft", "changes-requested"], "submitted", "AUTHORING_SUBMITTED", (changeSet, now) => ({ ...changeSet, submittedBy: command.authorization.principal.id, submittedAt: now }));
  }

  async requestChanges(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const comment = requiredText(command.comment, "review comment");
    return this.transition(id, command, "knowledge-authoring:review", ["submitted"], "changes-requested", "AUTHORING_CHANGES_REQUESTED", (changeSet, now) => ({ ...changeSet, reviewedBy: command.authorization.principal.id, reviewedAt: now, reviewComment: comment }));
  }

  async reject(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const comment = requiredText(command.comment, "rejection reason");
    return this.transition(id, command, "knowledge-authoring:review", ["submitted", "changes-requested"], "rejected", "AUTHORING_REJECTED", (changeSet, now) => ({ ...changeSet, reviewedBy: command.authorization.principal.id, reviewedAt: now, reviewComment: comment }));
  }

  async approve(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const current = await this.requiredChangeSet(id);
    if (this.policy.requireDistinctSubmitterAndApprover && current.submittedBy === command.authorization.principal.id) throw workflowError("SEPARATION_OF_DUTIES_REQUIRED", "Approver must differ from submitter.", 403);
    return this.transitionWithValidation(id, command, "knowledge-authoring:approve", ["submitted"], "approved", "AUTHORING_APPROVED", (changeSet, now, hash) => ({
      ...changeSet,
      reviewedBy: command.authorization.principal.id,
      reviewedAt: now,
      approvedBy: command.authorization.principal.id,
      approvedAt: now,
      approvalComment: optionalText(command.comment),
      approvalRevision: changeSet.revision,
      approvalContentHash: hash,
    }));
  }

  async withdrawApproval(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    return this.transition(id, command, "knowledge-authoring:approve", ["approved"], "draft", "AUTHORING_APPROVAL_WITHDRAWN", (changeSet) => ({ ...changeSet, approvedBy: undefined, approvedAt: undefined, approvalComment: undefined, approvalRevision: undefined, approvalContentHash: undefined, validationResult: undefined }));
  }

  async withdraw(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const current = await this.requiredChangeSet(id);
    return current.status === "submitted"
      ? this.transition(id, command, "knowledge-authoring:submit", ["submitted"], "draft", "AUTHORING_WITHDRAWN")
      : this.transition(id, command, "knowledge-authoring:edit", ["draft", "changes-requested"], "withdrawn", "AUTHORING_WITHDRAWN");
  }

  async deleteDraft(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const current = await this.requiredChangeSet(id);
    await this.authorize(command.authorization, "knowledge-authoring:edit", resource(current));
    requireIdempotency(command.idempotencyKey);
    return this.options.store.transact((state) => {
      const operation = `delete:${id}`;
      const replay = findReplay(state, command.idempotencyKey, operation);
      if (replay) return { state, result: replay };
      const changeSet = requiredFromState(state, id);
      if (changeSet.status !== "draft") throw workflowError("INVALID_AUTHORING_STATE_TRANSITION", "Only an unsubmitted draft can be deleted.", 409);
      const now = this.now().toISOString();
      state.changeSets = state.changeSets.filter((candidate) => candidate.id !== id);
      appendAudit(state, changeSet, command.authorization.principal.id, "AUTHORING_DRAFT_DELETED", "completed", now);
      remember(state, command.idempotencyKey, operation, changeSet, now);
      return { state, result: changeSet };
    });
  }

  async publish(id: string, command: WorkflowCommand): Promise<KnowledgeChangeSet> {
    const current = await this.requiredChangeSet(id);
    await this.authorize(command.authorization, "knowledge-authoring:publish", resource(current));
    requireIdempotency(command.idempotencyKey);
    const state = await this.options.store.read();
    const replay = findReplay(state, command.idempotencyKey, `publish:${id}`);
    if (replay) return replay;
    if (current.status !== "approved") throw workflowError("INVALID_AUTHORING_STATE_TRANSITION", "Only an approved change set can be published.", 409);
    if (this.policy.requireDistinctApproverAndPublisher && current.approvedBy === command.authorization.principal.id) throw workflowError("SEPARATION_OF_DUTIES_REQUIRED", "Publisher must differ from approver.", 403);
    const validation = await this.options.validator.validate(current);
    if (!validation.valid) {
      if (validation.issues.some((issue) => issue.code === "VERSION_CONFLICT" || issue.code === "UNKNOWN_CANONICAL_REFERENCE")) {
        await this.invalidateApproval(current, command.authorization.principal.id, "Approval invalidated because the underlying canonical version or reference changed.");
      }
      throw workflowError("VALIDATION_FAILED", "Publication validation failed.", 422, validation.issues);
    }
    const contentHash = authoringContentHash(current);
    if (current.validationResult?.policyVersion !== validation.policyVersion) throw workflowError("APPROVAL_STALE", "Validation policy changed after approval.", 409);
    if (current.approvalRevision !== current.revision || current.approvalContentHash !== contentHash) throw workflowError("APPROVAL_STALE", "Approval no longer matches the current revision.", 409);
    const startedAt = this.now().toISOString();
    await this.options.store.transact((nextState) => {
      nextState.publicationJournals = nextState.publicationJournals.filter((journal) => journal.changeSetId !== id);
      nextState.publicationJournals.push({ changeSetId: id, state: "started", updatedAt: startedAt });
      appendAudit(nextState, current, command.authorization.principal.id, "AUTHORING_PUBLICATION_STARTED", "completed", startedAt);
      return { state: nextState, result: undefined };
    });
    try {
      await this.options.publication.stage(current);
      const publicationResult = await this.options.publication.publish(id);
      const verification = await this.options.publication.verify(id);
      if (!verification.verified) throw workflowError("PUBLICATION_VERIFICATION_FAILED", "Published knowledge could not be verified.", 500, verification.issues);
      const publishedAt = publicationResult.publishedAt ?? this.now().toISOString();
      return this.options.store.transact((nextState) => {
        const latest = requiredFromState(nextState, id);
        if (latest.revision !== current.revision || latest.status !== "approved") throw workflowError("APPROVAL_STALE", "Change set changed while publication was in progress.", 409);
        const result = { ...publicationResult, verificationHash: verification.verificationHash };
        const published: KnowledgeChangeSet = { ...latest, status: "published", publishedBy: command.authorization.principal.id, publishedAt, publicationResult: result, validationResult: validation, updatedAt: publishedAt };
        replaceChangeSet(nextState, published);
        nextState.publicationJournals = nextState.publicationJournals.filter((journal) => journal.changeSetId !== id);
        nextState.publicationJournals.push({ changeSetId: id, state: "verified", updatedAt: publishedAt });
        nextState.provenanceRecords.push(...buildProvenance(published, command.authorization.principal.id, this.policy.policyVersion));
        appendAudit(nextState, published, command.authorization.principal.id, "AUTHORING_PUBLISHED", "completed", publishedAt);
        remember(nextState, command.idempotencyKey, `publish:${id}`, published, publishedAt);
        return { state: nextState, result: published };
      });
    } catch (error) {
      const failedAt = this.now().toISOString();
      await this.options.store.transact((nextState) => {
        nextState.publicationJournals = nextState.publicationJournals.filter((journal) => journal.changeSetId !== id);
        nextState.publicationJournals.push({ changeSetId: id, state: "recovery-required", updatedAt: failedAt, message: safeError(error) });
        appendAudit(nextState, current, command.authorization.principal.id, "AUTHORING_PUBLICATION_FAILED", "failed", failedAt);
        return { state: nextState, result: undefined };
      });
      throw error;
    }
  }

  async get(id: string, authorization: AgentAuthorizationContext): Promise<KnowledgeChangeSet> {
    const changeSet = await this.requiredChangeSet(id);
    await this.authorize(authorization, "knowledge-authoring:read", resource(changeSet));
    return changeSet;
  }

  async list(authorization: AgentAuthorizationContext, domain?: string): Promise<KnowledgeChangeSet[]> {
    await this.authorize(authorization, "knowledge-authoring:read", { id: "list", tenantId: authorization.principal.tenantId, domain, ownerPrincipalId: authorization.principal.id });
    return this.options.store.listChangeSets({ tenantId: authorization.principal.tenantId, domain });
  }

  async diff(id: string, authorization: AgentAuthorizationContext) {
    const changeSet = await this.get(id, authorization);
    return this.options.validator.diff(changeSet);
  }

  async audit(id: string, authorization: AgentAuthorizationContext) {
    const changeSet = await this.get(id, authorization);
    await this.authorize(authorization, "knowledge-authoring:review", resource(changeSet));
    return (await this.options.store.read()).auditEvents.filter((event) => event.changeSetId === id);
  }

  private async transitionWithValidation(
    id: string,
    command: WorkflowCommand,
    action: AgentSecurityAction,
    allowed: KnowledgeChangeSet["status"][],
    status: KnowledgeChangeSet["status"],
    auditAction: AuthoringAuditAction,
    enhance?: (changeSet: KnowledgeChangeSet, now: string, contentHash: string) => KnowledgeChangeSet,
  ) {
    const current = await this.requiredChangeSet(id);
    await this.authorize(command.authorization, action, resource(current));
    const validation = await this.options.validator.validate(current);
    if (!validation.valid) throw workflowError("VALIDATION_FAILED", "Governed authoring validation failed.", 422, validation.issues);
    return this.transition(id, command, action, allowed, status, auditAction, (changeSet, now) => ({ ...(enhance?.(changeSet, now, validation.contentHash) ?? changeSet), validationResult: validation }));
  }

  private async transition(
    id: string,
    command: WorkflowCommand,
    action: AgentSecurityAction,
    allowed: KnowledgeChangeSet["status"][],
    status: KnowledgeChangeSet["status"],
    auditAction: AuthoringAuditAction,
    enhance?: (changeSet: KnowledgeChangeSet, now: string) => KnowledgeChangeSet,
  ): Promise<KnowledgeChangeSet> {
    requireIdempotency(command.idempotencyKey);
    const current = await this.requiredChangeSet(id);
    await this.authorize(command.authorization, action, resource(current));
    return this.options.store.transact((state) => {
      const operation = `${status}:${id}`;
      const replay = findReplay(state, command.idempotencyKey, operation);
      if (replay) return { state, result: replay };
      const changeSet = requiredFromState(state, id);
      if (!allowed.includes(changeSet.status)) throw workflowError("INVALID_AUTHORING_STATE_TRANSITION", `Cannot transition ${changeSet.status} to ${status}.`, 409);
      const now = this.now().toISOString();
      const next = { ...(enhance?.(changeSet, now) ?? changeSet), status, updatedAt: now };
      replaceChangeSet(state, next);
      appendAudit(state, next, command.authorization.principal.id, auditAction, "completed", now, command.comment);
      remember(state, command.idempotencyKey, operation, next, now);
      return { state, result: next };
    });
  }

  private async authorize(authorization: AgentAuthorizationContext, action: AgentSecurityAction, input: { id: string; tenantId: string; domain?: string; ownerPrincipalId: string }) {
    const decision = this.authorizer.authorize(authorization, action, { type: "knowledge-change-set", id: input.id, tenantId: input.tenantId, domainIds: input.domain ? [input.domain] : undefined, ownerPrincipalId: input.ownerPrincipalId });
    if (decision.decision !== "allowed") throw workflowError("AUTHORIZATION_DENIED", `Knowledge authoring access denied: ${decision.reasonCode}.`, 403);
  }

  private async requiredChangeSet(id: string): Promise<KnowledgeChangeSet> {
    const changeSet = await this.options.store.getChangeSet(id);
    if (!changeSet) throw workflowError("CHANGE_SET_NOT_FOUND", `Knowledge change set not found: ${id}.`, 404);
    return changeSet;
  }

  private async invalidateApproval(changeSet: KnowledgeChangeSet, actorId: string, reason: string): Promise<void> {
    await this.options.store.transact((state) => {
      const latest = requiredFromState(state, changeSet.id);
      if (latest.status !== "approved") return { state, result: undefined };
      const now = this.now().toISOString();
      const invalidated: KnowledgeChangeSet = { ...latest, status: "draft", approvedBy: undefined, approvedAt: undefined, approvalComment: undefined, approvalRevision: undefined, approvalContentHash: undefined, validationResult: undefined, updatedAt: now };
      replaceChangeSet(state, invalidated);
      appendAudit(state, invalidated, actorId, "AUTHORING_APPROVAL_INVALIDATED", "completed", now, reason);
      return { state, result: undefined };
    });
  }
}

export class KnowledgeAuthoringError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = "KnowledgeAuthoringError";
  }
}

function workflowError(code: string, message: string, status: number, details?: unknown) { return new KnowledgeAuthoringError(code, message, status, details); }
function requireIdempotency(value: string) { if (!value.trim() || value.length > 160) throw workflowError("IDEMPOTENCY_KEY_REQUIRED", "A bounded Idempotency-Key is required.", 400); }
function requiredText(value: string | undefined, field: string): string { const normalized = value?.trim(); if (!normalized) throw workflowError("REQUEST_INVALID", `${field} is required.`, 422); return normalized; }
function optionalText(value: string | undefined): string | undefined { const normalized = value?.trim(); return normalized || undefined; }
function sanitizeAuthorization(context: AgentAuthorizationContext): SanitizedAuthorizationSnapshot { return { principalId: context.principal.id, tenantId: context.principal.tenantId, roleIds: [...context.principal.roleIds], domainIds: [...context.principal.domainIds], objectIds: context.principal.objectIds ? [...context.principal.objectIds] : undefined, authenticationMethod: context.principal.authenticationMethod }; }
function resource(changeSet: KnowledgeChangeSet) { return { id: changeSet.id, tenantId: changeSet.tenantId, domain: changeSet.domain, ownerPrincipalId: changeSet.createdBy }; }
function requiredFromState(state: KnowledgeAuthoringState, id: string): KnowledgeChangeSet { const value = state.changeSets.find((changeSet) => changeSet.id === id); if (!value) throw workflowError("CHANGE_SET_NOT_FOUND", `Knowledge change set not found: ${id}.`, 404); return value; }
function replaceChangeSet(state: KnowledgeAuthoringState, changeSet: KnowledgeChangeSet) { state.changeSets = state.changeSets.filter((candidate) => candidate.id !== changeSet.id); state.changeSets.push(clone(changeSet)); }
function definedFields<T extends Record<string, unknown>>(value: T): Partial<T> { return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>; }
function nextRevision(revision: string): string { return `rev-${Number(revision.replace("rev-", "")) + 1}`; }
function findReplay(state: KnowledgeAuthoringState, key: string, operation: string): KnowledgeChangeSet | undefined { const existing = state.idempotencyRecords.find((record) => record.key === key); if (!existing) return undefined; if (existing.operation !== operation) throw workflowError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another operation.", 409); return clone(existing.result); }
function remember(state: KnowledgeAuthoringState, key: string, operation: string, result: KnowledgeChangeSet, recordedAt: string) { state.idempotencyRecords.push({ key, operation, changeSetId: result.id, result: clone(result), recordedAt }); }
function appendAudit(state: KnowledgeAuthoringState, changeSet: KnowledgeChangeSet, actorId: string, action: AuthoringAuditAction, outcome: AuthoringAuditEvent["outcome"], occurredAt: string, comment?: string) { state.auditEvents.push({ id: `authoring-audit.${randomUUID()}`, changeSetId: changeSet.id, action, actorId, tenantId: changeSet.tenantId, domain: changeSet.domain, occurredAt, outcome, comment: optionalText(comment), metadata: { revision: changeSet.revision, status: changeSet.status } }); }
function buildProvenance(changeSet: KnowledgeChangeSet, actorId: string, approvalPolicyVersion: string): AuthoringProvenanceRecord[] { const publishedAt = changeSet.publishedAt ?? new Date().toISOString(); return [...changeSet.entityMutations, ...changeSet.relationMutations].map((mutation) => ({ id: `authoring-provenance.${randomUUID()}`, changeSetId: changeSet.id, canonicalId: mutation.canonicalId, mutationType: mutation.operation, origin: "manual-authoring", actorId, tenantId: changeSet.tenantId, domain: changeSet.domain, beforeVersion: "expectedCurrentVersion" in mutation ? mutation.expectedCurrentVersion : undefined, afterVersion: mutation.proposedVersion, publishedAt, validationPolicyVersion: changeSet.validationResult?.policyVersion ?? "unknown", approvalPolicyVersion })); }
function safeError(error: unknown): string { return error instanceof Error ? error.message.slice(0, 240) : "Unknown publication failure"; }
