import {
  canonicalKnowledgeBaselineByScenarioId,
  leakRateQualityIssueTraceBaseline,
} from "../../demo-data/src/index";
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
  type QuantitativeAssessmentEnvelope,
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

const SUPPORTED_DETERMINISTIC_INTENTS = new Set([
  "quality_issue_trace",
  "quality_specification",
  "quality_control_threshold",
  "control_method_capability",
  "latest_quality_metric",
  "percentage_change_assessment",
  "value_limit_comparison",
  "reaction_plan",
  "measurement_system_capability",
  "program_change_status",
  "evidence_lookup",
  "engineering_change_impact",
  "bottleneck_analysis",
]);

const QUALITY_QUERY_TEMPLATE_BY_INTENT: Partial<Record<SemanticQueryPlan["intent"], string>> = {
  quality_issue_trace: "quality-issue-trace.direct-neighborhood.v1",
  quality_specification: "GET_CHARACTERISTIC_SPECIFICATION",
  quality_control_threshold: "GET_CHARACTERISTIC_CONTROL_LIMITS",
  control_method_capability: "GET_CONTROL_METHOD",
  latest_quality_metric: "GET_LATEST_VALID_METRIC",
  percentage_change_assessment: "GET_CROSS_DOMAIN_EVIDENCE",
  value_limit_comparison: "GET_CROSS_DOMAIN_EVIDENCE",
  reaction_plan: "GET_REACTION_PLAN",
  measurement_system_capability: "GET_MEASUREMENT_SYSTEM",
  program_change_status: "GET_PROGRAM_VERSION_STATUS",
  evidence_lookup: "GET_CROSS_DOMAIN_EVIDENCE",
};

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

export class RegisteredCanonicalKnowledgeSource implements AgentKnowledgeSource {
  async getBaseline(scenarioId?: string): Promise<CanonicalKnowledgeBaseline> {
    const resolvedId = scenarioId ?? leakRateQualityIssueTraceBaseline.scenario.id;
    const baseline = canonicalKnowledgeBaselineByScenarioId.get(resolvedId);
    if (!baseline) throw new AgentPipelineError("QUERY_INTENT_UNSUPPORTED", `No canonical baseline is registered for scenario: ${resolvedId}`);
    return baseline;
  }
}

export class LeakRateCanonicalKnowledgeSource extends RegisteredCanonicalKnowledgeSource {}

export class DeterministicScenarioSemanticParser implements SemanticParser {
  readonly toolName: string = "deterministic-canonical-scenario-parser.v1";

  async parse(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline): Promise<SemanticQueryPlan> {
    const normalized = request.message.normalize("NFKC").toLowerCase();
    if (baseline.scenario.id === "engineering-change-impact") {
      const reversedProgramDirection = /from\s+(?:leaktestprogram\s+)?v3\.5\s+to\s+(?:leaktestprogram\s+)?v3\.4/u.test(normalized);
      if (reversedProgramDirection) {
        throw new AgentPipelineError(
          "CLARIFICATION_REQUIRED",
          "The requested program direction conflicts with the governed current/proposed version baseline.",
          "semantic-parsing",
          { currentVersion: "V3.4", proposedVersion: "V3.5" },
        );
      }
    }
    const intent = baseline.scenario.id === "quality-issue-trace"
      ? inferQualityIntent(normalized)
      : baseline.scenario.intent;
    const entityById = new Map(baseline.entities.map((entity) => [entity.id, entity]));
    const missingSeedEntityIds = baseline.scenario.seedEntityIds.filter((entityId) => {
      if (baseline.scenario.id === "quality-issue-trace") {
        if (intent === "program_change_status") return false;
        if (entityId === "operation.op30") return !(/\bop\s*30\b/u.test(normalized) || normalized.includes("leak test") || normalized.includes("泄漏测试") || normalized.includes("leak rate") || normalized.includes("泄漏率"));
        if (entityId === "quality-characteristic.leak-rate") return !["leak rate", "air leak", "leakage", "泄漏率", "漏率", "泄漏", "气密性"].some((term) => normalized.includes(term));
      }
      const entity = entityById.get(entityId);
      const terms = [entityId, entity?.label ?? "", ...(baseline.semanticAliases?.[entityId] ?? [])]
        .map((term) => term.normalize("NFKC").toLowerCase())
        .filter(Boolean);
      return !terms.some((term) => normalized.includes(term));
    });
    if (missingSeedEntityIds.length) {
      throw new AgentPipelineError(
        "CLARIFICATION_REQUIRED",
        `The deterministic parser requires explicit references for scenario ${baseline.scenario.id}.`,
        "semantic-parsing",
        { missingSeedEntityIds: missingSeedEntityIds.join(",") },
      );
    }

    const matchedEntities = baseline.entities.filter((entity) => {
      const terms = [entity.id, entity.label, ...(baseline.semanticAliases?.[entity.id] ?? [])]
        .map((term) => term.normalize("NFKC").toLowerCase());
      return terms.some((term) => term.length >= 3 && normalized.includes(term));
    });
    const selectedEntities = new Map(baseline.queryPlan.entities.map((entity) => [entity.id, { ...entity }]));
    if (baseline.scenario.id === "quality-issue-trace" && intent !== "quality_issue_trace") {
      matchedEntities.forEach((entity) => selectedEntities.set(entity.id, {
        id: entity.id,
        label: entity.label,
        type: entity.type,
        role: entity.id === "operation.op30" || entity.id === "quality-characteristic.leak-rate" ? "subject" : "context",
      }));
    }
    const constraints = baseline.queryPlan.constraints.map((constraint) => ({
      ...constraint,
      value: Array.isArray(constraint.value) ? [...constraint.value] : constraint.value,
    }));
    if (intent === "percentage_change_assessment" || intent === "value_limit_comparison") {
      const percentageChange = extractPercentage(normalized);
      const referenceValue = extractReferenceValue(normalized);
      if (percentageChange !== undefined || intent === "value_limit_comparison") {
        constraints.push({ key: "percentageChange", operator: "eq", value: percentageChange ?? 0 });
      }
      if (referenceValue !== undefined) constraints.push({ key: "referenceValue", operator: "eq", value: referenceValue });
      constraints.push({
        key: "referencePolicy",
        operator: "eq",
        value: referenceValue !== undefined
          ? "explicit"
          : /control center|center line|中心线|中心值/u.test(normalized)
            ? "control-center-line"
            : /latest|current mean|最新|当前均值/u.test(normalized)
              ? "latest-governed-observation"
              : "compare-all-governed-baselines",
      });
    }
    return {
      ...baseline.queryPlan,
      planId: `query-plan.${request.requestId}`,
      intent,
      originalQuestion: request.message,
      entities: [...selectedEntities.values()],
      relationTypes: [...baseline.queryPlan.relationTypes],
      requestedFacets: [...baseline.queryPlan.requestedFacets],
      constraints,
      assumptions: intent === "percentage_change_assessment" && extractReferenceValue(normalized) === undefined
        ? [...baseline.queryPlan.assumptions, "The percentage increase has no explicit baseline; compare all governed baselines."]
        : [...baseline.queryPlan.assumptions],
    };
  }
}

