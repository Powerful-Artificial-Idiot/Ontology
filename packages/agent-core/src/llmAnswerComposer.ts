import type {
  AgentAnswer,
  AgentClaim,
  AgentConfidence,
  AgentTurnRequest,
  EvidenceClaimPolicy,
  EvidencePack,
} from "../../knowledge-contracts/src/index";
import { AgentPipelineError, assertPipeline } from "./errors";
import type { AnswerComposer, GraphRetrievalResult } from "./types";

export type AnswerComposerMode = "template" | "llm" | "hybrid";

export type ProjectedEvidenceItem = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  sourceSystem?: string;
  sourceId: string;
  locator?: string;
  version?: string;
  status?: string;
  linkedEntityIds: string[];
  supportsClaimIds: string[];
};

export type EvidenceContextProjection = {
  evidencePackId: string;
  ontologyVersion: string;
  dataVersion: string;
  items: ProjectedEvidenceItem[];
  claimPolicies: EvidenceClaimPolicy[];
  limitations: string[];
};

export type GroundedTextDraft = {
  text: string;
  claimIds: string[];
};

export type GroundedActionDraft = {
  text: string;
  evidenceIds: string[];
};

export type LlmAnswerClaimDraft = {
  id: string;
  text: string;
  classification: AgentClaim["classification"];
  citations: Array<{ evidenceId: string }>;
};

export type LlmAnswerDraft = {
  version: "1.0.0";
  summary: GroundedTextDraft;
  findings: GroundedTextDraft[];
  recommendedActions: GroundedActionDraft[];
  risks: GroundedTextDraft[];
  assumptions: string[];
  limitations: string[];
  claims: LlmAnswerClaimDraft[];
  confidence: Exclude<AgentConfidence, "approved">;
};

export type LlmAnswerComposeInput = {
  requestId: string;
  language: AgentTurnRequest["language"];
  question: string;
  evidence: EvidenceContextProjection;
  templateGuidance?: AgentAnswer;
};

export interface LlmAnswerComposerProvider {
  readonly providerName: string;
  compose(input: LlmAnswerComposeInput, signal?: AbortSignal): Promise<unknown>;
}

export class EvidenceContextProjector {
  constructor(private readonly maximumItems = 50, private readonly maximumExcerptCharacters = 2_000, private readonly maximumTotalCharacters = 40_000) {}

  project(evidencePack: EvidencePack): EvidenceContextProjection {
    assertPipeline(evidencePack.items.length > 0, "EVIDENCE_INSUFFICIENT", "LLM answer composition requires at least one evidence item.", "answer-composition");
    assertPipeline(evidencePack.items.length <= this.maximumItems, "EVIDENCE_INSUFFICIENT", "Evidence Pack exceeds the bounded LLM projection item limit.", "answer-composition", { itemCount: evidencePack.items.length, maximumItems: this.maximumItems });
    assertPipeline(Boolean(evidencePack.claimPolicies?.length), "EVIDENCE_INSUFFICIENT", "LLM answer composition requires governed claim policies.", "answer-composition");
    const evidenceIds = new Set(evidencePack.items.map((item) => item.id));
    const supportedClaimIds = new Set(evidencePack.items.flatMap((item) => item.supportsClaimIds));
    const claimPolicies = evidencePack.claimPolicies ?? [];
    claimPolicies.forEach((policy) => assertPipeline(supportedClaimIds.has(policy.claimId), "EVIDENCE_INSUFFICIENT", `No evidence supports governed claim ${policy.claimId}.`, "answer-composition", { claimId: policy.claimId }));
    evidencePack.items.forEach((item) => {
      assertPipeline(item.excerpt.length <= this.maximumExcerptCharacters, "EVIDENCE_INSUFFICIENT", `Evidence excerpt exceeds the bounded projection limit: ${item.id}`, "answer-composition", { evidenceId: item.id, excerptCharacters: item.excerpt.length });
      assertPipeline(evidenceIds.has(item.id), "EVIDENCE_INSUFFICIENT", "Evidence projection contains an invalid ID.", "answer-composition");
    });
    const projected: EvidenceContextProjection = {
      evidencePackId: evidencePack.id,
      ontologyVersion: evidencePack.ontologyVersion,
      dataVersion: evidencePack.dataVersion,
      items: evidencePack.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        excerpt: item.excerpt,
        sourceSystem: item.source.sourceSystem,
        sourceId: item.source.sourceId,
        locator: item.source.locator,
        version: item.version,
        status: item.status,
        linkedEntityIds: [...item.linkedEntityIds],
        supportsClaimIds: [...item.supportsClaimIds],
      })),
      claimPolicies: claimPolicies.map((policy) => ({ ...policy })),
      limitations: [...evidencePack.limitations],
    };
    const size = JSON.stringify(projected).length;
    assertPipeline(size <= this.maximumTotalCharacters, "EVIDENCE_INSUFFICIENT", "Evidence projection exceeds the bounded LLM context limit.", "answer-composition", { projectionCharacters: size, maximumCharacters: this.maximumTotalCharacters });
    return projected;
  }
}

