import { leakRateQualityIssueTraceBaseline } from "../../demo-data/src/index";
import {
  AGENT_CONTRACT_VERSION,
  type AgentAnswer,
  type AgentCitation,
  type AgentClaim,
  type AgentTurnRequest,
  type CanonicalKnowledgeBaseline,
  type CitationValidationIssue,
  type CitationValidationResult,
  type EvidenceItem,
  type EvidencePack,
  type GraphQueryPlan,
  type SemanticQueryPlan,
  type ValidatedQueryPlan,
} from "../../knowledge-contracts/src/index";
import { AgentPipelineError, assertPipeline } from "./errors";
import type {
  AgentClock,
  AgentIdFactory,
  AgentKnowledgeSource,
  AnswerComposer,
  CitationValidator,
  DocumentEvidenceRetriever,
  DocumentRetrievalResult,
  EvidencePackBuilder,
  GraphQueryCompiler,
  GraphRetrievalResult,
  GraphRetriever,
  OntologyQueryPlanValidator,
  PipelineIdentifiers,
  QueryPlanSchemaValidator,
  SemanticParser,
} from "./types";

const QUALITY_TRACE_TEMPLATE = "quality-issue-trace.direct-neighborhood.v1";

export class SystemAgentClock implements AgentClock {
  now(): Date {
    return new Date();
  }
}

export class StableAgentIdFactory implements AgentIdFactory {
  forRequest(request: AgentTurnRequest): PipelineIdentifiers {
    const suffix = request.requestId.replace(/[^a-zA-Z0-9._-]/g, "-");
    return { turnId: `turn.${suffix}`, traceId: `trace.${suffix}` };
  }
}

export class LeakRateCanonicalKnowledgeSource implements AgentKnowledgeSource {
  async getBaseline(scenarioId?: string): Promise<CanonicalKnowledgeBaseline> {
    if (scenarioId && scenarioId !== leakRateQualityIssueTraceBaseline.scenario.id) {
      throw new AgentPipelineError("QUERY_INTENT_UNSUPPORTED", `No canonical baseline is registered for scenario: ${scenarioId}`);
    }
    return leakRateQualityIssueTraceBaseline;
  }
}

export class DeterministicLeakRateSemanticParser implements SemanticParser {
  readonly toolName = "deterministic-leak-rate-parser.v1";

  async parse(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline): Promise<SemanticQueryPlan> {
    const normalized = request.message.normalize("NFKC").toLowerCase();
    const hasOperation = /\bop\s*30\b/u.test(normalized) || normalized.includes("leak test") || normalized.includes("泄漏测试");
    const hasCharacteristic = ["leak rate", "air leak", "leakage", "泄漏率", "漏率", "泄漏"].some((term) => normalized.includes(term));
    if (!hasOperation || !hasCharacteristic) {
      throw new AgentPipelineError(
        "CLARIFICATION_REQUIRED",
        "The deterministic parser requires an OP30 and Leak Rate reference.",
        "semantic-parsing",
        { hasOperation, hasCharacteristic },
      );
    }

    return {
      ...baseline.queryPlan,
      planId: `query-plan.${request.requestId}`,
      originalQuestion: request.message,
      entities: baseline.queryPlan.entities.map((entity) => ({ ...entity })),
      relationTypes: [...baseline.queryPlan.relationTypes],
      requestedFacets: [...baseline.queryPlan.requestedFacets],
      constraints: baseline.queryPlan.constraints.map((constraint) => ({
        ...constraint,
        value: Array.isArray(constraint.value) ? [...constraint.value] : constraint.value,
      })),
      assumptions: request.language === "en"
        ? ["The recent abnormality is a local QMS fixture signal; no live time series is connected."]
        : [...baseline.queryPlan.assumptions],
    };
  }
}

export class StrictQueryPlanValidator implements QueryPlanSchemaValidator {
  async validate(plan: SemanticQueryPlan): Promise<SemanticQueryPlan> {
    assertPipeline(plan.planVersion === "1.0.0", "QUERY_PLAN_INVALID", "Unsupported semantic query plan version.", "query-plan-validation");
    assertPipeline(plan.intent === "quality_issue_trace", "QUERY_INTENT_UNSUPPORTED", `Unsupported deterministic intent: ${plan.intent}`, "query-plan-validation");
    assertPipeline(plan.originalQuestion.trim().length > 0, "QUERY_PLAN_INVALID", "The original question is required.", "query-plan-validation");
    assertPipeline(plan.entities.length > 0, "QUERY_PLAN_INVALID", "At least one canonical entity is required.", "query-plan-validation");
    assertPipeline(new Set(plan.entities.map((entity) => entity.id)).size === plan.entities.length, "QUERY_PLAN_INVALID", "Semantic query plan contains duplicate entities.", "query-plan-validation");
    assertPipeline(new Set(plan.relationTypes).size === plan.relationTypes.length, "QUERY_PLAN_INVALID", "Semantic query plan contains duplicate relationship types.", "query-plan-validation");
    assertPipeline(plan.relationTypes.every(isSafeIdentifier), "QUERY_PLAN_INVALID", "Relationship types must be governed identifiers, not query text.", "query-plan-validation");
    return plan;
  }
}

