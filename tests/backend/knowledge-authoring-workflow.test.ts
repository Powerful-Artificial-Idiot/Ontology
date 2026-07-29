import { describe, expect, it } from "vitest";
import type { AgentAuthorizationContext, AuthoringApprovalPolicy, EntityMutation, KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
import {
  DEFAULT_AUTHORING_APPROVAL_POLICY,
  InMemoryKnowledgeAuthoringStore,
  KnowledgeAuthoringError,
  KnowledgeAuthoringService,
  KnowledgeAuthoringValidator,
  MockKnowledgeAuthoringPublicationStore,
  PublishedKnowledgeOverlayRepository,
} from "../../packages/knowledge-authoring/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("Phase 5E governed knowledge authoring", () => {
  it("requires three explicit audited transitions before publication", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft(input(operation("operation.op50", "OP50 Pack")), command("create"));
    await expect(runtime.service.publish(draft.id, command("direct"))).rejects.toMatchObject({ code: "INVALID_AUTHORING_STATE_TRANSITION" });
    const submitted = await runtime.service.submit(draft.id, command("submit"));
    const approved = await runtime.service.approve(draft.id, command("approve"));
    const published = await runtime.service.publish(draft.id, command("publish"));

    expect([submitted.status, approved.status, published.status]).toEqual(["submitted", "approved", "published"]);
    const actions = (await runtime.store.read()).auditEvents.map((event) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["AUTHORING_SUBMITTED", "AUTHORING_APPROVED", "AUTHORING_PUBLISHED"]));
    expect((await runtime.store.read()).provenanceRecords).toHaveLength(1);
  });

  it("keeps draft, submitted and approved knowledge outside repository reads", async () => {
    const runtime = await authoring();
    const overlay = new PublishedKnowledgeOverlayRepository(runtime.repository, () => runtime.publication.listPublished());
    const draft = await runtime.service.createDraft(input(operation("operation.op51", "OP51 Audit")), command("create-isolation"));
    expect(await overlay.getEntityById("operation.op51")).toBeNull();
    await runtime.service.submit(draft.id, command("submit-isolation"));
    expect(await overlay.getEntityById("operation.op51")).toBeNull();
    await runtime.service.approve(draft.id, command("approve-isolation"));
    expect(await overlay.getEntityById("operation.op51")).toBeNull();
    await runtime.service.publish(draft.id, command("publish-isolation"));
    expect(await overlay.getEntityById("operation.op51")).toMatchObject({ id: "operation.op51", version: "1.0" });
  });

  it("supports request changes, edit, revalidation and resubmission", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft(input(operation("machine.m230", "M230", "Machine")), command("create-m230"));
    await runtime.service.submit(draft.id, command("submit-m230"));
    const requested = await runtime.service.requestChanges(draft.id, command("request-m230", "Add a clearer description."));
    const edited = await runtime.service.updateDraft(draft.id, { description: "Revised governed machine change.", entityMutations: [operation("machine.m230", "M230 Leak Bench", "Machine")] }, command("edit-m230"));
    const resubmitted = await runtime.service.submit(draft.id, command("resubmit-m230"));
    expect([requested.status, edited.status, edited.revision, resubmitted.status]).toEqual(["changes-requested", "draft", "rev-2", "submitted"]);
  });

  it("rejects missing review comments and prevents rejected publication", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft(input(operation("operation.op52", "OP52")), command("create-reject"));
    await runtime.service.submit(draft.id, command("submit-reject"));
    await expect(runtime.service.reject(draft.id, command("reject-empty"))).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    const rejected = await runtime.service.reject(draft.id, command("reject", "Not aligned to the released route."));
    expect(rejected.status).toBe("rejected");
    await expect(runtime.service.publish(draft.id, command("publish-rejected"))).rejects.toMatchObject({ code: "INVALID_AUTHORING_STATE_TRANSITION" });
  });

  it("invalidates approval when approved content changes", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft(input(operation("operation.op53", "OP53")), command("create-invalidate"));
    await runtime.service.submit(draft.id, command("submit-invalidate"));
    await runtime.service.approve(draft.id, command("approve-invalidate"));
    const edited = await runtime.service.updateDraft(draft.id, { title: "Changed after approval" }, command("edit-approved"));
    expect(edited.status).toBe("draft");
    expect(edited.approvalContentHash).toBeUndefined();
    expect((await runtime.store.read()).auditEvents.some((event) => event.action === "AUTHORING_APPROVAL_INVALIDATED")).toBe(true);
  });

  it("replays the first idempotent result without duplicate audit", async () => {
    const runtime = await authoring();
    const first = await runtime.service.createDraft(input(operation("operation.op54", "OP54")), command("same-create"));
    const replay = await runtime.service.createDraft(input(operation("operation.op54", "OP54")), command("same-create"));
    expect(replay.id).toBe(first.id);
    expect((await runtime.store.read()).auditEvents.filter((event) => event.action === "AUTHORING_DRAFT_CREATED")).toHaveLength(1);
  });

  it("reports published and pending canonical IDs as unavailable", async () => {
    const runtime = await authoring();
    expect(await runtime.service.checkIdAvailability("Operation", "operation.op30", admin())).toMatchObject({ available: false, syntaxValid: true });
    expect(await runtime.service.checkIdAvailability("Operation", "operation.op98", admin())).toMatchObject({ available: true, syntaxValid: true });
    await runtime.service.createDraft(input(operation("operation.op98", "OP98")), command("availability-pending"));
    expect(await runtime.service.checkIdAvailability("Operation", "operation.op98", admin())).toMatchObject({ available: false, syntaxValid: true });
  });

  it("blocks invalid canonical IDs, missing required fields and source-owned fields", async () => {
    const runtime = await authoring();
    const invalid: EntityMutation = { operation: "create", canonicalId: "Operation.OP55", canonicalType: "Operation", proposedVersion: "1.0", properties: { label: "OP55", status: "active", owner: "Owner" }, ownershipMode: "manual" };
    const draft = await runtime.service.createDraft(input(invalid), command("invalid"));
    await expect(runtime.service.submit(draft.id, command("submit-invalid"))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const sourceOwned = await runtime.service.createDraft(input({ ...operation("operation.op56", "OP56"), properties: { ...operation("operation.op56", "OP56").properties, cycleTimeSeconds: 30 } }), command("source-owned"));
    await expect(runtime.service.submit(sourceOwned.id, command("submit-source-owned"))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const validation = await runtime.validator.validate(await runtime.store.getChangeSet(sourceOwned.id) as never);
    expect(validation.issues.some((issue) => issue.code === "SOURCE_OWNED_FIELD_NOT_EDITABLE")).toBe(true);
  });

  it("validates ontology relation type, direction and unknown references", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft({
      ...input(operation("operation.op57", "OP57")),
      relationMutations: [{ operation: "create", canonicalId: "relation.invalid", relationType: "relatedTo", sourceCanonicalId: "operation.op57", targetCanonicalId: "machine.m220", proposedVersion: "1.0" }],
    }, command("invalid-relation"));
    const validation = await runtime.validator.validate(await runtime.store.getChangeSet(draft.id) as never);
    expect(validation.issues.some((issue) => issue.code === "RELATION_TYPE_INVALID")).toBe(true);

    const direction = await runtime.service.createDraft({
      ...input(operation("machine.m231", "M231", "Machine")),
      relationMutations: [{ operation: "create", canonicalId: "relation.m231-controls", relationType: "controlsCharacteristic", sourceCanonicalId: "machine.m231", targetCanonicalId: "quality-characteristic.leak-rate", proposedVersion: "1.0" }],
    }, command("direction"));
    const directionValidation = await runtime.validator.validate(await runtime.store.getChangeSet(direction.id) as never);
    expect(directionValidation.issues.map((issue) => issue.code)).toContain("RELATION_DIRECTION_INVALID");
  });

  it("publishes a new entity and valid relation atomically", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft({
      title: "Create OP58 and M238",
      domain: "production",
      entityMutations: [operation("operation.op58", "OP58"), operation("machine.m238", "M238", "Machine")],
      relationMutations: [{ operation: "create", canonicalId: "relation.operation.op58.executed-by.machine.m238", relationType: "executedBy", sourceCanonicalId: "operation.op58", targetCanonicalId: "machine.m238", proposedVersion: "1.0" }],
    }, command("atomic-create"));
    await runtime.service.submit(draft.id, command("atomic-submit"));
    await runtime.service.approve(draft.id, command("atomic-approve"));
    await runtime.service.publish(draft.id, command("atomic-publish"));
    const snapshot = await runtime.publication.listPublished();
    expect(snapshot.entities.map((entity) => entity.id)).toEqual(expect.arrayContaining(["operation.op58", "machine.m238"]));
    expect(snapshot.relations.map((relation) => relation.id)).toContain("relation.operation.op58.executed-by.machine.m238");
  });

  it("updates and softly deactivates a published relation as independent revisions", async () => {
    const runtime = await authoring();
    const relationId = "relation.operation.op62.executed-by.machine.m262";
    const initial = await runtime.service.createDraft({
      title: "Create versioned relation",
      domain: "production",
      entityMutations: [operation("operation.op62", "OP62"), operation("machine.m262", "M262", "Machine")],
      relationMutations: [{ operation: "create", canonicalId: relationId, relationType: "executedBy", sourceCanonicalId: "operation.op62", targetCanonicalId: "machine.m262", proposedVersion: "1.0" }],
    }, command("relation-create"));
    await runtime.service.submit(initial.id, command("relation-create-submit"));
    await runtime.service.approve(initial.id, command("relation-create-approve"));
    await runtime.service.publish(initial.id, command("relation-create-publish"));

    const update = await runtime.service.createDraft({
      title: "Update relation annotation",
      domain: "production",
      relationMutations: [{ operation: "update", canonicalId: relationId, relationType: "executedBy", expectedCurrentVersion: "1.0", proposedVersion: "1.1", changedProperties: { annotation: "Validated pairing" } }],
    }, command("relation-update"));
    await runtime.service.submit(update.id, command("relation-update-submit"));
    await runtime.service.approve(update.id, command("relation-update-approve"));
    await runtime.service.publish(update.id, command("relation-update-publish"));
    expect((await runtime.publication.listPublished()).relations.find((relation) => relation.id === relationId)).toMatchObject({ version: "1.1", properties: { annotation: "Validated pairing" } });

    const deactivate = await runtime.service.createDraft({
      title: "Deactivate relation",
      domain: "production",
      relationMutations: [{ operation: "deactivate", canonicalId: relationId, relationType: "executedBy", expectedCurrentVersion: "1.1", proposedVersion: "1.2", reason: "Equipment reassigned" }],
    }, command("relation-deactivate"));
    await runtime.service.submit(deactivate.id, command("relation-deactivate-submit"));
    await runtime.service.approve(deactivate.id, command("relation-deactivate-approve"));
    await runtime.service.publish(deactivate.id, command("relation-deactivate-publish"));
    expect((await runtime.publication.listPublished()).relations.find((relation) => relation.id === relationId)).toMatchObject({ version: "1.2", status: "inactive", properties: { deactivationReason: "Equipment reassigned" } });
  });

  it("enforces production separation of duties when configured", async () => {
    const policy: AuthoringApprovalPolicy = { ...DEFAULT_AUTHORING_APPROVAL_POLICY, requireDistinctSubmitterAndApprover: true };
    const runtime = await authoring(policy);
    const draft = await runtime.service.createDraft(input(operation("operation.op59", "OP59")), command("sod-create"));
    await runtime.service.submit(draft.id, command("sod-submit"));
    await expect(runtime.service.approve(draft.id, command("sod-approve"))).rejects.toMatchObject({ code: "SEPARATION_OF_DUTIES_REQUIRED" });
  });

  it("allows only drafts to be permanently removed", async () => {
    const runtime = await authoring();
    const draft = await runtime.service.createDraft(input(operation("operation.op60", "OP60")), command("delete-create"));
    await runtime.service.deleteDraft(draft.id, command("delete-draft"));
    expect(await runtime.store.getChangeSet(draft.id)).toBeNull();
  });
});