export class StrictLlmAnswerDraftValidator {
  validate(value: unknown, input: LlmAnswerComposeInput): LlmAnswerDraft {
    assertRecord(value, "LLM answer output must be a JSON object.");
    assertKeys(value, ["version", "summary", "findings", "recommendedActions", "risks", "assumptions", "limitations", "claims", "confidence"]);
    assertPipeline(value.version === "1.0.0", "LLM_RESPONSE_INVALID", "LLM answer output has an unsupported version.", "answer-composition");
    const policyById = new Map(input.evidence.claimPolicies.map((policy) => [policy.claimId, policy]));
    const requiredClaimIds = input.evidence.claimPolicies.filter((policy) => policy.required).map((policy) => policy.claimId);
    const evidenceById = new Map(input.evidence.items.map((item) => [item.id, item]));
    const claims = array(value.claims, "claims", 50).map((claim, index) => validateClaim(claim, index, policyById, evidenceById));
    assertUnique(claims.map((claim) => claim.id), "LLM answer contains duplicate claim IDs.");
    const returnedClaimIds = new Set(claims.map((claim) => claim.id));
    requiredClaimIds.forEach((claimId) => assertPipeline(returnedClaimIds.has(claimId), "LLM_RESPONSE_INVALID", `LLM answer omitted required governed claim ${claimId}.`, "answer-composition", { claimId }));

    const summary = validateGroundedText(value.summary, "summary", policyById, returnedClaimIds);
    const findings = array(value.findings, "findings", 20).map((item, index) => validateGroundedText(item, `findings[${index}]`, policyById, returnedClaimIds));
    const risks = array(value.risks, "risks", 20).map((item, index) => validateGroundedText(item, `risks[${index}]`, policyById, returnedClaimIds));
    const recommendedActions = array(value.recommendedActions, "recommendedActions", 20).map((item, index) => validateAction(item, index, evidenceById));
    const assumptions = validateTextArray(value.assumptions, "assumptions");
    const limitations = validateTextArray(value.limitations, "limitations");
    assertPipeline(limitations.length >= input.evidence.limitations.length, "LLM_RESPONSE_INVALID", "LLM answer omitted an Evidence Pack limitation.", "answer-composition");
    assertPipeline(value.confidence === "low" || value.confidence === "medium" || value.confidence === "high", "LLM_RESPONSE_INVALID", "LLM answer confidence must not claim approval.", "answer-composition");
    const allText = [summary.text, ...findings.map((item) => item.text), ...recommendedActions.map((item) => item.text), ...risks.map((item) => item.text), ...assumptions, ...limitations, ...claims.map((claim) => claim.text)].join(" ");
    if (input.language === "en") assertPipeline(!/[\u3400-\u9fff]/u.test(allText), "LLM_RESPONSE_INVALID", "English LLM answer contains Chinese text.", "answer-composition");
    return { version: "1.0.0", summary, findings, recommendedActions, risks, assumptions, limitations, claims, confidence: value.confidence };
  }
}

export class LlmEvidenceAnswerComposer implements AnswerComposer {
  readonly toolName: string;

  constructor(
    private readonly provider: LlmAnswerComposerProvider,
    private readonly projector = new EvidenceContextProjector(),
    private readonly validator = new StrictLlmAnswerDraftValidator(),
  ) {
    this.toolName = `llm-evidence-answer-composer.${provider.providerName}.v1`;
  }