export class DeterministicLeakRateSemanticParser extends DeterministicScenarioSemanticParser {
  override readonly toolName = "deterministic-leak-rate-parser.v1";
}

export class StrictQueryPlanValidator implements QueryPlanSchemaValidator {
  async validate(plan: SemanticQueryPlan): Promise<SemanticQueryPlan> {
    assertPipeline(plan.planVersion === "1.0.0", "QUERY_PLAN_INVALID", "Unsupported semantic query plan version.", "query-plan-validation");
    assertPipeline(SUPPORTED_DETERMINISTIC_INTENTS.has(plan.intent), "QUERY_INTENT_UNSUPPORTED", `Unsupported deterministic intent: ${plan.intent}`, "query-plan-validation");
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
    const supportedIntents = new Set(baseline.scenario.supportedIntents ?? [baseline.scenario.intent]);
    assertPipeline(supportedIntents.has(plan.intent), "QUERY_INTENT_UNSUPPORTED", `Intent ${plan.intent} is not supported by scenario ${baseline.scenario.id}.`, "ontology-validation");
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
      queryTemplateId: QUALITY_QUERY_TEMPLATE_BY_INTENT[plan.intent] ?? baseline.graphQueryPlan.templateId,
      parameters: { seedEntityIds: plan.entities.map((entity) => entity.id), status: "active" },
      warnings: [],
    };
  }
}