async function authoring(policy?: AuthoringApprovalPolicy) {
  const repository: KnowledgeRepository = new MockKnowledgeRepository();
  const store = new InMemoryKnowledgeAuthoringStore();
  await store.initialize();
  const publication = new MockKnowledgeAuthoringPublicationStore(repository);
  const validationRepository = new PublishedKnowledgeOverlayRepository(repository, () => publication.listPublished());
  const validator = new KnowledgeAuthoringValidator({ repository: validationRepository, store });
  return { repository, store, publication, validator, service: new KnowledgeAuthoringService({ store, publication, validator, policy }) };
}

function operation(canonicalId: string, label: string, canonicalType = "Operation"): EntityMutation & { operation: "create" } {
  const codeKey = canonicalType === "Machine" ? "machineCode" : "operationCode";
  return { operation: "create", canonicalId, canonicalType, proposedVersion: "1.0", properties: { label, description: `${label} governed object`, status: "active", owner: "Manufacturing Knowledge Owner", [codeKey]: label.split(" ")[0] }, ownershipMode: "manual" };
}
function input(mutation: EntityMutation) { return { title: `Create ${mutation.canonicalId}`, domain: mutation.canonicalType === "QualityCharacteristic" ? "quality" : "production", entityMutations: [mutation], relationMutations: [] }; }
function command(key: string, comment?: string) { return { authorization: admin(), idempotencyKey: `test.${key}`, comment }; }
function admin(): AgentAuthorizationContext { return { principal: { id: "demo-admin", tenantId: "local-demo", roleIds: ["demo-knowledge-admin"], domainIds: ["*"], objectIds: ["*"], authenticationMethod: "none" }, authenticatedAt: "2026-07-29T00:00:00.000Z", requestId: "request.phase5e" }; }
