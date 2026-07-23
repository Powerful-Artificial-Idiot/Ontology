import {
  AllowlistedGraphQueryCompiler,
  CanonicalEvidencePackBuilder,
  CanonicalOntologyValidator,
  DeterministicEvidenceAnswerComposer,
  DeterministicScenarioSemanticParser,
  InMemoryCanonicalDocumentRetriever,
  InMemoryCanonicalGraphRetriever,
  RegisteredCanonicalKnowledgeSource,
  StableAgentIdFactory,
  StrictCitationValidator,
  StrictQueryPlanValidator,
  SystemAgentClock,
} from "./deterministicComponents";
import { DeterministicAgentClient, InMemoryAgentAuditSink, InMemoryAgentSessionStore, InMemoryAgentTurnStore } from "./client";
import { DeterministicAgentPipeline } from "./pipeline";
import { DeterministicQuantitativeQualityAssessor } from "./quantitativeQualityAssessment";
import type { AgentAuditStore, AgentClock, AgentPipelineDependencies, AgentSessionStore, AgentTurnStore } from "./types";

export function createDeterministicAgentPipeline(overrides: Partial<AgentPipelineDependencies> = {}): DeterministicAgentPipeline {
  const defaults: AgentPipelineDependencies = {
    clock: new SystemAgentClock(),
    ids: new StableAgentIdFactory(),
    knowledgeSource: new RegisteredCanonicalKnowledgeSource(),
    semanticParser: new DeterministicScenarioSemanticParser(),
    queryPlanValidator: new StrictQueryPlanValidator(),
    ontologyValidator: new CanonicalOntologyValidator(),
    graphCompiler: new AllowlistedGraphQueryCompiler(),
    graphRetriever: new InMemoryCanonicalGraphRetriever(),
    documentRetriever: new InMemoryCanonicalDocumentRetriever(),
    quantitativeAssessor: new DeterministicQuantitativeQualityAssessor(),
    evidencePackBuilder: new CanonicalEvidencePackBuilder(),
    answerComposer: new DeterministicEvidenceAnswerComposer(),
    citationValidator: new StrictCitationValidator(),
  };
  return new DeterministicAgentPipeline({ ...defaults, ...overrides });
}

export type AgentClientStores = {
  sessions: AgentSessionStore;
  turns: AgentTurnStore;
  audit: AgentAuditStore;
};

export function createDeterministicAgentClient(
  clock: AgentClock = new SystemAgentClock(),
  pipelineOverrides: Partial<AgentPipelineDependencies> = {},
  storeOverrides: Partial<AgentClientStores> = {},
) {
  const sessions = storeOverrides.sessions ?? new InMemoryAgentSessionStore();
  const turns = storeOverrides.turns ?? new InMemoryAgentTurnStore();
  const audit = storeOverrides.audit ?? new InMemoryAgentAuditSink();
  const pipeline = createDeterministicAgentPipeline({ clock, ...pipelineOverrides });
  return { client: new DeterministicAgentClient(pipeline, sessions, turns, audit, clock), sessions, turns, audit, pipeline };
}
