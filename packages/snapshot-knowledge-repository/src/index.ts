import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import {
  type AgentAnswer,
  type CitationValidationResult,
  type EvidencePack,
  type KnowledgeEntity,
  type KnowledgeRelation,
} from "../../knowledge-contracts/src/index";
import { StrictCitationValidator } from "../../agent-core/src/index";

export const PERSONAL_OBJECT_TYPES = [
  "person",
  "concept",
  "question",
  "claim",
  "project",
  "document",
  "reference",
  "tool",
  "domain",
] as const;

export const PERSONAL_RELATION_TYPES = [
  "INTERESTED_IN",
  "PURSUING",
  "RESEARCHING",
  "HOLDS",
  "BUILDING",
  "RELATED_TO",
  "BROADER_THAN",
  "ABOUT",
  "SUPPORTED_BY",
  "CHALLENGED_BY",
  "DISCUSSES",
  "CONTAINS",
  "IMPLEMENTS",
  "INVESTIGATES",
  "AUTHORED_BY",
  "REVISES",
  "EVOLVED_FROM",
  "PRODUCED",
  "SUPERSEDES",
] as const;

export type PersonalObjectType = (typeof PERSONAL_OBJECT_TYPES)[number];
export type PersonalRelationType = (typeof PERSONAL_RELATION_TYPES)[number];

export type SnapshotProvenance = {
  contentId: string;
  sourcePath: string;
  sourceUrl?: string;
  headingId?: string;
  sectionTitle?: string;
  contentHash: string;
  visibility: "public" | "non-public";
  collection: string;
  idSource: "explicit" | "fallback" | "derived";
  extractedFields: string[];
};

export type SnapshotObject = {
  id: string;
  type: PersonalObjectType;
  subtype?: string;
  title: string;
  slug?: string;
  summary?: string;
  status?: "draft" | "published" | "archived";
  sourcePath?: string;
  canonicalUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  provenance: SnapshotProvenance;
};

export type SnapshotRelation = {
  id: string;
  type: PersonalRelationType;
  from: string;
  to: string;
  sourceDocumentId?: string;
  sourcePath?: string;
  confidence?: "explicit" | "derived";
  provenance: SnapshotProvenance;
};

export type PersonalKnowledgeSnapshot = {
  schemaVersion: string;
  generator: {
    name: "personal-knowledge-snapshot-builder";
    version: string;
  };
  generatedAt: string;
  sourceCommit?: string;
  contentHash: string;
  objects: SnapshotObject[];
  relations: SnapshotRelation[];
  canonicalIdentity: {
    explicitIdCount: number;
    fallbackIdCount: number;
    fallbackIds: string[];
  };
  diagnostics: {
    warnings: Array<{ severity: string; code: string; message: string; path?: string }>;
    errors: Array<{ severity: string; code: string; message: string; path?: string }>;
  };
};

export type NeighborOptions = {
  direction?: "incoming" | "outgoing" | "both";
  relationTypes?: PersonalRelationType[];
  objectTypes?: PersonalObjectType[];
};

export type NeighborResult = {
  objects: SnapshotObject[];
  relations: SnapshotRelation[];
};

export type PersonalQueryIntent =
  | "content-related-to-concept"
  | "projects-demonstrating-interest"
  | "current-beliefs";

export type PersonalQueryPlan = {
  id: string;
  question: string;
  intent: PersonalQueryIntent;
  seedIds: string[];
  allowedRelationTypes: PersonalRelationType[];
  resultTypes: PersonalObjectType[];
};

export type PersonalQueryResult = {
  plan: PersonalQueryPlan;
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  evidencePack: EvidencePack;
  answer: AgentAnswer;
  citationValidation: CitationValidationResult;
};

/**
 * Experimental feasibility query surface. It is not used by the production
 * Agent API and will be replaced by a governed planner integration.
 */

