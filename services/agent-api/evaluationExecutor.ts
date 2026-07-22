import {
  RepositoryGraphRetriever,
  SystemAgentClock,
  createDeterministicAgentClient,
  AgentPipelineError,
} from "../../packages/agent-core/src/index";
import type { AgentPipelineEvent, AgentTurnRequest, KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
import { AGENT_CONTRACT_VERSION } from "../../packages/knowledge-contracts/src/index";
import { pipelineEventToTelemetry } from "../../packages/agent-evaluation/src/index";
import type {
  EvaluationCase,
  EvaluationCaseExecution,
  EvaluationCaseExecutor,
  EvaluationTurnExecution,
  AgentTelemetrySink,
} from "../../packages/agent-evaluation/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";
import { ScenarioGovernedDocumentEvidenceRetriever, createDefaultGovernedDocumentRetriever } from "./governedDocumentEvidence";

export type DeterministicEvaluationCaseExecutorOptions = {
  repository?: KnowledgeRepository;
  telemetry?: AgentTelemetrySink;
};

export class DeterministicEvaluationCaseExecutor implements EvaluationCaseExecutor {
  constructor(private readonly options: DeterministicEvaluationCaseExecutorOptions = {}) {}

  async execute(testCase: EvaluationCase): Promise<EvaluationCaseExecution> {
    const clock = new SystemAgentClock();
    const scenarioId = testCase.scenarioId ?? "quality-issue-trace";
    const defaultRetriever = createDefaultGovernedDocumentRetriever();
    const documentRetriever = testCase.executionProfile === "no-document-access"
      ? new ScenarioGovernedDocumentEvidenceRetriever({
          registryPaths: defaultRegistryPaths(),
          access: { principalId: "evaluation-denied", roleIds: [], domainIds: [] },
        })
      : defaultRetriever;
    const core = createDeterministicAgentClient(clock, {
      graphRetriever: new RepositoryGraphRetriever(this.options.repository ?? new MockKnowledgeRepository()),
      documentRetriever,
    });
    const sessionId = `evaluation-session.${testCase.caseId}`;
    await core.client.startSession({
      id: sessionId,
      scenarioId,
      mode: "live",
      language: testCase.turns[0]?.input.language ?? "en",
    });

    const turns: EvaluationTurnExecution[] = [];
    for (const turnCase of testCase.turns) {
      const pipelineEvents: AgentPipelineEvent[] = [];
      const startedAt = new Date().toISOString();
      const request: AgentTurnRequest = {
        contractVersion: AGENT_CONTRACT_VERSION,
        requestId: `evaluation.${testCase.caseId}.${turnCase.turnId}`,
        sessionId,
        scenarioId,
        mode: "live",
        language: turnCase.input.language,
        message: turnCase.input.message,
        context: turnCase.input.context,
        requestedAt: startedAt,
      };
      try {
        const response = await core.client.runTurn(request, undefined, (event) => {
          pipelineEvents.push(event);
          return this.options.telemetry?.record(pipelineEventToTelemetry(event));
        });
        turns.push({ turnId: turnCase.turnId, startedAt, completedAt: new Date().toISOString(), response, pipelineEvents });
      } catch (error) {
        turns.push({
          turnId: turnCase.turnId,
          startedAt,
          completedAt: new Date().toISOString(),
          errorCode: error instanceof AgentPipelineError ? error.detail.code : "PIPELINE_FAILED",
          pipelineEvents,
        });
      }
    }

    return {
      caseId: testCase.caseId,
      turns,
      finalContext: (await core.sessions.get(sessionId))?.context,
    };
  }
}

function defaultRegistryPaths(): Record<string, string> {
  return {
    "quality-issue-trace": "packages/demo-data/documents/leak-rate/document-registry.json",
    "engineering-change-impact": "packages/demo-data/documents/engineering-change/document-registry.json",
    "bottleneck-analysis": "packages/demo-data/documents/bottleneck/document-registry.json",
  };
}
