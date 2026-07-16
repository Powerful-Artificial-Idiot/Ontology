import {
  AllowlistedGraphQueryCompiler,
  CanonicalEvidencePackBuilder,
  CanonicalOntologyValidator,
  DeterministicEvidenceAnswerComposer,
  DeterministicLeakRateSemanticParser,
  InMemoryCanonicalDocumentRetriever,
  InMemoryCanonicalGraphRetriever,
  LeakRateCanonicalKnowledgeSource,
  StableAgentIdFactory,
  StrictCitationValidator,
  StrictQueryPlanValidator,
  SystemAgentClock,
} from "./deterministicComponents";
import { DeterministicAgentClient, InMemoryAgentAuditSink, InMemoryAgentSessionStore } from "./client";
import { DeterministicAgentPipeline } from "./pipeline";
import type { AgentClock, AgentPipelineDependencies } from "./types";

export function createDeterministicAgentPipeline(overrides: Partial<AgentPipelineDependencies> = {}): DeterministicAgentPipeline {
  const defaults: AgentPipelineDependencies = {
    clock: new SystemAgentClock(),
    ids: new StableAgentIdFactory(),
    knowledgeSource: new LeakRateCanonicalKnowledgeSource(),
    semanticParser: new DeterministicLeakRateSemanticParser(),
    queryPlanValidator: new StrictQueryPlanValidator(),
    ontologyValidator: new CanonicalOntologyValidator(),
    graphCompiler: new AllowlistedGraphQueryCompiler(),
    graphRetriever: new InMemoryCanonicalGraphRetriever(),
    documentRetriever: new InMemoryCanonicalDocumentRetriever(),
    evidencePackBuilder: new CanonicalEvidencePackBuilder(),
    answerComposer: new DeterministicEvidenceAnswerComposer(),
    citationValidator: new StrictCitationValidator(),
  };
  return new DeterministicAgentPipeline({ ...defaults, ...overrides });
}

export function createDeterministicAgentClient(clock: AgentClock = new SystemAgentClock()) {
  const sessions = new InMemoryAgentSessionStore();
  const audit = new InMemoryAgentAuditSink();
  const pipeline = createDeterministicAgentPipeline({ clock });
  return { client: new DeterministicAgentClient(pipeline, sessions, audit, clock), sessions, audit, pipeline };
}