const CANONICAL_ID = /^(?:person|concept|question|claim|project|document|reference|tool|domain|relation)\.[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
export const PERSONAL_KNOWLEDGE_SUPPORTED_SCHEMA_MAJOR = 0;
export const PERSONAL_KNOWLEDGE_SCHEMA_SHA256 = "d6750ab1b22080055542faefc6a02da513bba681b5cf5d0d633965bfa87f246f";

const schemaBytes = readFileSync(new URL("../schemas/0.1.0.schema.json", import.meta.url), "utf8");
const actualSchemaHash = createHash("sha256").update(schemaBytes).digest("hex");
if (actualSchemaHash !== PERSONAL_KNOWLEDGE_SCHEMA_SHA256) {
  throw new Error(`Personal Knowledge Snapshot schema fixture hash mismatch: ${actualSchemaHash}`);
}
const snapshotSchemaValidator = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(schemaBytes));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Snapshot field ${key} must be a non-empty string.`);
  return value;
}

export function parsePersonalKnowledgeSnapshot(input: unknown): PersonalKnowledgeSnapshot {
  if (!isRecord(input)) throw new Error("Knowledge snapshot must be an object.");
  const schemaVersion = requireString(input, "schemaVersion");
  if (!/^\d+\.\d+\.\d+$/.test(schemaVersion)) throw new Error(`Invalid snapshot schema version: ${schemaVersion}`);
  if (Number(schemaVersion.split(".")[0]) !== PERSONAL_KNOWLEDGE_SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(`Unsupported snapshot schema major version: ${schemaVersion}`);
  }
  if (!snapshotSchemaValidator(input)) {
    throw new Error(`Personal Knowledge Snapshot schema validation failed: ${JSON.stringify(snapshotSchemaValidator.errors)}`);
  }
  const objectsInput = input.objects;
  const relationsInput = input.relations;
  const diagnosticsInput = input.diagnostics;
  if (!Array.isArray(objectsInput) || !Array.isArray(relationsInput) || !isRecord(diagnosticsInput)) {
    throw new Error("Knowledge snapshot objects, relations, and diagnostics are required.");
  }
  if (!Array.isArray(diagnosticsInput.errors) || diagnosticsInput.errors.length > 0) {
    throw new Error("Knowledge snapshot contains validation errors.");
  }

  const objectTypes = new Set<string>(PERSONAL_OBJECT_TYPES);
  const relationTypes = new Set<string>(PERSONAL_RELATION_TYPES);
  const objectIds = new Set<string>();
  const relationIds = new Set<string>();
  const objects = objectsInput.map((value) => {
    if (!isRecord(value)) throw new Error("Snapshot object entry is invalid.");
    const id = requireString(value, "id");
    const type = requireString(value, "type");
    requireString(value, "title");
    if (!CANONICAL_ID.test(id) || id.startsWith("relation.")) throw new Error(`Invalid object ID: ${id}`);
    if (!objectTypes.has(type)) throw new Error(`Invalid object type: ${type}`);
    if (objectIds.has(id)) throw new Error(`Duplicate object ID: ${id}`);
    if (!isRecord(value.provenance)) throw new Error(`Missing provenance: ${id}`);
    objectIds.add(id);
    return value as SnapshotObject;
  });
  const relations = relationsInput.map((value) => {
    if (!isRecord(value)) throw new Error("Snapshot relation entry is invalid.");
    const id = requireString(value, "id");
    const type = requireString(value, "type");
    const from = requireString(value, "from");
    const to = requireString(value, "to");
    if (!CANONICAL_ID.test(id) || !id.startsWith("relation.")) throw new Error(`Invalid relation ID: ${id}`);
    if (!relationTypes.has(type)) throw new Error(`Invalid relation type: ${type}`);
    if (relationIds.has(id)) throw new Error(`Duplicate relation ID: ${id}`);
    if (!objectIds.has(from) || !objectIds.has(to)) throw new Error(`Dangling relation: ${id}`);
    if (value.confidence !== "explicit") throw new Error(`Only explicit relations are accepted: ${id}`);
    if (!isRecord(value.provenance)) throw new Error(`Missing provenance: ${id}`);
    relationIds.add(id);
    return value as SnapshotRelation;
  });

  const snapshot = { ...input, objects, relations } as PersonalKnowledgeSnapshot;
  const calculatedHash = computePersonalSnapshotContentHash(snapshot);
  if (snapshot.contentHash !== calculatedHash) throw new Error(`Personal Knowledge Snapshot content hash mismatch: expected ${calculatedHash}.`);
  return snapshot;
}

export function computePersonalSnapshotContentHash(snapshot: PersonalKnowledgeSnapshot): string {
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    generator: snapshot.generator,
    objects: snapshot.objects,
    relations: snapshot.relations,
    canonicalIdentity: snapshot.canonicalIdentity,
    diagnostics: snapshot.diagnostics,
  })).digest("hex");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function searchableText(object: SnapshotObject): string {
  return normalize([
    object.id,
    object.title,
    object.slug,
    object.summary,
    JSON.stringify(object.metadata ?? {}),
  ].filter(Boolean).join(" "));
}

function toEntity(object: SnapshotObject): KnowledgeEntity {
  const sourcePath = object.sourcePath ?? object.provenance.sourcePath;
  return {
    id: object.id,
    type: object.type,
    label: object.title,
    description: object.summary,
    domain: "personal-knowledge",
    properties: {
      subtype: object.subtype,
      slug: object.slug,
      canonicalUrl: object.canonicalUrl,
      sourceUrl: object.provenance.sourceUrl,
      ...object.metadata,
    },
    source: sourcePath ? [{ sourceType: "astro-content", sourceId: object.id, sourceSystem: "personal-website", locator: sourcePath }] : [],
    validFrom: object.createdAt,
    version: object.updatedAt,
    status: object.status,
  };
}

function toRelation(relation: SnapshotRelation): KnowledgeRelation {
  return {
    id: relation.id,
    sourceId: relation.from,
    targetId: relation.to,
    predicate: relation.type,
    assertionType: "asserted",
    confidence: 1,
    provenance: relation.sourcePath ? [{ sourceType: "astro-content", sourceId: relation.sourceDocumentId ?? relation.id, sourceSystem: "personal-website", locator: relation.sourcePath }] : [],
  };
}

export class SnapshotKnowledgeRepository {
  private readonly objectById: Map<string, SnapshotObject>;
  readonly snapshot: PersonalKnowledgeSnapshot;

  constructor(snapshot: unknown) {
    this.snapshot = parsePersonalKnowledgeSnapshot(snapshot);
    this.objectById = new Map(this.snapshot.objects.map((object) => [object.id, object]));
  }

  static fromFile(path: string): SnapshotKnowledgeRepository {
    return new SnapshotKnowledgeRepository(JSON.parse(readFileSync(path, "utf8")));
  }

  getById(id: string): SnapshotObject | null {
    return this.objectById.get(id) ?? null;
  }

  search(query: string, types?: PersonalObjectType[]): SnapshotObject[] {
    const terms = normalize(query).split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);
    if (!terms.length) return [];
    return this.snapshot.objects
      .filter((object) => !types || types.includes(object.type))
      .map((object) => ({ object, text: searchableText(object) }))
      .filter(({ text }) => terms.every((term) => text.includes(term)))
      .sort((a, b) => {
        const aTitle = normalize(a.object.title) === normalize(query) ? 1 : 0;
        const bTitle = normalize(b.object.title) === normalize(query) ? 1 : 0;
        return bTitle - aTitle || a.object.id.localeCompare(b.object.id);
      })
      .map(({ object }) => object);
  }

  neighbors(id: string, options: NeighborOptions = {}): NeighborResult {
    const direction = options.direction ?? "both";
    const relations = this.snapshot.relations.filter((relation) => {
      if (options.relationTypes && !options.relationTypes.includes(relation.type)) return false;
      return (direction !== "incoming" && relation.from === id) || (direction !== "outgoing" && relation.to === id);
    });
    const neighborIds = new Set(relations.map((relation) => relation.from === id ? relation.to : relation.from));
    const objects = [...neighborIds]
      .map((neighborId) => this.objectById.get(neighborId))
      .filter((object): object is SnapshotObject => Boolean(object))
      .filter((object) => !options.objectTypes || options.objectTypes.includes(object.type))
      .sort((a, b) => a.id.localeCompare(b.id));
    const visibleIds = new Set(objects.map((object) => object.id));
    return {
      objects,
      relations: relations.filter((relation) => visibleIds.has(relation.from === id ? relation.to : relation.from)).sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  getDocumentKnowledge(id: string): NeighborResult {
    const object = this.getById(id);
    if (!object || object.type !== "document") return { objects: [], relations: [] };
    return this.neighbors(id, { direction: "outgoing", relationTypes: ["ABOUT", "CONTAINS", "SUPPORTED_BY", "DISCUSSES"] });
  }

  getConceptKnowledge(id: string): NeighborResult {
    const object = this.getById(id);
    if (!object || object.type !== "concept") return { objects: [], relations: [] };
    return this.neighbors(id, { direction: "incoming", relationTypes: ["ABOUT", "DISCUSSES", "INVESTIGATES", "INTERESTED_IN"] });
  }

  asEntities(objects: SnapshotObject[]): KnowledgeEntity[] {
    return objects.map(toEntity);
  }

  asRelations(relations: SnapshotRelation[]): KnowledgeRelation[] {
    return relations.map(toRelation);
  }
}

export function planPersonalKnowledgeQuery(question: string): PersonalQueryPlan {
  const normalized = normalize(question);
  if (normalized.includes("project") && (normalized.includes("knowledge graph") || normalized.includes("knowledge engineering"))) {
    return {
      id: "personal-plan.projects-demonstrating-interest",
      question,
      intent: "projects-demonstrating-interest",
      seedIds: ["person.zhiyuan-zhang", "concept.knowledge-engineering"],
      allowedRelationTypes: ["BUILDING", "ABOUT"],
      resultTypes: ["project"],
    };
  }
  if (normalized.includes("believe") || normalized.includes("claim")) {
    return {
      id: "personal-plan.current-beliefs",
      question,
      intent: "current-beliefs",
      seedIds: ["person.zhiyuan-zhang"],
      allowedRelationTypes: ["HOLDS", "SUPPORTED_BY"],
      resultTypes: ["claim"],
    };
  }
  return {
    id: "personal-plan.content-related-to-concept",
    question,
    intent: "content-related-to-concept",
    seedIds: ["concept.knowledge-engineering"],
    allowedRelationTypes: ["ABOUT", "DISCUSSES"],
    resultTypes: ["document", "project"],
  };
}

function executePlan(repository: SnapshotKnowledgeRepository, plan: PersonalQueryPlan): NeighborResult {
  if (plan.intent === "content-related-to-concept") {
    return repository.neighbors(plan.seedIds[0], {
      direction: "incoming",
      relationTypes: plan.allowedRelationTypes,
      objectTypes: plan.resultTypes,
    });
  }
  if (plan.intent === "projects-demonstrating-interest") {
    const built = repository.neighbors("person.zhiyuan-zhang", { direction: "outgoing", relationTypes: ["BUILDING"], objectTypes: ["project"] });
    const relatedProjects = new Set(repository.neighbors("concept.knowledge-engineering", { direction: "incoming", relationTypes: ["ABOUT"], objectTypes: ["project"] }).objects.map((object) => object.id));
    const objects = built.objects.filter((object) => relatedProjects.has(object.id));
    const objectIds = new Set(objects.map((object) => object.id));
    const relations = repository.snapshot.relations.filter((relation) => plan.allowedRelationTypes.includes(relation.type) && (objectIds.has(relation.from) || objectIds.has(relation.to)));
    return { objects, relations };
  }
  const matchedClaims = repository.search("language concept space", ["claim"]);
  const claimIds = new Set(matchedClaims.map((object) => object.id));
  return {
    objects: matchedClaims,
    relations: repository.snapshot.relations.filter((relation) => claimIds.has(relation.from) && plan.allowedRelationTypes.includes(relation.type)),
  };
}

function buildEvidencePack(repository: SnapshotKnowledgeRepository, plan: PersonalQueryPlan, result: NeighborResult): EvidencePack {
  const claimId = `claim.personal-query.${plan.intent}`;
  const items = result.objects.map((object) => ({
    id: `evidence.personal.${object.id}`,
    kind: "graph" as const,
    title: object.title,
    excerpt: object.summary ? `${object.title}: ${object.summary}` : object.title,
    source: {
      sourceType: "astro-content",
      sourceId: object.id,
      sourceSystem: "personal-website",
      locator: object.sourcePath ?? object.provenance.sourcePath,
    },
    linkedEntityIds: [object.id],
    supportsClaimIds: [claimId],
    version: object.updatedAt,
    status: "active" as const,
  }));
  const hasEvidence = items.length > 0;
  return {
    id: `evidence-pack.${plan.intent}`,
    queryPlanId: plan.id,
    generatedAt: repository.snapshot.generatedAt,
    ontologyVersion: `personal-knowledge-${repository.snapshot.schemaVersion}`,
    dataVersion: repository.snapshot.contentHash,
    items,
    claimPolicies: [{ claimId, classification: hasEvidence ? "fact" : "unknown", required: true }],
    limitations: hasEvidence ? [] : ["The snapshot does not contain an explicit claim matching language and concept space."],
  };
}

function composeAnswer(plan: PersonalQueryPlan, evidencePack: EvidencePack): AgentAnswer {
  const claimId = `claim.personal-query.${plan.intent}`;
  if (!evidencePack.items.length) {
    const text = "The current snapshot does not contain enough explicit evidence to state this belief.";
    return {
      summary: text,
      findings: [],
      recommendedActions: ["Add an explicit Claim and a supporting Document relation before publishing this conclusion."],
      risks: ["Inferring a belief from loosely related content would exceed the governed snapshot."],
      assumptions: [],
      limitations: evidencePack.limitations,
      claims: [{ id: claimId, text, classification: "unknown", citations: [] }],
      confidence: "low",
    };
  }
  const titles = evidencePack.items.map((item) => item.title);
  const text = plan.intent === "projects-demonstrating-interest"
    ? `The governed snapshot identifies these relevant projects: ${titles.join(", ")}.`
    : `The governed snapshot identifies this related content: ${titles.join(", ")}.`;
  return {
    summary: text,
    findings: titles,
    recommendedActions: [],
    risks: [],
    assumptions: [],
    limitations: evidencePack.limitations,
    claims: [{ id: claimId, text, classification: "fact", citations: evidencePack.items.map((item) => ({ evidenceId: item.id, locator: item.source.locator })) }],
    confidence: "high",
  };
}

export async function runPersonalKnowledgeQuery(
  repository: SnapshotKnowledgeRepository,
  question: string,
): Promise<PersonalQueryResult> {
  const plan = planPersonalKnowledgeQuery(question);
  const result = executePlan(repository, plan);
  const evidencePack = buildEvidencePack(repository, plan, result);
  const answer = composeAnswer(plan, evidencePack);
  const citationValidation = await new StrictCitationValidator().validate(answer, evidencePack);
  if (citationValidation.status !== "passed") throw new Error(`Citation validation failed: ${JSON.stringify(citationValidation.issues)}`);
  return {
    plan,
    entities: repository.asEntities(result.objects),
    relations: repository.asRelations(result.relations),
    evidencePack,
    answer,
    citationValidation,
  };
}
