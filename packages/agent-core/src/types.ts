import type {
  AgentAnswer,
  AgentAuditEvent,
  AgentSession,
  AgentTurnRequest,
  CanonicalKnowledgeBaseline,
  CitationValidationResult,
  EvidenceItem,
  EvidencePack,
  GraphQueryPlan,
  KnowledgeEntity,
  KnowledgeRelation,
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
  parse(request: AgentTurnRequest, baseline: CanonicalKnowledgeBaseline): Promise<SemanticQueryPlan>;
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
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
};

export interface GraphRetriever {
  retrieve(plan: GraphQueryPlan, baseline: CanonicalKnowledgeBaseline): Promise<GraphRetrievalResult>;
}

export type DocumentRetrievalResult = {
  graphPlanId: string;
  items: EvidenceItem[];
};

export interface DocumentEvidenceRetriever {
  retrieve(graph: GraphRetrievalResult, baseline: CanonicalKnowledgeBaseline): Promise<DocumentRetrievalResult>;
}

export interface EvidencePackBuilder {
  build(plan: SemanticQueryPlan, graph: GraphRetrievalResult, documents: DocumentRetrievalResult, baseline: CanonicalKnowledgeBaseline, generatedAt: string): Promise<EvidencePack>;
}

export interface AnswerComposer {
  compose(request: AgentTurnRequest, graph: GraphRetrievalResult, evidencePack: EvidencePack): Promise<AgentAnswer>;
}

export interface CitationValidator {
  validate(answer: AgentAnswer, evidencePack: EvidencePack): Promise<CitationValidationResult>;
}

export interface AgentSessionStore {
  create(session: AgentSession): Promise<void>;
  get(id: string): Promise<AgentSession | null>;
  save(session: AgentSession): Promise<void>;
}

export interface AgentAuditSink {
  append(event: AgentAuditEvent): Promise<void>;
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
  evidencePackBuilder: EvidencePackBuilder;
  answerComposer: AnswerComposer;
  citationValidator: CitationValidator;
};
