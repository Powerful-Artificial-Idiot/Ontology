import { randomUUID } from "node:crypto";
import type {
  AgentAnswer,
  AgentAuditEvent,
  CitationValidationResult,
  EvidenceItem,
  EvidencePack,
  StructuredAgentTrace,
} from "../../knowledge-contracts/src/index";
import { StrictCitationValidator, type AgentAuditSink, type CitationValidator } from "../../agent-core/src/index";
import { SnapshotKnowledgeRepository, type PersonalObjectType, type SnapshotObject, type SnapshotRelation } from "./index";
import type { PersonalKnowledgeSnapshotIngestionService } from "./ingestion";

export const PERSONAL_KNOWLEDGE_DOMAIN = "personal-knowledge" as const;
export const PERSONAL_QUERY_OPERATIONS = [
  "find-content-about",
  "find-projects-related-to",
  "find-documents-related-to",
  "show-neighbors",
] as const;
export type PersonalQueryOperation = (typeof PERSONAL_QUERY_OPERATIONS)[number];

export type GovernedPersonalQueryPlan = {
  id: string;
  domain: typeof PERSONAL_KNOWLEDGE_DOMAIN;
  operation: PersonalQueryOperation;
  seedId: string;
  resultTypes: PersonalObjectType[];
  limit: number;
};

export type PersonalKnowledgeQueryRequest = {
  domain: string;
  question?: string;
  operation?: string;
  concept?: string;
  canonicalId?: string;
  limit?: number;
};

export type PersonalEvidenceItem = EvidenceItem & {
  personalKnowledge: {
    canonicalId: string;
    title: string;
    objectType: PersonalObjectType;
    sourceUrl: string;
    sourcePath: string;
    headingId?: string;
    contentHash: string;
    sourceCommit?: string;
  };
};

export type PersonalKnowledgeQueryResponse = {
  plan: GovernedPersonalQueryPlan;
  answer: AgentAnswer;
  evidencePack: EvidencePack & { items: PersonalEvidenceItem[] };
  citationValidation: CitationValidationResult;
  trace: StructuredAgentTrace;
};

export class PersonalKnowledgeQueryError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "DOMAIN_MISMATCH" | "UNSUPPORTED_OPERATION" | "SNAPSHOT_UNAVAILABLE" | "EVIDENCE_INSUFFICIENT" | "CITATION_INVALID", message: string) {
    super(message);
    this.name = "PersonalKnowledgeQueryError";
  }
}

export class GovernedPersonalKnowledgePlanner {
  plan(request: PersonalKnowledgeQueryRequest, repository: SnapshotKnowledgeRepository): GovernedPersonalQueryPlan {
    if (request.domain !== PERSONAL_KNOWLEDGE_DOMAIN) throw new PersonalKnowledgeQueryError("DOMAIN_MISMATCH", "The request must explicitly select the personal-knowledge domain.");
    const parsed = request.operation
      ? { operation: request.operation, value: request.canonicalId ?? request.concept ?? "" }
      : parseQuestion(request.question ?? "");
    if (!PERSONAL_QUERY_OPERATIONS.includes(parsed.operation as PersonalQueryOperation)) throw new PersonalKnowledgeQueryError("UNSUPPORTED_OPERATION", `Unsupported Personal Knowledge operation: ${parsed.operation || "empty"}.`);
    const operation = parsed.operation as PersonalQueryOperation;
    const limit = request.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new PersonalKnowledgeQueryError("INVALID_REQUEST", "Personal Knowledge query limit must be an integer from 1 to 25.");
    const rawSeed = operation === "show-neighbors" ? request.canonicalId ?? parsed.value : request.concept ?? parsed.value;
    const seed = operation === "show-neighbors" ? repository.getById(rawSeed) : resolveConcept(repository, rawSeed);
    if (!seed) throw new PersonalKnowledgeQueryError("EVIDENCE_INSUFFICIENT", `No governed public seed object matches: ${rawSeed || "empty"}.`);
    return {
      id: `personal-query-plan.${randomUUID()}`,
      domain: PERSONAL_KNOWLEDGE_DOMAIN,
      operation,
      seedId: seed.id,
      resultTypes: operation === "find-projects-related-to" ? ["project"] : operation === "find-documents-related-to" ? ["document"] : operation === "find-content-about" ? ["document", "project"] : [...new Set(repository.snapshot.objects.map((object) => object.type))],
      limit,
    };
  }
}