  async compose(request: AgentTurnRequest, _graph: GraphRetrievalResult, evidencePack: EvidencePack, signal?: AbortSignal): Promise<AgentAnswer> {
    return this.composeWithGuidance(request, evidencePack, undefined, signal);
  }

  async composeWithGuidance(request: AgentTurnRequest, evidencePack: EvidencePack, templateGuidance?: AgentAnswer, signal?: AbortSignal): Promise<AgentAnswer> {
    const input: LlmAnswerComposeInput = {
      requestId: request.requestId,
      language: request.language,
      question: request.message,
      evidence: this.projector.project(evidencePack),
      templateGuidance,
    };
    let raw: unknown;
    try {
      raw = await this.provider.compose(input, signal);
    } catch (error) {
      if (error instanceof AgentPipelineError) throw error;
      throw new AgentPipelineError("LLM_PROVIDER_UNAVAILABLE", `Answer composer provider ${this.provider.providerName} is unavailable.`, "answer-composition", { provider: this.provider.providerName });
    }
    return toAgentAnswer(this.validator.validate(raw, input), evidencePack);
  }
}

export class HybridEvidenceAnswerComposer implements AnswerComposer {
  readonly toolName = "hybrid-evidence-answer-composer.v1";

  constructor(private readonly template: AnswerComposer, private readonly llm: LlmEvidenceAnswerComposer) {}

  async compose(request: AgentTurnRequest, graph: GraphRetrievalResult, evidencePack: EvidencePack, signal?: AbortSignal): Promise<AgentAnswer> {
    const guidance = await this.template.compose(request, graph, evidencePack, signal);
    return this.llm.composeWithGuidance(request, evidencePack, guidance, signal);
  }
}

function toAgentAnswer(draft: LlmAnswerDraft, evidencePack: EvidencePack): AgentAnswer {
  const evidenceById = new Map(evidencePack.items.map((item) => [item.id, item]));
  return {
    summary: draft.summary.text,
    findings: draft.findings.map((item) => item.text),
    recommendedActions: draft.recommendedActions.map((item) => item.text),
    risks: draft.risks.map((item) => item.text),
    assumptions: [...draft.assumptions],
    limitations: [...draft.limitations],
    claims: draft.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
      classification: claim.classification,
      citations: claim.citations.map((citation) => ({ evidenceId: citation.evidenceId, locator: evidenceById.get(citation.evidenceId)?.source.locator })),
    })),
    confidence: draft.confidence,
  };
}

function validateClaim(value: unknown, index: number, policyById: Map<string, EvidenceClaimPolicy>, evidenceById: Map<string, ProjectedEvidenceItem>): LlmAnswerClaimDraft {
  assertRecord(value, `LLM answer claim ${index} must be an object.`);
  assertKeys(value, ["id", "text", "classification", "citations"]);
  assertPipeline(typeof value.id === "string" && policyById.has(value.id), "LLM_RESPONSE_INVALID", "LLM answer created a claim outside the Evidence Pack policy.", "answer-composition", { claimIndex: index });
  const claimId = value.id;
  const policy = policyById.get(claimId);
  assertPipeline(policy, "LLM_RESPONSE_INVALID", "LLM answer claim has no governed policy.", "answer-composition", { claimIndex: index });
  assertPipeline(value.classification === policy.classification, "LLM_RESPONSE_INVALID", "LLM answer changed a governed claim classification.", "answer-composition", { claimIndex: index });
  const text = validateText(value.text, `claims[${index}].text`);
  const citations = array(value.citations, `claims[${index}].citations`, 20).map((citation, citationIndex) => {
    assertRecord(citation, `LLM answer citation ${citationIndex} must be an object.`);
    assertKeys(citation, ["evidenceId"]);
    assertPipeline(typeof citation.evidenceId === "string" && evidenceById.has(citation.evidenceId), "LLM_RESPONSE_INVALID", "LLM answer cited an unknown evidence ID.", "answer-composition", { claimIndex: index, citationIndex });
    const evidenceId = citation.evidenceId;
    const evidence = evidenceById.get(evidenceId);
    assertPipeline(evidence, "LLM_RESPONSE_INVALID", "LLM answer citation is unavailable.", "answer-composition", { claimIndex: index, citationIndex });
    assertPipeline(evidence.supportsClaimIds.includes(claimId), "LLM_RESPONSE_INVALID", "LLM answer citation does not support the selected claim ID.", "answer-composition", { claimIndex: index, citationIndex });
    assertPipeline(!evidence.status || evidence.status === "active", "LLM_RESPONSE_INVALID", "LLM answer cited inactive evidence.", "answer-composition", { claimIndex: index, citationIndex });
    return { evidenceId };
  });
  if (value.classification === "fact") assertPipeline(citations.length > 0, "LLM_RESPONSE_INVALID", "LLM factual claim has no citation.", "answer-composition", { claimIndex: index });
  assertUnique(citations.map((citation) => citation.evidenceId), "LLM answer contains duplicate citations.");
  return { id: claimId, text, classification: policy.classification, citations };
}