export class AllowlistedGraphQueryCompiler implements GraphQueryCompiler {
  async compile(validated: ValidatedQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<GraphQueryPlan> {
    const supportedIntents = new Set(baseline.scenario.supportedIntents ?? [baseline.scenario.intent]);
    assertPipeline(supportedIntents.has(validated.plan.intent), "QUERY_INTENT_UNSUPPORTED", `No graph template for intent: ${validated.plan.intent}`, "query-compilation");
    const expectedTemplate = QUALITY_QUERY_TEMPLATE_BY_INTENT[validated.plan.intent] ?? baseline.graphQueryPlan.templateId;
    const isRichQualityIntent = baseline.scenario.id === "quality-issue-trace" && validated.plan.intent !== "quality_issue_trace";
    assertPipeline(validated.queryTemplateId === expectedTemplate, "QUERY_INTENT_UNSUPPORTED", `Graph template is not allowlisted: ${validated.queryTemplateId}`, "query-compilation");
    const seedEntityIds = validated.plan.entities.map((entity) => entity.id);
    assertPipeline(seedEntityIds.every((id) => validated.authorizedEntityIds.includes(id)), "ONTOLOGY_TERM_INVALID", "Graph plan contains an entity outside the validated scope.", "query-compilation");
    return {
      ...baseline.graphQueryPlan,
      graphPlanId: `graph-query-plan.${validated.plan.planId}`,
      semanticPlanId: validated.plan.planId,
      intent: validated.plan.intent,
      templateId: expectedTemplate,
      maxDepth: isRichQualityIntent ? 3 : baseline.graphQueryPlan.maxDepth,
      resultLimit: isRichQualityIntent ? 200 : baseline.graphQueryPlan.resultLimit,
      seedEntityIds,
      allowedRelationTypes: isRichQualityIntent
        ? [...baseline.queryPlan.relationTypes]
        : [...baseline.graphQueryPlan.allowedRelationTypes],
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
    return { graphPlanId: plan.graphPlanId, templateId: plan.templateId, repositoryType: "canonical-fixture", entities, relations };
  }
}

export class InMemoryCanonicalDocumentRetriever implements DocumentEvidenceRetriever {
  readonly toolName = "in-memory-canonical-document-retriever.v1";

  async retrieve(graph: GraphRetrievalResult, baseline: CanonicalKnowledgeBaseline): Promise<DocumentRetrievalResult> {
    if (graph.templateId === "quality-issue-trace.direct-neighborhood.v1") {
      const legacyEvidenceIds = new Set([
        "evidence-chunk.document.control-plan.cp-bb01.rev-a.sheet-process-control-row-op30-leak-rate",
        "evidence-chunk.document.pfmea.pf-bb01.rev-b.sheet-process-fmea-row-op30-internal-leakage",
        "evidence-chunk.document.sop.op30-leak-test.page-4-section-3-2-setup-and-golden-part-verification",
        "evidence-chunk.record.qms.leak-rate.2026-07-demo.record-qms-lr-2026-0716-signal-summary",
      ]);
      return {
        graphPlanId: graph.graphPlanId,
        items: baseline.evidencePack.items.filter((item) => legacyEvidenceIds.has(item.id)).map(cloneEvidenceItem),
      };
    }
    const entityIds = new Set(graph.entities.map((entity) => entity.id));
    const boundedRichQualityRetrieval = graph.templateId?.startsWith("GET_") ?? false;
    const perDocument = new Map<string, number>();
    const items = baseline.evidencePack.items
      .filter((item) => item.linkedEntityIds.some((id) => entityIds.has(id)))
      .filter((item) => {
        if (!boundedRichQualityRetrieval) return true;
        if (item.kind !== "document" && item.kind !== "system-record") return false;
        const documentId = item.governance?.documentId ?? item.id;
        const count = perDocument.get(documentId) ?? 0;
        if (count >= 2) return false;
        perDocument.set(documentId, count + 1);
        return true;
      })
      .slice(0, boundedRichQualityRetrieval ? 20 : undefined)
      .map(cloneEvidenceItem);
    return { graphPlanId: graph.graphPlanId, items };
  }
}

export class CanonicalEvidencePackBuilder implements EvidencePackBuilder {
  readonly toolName = "governed-evidence-pack-merger.v1";

  async build(
    plan: SemanticQueryPlan,
    _graph: GraphRetrievalResult,
    documents: DocumentRetrievalResult,
    baseline: CanonicalKnowledgeBaseline,
    generatedAt: string,
    quantitativeAssessment?: QuantitativeAssessmentEnvelope,
  ): Promise<EvidencePack> {
    const items = new Map<string, EvidenceItem>();
    const requiredClaimIds = requiredClaimsForIntent(plan.intent);
    baseline.evidencePack.items
      .filter((item) => item.kind !== "document" && item.kind !== "system-record")
      .filter((item) => plan.intent === "quality_issue_trace"
        ? item.id === "evidence.route.brake-booster.rev-c"
        : requiredClaimIds
          ? item.supportsClaimIds.some((claimId) => requiredClaimIds.has(claimId))
          : true)
      .forEach((item) => items.set(item.id, cloneEvidenceItem(item)));
    documents.items.forEach((item) => items.set(item.id, cloneEvidenceItem(item)));
    quantitativeAssessment?.assessments.forEach((assessment) => {
      items.set(`evidence.derived.${assessment.assessmentId}`, {
        id: `evidence.derived.${assessment.assessmentId}`,
        kind: "derived",
        title: `Deterministic Leak Rate assessment from ${assessment.referencePolicy}`,
        excerpt: `${assessment.formula}; warning=${assessment.warningLimitStatus}; action=${assessment.actionLimitStatus}; specification=${assessment.specificationStatus}; measurement=${assessment.measurementCapabilityStatus}.`,
        source: {
          sourceType: "deterministic-calculation",
          sourceId: assessment.assessmentId,
          sourceSystem: "QuantitativeQualityAssessmentService",
          locator: assessment.formula,
          recordedAt: generatedAt,
        },
        linkedEntityIds: [assessment.characteristicId, assessment.operationId, assessment.productId].filter((id): id is string => Boolean(id)),
        supportsClaimIds: ["claim.percentage-projection"],
        version: "1.0.0",
        effectiveAt: generatedAt,
        status: "active",
      });
    });
    return {
      id: `evidence-pack.${plan.planId}`,
      queryPlanId: plan.planId,
      generatedAt,
      ontologyVersion: baseline.ontologyVersion,
      dataVersion: baseline.dataVersion,
      items: [...items.values()],
      claimPolicies: baseline.evidencePack.claimPolicies?.map((policy) => ({
        ...policy,
        required: requiredClaimIds ? requiredClaimIds.has(policy.claimId) : policy.required,
      })),
      limitations: [...baseline.evidencePack.limitations],
    };
  }
}

function requiredClaimsForIntent(intent: SemanticQueryPlan["intent"]): Set<string> | undefined {
  const claimsByIntent: Partial<Record<SemanticQueryPlan["intent"], string[]>> = {
    quality_issue_trace: ["claim.affected-product", "claim.affected-equipment", "claim.quality-risk", "claim.governed-documents", "claim.signal-limitation"],
    quality_specification: ["claim.specification", "claim.control-thresholds", "claim.measurement-capability"],
    quality_control_threshold: ["claim.control-thresholds", "claim.reaction-plan"],
    control_method_capability: ["claim.measurement-capability", "claim.specification"],
    latest_quality_metric: ["claim.latest-metric"],
    percentage_change_assessment: ["claim.percentage-projection", "claim.control-thresholds", "claim.specification", "claim.measurement-capability", "claim.reaction-plan"],
    value_limit_comparison: ["claim.percentage-projection", "claim.control-thresholds", "claim.specification", "claim.measurement-capability", "claim.reaction-plan"],
    reaction_plan: ["claim.reaction-plan"],
    measurement_system_capability: ["claim.measurement-system"],
    program_change_status: ["claim.version-status", "claim.change-validation"],
    evidence_lookup: ["claim.causal-boundary"],
  };
  const claimIds = claimsByIntent[intent];
  return claimIds ? new Set(claimIds) : undefined;
}

export class DeterministicEvidenceAnswerComposer implements AnswerComposer {
  readonly toolName = "deterministic-evidence-answer-composer.v1";

  async compose(
    request: AgentTurnRequest,
    graph: GraphRetrievalResult,
    evidencePack: EvidencePack,
    _signal?: AbortSignal,
    baseline?: CanonicalKnowledgeBaseline,
    plan?: SemanticQueryPlan,
    quantitativeAssessment?: QuantitativeAssessmentEnvelope,
  ): Promise<AgentAnswer> {
    if (baseline?.scenario.id === "quality-issue-trace" && plan && plan.intent !== "quality_issue_trace") {
      return composeRichQualityAnswer(request, plan, evidencePack, quantitativeAssessment);
    }
    if (baseline && baseline.scenario.intent !== "quality_issue_trace") {
      return composeCanonicalScenarioAnswer(request, evidencePack, baseline);
    }
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
        } else if ((evidence.kind === "document" || evidence.kind === "system-record") && !hasValidEvidenceGovernance(evidence)) {
          issues.push({ claimId: claim.id, code: "ungoverned-evidence", message: `Document evidence has not passed governance validation: ${citation.evidenceId}` });
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

function composeCanonicalScenarioAnswer(
  request: AgentTurnRequest,
  evidencePack: EvidencePack,
  baseline: CanonicalKnowledgeBaseline,
): AgentAnswer {
  const availableEvidence = new Map(evidencePack.items.map((item) => [item.id, item]));
  const expected = baseline.expectedResponse.answer;
  const claims = expected.claims.map((claim) => ({
    ...claim,
    citations: claim.citations.flatMap((citation) => {
      const evidence = availableEvidence.get(citation.evidenceId);
      return evidence ? [{ evidenceId: evidence.id, locator: evidence.source.locator }] : [];
    }),
  }));

  if (request.language === "en") {
    return {
      ...expected,
      findings: [...expected.findings],
      recommendedActions: [...expected.recommendedActions],
      risks: [...expected.risks],
      assumptions: [...expected.assumptions],
      limitations: [...(expected.limitations ?? [])],
      claims,
    };
  }

  const localized = baseline.scenario.intent === "engineering_change_impact"
    ? {
        summary: "拟议的 V3.5 程序变更影响 M220 与 OP30；在完成验证并同步受控质量文件前，不得批准发布。",
        findings: ["V3.4 仍是已发布基线，V3.5 处于拟议状态。", "OP30 与 Leak Rate 控制属于变更影响范围。", "发布需要 ECR、验证记录、SOP 与 Control Plan 证据。"],
        recommendedActions: ["完成 V3.5 受控验证方案。", "复核 Control Plan 与 SOP 的一致性。", "在批准发布前保留 V3.4 作为回退基线。"],
        risks: ["未经验证的程序逻辑可能改变 Leak Rate 判定或误拒行为。"],
        assumptions: ["V3.5 是演示中的拟议变更，V3.4 仍是生产发布基线。"],
        limitations: ["当前未接入已完成的 V3.5 验证结果或真实部署历史。"],
        claimTexts: [
          "拟议的 V3.5 变更直接影响 M220 与 OP30，V3.4 仍是已发布程序。",
          "V3.5 在发布前必须完成受控回归验证。",
          "Leak Rate 阈值与反应规则仍由已发布 Control Plan 管理。",
          "发布需要已批准的 ECR、验证证据及受控文件一致性。",
          "演示数据没有已完成的 V3.5 验证结果，因此不能建议生产发布。",
        ],
      }
    : {
        summary: "OP20 是当前有边界证据支持的瓶颈候选；OP30 复测增加可能使约束下移或扩大，但仍需实时流动与质量数据确认。",
        findings: ["OP20 样本节拍为 48 秒，高于 45 秒 takt。", "OP20 前存在 WIP 与等待累积。", "OP30 复测是受控的下游转移风险，并非已确认事件。"],
        recommendedActions: ["采集当前周期与停机时间分布。", "观察 OP20 作业内容与资源可用性。", "监控 OP30 复测负荷与 OP40 前等待。"],
        risks: ["将有限样本误判为已确认瓶颈，可能导致错误的产能投资。"],
        assumptions: ["本地 OP20 与 OP30 样本是有边界的演示信号，不是实时企业遥测。"],
        limitations: ["当前未接入实时班次历史、停机分布、人员状态或已确认的 OP30 复测群体。"],
        claimTexts: [
          "OP20 当前是有边界证据支持的瓶颈候选：48 秒样本超过 45 秒 takt，且上游存在 WIP 与等待。",
          "OP20 约束会限制已发布 Brake Booster 路线流向 OP30 的产出。",
          "OP30 Leak Rate 复测增加可能使当前约束向 OP30 转移或扩大。",
          "实时决策需要当前周期、停机、WIP、等待及资源状态观测。",
          "本地 MES/QMS fixture 不能证明持续的实时瓶颈或实际瓶颈转移。",
        ],
      };

  return {
    summary: localized.summary,
    findings: localized.findings,
    recommendedActions: localized.recommendedActions,
    risks: localized.risks,
    assumptions: localized.assumptions,
    limitations: localized.limitations,
    claims: claims.map((claim, index) => ({ ...claim, text: localized.claimTexts[index] ?? claim.text })),
    confidence: expected.confidence,
  };
}

function composeRichQualityAnswer(
  request: AgentTurnRequest,
  plan: SemanticQueryPlan,
  evidencePack: EvidencePack,
  quantitativeAssessment?: QuantitativeAssessmentEnvelope,
): AgentAnswer {
  const citationsFor = (claimId: string): AgentCitation[] => evidencePack.items
    .filter((item) => item.supportsClaimIds.includes(claimId))
    .map((item) => ({ evidenceId: item.id, locator: item.source.locator }));
  const claim = (id: string, text: string): AgentClaim => fact(id, text, citationsFor(id));
  const english = request.language === "en";
  const sharedLimitations = [
    ...evidencePack.limitations,
    "All numeric values are synthetic governed demo fixtures and must not be used as production manufacturing specifications.",
  ];

  if (plan.intent === "percentage_change_assessment" || plan.intent === "value_limit_comparison") {
    assertPipeline(quantitativeAssessment && quantitativeAssessment.assessments.length > 0, "EVIDENCE_INSUFFICIENT", "Quantitative assessment output is required.", "answer-composition");
    const lines = quantitativeAssessment.assessments.map((assessment) => {
      const status = assessment.specificationStatus === "exceeded"
        ? (english ? "exceeds the product USL and is nonconforming" : "超过产品 USL，产品不合格")
        : assessment.specificationStatus === "at-limit"
          ? (english ? "reaches, but does not exceed, the product USL" : "达到但未超过产品 USL")
          : (english ? "remains within the product specification" : "仍在产品规格内");
      return `${assessment.formula}; ${status}; ${english ? "measurement status" : "测量能力"}: ${assessment.measurementCapabilityStatus}.`;
    });
    const projectionClaim = claim("claim.percentage-projection", lines.join(" "));
    const claims = [
      projectionClaim,
      claim("claim.control-thresholds", english
        ? "The governed internal warning limit is 0.24 sccm and the action limit is 0.27 sccm."
        : "受治理的内部预警限为 0.24 sccm，行动限为 0.27 sccm。"),
      claim("claim.specification", english
        ? "The effective product acceptance range is 0.00–0.30 sccm, with target 0.18 sccm."
        : "当前有效产品接受范围为 0.00–0.30 sccm，目标值为 0.18 sccm。"),
      claim("claim.measurement-capability", english
        ? "The M220 measurement range is 0.00–0.50 sccm; being measurable does not make a product conforming."
        : "M220 测量范围为 0.00–0.50 sccm；能够测量不代表产品合格。"),
      claim("claim.reaction-plan", english
        ? "Any projected value above 0.27 sccm requires the governed OP30 reaction plan."
        : "任何超过 0.27 sccm 的预测值都必须触发受治理的 OP30 Reaction Plan。"),
    ];
    const summary = quantitativeAssessment.baselineDisclosureRequired
      ? (english
          ? `A ${formatCompact(quantitativeAssessment.request.percentageChange)}% increase is baseline-dependent. ${lines.join(" ")}`
          : `“提升 ${formatCompact(quantitativeAssessment.request.percentageChange)}%”取决于基准。${lines.join(" ")}`)
      : lines[0];
    return {
      summary,
      findings: lines,
      recommendedActions: english
        ? ["Execute the governed reaction plan.", "Verify the master leak, fixture seals and released program version.", "Release product only after required evidence approval."]
        : ["执行受治理的 Reaction Plan。", "核验 master leak、工装密封及已发布程序版本。", "仅在所需证据批准后放行产品。"],
      risks: english
        ? ["A measurable result can still be nonconforming against the product specification."]
        : ["处于设备量程内的结果仍可能违反产品规格。"],
      assumptions: quantitativeAssessment.baselineDisclosureRequired
        ? [english ? "The user did not specify a baseline, so both governed baselines are disclosed." : "用户未指定基准，因此同时披露两个受治理基准。"]
        : [],
      limitations: sharedLimitations,
      claims,
      confidence: "high",
    };
  }

  const content = richQualityContent(plan.intent, english);
  if (plan.intent === "evidence_lookup") {
    const causalClaim: AgentClaim = {
      id: "claim.causal-boundary",
      text: english
        ? "The governed evidence is insufficient to conclude that the OP20 bottleneck caused the OP30 Leak Rate increase; synchronized time-series, controlled comparison and equipment/fixture evidence are still required."
        : "现有受治理证据不足以证明 OP20 瓶颈导致 OP30 Leak Rate 上升；仍需同步时间序列、受控对比及设备/工装证据。",
      classification: "limitation",
      citations: citationsFor("claim.causal-boundary"),
    };
    return {
      summary: causalClaim.text,
      findings: [causalClaim.text],
      recommendedActions: english
        ? ["Collect synchronized OP20 flow, OP30 quality, equipment and fixture evidence before causal attribution."]
        : ["在进行因果归因前，采集同步的 OP20 流动、OP30 质量、设备和工装证据。"],
      risks: [english ? "Correlation or sequence alone can create an unsupported causal claim." : "仅凭相关性或先后顺序会产生无证据的因果断言。"],
      assumptions: [],
      limitations: sharedLimitations,
      claims: [causalClaim],
      confidence: "medium",
    };
  }
  return {
    summary: content.summary,
    findings: content.findings,
    recommendedActions: content.actions,
    risks: content.risks,
    assumptions: [],
    limitations: sharedLimitations,
    claims: content.claims.map(([id, text]) => claim(id, text)),
    confidence: "high",
  };
}

function richQualityContent(intent: SemanticQueryPlan["intent"], english: boolean): {
  summary: string;
  findings: string[];
  actions: string[];
  risks: string[];
  claims: Array<[string, string]>;
} {
  const localized = {
    quality_specification: english
      ? ["The effective OP30 product acceptance range is 0.00–0.30 sccm; internal thresholds and equipment range are separate.", ["Target 0.18 sccm; warning 0.24; action 0.27; USL 0.30; equipment range 0.00–0.50 sccm."], ["Use the product specification for conformity and the control plan for process reaction."], ["Do not use the measurement range as an acceptance criterion."], [["claim.specification", "Brake Booster Leak Rate at OP30 has target 0.18 sccm, LSL 0.00 sccm and USL 0.30 sccm."], ["claim.control-thresholds", "Internal warning and action limits are 0.24 and 0.27 sccm."], ["claim.measurement-capability", "M220 measures 0.00–0.50 sccm at 0.01 sccm resolution."]]]
      : ["OP30 当前有效产品接受范围为 0.00–0.30 sccm；内部阈值和设备量程属于不同层级。", ["目标 0.18 sccm；预警 0.24；行动 0.27；USL 0.30；设备量程 0.00–0.50 sccm。"], ["产品合格性使用产品规格，过程反应使用 Control Plan。"], ["不得把设备量程作为产品接受标准。"], [["claim.specification", "Brake Booster 在 OP30 的 Leak Rate 目标为 0.18 sccm，LSL 为 0.00 sccm，USL 为 0.30 sccm。"], ["claim.control-thresholds", "内部预警限和行动限分别为 0.24 与 0.27 sccm。"], ["claim.measurement-capability", "M220 的测量范围为 0.00–0.50 sccm，分辨率为 0.01 sccm。"]]],
    quality_control_threshold: english
      ? ["The internal warning limit is 0.24 sccm and action limit is 0.27 sccm; neither is the product USL.", ["Values above 0.27 sccm require reaction; above 0.30 sccm are nonconforming."], ["Follow the governed reaction plan."], ["Control thresholds must not replace the acceptance specification."], [["claim.control-thresholds", "Warning is 0.24 sccm and action is 0.27 sccm; product USL remains 0.30 sccm."], ["claim.reaction-plan", "Values above the action limit require the governed OP30 reaction plan."]]]
      : ["内部预警限为 0.24 sccm，行动限为 0.27 sccm；二者都不是产品 USL。", ["超过 0.27 sccm 需反应，超过 0.30 sccm 判为不合格。"], ["执行受治理的 Reaction Plan。"], ["内部控制阈值不得替代产品接受规格。"], [["claim.control-thresholds", "预警限为 0.24 sccm，行动限为 0.27 sccm；产品 USL 仍为 0.30 sccm。"], ["claim.reaction-plan", "超过行动限时必须执行受治理的 OP30 Reaction Plan。"]]],
    latest_quality_metric: english
      ? ["The latest governed period is 2026-W29: mean 0.22 sccm, maximum 0.28 sccm, P95 0.27 sccm, Cpk 1.08, n=2400.", ["The current mean is above the 0.20 sccm baseline center but below the 0.24 sccm warning limit."], ["Continue monitoring and preserve source lineage."], ["Aggregated data does not identify individual nonconforming serial numbers."], [["claim.latest-metric", "For 2026-W29, governed Leak Rate mean is 0.22 sccm, maximum 0.28 sccm, P95 0.27 sccm, Cpk 1.08 and sample count 2400."]]]
      : ["最新受治理周期为 2026-W29：均值 0.22 sccm、最大值 0.28 sccm、P95 0.27 sccm、Cpk 1.08、样本数 2400。", ["当前均值高于 0.20 sccm 基准中心，但低于 0.24 sccm 预警限。"], ["继续监控并保留来源 lineage。"], ["聚合数据不能定位具体不合格序列号。"], [["claim.latest-metric", "2026-W29 的受治理 Leak Rate 均值为 0.22 sccm、最大值 0.28 sccm、P95 为 0.27 sccm、Cpk 为 1.08、样本数为 2400。"]]],
    reaction_plan: english
      ? ["Above 0.27 sccm, execute the governed reaction sequence before release.", ["Hold lot; identify last-known-good; verify master leak; inspect fixture seals; verify program; repeat golden sample; re-screen when required; create deviation; notify Quality; release after approval."], ["Record evidence for each completed step."], ["Skipping evidence approval invalidates release."], [["claim.reaction-plan", "The OP30 reaction plan defines ten ordered containment, verification, notification and release-control actions for values above 0.27 sccm."]]]
      : ["超过 0.27 sccm 后，放行前必须执行受治理的反应顺序。", ["隔离批次；确定最后已知良品；核验 master leak；检查工装密封；核验程序；重复 golden sample；必要时全检；创建偏差；通知质量工程师；批准后放行。"], ["记录每一步完成证据。"], ["跳过证据审批会使放行无效。"], [["claim.reaction-plan", "OP30 Reaction Plan 为超过 0.27 sccm 的情况定义了十项有顺序的围堵、验证、通知和放行控制措施。"]]],
    program_change_status: english
      ? ["LeakTestProgram V3.5 is proposed, pending validation and not effective for production; V3.4 remains current.", ["Required evidence includes MSA confirmation, master-leak verification, a 30-piece correlation study, capability confirmation and Quality approval."], ["Continue production with the released V3.4 baseline."], ["Potential impacts are not confirmed improvements."], [["claim.version-status", "V3.4 is approved, effective and current; V3.5 is proposed, pending validation and not effective."], ["claim.change-validation", "V3.5 still requires MSA, master-leak, 30-piece correlation, capability and Quality approval evidence."]]]
      : ["LeakTestProgram V3.5 处于拟议、待验证且未生效状态；V3.4 仍为当前版本。", ["所需证据包括 MSA 确认、master leak 验证、30 件相关性研究、能力确认和质量批准。"], ["继续使用已发布的 V3.4 生产基线。"], ["潜在影响不能表述为已确认改善。"], [["claim.version-status", "V3.4 已批准、有效且为当前版本；V3.5 为拟议、待验证且未生效。"], ["claim.change-validation", "V3.5 仍缺少 MSA、master leak、30 件相关性、能力确认和质量批准证据。"]]],
    control_method_capability: english
      ? ["The automated air-decay method can measure 0.00–0.50 sccm, but acceptance is governed separately by the 0.30 sccm product USL.", ["Range 0.00–0.50; resolution 0.01; pressure 500±5 kPa; stabilization 3.0 s; measurement 5.0 s; inspection 100%."], ["Apply specification and control thresholds independently."], ["Measurable does not mean conforming."], [["claim.measurement-capability", "The automated air-decay method has range 0.00–0.50 sccm, resolution 0.01 sccm, pressure 500±5 kPa, 3.0 s stabilization, 5.0 s measurement and 100% inspection."], ["claim.specification", "Product acceptance remains bounded by the effective 0.30 sccm USL."]]]
      : ["自动 air-decay 方法可测量 0.00–0.50 sccm，但产品接受性由独立的 0.30 sccm USL 管理。", ["量程 0.00–0.50；分辨率 0.01；压力 500±5 kPa；稳定 3.0 秒；测量 5.0 秒；100% 检测。"], ["分别应用产品规格与内部控制阈值。"], ["可测量不代表合格。"], [["claim.measurement-capability", "自动 air-decay 方法量程为 0.00–0.50 sccm、分辨率 0.01 sccm、压力 500±5 kPa、稳定 3.0 秒、测量 5.0 秒且 100% 检测。"], ["claim.specification", "产品接受性仍受当前有效的 0.30 sccm USL 约束。"]]],
    measurement_system_capability: english
      ? ["The M220 measurement system is currently calibrated and its MSA is acceptable for this demo baseline.", ["GRR 8.2% of tolerance; bias 0.004 sccm; calibration valid; range 0.00–0.50 sccm."], ["Verify calibration status before relying on measurements."], ["This synthetic MSA does not qualify production equipment."], [["claim.measurement-system", "M220 MSA records GRR 8.2% of tolerance and bias 0.004 sccm; calibration status is valid."]]]
      : ["M220 测量系统当前校准有效，MSA 在本演示基线中可接受。", ["GRR 为公差的 8.2%；偏倚 0.004 sccm；校准有效；量程 0.00–0.50 sccm。"], ["使用测量结果前核验校准状态。"], ["该合成 MSA 不能用于认定生产设备。"], [["claim.measurement-system", "M220 MSA 记录 GRR 为公差的 8.2%、偏倚为 0.004 sccm，校准状态有效。"]]],
  } as const;
  type RichContentTuple = readonly [
    string,
    readonly string[],
    readonly string[],
    readonly string[],
    readonly (readonly [string, string])[],
  ];
  const selected = (localized[intent as keyof typeof localized] ?? localized.quality_specification) as unknown as RichContentTuple;
  return {
    summary: selected[0],
    findings: [...selected[1]],
    actions: [...selected[2]],
    risks: [...selected[3]],
    claims: selected[4].map(([id, text]) => [id, text]),
  };
}

function inferQualityIntent(normalized: string): SemanticQueryPlan["intent"] {
  if (/(bottleneck|瓶颈)/u.test(normalized) && /(cause|causal|导致|证明)/u.test(normalized)) return "evidence_lookup";
  if (/%|percent|percentage|百分|提升|increase|增长/u.test(normalized)) return "percentage_change_assessment";
  if (/(reaction plan|反应计划|措施|what.*do|需要执行)/u.test(normalized) && /(0\.27|action|行动限|超过)/u.test(normalized)) return "reaction_plan";
  if (/(v3\.5|program change|程序.*生效|程序.*正式|validation)/u.test(normalized)) return "program_change_status";
  if (/(latest|current level|current leak|最新|当前.*水平|最大值|mean|cpk|均值)/u.test(normalized)) return "latest_quality_metric";
  if (/(grr|msa|calibrat|校准|测量系统)/u.test(normalized)) return "measurement_system_capability";
  if (/(0\.\d+)\s*sccm/u.test(normalized) && /(acceptable|conforming|合格|不合格|limit|范围)/u.test(normalized)) return "value_limit_comparison";
  if (/(measurement range|equipment range|control method|检测设备量程|设备量程|测量范围|检测方法|控制方法)/u.test(normalized)) return "control_method_capability";
  if (/(warning|action limit|control threshold|预警限|警戒线|行动限|反应限|控制阈值)/u.test(normalized)) return "quality_control_threshold";
  if (/(allowable|acceptance|specification|spec limit|usl|容许范围|允许范围|规格范围|接受标准|产品上限)/u.test(normalized)) return "quality_specification";
  return "quality_issue_trace";
}

function formatCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function extractPercentage(normalized: string): number | undefined {
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent|百分)/u);
  return match ? Number(match[1]) : undefined;
}

function extractReferenceValue(normalized: string): number | undefined {
  const explicit = normalized.match(/(?:from|reference|baseline|从|基准(?:为|是)?)\s*(\d+(?:\.\d+)?)\s*(?:sccm)?/u);
  if (explicit) return Number(explicit[1]);
  const values = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*sccm/gu)].map((match) => Number(match[1]));
  return values.length === 1 ? values[0] : undefined;
}

function cloneEvidenceItem(item: EvidenceItem): EvidenceItem {
  return {
    ...item,
    source: { ...item.source },
    linkedEntityIds: [...item.linkedEntityIds],
    supportsClaimIds: [...item.supportsClaimIds],
    governance: item.governance ? { ...item.governance } : undefined,
  };
}

function hasValidEvidenceGovernance(item: EvidenceItem): boolean {
  const governance = item.governance;
  return Boolean(governance
    && governance.documentId
    && governance.owner
    && governance.parserId
    && governance.parserVersion
    && governance.approvalStatus === "approved"
    && governance.lifecycleStatus === "effective"
    && governance.accessDecision === "allowed"
    && Boolean(item.source.locator)
    && Number.isFinite(Date.parse(governance.ingestedAt))
    && /^sha256:[a-f0-9]{64}$/u.test(governance.contentChecksum)
    && /^sha256:[a-f0-9]{64}$/u.test(governance.chunkChecksum));
}

function isSafeIdentifier(value: string): boolean {
  return /^[a-z][a-z0-9.-]*$/i.test(value) && !/(create|merge|delete|set|remove|drop|call|match\s|return\s)/i.test(value);
}
