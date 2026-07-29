import type { SanitizedAuthorizationSnapshot } from "./sourceSync";

export const KNOWLEDGE_AUTHORING_SCHEMA_VERSION = "1.0.0" as const;

export type KnowledgeChangeSetStatus =
  | "draft"
  | "submitted"
  | "changes-requested"
  | "approved"
  | "rejected"
  | "published"
  | "withdrawn";

export type FieldOwner = "manual" | "mes" | "plm" | "qms";
export type KnowledgeOwnershipMode = "manual" | "source-managed" | "mixed";

export type EntityMutation =
  | {
      operation: "create";
      canonicalId: string;
      canonicalType: string;
      proposedVersion: string;
      properties: Record<string, unknown>;
      ownershipMode: KnowledgeOwnershipMode;
      fieldOwnership?: Record<string, FieldOwner>;
    }
  | {
      operation: "update";
      canonicalId: string;
      canonicalType: string;
      expectedCurrentVersion: string;
      proposedVersion: string;
      changedProperties: Record<string, unknown>;
    }
  | {
      operation: "deactivate";
      canonicalId: string;
      canonicalType: string;
      expectedCurrentVersion: string;
      proposedVersion: string;
      reason: string;
    };

export type RelationMutation =
  | {
      operation: "create";
      canonicalId: string;
      relationType: string;
      sourceCanonicalId: string;
      targetCanonicalId: string;
      proposedVersion: string;
      properties?: Record<string, unknown>;
    }
  | {
      operation: "update";
      canonicalId: string;
      relationType: string;
      expectedCurrentVersion: string;
      proposedVersion: string;
      changedProperties: Record<string, unknown>;
    }
  | {
      operation: "deactivate";
      canonicalId: string;
      relationType: string;
      expectedCurrentVersion: string;
      proposedVersion: string;
      reason: string;
    };

export type AuthoringValidationIssueCode =
  | "CANONICAL_ID_INVALID"
  | "CANONICAL_ID_ALREADY_EXISTS"
  | "CANONICAL_ID_ALIAS_CONFLICT"
  | "REQUIRED_FIELD_MISSING"
  | "UNKNOWN_CANONICAL_REFERENCE"
  | "ONTOLOGY_TYPE_INVALID"
  | "RELATION_TYPE_INVALID"
  | "RELATION_DIRECTION_INVALID"
  | "SHACL_VALIDATION_FAILED"
  | "VERSION_CONFLICT"
  | "SOURCE_OWNED_FIELD_NOT_EDITABLE"
  | "TENANT_MISMATCH"
  | "DOMAIN_NOT_ALLOWED"
  | "AUTHORIZATION_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_STALE"
  | "PUBLICATION_VERIFICATION_FAILED";

export type AuthoringValidationIssue = {
  code: AuthoringValidationIssueCode;
  severity: "blocking" | "warning" | "information";
  message: string;
  canonicalId?: string;
  relationId?: string;
  field?: string;
};

export type AuthoringValidationResult = {
  valid: boolean;
  validatedAt: string;
  policyVersion: string;
  contentHash: string;
  issues: AuthoringValidationIssue[];
};

export type AuthoringDiff = {
  entities: Array<{
    canonicalId: string;
    changeType: "created" | "updated" | "deactivated";
    fields: Array<{ field: string; before?: unknown; after?: unknown; owner?: FieldOwner }>;
  }>;
  relations: Array<{
    canonicalId: string;
    changeType: "created" | "updated" | "deactivated";
    sourceCanonicalId: string;
    targetCanonicalId: string;
    relationType: string;
    fields?: Array<{ field: string; before?: unknown; after?: unknown; owner?: FieldOwner }>;
  }>;
};

export type AuthoringPublicationResult = {
  changeSetId: string;
  status: "published" | "failed" | "recovery-required";
  target: "mock" | "neo4j";
  publishedEntityIds: string[];
  publishedRelationIds: string[];
  publicationHash?: string;
  verificationHash?: string;
  publishedAt?: string;
  issues: string[];
};