export class PersonalKnowledgeQueryService {
  private readonly planner = new GovernedPersonalKnowledgePlanner();
  private readonly citationValidator: CitationValidator;

  constructor(
    private readonly ingestion: PersonalKnowledgeSnapshotIngestionService,
    private readonly audit: AgentAuditSink,
    citationValidator?: CitationValidator,
  ) {
    this.citationValidator = citationValidator ?? new StrictCitationValidator();
  }

  async query(request: PersonalKnowledgeQueryRequest, actorId: string, requestId = `personal-query.${randomUUID()}`): Promise<PersonalKnowledgeQueryResponse> {
    const startedAt = new Date().toISOString();
    await this.record("personal_query_started", "completed", requestId, actorId);
    try {
      const repository = this.ingestion.getActiveRepository();
      if (!repository) throw new PersonalKnowledgeQueryError("SNAPSHOT_UNAVAILABLE", "No validated Personal Knowledge Snapshot is active.");
      const plan = this.planner.plan(request, repository);
      const result = executePlan(repository, plan);
      const evidencePack = buildEvidencePack(repository, plan, result.objects);
      const answer = composeAnswer(plan, evidencePack);
      const citationValidation = await this.citationValidator.validate(answer, evidencePack);
      if (citationValidation.status !== "passed") {
        await this.record("citation_validation_failed", "failed", requestId, actorId, { issueCount: citationValidation.issues.length });
        throw new PersonalKnowledgeQueryError("CITATION_INVALID", "Personal Knowledge citation validation failed.");
      }
      const completedAt = new Date().toISOString();
      const trace = buildTrace(requestId, plan, evidencePack, startedAt, completedAt);
      await this.record("personal_query_completed", "completed", requestId, actorId, { operation: plan.operation, evidenceCount: evidencePack.items.length });
      return { plan, answer, evidencePack, citationValidation, trace };
    } catch (error) {
      await this.record("personal_query_rejected", "failed", requestId, actorId, { reason: error instanceof PersonalKnowledgeQueryError ? error.code : "QUERY_FAILED" });
      throw error;
    }
  }

  private async record(action: string, outcome: AgentAuditEvent["outcome"], traceId: string, actorId: string, metadata: AgentAuditEvent["metadata"] = {}): Promise<void> {
    await this.audit.append({ id: `audit.personal.${randomUUID()}`, traceId, actorId, action, resourceIds: ["domain.personal-knowledge"], outcome, occurredAt: new Date().toISOString(), metadata });
  }
}

function parseQuestion(question: string): { operation: string; value: string } {
  const trimmed = question.trim();
  const patterns: Array<[PersonalQueryOperation, RegExp]> = [
    ["find-content-about", /^find\s+content\s+about\s+(.+)$/i],
    ["find-projects-related-to", /^find\s+projects\s+related\s+to\s+(.+)$/i],
    ["find-documents-related-to", /^find\s+documents\s+related\s+to\s+(.+)$/i],
    ["show-neighbors", /^show\s+neighbors\s+of\s+([a-z0-9.-]+)$/i],
  ];
  for (const [operation, pattern] of patterns) {
    const match = pattern.exec(trimmed);
    if (match) return { operation, value: match[1].trim().replace(/[?.!]$/, "") };
  }
  return { operation: "", value: "" };
}

function resolveConcept(repository: SnapshotKnowledgeRepository, value: string): SnapshotObject | null {
  if (value.startsWith("concept.")) {
    const object = repository.getById(value);
    return object?.type === "concept" ? object : null;
  }
  return repository.search(value, ["concept"])[0] ?? null;
}

function executePlan(repository: SnapshotKnowledgeRepository, plan: GovernedPersonalQueryPlan): { objects: SnapshotObject[]; relations: SnapshotRelation[] } {
  const result = plan.operation === "show-neighbors"
    ? repository.neighbors(plan.seedId, { direction: "both", objectTypes: plan.resultTypes })
    : repository.neighbors(plan.seedId, { direction: "incoming", relationTypes: ["ABOUT", "DISCUSSES", "INVESTIGATES"], objectTypes: plan.resultTypes });
  const objects = result.objects.filter((object) => object.provenance.visibility === "public" && Boolean(object.provenance.sourceUrl)).slice(0, plan.limit);
  const visible = new Set(objects.map((object) => object.id));
  return { objects, relations: result.relations.filter((relation) => visible.has(relation.from === plan.seedId ? relation.to : relation.from)) };
}

