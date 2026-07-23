import type {
  AgentAnswer,
  AgentAuthorizationContext,
  AgentAuditEvent,
  AgentRunEvent,
  AgentSession,
  AgentTurnRecord,
  PersistedAgentTurnRun,
  AgentTurnRequest,
  CanonicalKnowledgeBaseline,
  CitationValidationResult,
  EvidenceItem,
  EvidencePack,
  GraphQueryPlan,
  KnowledgeEntity,
  KnowledgeRelation,
  QuantitativeAssessmentEnvelope,
  SemanticQueryPlan,
  ValidatedQueryPlan,
} from "../../knowledge-contracts/src/index";

export type PipelineIdentifiers = {
  turnId: string;
  traceId: string;
};

export interface AgentClock {
  now(): Date;
}

export interface AgentIdFactory {
  forRequest(request: AgentTurnRequest): PipelineIdentifiers;
}

export interface AgentKnowledgeSource {
  getBaseline(scenarioId?: string): Promise<CanonicalKnowledgeBaseline>;
}

export interface SemanticParser {
  readonly toolName?: string;
  parse(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline, signal?: AbortSignal): Promise<SemanticQueryPlan>;
}

export interface QueryPlanSchemaValidator {
  validate(plan: SemanticQueryPlan): Promise<SemanticQueryPlan>;
}

export interface OntologyQueryPlanValidator {
  validate(plan: SemanticQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<ValidatedQueryPlan>;
}

export interface GraphQueryCompiler {
  compile(plan: ValidatedQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<GraphQueryPlan>;
}

export type GraphRetrievalResult = {
  graphPlanId: string;
  templateId?: string;
  repositoryType: string;
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
};

export interface GraphRetriever {
  retrieve(plan: GraphQueryPlan, baseline: CanonicalKnowledgeBaseline, authorization?: AgentAuthorizationContext): Promise<GraphRetrievalResult>;
}

export type DocumentRetrievalResult = {
  graphPlanId: string;
  items: EvidenceItem[];
};

export interface DocumentEvidenceRetriever {
  readonly toolName?: string;
  retrieve(graph: GraphRetrievalResult, baseline: CanonicalKnowledgeBaseline, authorization?: AgentAuthorizationContext): Promise<DocumentRetrievalResult>;
}

export interface QuantitativeQualityAssessor {
  readonly toolName?: string;
  supports(plan: SemanticQueryPlan): boolean;
  assess(
    plan: SemanticQueryPlan,
    graph: GraphRetrievalResult,
    baseline: CanonicalKnowledgeBaseline,
  ): Promise<QuantitativeAssessmentEnvelope>;
}

export interface EvidencePackBuilder {
  readonly toolName?: string;
  build(
    plan: SemanticQueryPlan,
    graph: GraphRetrievalResult,
    documents: DocumentRetrievalResult,
    baseline: CanonicalKnowledgeBaseline,
    generatedAt: string,
    quantitativeAssessment?: QuantitativeAssessmentEnvelope,
  ): Promise<EvidencePack>;
}

export interface AnswerComposer {
  readonly toolName?: string;
  compose(
    request: AgentTurnRequest,
    graph: GraphRetrievalResult,
    evidencePack: EvidencePack,
    signal?: AbortSignal,
    baseline?: CanonicalKnowledgeBaseline,
    plan?: SemanticQueryPlan,
    quantitativeAssessment?: QuantitativeAssessmentEnvelope,
  ): Promise<AgentAnswer>;
}

export interface CitationValidator {
  validate(answer: AgentAnswer, evidencePack: EvidencePack, authorization?: AgentAuthorizationContext): Promise<CitationValidationResult>;
}

export interface AgentSessionStore {
  create(session: AgentSession): Promise<void>;
  get(id: string): Promise<AgentSession | null>;
  save(session: AgentSession): Promise<void>;
}

export interface AgentAuditSink {
  append(event: AgentAuditEvent): Promise<void>;
}

export interface AgentTurnStore {
  create(turn: AgentTurnRecord): Promise<void>;
  get(turnId: string): Promise<AgentTurnRecord | null>;
  listBySession(sessionId: string): Promise<AgentTurnRecord[]>;
}

export interface AgentRunStore {
  create(run: PersistedAgentTurnRun): Promise<void>;
  get(runId: string): Promise<PersistedAgentTurnRun | null>;
  save(run: PersistedAgentTurnRun): Promise<void>;
  listBySession(sessionId: string): Promise<PersistedAgentTurnRun[]>;
}

export interface AgentRunEventStore {
  append(event: AgentRunEvent): Promise<void>;
  list(runId: string, afterSequence?: number): Promise<AgentRunEvent[]>;
}

export type AgentAuditQuery = {
  sessionId?: string;
  turnId?: string;
  traceId?: string;
};

export interface AgentAuditStore extends AgentAuditSink {
  list(query?: AgentAuditQuery): AgentAuditEvent[];
}

export type AgentPipelineDependencies = {
  clock: AgentClock;
  ids: AgentIdFactory;
  knowledgeSource: AgentKnowledgeSource;
  semanticParser: SemanticParser;
  queryPlanValidator: QueryPlanSchemaValidator;
  ontologyValidator: OntologyQueryPlanValidator;
  graphCompiler: GraphQueryCompiler;
  graphRetriever: GraphRetriever;
  documentRetriever: DocumentEvidenceRetriever;
  quantitativeAssessor?: QuantitativeQualityAssessor;
  evidencePackBuilder: EvidencePackBuilder;
  answerComposer: AnswerComposer;
  citationValidator: CitationValidator;
};
