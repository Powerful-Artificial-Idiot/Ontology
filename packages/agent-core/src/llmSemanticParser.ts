import type {
  AgentDomain,
  AgentEntityRole,
  AgentQueryIntent,
  AgentTurnRequest,
  CanonicalKnowledgeBaseline,
  QueryPlanConstraint,
  SemanticQueryPlan,
} from "../../knowledge-contracts/src/index";
import { AgentPipelineError, assertPipeline } from "./errors";
import type { SemanticParser } from "./types";

export type SemanticParserMode = "deterministic" | "llm" | "hybrid";

export type SemanticEntityCandidate = {
  id: string;
  label: string;
  type: string;
  domain: string;
  matchedTerms: string[];
  matchScore: number;
};

export type LlmSemanticEntitySelection = {
  candidateId: string;
  role: AgentEntityRole;
};

export type LlmSemanticPlanDraft = {
  version: "1.0.0";
  intent: AgentQueryIntent;
  entities: LlmSemanticEntitySelection[];
  relationTypes: string[];
  requestedFacets: AgentDomain[];
  constraints: QueryPlanConstraint[];
  ambiguityNotes: string[];
};

export type LlmSemanticParseInput = {
  requestId: string;
  language: AgentTurnRequest["language"];
  message: string;
  context: {
    activeTopic?: string;
    resolvedEntityIds: string[];
  };
  ontologyVersion: string;
  candidates: SemanticEntityCandidate[];
  allowedIntents: AgentQueryIntent[];
  allowedRelationTypes: string[];
  allowedFacets: AgentDomain[];
  allowedConstraintKeys: string[];
};

export interface LlmSemanticParserProvider {
  readonly providerName: string;
  parse(input: LlmSemanticParseInput, signal?: AbortSignal): Promise<unknown>;
}

export interface EntityCandidateResolver {
  resolve(message: string, baseline: CanonicalKnowledgeBaseline): SemanticEntityCandidate[];
}

export class CanonicalEntityCandidateResolver implements EntityCandidateResolver {
  constructor(private readonly maximumCandidates = 30) {}

  resolve(message: string, baseline: CanonicalKnowledgeBaseline): SemanticEntityCandidate[] {
    const normalizedMessage = normalizeText(message);
    const candidates = baseline.entities.map((entity) => {
      const terms = unique<string | undefined>([
        entity.id,
        entity.label,
        entity.description,
        ...Object.values(entity.properties).filter((value): value is string => typeof value === "string"),
        ...(entity.source ?? []).flatMap((source) => [source.sourceId, source.documentName].filter((value): value is string => Boolean(value))),
        ...(baseline.semanticAliases?.[entity.id] ?? []),
      ]).filter((term): term is string => typeof term === "string" && term.length >= 2);
      const matchedTerms = terms.filter((term) => normalizedMessage.includes(normalizeText(term)));
      return {
        id: entity.id,
        label: entity.label,
        type: entity.type,
        domain: entity.domain ?? "governance",
        matchedTerms,
        matchScore: matchedTerms.reduce((score, term) => score + Math.min(20, normalizeText(term).length), 0),
      };
    });
    return candidates
      .sort((left, right) => right.matchScore - left.matchScore || left.id.localeCompare(right.id))
      .slice(0, this.maximumCandidates);
  }
}