export class CanonicalOntologyValidator implements OntologyQueryPlanValidator {
  async validate(plan: SemanticQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<ValidatedQueryPlan> {
    const entityById = new Map(baseline.entities.map((entity) => [entity.id, entity]));
    const allowedRelationTypes = new Set(baseline.queryPlan.relationTypes);
    for (const reference of plan.entities) {
      const entity = entityById.get(reference.id);
      assertPipeline(entity, "ONTOLOGY_TERM_INVALID", `Unknown canonical entity: ${reference.id}`, "ontology-validation", { entityId: reference.id });
      if (reference.type) {
        assertPipeline(entity.type === reference.type, "ONTOLOGY_TERM_INVALID", `Entity type mismatch for ${reference.id}.`, "ontology-validation", { expected: entity.type, actual: reference.type });
      }
    }
    for (const relationType of plan.relationTypes) {
      assertPipeline(allowedRelationTypes.has(relationType), "ONTOLOGY_TERM_INVALID", `Relationship type is not allowed by the canonical baseline: ${relationType}`, "ontology-validation", { relationType });
    }
    return {
      plan,
      status: "valid",
      ontologyVersion: baseline.ontologyVersion,
      authorizedEntityIds: baseline.entities.map((entity) => entity.id),
      queryTemplateId: QUALITY_TRACE_TEMPLATE,
      parameters: { seedEntityIds: plan.entities.map((entity) => entity.id), status: "active" },
      warnings: [],
    };
  }
}

export class AllowlistedGraphQueryCompiler implements GraphQueryCompiler {
  async compile(validated: ValidatedQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<GraphQueryPlan> {
    assertPipeline(validated.plan.intent === "quality_issue_trace", "QUERY_INTENT_UNSUPPORTED", `No graph template for intent: ${validated.plan.intent}`, "query-compilation");
    assertPipeline(validated.queryTemplateId === QUALITY_TRACE_TEMPLATE, "QUERY_INTENT_UNSUPPORTED", `Graph template is not allowlisted: ${validated.queryTemplateId}`, "query-compilation");
    const seedEntityIds = validated.plan.entities.map((entity) => entity.id);
    assertPipeline(seedEntityIds.every((id) => validated.authorizedEntityIds.includes(id)), "ONTOLOGY_TERM_INVALID", "Graph plan contains an entity outside the validated scope.", "query-compilation");
    return {
      ...baseline.graphQueryPlan,
      graphPlanId: `graph-query-plan.${validated.plan.planId}`,
      semanticPlanId: validated.plan.planId,
      seedEntityIds,
      allowedRelationTypes: [...baseline.graphQueryPlan.allowedRelationTypes],
      parameters: { ...baseline.graphQueryPlan.parameters },
    };
  }
}

export class InMemoryCanonicalGraphRetriever implements GraphRetriever {
  async retrieve(plan: GraphQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<GraphRetrievalResult> {
    assertPipeline(plan.readOnly === true, "QUERY_PLAN_INVALID", "Graph retrieval only accepts read-only plans.", "graph-retrieval");
    assertPipeline(plan.maxDepth <= 3, "QUERY_PLAN_INVALID", "Graph traversal exceeds the maximum depth.", "graph-retrieval", { maxDepth: plan.maxDepth });
    assertPipeline(plan.resultLimit <= 200, "QUERY_PLAN_INVALID", "Graph traversal exceeds the maximum result limit.", "graph-retrieval", { resultLimit: plan.resultLimit });
    const entityIds = new Set(baseline.entities.map((entity) => entity.id));
    plan.seedEntityIds.forEach((id) => assertPipeline(entityIds.has(id), "ONTOLOGY_TERM_INVALID", `Graph seed does not exist: ${id}`, "graph-retrieval"));

    const allowedRelations = new Set(plan.allowedRelationTypes);
    const visited = new Set(plan.seedEntityIds);
    let frontier = new Set(plan.seedEntityIds);
    for (let depth = 0; depth < plan.maxDepth && frontier.size > 0; depth += 1) {
      const next = new Set<string>();
      baseline.relations.forEach((relation) => {
        if (!allowedRelations.has(relation.label ?? relation.predicate)) return;
        if (frontier.has(relation.sourceId) && !visited.has(relation.targetId)) next.add(relation.targetId);
        if (frontier.has(relation.targetId) && !visited.has(relation.sourceId)) next.add(relation.sourceId);
      });
      next.forEach((id) => visited.add(id));
      frontier = next;
    }

    assertPipeline(visited.size <= plan.resultLimit, "QUERY_PLAN_INVALID", "Graph result exceeds the bounded result limit.", "graph-retrieval", { resultCount: visited.size });
    const entities = baseline.entities.filter((entity) => visited.has(entity.id));
    const relations = baseline.relations.filter((relation) => visited.has(relation.sourceId) && visited.has(relation.targetId) && allowedRelations.has(relation.label ?? relation.predicate));
    return { graphPlanId: plan.graphPlanId, repositoryType: "canonical-fixture", entities, relations };
  }
}

export class InMemoryCanonicalDocumentRetriever implements DocumentEvidenceRetriever {
  async retrieve(graph: GraphRetrievalResult, baseline: CanonicalKnowledgeBaseline): Promise<DocumentRetrievalResult> {
    const entityIds = new Set(graph.entities.map((entity) => entity.id));
    const items = baseline.evidencePack.items
      .filter((item) => item.linkedEntityIds.some((id) => entityIds.has(id)))
      .map(cloneEvidenceItem);
    return { graphPlanId: graph.graphPlanId, items };
  }
}

export class CanonicalEvidencePackBuilder implements EvidencePackBuilder {
  async build(plan: SemanticQueryPlan, _graph: GraphRetrievalResult, documents: DocumentRetrievalResult, baseline: CanonicalKnowledgeBaseline, generatedAt: string): Promise<EvidencePack> {
    return {
      id: `evidence-pack.${plan.planId}`,
      queryPlanId: plan.planId,
      generatedAt,
      ontologyVersion: baseline.ontologyVersion,
      dataVersion: baseline.dataVersion,
      items: documents.items.map(cloneEvidenceItem),
      claimPolicies: baseline.evidencePack.claimPolicies?.map((policy) => ({ ...policy })),
      limitations: [...baseline.evidencePack.limitations],
    };
  }
}

export class DeterministicEvidenceAnswerComposer implements AnswerComposer {
  readonly toolName = "deterministic-evidence-answer-composer.v1";