function validateGroundedText(value: unknown, name: string, policyById: Map<string, EvidenceClaimPolicy>, returnedClaimIds: Set<string>): GroundedTextDraft {
  assertRecord(value, `LLM answer ${name} must be an object.`);
  assertKeys(value, ["text", "claimIds"]);
  const text = validateText(value.text, `${name}.text`);
  const claimIds = validateTextArray(value.claimIds, `${name}.claimIds`);
  assertPipeline(claimIds.length > 0 && claimIds.every((claimId) => policyById.has(claimId)), "LLM_RESPONSE_INVALID", `LLM answer ${name} is not grounded in governed claim IDs.`, "answer-composition");
  assertPipeline(claimIds.every((claimId) => returnedClaimIds.has(claimId)), "LLM_RESPONSE_INVALID", `LLM answer ${name} references a claim that is absent from the returned claim set.`, "answer-composition");
  assertUnique(claimIds, `LLM answer ${name} contains duplicate claim IDs.`);
  return { text, claimIds };
}

function validateAction(value: unknown, index: number, evidenceById: Map<string, ProjectedEvidenceItem>): GroundedActionDraft {
  assertRecord(value, `LLM recommended action ${index} must be an object.`);
  assertKeys(value, ["text", "evidenceIds"]);
  const text = validateText(value.text, `recommendedActions[${index}].text`);
  const evidenceIds = validateTextArray(value.evidenceIds, `recommendedActions[${index}].evidenceIds`);
  assertPipeline(evidenceIds.length > 0 && evidenceIds.every((evidenceId) => evidenceById.has(evidenceId)), "LLM_RESPONSE_INVALID", "LLM recommended action is not grounded in Evidence Pack IDs.", "answer-composition", { actionIndex: index });
  assertPipeline(evidenceIds.every((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    return evidence && (!evidence.status || evidence.status === "active");
  }), "LLM_RESPONSE_INVALID", "LLM recommended action references inactive evidence.", "answer-composition", { actionIndex: index });
  assertUnique(evidenceIds, "LLM recommended action contains duplicate evidence IDs.");
  return { text, evidenceIds };
}

function validateTextArray(value: unknown, name: string): string[] {
  return array(value, name, 30).map((item, index) => validateText(item, `${name}[${index}]`));
}

function validateText(value: unknown, name: string): string {
  assertPipeline(typeof value === "string" && value.trim().length > 0 && value.length <= 2_000, "LLM_RESPONSE_INVALID", `LLM answer ${name} must contain 1 to 2000 characters.`, "answer-composition");
  return value.trim();
}

function array(value: unknown, name: string, maximumItems: number): unknown[] {
  assertPipeline(Array.isArray(value) && value.length <= maximumItems, "LLM_RESPONSE_INVALID", `LLM answer ${name} must be a bounded array.`, "answer-composition", { maximumItems });
  return value;
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertPipeline(Boolean(value) && typeof value === "object" && !Array.isArray(value), "LLM_RESPONSE_INVALID", message, "answer-composition");
}

function assertKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  assertPipeline(unexpected.length === 0, "LLM_RESPONSE_INVALID", "LLM answer contains undeclared fields.", "answer-composition", { unexpectedFieldCount: unexpected.length });
}

function assertUnique(values: string[], message: string): void {
  assertPipeline(new Set(values).size === values.length, "LLM_RESPONSE_INVALID", message, "answer-composition");
}