export class StrictLlmSemanticDraftValidator {
  validate(value: unknown, input: LlmSemanticParseInput): LlmSemanticPlanDraft {
    assertRecord(value, "LLM semantic output must be a JSON object.");
    assertKeys(value, ["version", "intent", "entities", "relationTypes", "requestedFacets", "constraints", "ambiguityNotes"]);
    assertPipeline(value.version === "1.0.0", "LLM_RESPONSE_INVALID", "LLM semantic output has an unsupported version.", "semantic-parsing");
    assertPipeline(typeof value.intent === "string" && input.allowedIntents.includes(value.intent as AgentQueryIntent), "LLM_RESPONSE_INVALID", "LLM returned an intent outside the allowlist.", "semantic-parsing");
    const intent = value.intent as AgentQueryIntent;
    assertPipeline(Array.isArray(value.entities), "LLM_RESPONSE_INVALID", "LLM semantic output entities must be an array.", "semantic-parsing");
    const candidateIds = new Set(input.candidates.map((candidate) => candidate.id));
    const entities = value.entities.map((entity, index) => {
      assertRecord(entity, `LLM entity selection ${index} must be an object.`);
      assertKeys(entity, ["candidateId", "role"]);
      assertPipeline(typeof entity.candidateId === "string" && candidateIds.has(entity.candidateId), "LLM_ENTITY_UNRESOLVED", "LLM selected an entity outside the deterministic candidate set.", "semantic-parsing", { entityIndex: index });
      assertPipeline(isEntityRole(entity.role), "LLM_RESPONSE_INVALID", "LLM returned an unsupported entity role.", "semantic-parsing", { entityIndex: index });
      return { candidateId: entity.candidateId, role: entity.role };
    });
    assertUnique(entities.map((entity) => entity.candidateId), "LLM semantic output contains duplicate entities.");

    const relationTypes = stringArray(value.relationTypes, "relationTypes");
    assertPipeline(relationTypes.every((relation) => input.allowedRelationTypes.includes(relation)), "LLM_RESPONSE_INVALID", "LLM returned a relationship outside the allowlist.", "semantic-parsing");
    assertUnique(relationTypes, "LLM semantic output contains duplicate relationship types.");
    const requestedFacets = stringArray(value.requestedFacets, "requestedFacets") as AgentDomain[];
    assertPipeline(requestedFacets.every((facet) => input.allowedFacets.includes(facet)), "LLM_RESPONSE_INVALID", "LLM returned a facet outside the allowlist.", "semantic-parsing");
    assertUnique(requestedFacets, "LLM semantic output contains duplicate facets.");
    const constraints = validateConstraints(value.constraints, input.allowedConstraintKeys);
    const ambiguityNotes = stringArray(value.ambiguityNotes, "ambiguityNotes");

    if (intent !== "clarification_required") {
      assertPipeline(entities.length > 0, "LLM_ENTITY_UNRESOLVED", "LLM did not select a canonical entity.", "semantic-parsing");
    }
    return { version: "1.0.0", intent, entities, relationTypes, requestedFacets, constraints, ambiguityNotes };
  }
}

export class LlmSemanticParser implements SemanticParser {
  readonly toolName: string;

  constructor(
    private readonly provider: LlmSemanticParserProvider,
    private readonly resolver: EntityCandidateResolver = new CanonicalEntityCandidateResolver(),
    private readonly validator = new StrictLlmSemanticDraftValidator(),
  ) {
    this.toolName = `llm-semantic-parser.${provider.providerName}.v1`;
  }

  async parse(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline, signal?: AbortSignal): Promise<SemanticQueryPlan> {
    const input = buildProviderInput(request, baseline, this.resolver.resolve(request.message, baseline));
    let raw: unknown;
    try {
      raw = await this.provider.parse(input, signal);
    } catch (error) {
      if (error instanceof AgentPipelineError) throw error;
      throw new AgentPipelineError(
        "LLM_PROVIDER_UNAVAILABLE",
        `Semantic parser provider ${this.provider.providerName} is unavailable.`,
        "semantic-parsing",
        { provider: this.provider.providerName },
      );
    }
    const draft = this.validator.validate(raw, input);
    if (draft.intent === "clarification_required") {
      throw new AgentPipelineError(
        "CLARIFICATION_REQUIRED",
        "The semantic parser could not resolve the request within the governed ontology scope.",
        "semantic-parsing",
        { ambiguityCount: draft.ambiguityNotes.length },
      );
    }
    const entityById = new Map(baseline.entities.map((entity) => [entity.id, entity]));
    const entities = draft.entities.map((selection) => {
      const entity = entityById.get(selection.candidateId);
      assertPipeline(entity, "LLM_ENTITY_UNRESOLVED", "Selected candidate is not present in the canonical baseline.", "semantic-parsing");
      return { id: entity.id, label: entity.label, type: entity.type, role: selection.role };
    });
    return {
      planId: `query-plan.${request.requestId}`,
      planVersion: "1.0.0",
      intent: draft.intent,
      originalQuestion: request.message,
      entities,
      relationTypes: [...draft.relationTypes],
      requestedFacets: [...draft.requestedFacets],
      constraints: draft.constraints.map(cloneConstraint),
      assumptions: request.language === "en"
        ? ["The recent abnormality is a local QMS fixture signal; no live time series is connected."]
        : [...baseline.queryPlan.assumptions],
    };
  }
}