  async compose(request: AgentTurnRequest, graph: GraphRetrievalResult, evidencePack: EvidencePack): Promise<AgentAnswer> {
    const entityByType = new Map(graph.entities.map((entity) => [entity.type, entity]));
    const product = entityByType.get("mfg:Product")?.label ?? "Brake Booster Assembly";
    const machine = entityByType.get("mfg:Machine")?.label ?? "M220 Leak Test Bench";
    const failureMode = entityByType.get("qual:FailureMode")?.label ?? "Internal Leakage";
    const citationsFor = (claimId: string): AgentCitation[] => evidencePack.items
      .filter((item) => item.supportsClaimIds.includes(claimId))
      .map((item) => ({ evidenceId: item.id, locator: item.source.locator }));
    const claims: AgentClaim[] = [
      fact("claim.affected-product", `OP30 belongs to the released ${product} route.`, citationsFor("claim.affected-product")),
      fact("claim.affected-equipment", `OP30 uses ${machine}, FX-002 and LeakTestProgram V3.4.`, citationsFor("claim.affected-equipment")),
      fact("claim.quality-risk", `Leak Rate is controlled at 100% frequency and is linked to ${failureMode} risk.`, citationsFor("claim.quality-risk")),
      fact("claim.governed-documents", "Control Plan, PFMEA and SOP are the governed documents for this investigation.", citationsFor("claim.governed-documents")),
      { id: "claim.signal-limitation", text: "The actual affected batch population is unknown until live QMS and MES genealogy are connected.", classification: "limitation", citations: citationsFor("claim.signal-limitation") },
    ];

    if (request.language === "en") {
      return {
        summary: `The Leak Rate abnormality may affect ${product} and is associated with ${machine}, FX-002, the released V3.4 program, ${failureMode} risk, and governed quality documents.`,
        findings: [
          `Product scope: ${product}.`,
          `Equipment and engineering resources: ${machine}, FX-002, and LeakTestProgram V3.4.`,
          `Quality risk: ${failureMode}; inspection frequency is 100%.`,
          "Governed documents: Control Plan Rev.A, PFMEA Rev.B, and SOP Rev.3.",
        ],
        recommendedActions: ["Start containment under the Control Plan.", "Verify M220, FX-002, the active program version, and golden-part results.", "Add QMS results and MES genealogy before confirming the actual affected population."],
        risks: ["Without live batch and equipment data, the pipeline cannot claim that every product is affected."],
        assumptions: ["The abnormal signal comes from the Phase 2 local QMS fixture."],
        limitations: [...evidencePack.limitations],
        claims,
        confidence: "high",
      };
    }

    return {
      summary: `Leak Rate 异常可能影响 ${product}，并关联 ${machine}、FX-002、V3.4 程序、${failureMode} 风险以及受控质量文件。`,
      findings: [`产品范围：${product}。`, `设备与工程资源：${machine}、FX-002、LeakTestProgram V3.4。`, `质量风险：${failureMode}，检测频率为 100%。`, "受控文件：Control Plan Rev.A、PFMEA Rev.B、SOP Rev.3。"],
      recommendedActions: ["按 Control Plan 启动围堵。", "核对 M220、FX-002、程序版本和 golden-part 结果。", "补充 QMS 结果与 MES genealogy 后再确认实际影响范围。"],
      risks: ["缺少实时批次和设备数据时，不能断言全部产品均已受影响。"],
      assumptions: ["异常信号来自 Phase 2 本地 QMS fixture。"],
      limitations: [...evidencePack.limitations],
      claims,
      confidence: "high",
    };
  }
}

export class StrictCitationValidator implements CitationValidator {
  async validate(answer: AgentAnswer, evidencePack: EvidencePack): Promise<CitationValidationResult> {
    const evidenceById = new Map(evidencePack.items.map((item) => [item.id, item]));
    const policyById = new Map(evidencePack.claimPolicies?.map((policy) => [policy.claimId, policy]) ?? []);
    const issues: CitationValidationIssue[] = [];
    const claimIds = answer.claims.map((claim) => claim.id);
    const seenClaimIds = new Set<string>();
    claimIds.forEach((claimId) => {
      if (seenClaimIds.has(claimId)) issues.push({ claimId, code: "duplicate-claim", message: `Answer contains duplicate claim ID: ${claimId}` });
      seenClaimIds.add(claimId);
    });
    evidencePack.claimPolicies?.filter((policy) => policy.required && !seenClaimIds.has(policy.claimId)).forEach((policy) => {
      issues.push({ claimId: policy.claimId, code: "missing-required-claim", message: `Answer omitted required governed claim: ${policy.claimId}` });
    });
    answer.claims.forEach((claim) => {
      const policy = policyById.get(claim.id);
      if (evidencePack.claimPolicies && !policy) {
        issues.push({ claimId: claim.id, code: "unknown-claim", message: `Claim is not declared by the Evidence Pack: ${claim.id}` });
      } else if (policy && policy.classification !== claim.classification) {
        issues.push({ claimId: claim.id, code: "claim-classification-mismatch", message: `Claim classification does not match the Evidence Pack policy: ${claim.id}` });
      }
      if (claim.classification === "fact" && claim.citations.length === 0) {
        issues.push({ claimId: claim.id, code: "missing-citation", message: "Factual claim has no evidence citation." });
      }
      claim.citations.forEach((citation) => {
        const evidence = evidenceById.get(citation.evidenceId);
        if (!evidence) {
          issues.push({ claimId: claim.id, code: "unknown-evidence", message: `Unknown evidence ID: ${citation.evidenceId}` });
        } else if (evidence.status && evidence.status !== "active") {
          issues.push({ claimId: claim.id, code: "inactive-evidence", message: `Evidence is not active: ${citation.evidenceId}` });
        } else if (!evidence.supportsClaimIds.includes(claim.id)) {
          issues.push({ claimId: claim.id, code: "unsupported-claim", message: `Evidence does not support claim: ${citation.evidenceId}` });
        }
      });
    });
    return {
      status: issues.length ? "failed" : "passed",
      checkedClaimIds: [...new Set(answer.claims.map((claim) => claim.id))],
      issues,
    };
  }
}

export function assertAgentRequest(request: AgentTurnRequest): void {
  assertPipeline(request.contractVersion === AGENT_CONTRACT_VERSION, "AGENT_CONTRACT_INCOMPATIBLE", `Expected Agent contract ${AGENT_CONTRACT_VERSION}.`);
  assertPipeline(request.requestId.trim().length > 0, "QUERY_PLAN_INVALID", "requestId is required.");
  assertPipeline(request.message.trim().length > 0, "QUERY_PLAN_INVALID", "message is required.");
  assertPipeline(request.mode === "scripted" || request.mode === "live", "QUERY_PLAN_INVALID", "Unsupported Agent mode.");
}

function fact(id: string, text: string, citations: AgentCitation[]): AgentClaim {
  return { id, text, classification: "fact", citations };
}

function cloneEvidenceItem(item: EvidenceItem): EvidenceItem {
  return {
    ...item,
    source: { ...item.source },
    linkedEntityIds: [...item.linkedEntityIds],
    supportsClaimIds: [...item.supportsClaimIds],
  };
}

function isSafeIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9.-]*$/i.test(value) && !/(create|merge|delete|set|remove|drop|call|match\s|return\s)/i.test(value);
}