function buildEvidencePack(repository: SnapshotKnowledgeRepository, plan: GovernedPersonalQueryPlan, objects: SnapshotObject[]): EvidencePack & { items: PersonalEvidenceItem[] } {
  const claimId = `claim.personal.${plan.id}`;
  const items = objects.map((object): PersonalEvidenceItem => {
    const provenance = object.provenance;
    const locator = provenance.headingId ? `${provenance.sourcePath}#${provenance.headingId}` : provenance.sourcePath;
    return {
      id: `evidence.personal.${plan.id}.${object.id}`,
      kind: "graph",
      title: object.title,
      excerpt: `${object.title}${object.summary ? `: ${object.summary}` : ""}`,
      source: { sourceType: "personal-knowledge-snapshot", sourceId: object.id, sourceSystem: "personal-website", locator },
      linkedEntityIds: [plan.seedId, object.id],
      supportsClaimIds: [claimId],
      version: repository.snapshot.sourceCommit,
      status: "active",
      personalKnowledge: {
        canonicalId: object.id,
        title: object.title,
        objectType: object.type,
        sourceUrl: provenance.sourceUrl!,
        sourcePath: provenance.sourcePath,
        headingId: provenance.headingId,
        contentHash: provenance.contentHash,
        sourceCommit: repository.snapshot.sourceCommit,
      },
    };
  });
  return {
    id: `evidence-pack.${plan.id}`,
    queryPlanId: plan.id,
    generatedAt: repository.snapshot.generatedAt,
    ontologyVersion: `personal-knowledge-${repository.snapshot.schemaVersion}`,
    dataVersion: repository.snapshot.contentHash,
    items,
    claimPolicies: [{ claimId, classification: items.length ? "fact" : "unknown", required: true }],
    limitations: items.length ? [] : ["The active public snapshot contains no explicit relationship matching this query."],
  };
}

function composeAnswer(plan: GovernedPersonalQueryPlan, evidencePack: EvidencePack & { items: PersonalEvidenceItem[] }): AgentAnswer {
  const claimId = `claim.personal.${plan.id}`;
  if (!evidencePack.items.length) {
    const summary = "The active public snapshot contains insufficient explicit evidence for this query.";
    return { summary, findings: [], recommendedActions: [], risks: [], assumptions: [], limitations: evidencePack.limitations, claims: [{ id: claimId, text: summary, classification: "unknown", citations: [] }], confidence: "low" };
  }
  const summary = `The governed snapshot explicitly links ${evidencePack.items.map((item) => item.title).join(", ")} to ${plan.seedId}.`;
  return {
    summary,
    findings: evidencePack.items.map((item) => item.title),
    recommendedActions: [],
    risks: [],
    assumptions: [],
    limitations: [],
    claims: [{ id: claimId, text: summary, classification: "fact", citations: evidencePack.items.map((item) => ({ evidenceId: item.id, locator: item.source.locator })) }],
    confidence: "high",
  };
}

function buildTrace(requestId: string, plan: GovernedPersonalQueryPlan, evidencePack: EvidencePack, startedAt: string, completedAt: string): StructuredAgentTrace {
  const stage = (name: StructuredAgentTrace["stages"][number]["stage"], inputRefs: string[], outputRefs: string[], summary: string) => ({
    id: `trace-stage.${requestId}.${name}`,
    stage: name,
    status: "completed" as const,
    startedAt,
    completedAt,
    durationMs: 0,
    tool: `personal-knowledge-${name}`,
    inputRefs,
    outputRefs,
    summary,
  });
  return {
    traceId: requestId,
    requestId,
    stages: [
      stage("query-plan-validation", [PERSONAL_KNOWLEDGE_DOMAIN], [plan.id], `Validated allowlisted operation ${plan.operation}.`),
      stage("graph-retrieval", [plan.seedId], evidencePack.items.flatMap((item) => item.linkedEntityIds), "Retrieved bounded public snapshot relationships."),
      stage("evidence-pack", [plan.id], [evidencePack.id], `Built ${evidencePack.items.length} provenance-preserving evidence items.`),
      stage("citation-validation", [evidencePack.id], ["citation-status.passed"], "Validated all published factual claims against the Evidence Pack."),
    ],
  };
}