export class HybridSemanticParser implements SemanticParser {
  readonly toolName = "hybrid-semantic-parser.v1";

  constructor(private readonly deterministic: SemanticParser, private readonly llm: SemanticParser) {}

  async parse(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline, signal?: AbortSignal): Promise<SemanticQueryPlan> {
    try {
      return await this.deterministic.parse(request, baseline, signal);
    } catch (error) {
      if (!(error instanceof AgentPipelineError) || error.detail.code !== "CLARIFICATION_REQUIRED") throw error;
      return this.llm.parse(request, baseline, signal);
    }
  }
}

function buildProviderInput(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline, candidates: SemanticEntityCandidate[]): LlmSemanticParseInput {
  return {
    requestId: request.requestId,
    language: request.language,
    message: request.message,
    context: {
      activeTopic: request.context?.activeTopic,
      resolvedEntityIds: (request.context?.resolvedEntityIds ?? []).filter((id) => baseline.entities.some((entity) => entity.id === id)),
    },
    ontologyVersion: baseline.ontologyVersion,
    candidates,
    allowedIntents: unique([...(baseline.scenario.supportedIntents ?? [baseline.scenario.intent]), "clarification_required"]),
    allowedRelationTypes: [...baseline.queryPlan.relationTypes],
    allowedFacets: ["production", "quality", "engineering", "valueStream", "governance"],
    allowedConstraintKeys: unique([
      ...baseline.queryPlan.constraints.map((constraint) => constraint.key),
      "referenceValue",
      "referenceMetricId",
      "referencePolicy",
      "percentageChange",
      "unit",
      "timePeriod",
      "specificationRevision",
      "programVersion",
    ]),
  };
}

function validateConstraints(value: unknown, allowedKeys: string[]): QueryPlanConstraint[] {
  assertPipeline(Array.isArray(value), "LLM_RESPONSE_INVALID", "LLM semantic output constraints must be an array.", "semantic-parsing");
  return value.map((constraint, index) => {
    assertRecord(constraint, `LLM constraint ${index} must be an object.`);
    assertKeys(constraint, ["key", "operator", "value"]);
    assertPipeline(typeof constraint.key === "string" && allowedKeys.includes(constraint.key), "LLM_RESPONSE_INVALID", "LLM returned a constraint key outside the compiler allowlist.", "semantic-parsing", { constraintIndex: index });
    assertPipeline(isConstraintOperator(constraint.operator), "LLM_RESPONSE_INVALID", "LLM returned an unsupported constraint operator.", "semantic-parsing", { constraintIndex: index });
    assertPipeline(isConstraintValue(constraint.value), "LLM_RESPONSE_INVALID", "LLM returned an unsupported constraint value.", "semantic-parsing", { constraintIndex: index });
    return { key: constraint.key, operator: constraint.operator, value: Array.isArray(constraint.value) ? [...constraint.value] : constraint.value };
  });
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertPipeline(Boolean(value) && typeof value === "object" && !Array.isArray(value), "LLM_RESPONSE_INVALID", message, "semantic-parsing");
}

function assertKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  assertPipeline(unexpected.length === 0, "LLM_RESPONSE_INVALID", "LLM semantic output contains undeclared fields.", "semantic-parsing", { unexpectedFieldCount: unexpected.length });
}

function stringArray(value: unknown, name: string): string[] {
  assertPipeline(Array.isArray(value) && value.every((item) => typeof item === "string"), "LLM_RESPONSE_INVALID", `LLM semantic output ${name} must be a string array.`, "semantic-parsing");
  return [...value];
}

function assertUnique(values: string[], message: string): void {
  assertPipeline(new Set(values).size === values.length, "LLM_RESPONSE_INVALID", message, "semantic-parsing");
}

function isEntityRole(value: unknown): value is AgentEntityRole {
  return typeof value === "string" && ["subject", "affected", "resource", "risk", "evidence", "context"].includes(value);
}

function isConstraintOperator(value: unknown): value is QueryPlanConstraint["operator"] {
  return typeof value === "string" && ["eq", "in", "before", "after", "between"].includes(value);
}

function isConstraintValue(value: unknown): value is QueryPlanConstraint["value"] {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function cloneConstraint(constraint: QueryPlanConstraint): QueryPlanConstraint {
  return { ...constraint, value: Array.isArray(constraint.value) ? [...constraint.value] : constraint.value };
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") ?? "";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
