import type {
  AuthoringDiff,
  AuthoringFieldDefinition,
  AuthoringValidationIssue,
  AuthoringValidationResult,
  EntityMutation,
  KnowledgeChangeSet,
  KnowledgeEntity,
  KnowledgeRelation,
  KnowledgeRepository,
} from "../../knowledge-contracts/src/index";
import { getAuthoringRelation, getAuthoringType, mutationProperties, sourceOwnedFields } from "./catalog";
import { stableHash } from "./hash";
import type { KnowledgeAuthoringStore } from "./store";

export const AUTHORING_VALIDATION_POLICY_VERSION = "phase-5e.1";

export type KnowledgeAuthoringValidatorOptions = {
  repository: Pick<KnowledgeRepository, "getEntityById"> & Pick<KnowledgeRepository, "getRelationById">;
  store: KnowledgeAuthoringStore;
  resolveAlias?: (canonicalId: string) => string | undefined;
  now?: () => Date;
};

export class KnowledgeAuthoringValidator {
  private readonly now: () => Date;

  constructor(private readonly options: KnowledgeAuthoringValidatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async checkCanonicalId(canonicalType: string, canonicalId: string, tenantId: string): Promise<{
    available: boolean;
    syntaxValid: boolean;
    issues: AuthoringValidationIssue[];
  }> {
    const issues: AuthoringValidationIssue[] = [];
    const definition = getAuthoringType(canonicalType);
    if (!definition?.enabled) {
      issues.push(blocking("ONTOLOGY_TYPE_INVALID", `Type ${canonicalType} is not enabled for governed authoring.`, canonicalId));
      return { available: false, syntaxValid: false, issues };
    }
    const syntaxValid = new RegExp(`^${escapeRegExp(definition.idPrefix)}\\.[a-z0-9]+(?:[.-][a-z0-9]+)*$`, "u").test(canonicalId);
    if (!syntaxValid) {
      issues.push(blocking("CANONICAL_ID_INVALID", `Canonical ID must use the ${definition.idPrefix}. prefix and lowercase stable segments.`, canonicalId));
      return { available: false, syntaxValid, issues };
    }
    const [existing, pending] = await Promise.all([
      this.options.repository.getEntityById(canonicalId),
      this.options.store.listChangeSets({ tenantId }),
    ]);
    if (existing || pending.some((changeSet) => !["rejected", "withdrawn"].includes(changeSet.status) && changeSet.entityMutations.some((mutation) => mutation.operation === "create" && mutation.canonicalId === canonicalId))) {
      issues.push(blocking("CANONICAL_ID_ALREADY_EXISTS", "Canonical ID already exists in published or pending knowledge.", canonicalId));
    }
    const alias = this.options.resolveAlias?.(canonicalId);
    if (alias && alias !== canonicalId) issues.push(blocking("CANONICAL_ID_ALIAS_CONFLICT", `Canonical ID conflicts with alias for ${alias}.`, canonicalId));
    return { available: issues.length === 0, syntaxValid, issues };
  }

  async validate(changeSet: KnowledgeChangeSet): Promise<AuthoringValidationResult> {
    const issues: AuthoringValidationIssue[] = [];
    const proposedTypes = new Map(changeSet.entityMutations.map((mutation) => [mutation.canonicalId, mutation.canonicalType]));
    const pending = (await this.options.store.listChangeSets({ tenantId: changeSet.tenantId }))
      .filter((candidate) => candidate.id !== changeSet.id && !["rejected", "withdrawn"].includes(candidate.status));
    const pendingIds = new Set(pending.flatMap((candidate) => candidate.entityMutations.filter((mutation) => mutation.operation === "create").map((mutation) => mutation.canonicalId)));
    const pendingRelationIds = new Set(pending.flatMap((candidate) => candidate.relationMutations.filter((mutation) => mutation.operation === "create").map((mutation) => mutation.canonicalId)));
    const localIds = new Set<string>();
    const localRelationIds = new Set<string>();

    for (const mutation of changeSet.entityMutations) {
      const definition = getAuthoringType(mutation.canonicalType);
      if (!definition?.enabled) {
        issues.push(blocking("ONTOLOGY_TYPE_INVALID", `Type ${mutation.canonicalType} is not enabled for governed authoring.`, mutation.canonicalId));
        continue;
      }
      if (!new RegExp(`^${escapeRegExp(definition.idPrefix)}\\.[a-z0-9]+(?:[.-][a-z0-9]+)*$`, "u").test(mutation.canonicalId)) {
        issues.push(blocking("CANONICAL_ID_INVALID", `Canonical ID must use the ${definition.idPrefix}. prefix and lowercase stable segments.`, mutation.canonicalId));
      }
      const existing = await this.options.repository.getEntityById(mutation.canonicalId);
      if (mutation.operation === "create") {
        if (localIds.has(mutation.canonicalId)) issues.push(blocking("CANONICAL_ID_ALREADY_EXISTS", "Canonical ID is duplicated within this change set.", mutation.canonicalId));
        localIds.add(mutation.canonicalId);
        if (existing || pendingIds.has(mutation.canonicalId)) issues.push(blocking("CANONICAL_ID_ALREADY_EXISTS", "Canonical ID already exists in published or pending knowledge.", mutation.canonicalId));
        const alias = this.options.resolveAlias?.(mutation.canonicalId);
        if (alias && alias !== mutation.canonicalId) issues.push(blocking("CANONICAL_ID_ALIAS_CONFLICT", `Canonical ID conflicts with alias for ${alias}.`, mutation.canonicalId));
      } else {
        validateExistingMutation(mutation, existing, issues);
      }
      validateRequiredFields(mutation, definition.fields, issues);
      validateSourceOwnership(mutation, issues);
    }

    for (const mutation of changeSet.relationMutations) {
      const option = getAuthoringRelation(mutation.relationType);
      if (!option) {
        issues.push({ ...blocking("RELATION_TYPE_INVALID", `Relation ${mutation.relationType} is not in the governed ontology allowlist.`), relationId: mutation.canonicalId });
        continue;
      }
      const existing = await this.options.repository.getRelationById?.(mutation.canonicalId) ?? null;
      if (mutation.operation === "create") {
        if (!/^relation\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(mutation.canonicalId)) issues.push({ ...blocking("CANONICAL_ID_INVALID", "Relation canonical ID must use relation. and lowercase stable segments."), relationId: mutation.canonicalId });
        if (localRelationIds.has(mutation.canonicalId) || existing || pendingRelationIds.has(mutation.canonicalId)) issues.push({ ...blocking("CANONICAL_ID_ALREADY_EXISTS", "Relation canonical ID already exists in this change set, published knowledge or pending knowledge."), relationId: mutation.canonicalId });
        localRelationIds.add(mutation.canonicalId);
        const sourceEntity = proposedTypes.has(mutation.sourceCanonicalId) ? undefined : await this.options.repository.getEntityById(mutation.sourceCanonicalId);
        const targetEntity = proposedTypes.has(mutation.targetCanonicalId) ? undefined : await this.options.repository.getEntityById(mutation.targetCanonicalId);
        const sourceType = proposedTypes.get(mutation.sourceCanonicalId) ?? sourceEntity?.type;
        const targetType = proposedTypes.get(mutation.targetCanonicalId) ?? targetEntity?.type;
        if (!sourceType) issues.push(blocking("UNKNOWN_CANONICAL_REFERENCE", `Unknown source reference ${mutation.sourceCanonicalId}.`, mutation.sourceCanonicalId));
        if (!targetType) issues.push(blocking("UNKNOWN_CANONICAL_REFERENCE", `Unknown target reference ${mutation.targetCanonicalId}.`, mutation.targetCanonicalId));
        if (sourceEntity && sourceEntity.status && sourceEntity.status !== "active") issues.push(blocking("UNKNOWN_CANONICAL_REFERENCE", `Source reference ${mutation.sourceCanonicalId} is not active.`, mutation.sourceCanonicalId));
        if (targetEntity && targetEntity.status && targetEntity.status !== "active") issues.push(blocking("UNKNOWN_CANONICAL_REFERENCE", `Target reference ${mutation.targetCanonicalId} is not active.`, mutation.targetCanonicalId));
        if (sourceType && targetType && (sourceType !== option.sourceCanonicalType || targetType !== option.targetCanonicalType)) {
          issues.push({ ...blocking("RELATION_DIRECTION_INVALID", `${option.label} requires ${option.sourceCanonicalType} -> ${option.targetCanonicalType}.`), relationId: mutation.canonicalId });
        }
      } else {
        validateExistingRelationMutation(mutation, existing, issues);
      }
    }

    if (!changeSet.entityMutations.length && !changeSet.relationMutations.length) {
      issues.push(blocking("SHACL_VALIDATION_FAILED", "A change set must contain at least one governed mutation."));
    }

    const contentHash = authoringContentHash(changeSet);
    return {
      valid: !issues.some((issue) => issue.severity === "blocking"),
      validatedAt: this.now().toISOString(),
      policyVersion: AUTHORING_VALIDATION_POLICY_VERSION,
      contentHash,
      issues,
    };
  }

  async diff(changeSet: KnowledgeChangeSet): Promise<AuthoringDiff> {
    const entities: AuthoringDiff["entities"] = [];
    for (const mutation of changeSet.entityMutations) {
      const existing = await this.options.repository.getEntityById(mutation.canonicalId);
      const changes = mutation.operation === "create" ? mutation.properties : mutation.operation === "update" ? mutation.changedProperties : { status: "inactive" };
      entities.push({
        canonicalId: mutation.canonicalId,
        changeType: mutation.operation === "create" ? "created" : mutation.operation === "update" ? "updated" : "deactivated",
        fields: Object.entries(changes).map(([field, after]) => ({ field, before: existingValue(existing, field), after })),
      });
    }
    return {
      entities,
      relations: changeSet.relationMutations.map((mutation) => ({
        canonicalId: mutation.canonicalId,
        changeType: mutation.operation === "create" ? "created" : mutation.operation === "update" ? "updated" : "deactivated",
        sourceCanonicalId: "sourceCanonicalId" in mutation ? mutation.sourceCanonicalId : "existing-source",
        targetCanonicalId: "targetCanonicalId" in mutation ? mutation.targetCanonicalId : "existing-target",
        relationType: mutation.relationType,
      })),
    };
  }
}

function validateExistingRelationMutation(
  mutation: Extract<KnowledgeChangeSet["relationMutations"][number], { operation: "update" | "deactivate" }>,
  existing: KnowledgeRelation | null,
  issues: AuthoringValidationIssue[],
) {
  if (!existing) {
    issues.push({ ...blocking("UNKNOWN_CANONICAL_REFERENCE", "The relation to change does not exist in published knowledge."), relationId: mutation.canonicalId });
    return;
  }
  if (existing.label !== mutation.relationType && existing.predicate !== mutation.relationType && getAuthoringRelation(mutation.relationType)?.ontologyIri !== existing.predicate) {
    issues.push({ ...blocking("RELATION_TYPE_INVALID", "Published relation type does not match the requested mutation."), relationId: mutation.canonicalId });
  }
  const currentVersion = existing.version ?? (typeof existing.properties?.version === "string" ? existing.properties.version : "1");
  if (currentVersion !== mutation.expectedCurrentVersion) {
    issues.push({ ...blocking("VERSION_CONFLICT", `Expected ${mutation.expectedCurrentVersion}, but published relation version is ${currentVersion}.`), relationId: mutation.canonicalId });
  }
}

export function authoringContentHash(changeSet: KnowledgeChangeSet): string {
  return stableHash({
    tenantId: changeSet.tenantId,
    domain: changeSet.domain,
    entityMutations: changeSet.entityMutations,
    relationMutations: changeSet.relationMutations,
    expectedVersions: changeSet.expectedVersions,
  });
}

function validateExistingMutation(mutation: Exclude<EntityMutation, { operation: "create" }>, existing: KnowledgeEntity | null, issues: AuthoringValidationIssue[]) {
  if (!existing) {
    issues.push(blocking("UNKNOWN_CANONICAL_REFERENCE", "The entity to change does not exist in published knowledge.", mutation.canonicalId));
    return;
  }
  if (existing.type !== mutation.canonicalType) issues.push(blocking("ONTOLOGY_TYPE_INVALID", `Published entity type is ${existing.type}, not ${mutation.canonicalType}.`, mutation.canonicalId));
  if ((existing.version ?? "1") !== mutation.expectedCurrentVersion) issues.push(blocking("VERSION_CONFLICT", `Expected ${mutation.expectedCurrentVersion}, but published version is ${existing.version ?? "1"}.`, mutation.canonicalId));
}

function validateRequiredFields(mutation: EntityMutation, fields: AuthoringFieldDefinition[], issues: AuthoringValidationIssue[]) {
  if (mutation.operation !== "create") return;
  const properties = mutationProperties(mutation);
  fields.filter((field) => field.required).forEach((field) => {
    const value = properties[field.key];
    if (value === undefined || value === null || value === "") issues.push({ ...blocking("REQUIRED_FIELD_MISSING", `${field.key} is required.`, mutation.canonicalId), field: field.key });
  });
}

function validateSourceOwnership(mutation: EntityMutation, issues: AuthoringValidationIssue[]) {
  const properties = mutationProperties(mutation);
  Object.keys(properties).filter((field) => sourceOwnedFields.has(field)).forEach((field) => {
    issues.push({ ...blocking("SOURCE_OWNED_FIELD_NOT_EDITABLE", `${field} is source-managed and cannot be changed through manual authoring.`, mutation.canonicalId), field });
  });
}

function blocking(code: AuthoringValidationIssue["code"], message: string, canonicalId?: string): AuthoringValidationIssue {
  return { code, severity: "blocking", message, canonicalId };
}

function existingValue(entity: KnowledgeEntity | null, field: string): unknown {
  if (!entity) return undefined;
  if (field === "label") return entity.label;
  if (field === "description") return entity.description;
  if (field === "status") return entity.status;
  return entity.properties[field];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
