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
  "engineering_change_impact",
  "bottleneck_analysis",
]);

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
    const entityById = new Map(baseline.entities.map((entity) => [entity.id, entity]));
    const missingSeedEntityIds = baseline.scenario.seedEntityIds.filter((entityId) => {
      if (baseline.scenario.id === "quality-issue-trace") {
        if (entityId === "operation.op30") return !(/\bop\s*30\b/u.test(normalized) || normalized.includes("leak test") || normalized.includes("泄漏测试"));
        if (entityId === "quality-characteristic.leak-rate") return !["leak rate", "air leak", "leakage", "泄漏率", "漏率", "泄漏"].some((term) => normalized.includes(term));
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
      assumptions: [...baseline.queryPlan.assumptions],
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
    assertPipeline(plan.intent === baseline.scenario.intent, "QUERY_INTENT_UNSUPPORTED", `Intent ${plan.intent} does not match scenario ${baseline.scenario.id}.`, "ontology-validation");
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
      queryTemplateId: baseline.graphQueryPlan.templateId,
      parameters: { seedEntityIds: plan.entities.map((entity) => entity.id), status: "active" },
      warnings: [],
    };
  }
}

export class AllowlistedGraphQueryCompiler implements GraphQueryCompiler {
  async compile(validated: ValidatedQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<GraphQueryPlan> {
    assertPipeline(validated.plan.intent === baseline.scenario.intent, "QUERY_INTENT_UNSUPPORTED", `No graph template for intent: ${validated.plan.intent}`, "query-compilation");
    assertPipeline(validated.queryTemplateId === baseline.graphQueryPlan.templateId, "QUERY_INTENT_UNSUPPORTED", `Graph template is not allowlisted: ${validated.queryTemplateId}`, "query-compilation");
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
  readonly toolName = "in-memory-canonical-document-retriever.v1";

  async retrieve(graph: GraphRetrievalResult, baseline: CanonicalKnowledgeBaseline): Promise<DocumentRetrievalResult> {
    const entityIds = new Set(graph.entities.map((entity) => entity.id));
    const items = baseline.evidencePack.items
      .filter((item) => item.linkedEntityIds.some((id) => entityIds.has(id)))
      .map(cloneEvidenceItem);
    return { graphPlanId: graph.graphPlanId, items };
  }
}

export class CanonicalEvidencePackBuilder implements EvidencePackBuilder {
  readonly toolName = "governed-evidence-pack-merger.v1";

  async build(plan: SemanticQueryPlan, _graph: GraphRetrievalResult, documents: DocumentRetrievalResult, baseline: CanonicalKnowledgeBaseline, generatedAt: string): Promise<EvidencePack> {
    const items = new Map<string, EvidenceItem>();
    baseline.evidencePack.items
      .filter((item) => item.kind !== "document" && item.kind !== "system-record")
      .forEach((item) => items.set(item.id, cloneEvidenceItem(item)));
    documents.items.forEach((item) => items.set(item.id, cloneEvidenceItem(item)));
    return {
      id: `evidence-pack.${plan.planId}`,
      queryPlanId: plan.planId,
      generatedAt,
      ontologyVersion: baseline.ontologyVersion,
      dataVersion: baseline.dataVersion,
      items: [...items.values()],
      claimPolicies: baseline.evidencePack.claimPolicies?.map((policy) => ({ ...policy })),
      limitations: [...baseline.evidencePack.limitations],
    };
  }
}

export class DeterministicEvidenceAnswerComposer implements AnswerComposer {
  readonly toolName = "deterministic-evidence-answer-composer.v1";

  async compose(request: AgentTurnRequest, graph: GraphRetrievalResult, evidencePack: EvidencePack, _signal?: AbortSignal, baseline?: CanonicalKnowledgeBaseline): Promise<AgentAnswer> {
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