export type AuthoringStageResult = {
  changeSetId: string;
  stagedMutationCount: number;
  stageHash: string;
};

export type AuthoringVerificationResult = {
  changeSetId: string;
  verified: boolean;
  verifiedEntityIds: string[];
  verifiedRelationIds: string[];
  verificationHash: string;
  issues: string[];
};

export type AuthoringApprovalPolicy = {
  policyVersion: string;
  requireSubmission: true;
  requireApproval: true;
  requirePublication: true;
  requireDistinctSubmitterAndApprover: boolean;
  requireDistinctApproverAndPublisher: boolean;
  requireValidationBeforeSubmit: true;
  requireRevalidationBeforeApprove: true;
  requireRevalidationBeforePublish: true;
};

export type KnowledgeChangeSet = {
  id: string;
  schemaVersion: typeof KNOWLEDGE_AUTHORING_SCHEMA_VERSION;
  revision: string;
  tenantId: string;
  domain: string;
  title: string;
  description?: string;
  status: KnowledgeChangeSetStatus;
  entityMutations: EntityMutation[];
  relationMutations: RelationMutation[];
  expectedVersions: Record<string, string>;
  authorizationSnapshot: SanitizedAuthorizationSnapshot;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComment?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalComment?: string;
  publishedBy?: string;
  publishedAt?: string;
  validationResult?: AuthoringValidationResult;
  publicationResult?: AuthoringPublicationResult;
  approvalRevision?: string;
  approvalContentHash?: string;
};

export type AuthoringFieldDefinition = {
  key: string;
  label: string;
  description?: string;
  dataType: "string" | "number" | "boolean" | "date" | "datetime" | "enum" | "canonical-reference" | "string-array";
  required: boolean;
  readOnly: boolean;
  source?: "contract" | "ontology" | "authoring-config";
  enumValues?: string[];
  unitOptions?: string[];
  owner?: FieldOwner;
};

export type AuthoringObjectTypeDefinition = {
  canonicalType: string;
  label: string;
  domain: string;
  idPrefix: string;
  ontologyIri: string;
  enabled: boolean;
  disabledReason?: string;
  fields: AuthoringFieldDefinition[];
};

export type AuthoringRelationOption = {
  relationType: string;
  ontologyIri: string;
  label: string;
  sourceCanonicalType: string;
  targetCanonicalType: string;
  allowMultiple: boolean;
  requiredProperties: string[];
  validationDescription: string;
};

export type AuthoringAuditAction =
  | "AUTHORING_DRAFT_CREATED"
  | "AUTHORING_DRAFT_UPDATED"
  | "AUTHORING_DRAFT_DELETED"
  | "AUTHORING_VALIDATED"
  | "AUTHORING_SUBMITTED"
  | "AUTHORING_CHANGES_REQUESTED"
  | "AUTHORING_REJECTED"
  | "AUTHORING_APPROVED"
  | "AUTHORING_APPROVAL_WITHDRAWN"
  | "AUTHORING_APPROVAL_INVALIDATED"
  | "AUTHORING_PUBLICATION_STARTED"
  | "AUTHORING_PUBLISHED"
  | "AUTHORING_PUBLICATION_FAILED"
  | "AUTHORING_WITHDRAWN";

export type AuthoringAuditEvent = {
  id: string;
  changeSetId: string;
  action: AuthoringAuditAction;
  actorId: string;
  tenantId: string;
  domain: string;
  occurredAt: string;
  outcome: "allowed" | "denied" | "completed" | "failed";
  comment?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type AuthoringProvenanceRecord = {
  id: string;
  changeSetId: string;
  canonicalId: string;
  mutationType: EntityMutation["operation"] | RelationMutation["operation"];
  origin: "manual-authoring";
  actorId: string;
  tenantId: string;
  domain: string;
  beforeVersion?: string;
  afterVersion: string;
  publishedAt: string;
  validationPolicyVersion: string;
  approvalPolicyVersion: string;
};

export type KnowledgeChangeSetQuery = {
  tenantId: string;
  domain?: string;
  status?: KnowledgeChangeSetStatus;
  createdBy?: string;
};
