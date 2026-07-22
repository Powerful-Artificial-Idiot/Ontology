import type {
  AgentTraceStage,
  AgentTraceStageName,
  AgentPipelineEventHandler,
  AgentTurnRequest,
  AgentTurnResponse,
} from "../../knowledge-contracts/src/index";
import { AGENT_CONTRACT_VERSION } from "../../knowledge-contracts/src/index";
import { AgentPipelineError } from "./errors";
import { assertAgentRequest } from "./deterministicComponents";
import type { AgentPipelineDependencies } from "./types";

type StageDescriptor<T> = {
  name: AgentTraceStageName;
  tool: string;
  inputRefs: string[];
  outputRefs: (output: T) => string[];
  summary: (output: T) => string;
  execute: () => Promise<T>;
};

export class DeterministicAgentPipeline {
  constructor(private readonly dependencies: AgentPipelineDependencies) {}

  async run(request: AgentTurnRequest, signal?: AbortSignal, onEvent?: AgentPipelineEventHandler): Promise<AgentTurnResponse> {
    assertAgentRequest(request);
    const baseline = await this.dependencies.knowledgeSource.getBaseline(request.scenarioId);
    const identifiers = this.dependencies.ids.forRequest(request);
    const traceStages: AgentTraceStage[] = [];
    await onEvent?.({
      type: "pipeline-started",
      requestId: request.requestId,
      turnId: identifiers.turnId,
      traceId: identifiers.traceId,
      occurredAt: this.dependencies.clock.now().toISOString(),
    });
    const runStage = <T>(descriptor: StageDescriptor<T>) => this.runStage(
      traceStages,
      signal,
      descriptor,
      { requestId: request.requestId, turnId: identifiers.turnId, traceId: identifiers.traceId },
      onEvent,
    );

    const semanticPlan = await runStage({
      name: "semantic-parsing",
      tool: this.dependencies.semanticParser.toolName ?? "semantic-parser.v1",
      inputRefs: [request.requestId],
      outputRefs: (output) => [output.planId],
      summary: (output) => `Resolved ${output.entities.length} canonical entities for ${output.intent}.`,
      execute: () => this.dependencies.semanticParser.parse(request, baseline, signal),
    });

    const schemaValidatedPlan = await runStage({
      name: "query-plan-validation",
      tool: "strict-query-plan-validator.v1",
      inputRefs: [semanticPlan.planId],
      outputRefs: (output) => [output.planId],
      summary: () => "Validated plan version, intent, identifiers, uniqueness, and required fields.",
      execute: () => this.dependencies.queryPlanValidator.validate(semanticPlan),
    });

    const validatedPlan = await runStage({
      name: "ontology-validation",
      tool: `canonical-ontology-validator.${baseline.ontologyVersion}`,
      inputRefs: [schemaValidatedPlan.planId],
      outputRefs: (output) => output.authorizedEntityIds,
      summary: (output) => `Validated canonical entities and relationship types against ontology ${output.ontologyVersion}.`,
      execute: () => this.dependencies.ontologyValidator.validate(schemaValidatedPlan, baseline),
    });

    const graphPlan = await runStage({
      name: "query-compilation",
      tool: "allowlisted-graph-plan-compiler.v1",
      inputRefs: [validatedPlan.plan.planId],
      outputRefs: (output) => [output.graphPlanId, output.templateId],
      summary: (output) => `Compiled read-only template ${output.templateId} with depth ${output.maxDepth} and limit ${output.resultLimit}.`,
      execute: () => this.dependencies.graphCompiler.compile(validatedPlan, baseline),
    });

    const graph = await runStage({
      name: "graph-retrieval",
      tool: "in-memory-canonical-graph-retriever.v1",
      inputRefs: [graphPlan.graphPlanId, ...graphPlan.seedEntityIds],
      outputRefs: (output) => [...output.entities.map((entity) => entity.id), ...output.relations.map((relation) => relation.id)],
      summary: (output) => `Retrieved ${output.entities.length} entities and ${output.relations.length} relations from ${output.repositoryType}.`,
      execute: () => this.dependencies.graphRetriever.retrieve(graphPlan, baseline),
    });

    const documents = await runStage({
      name: "document-retrieval",
      tool: this.dependencies.documentRetriever.toolName ?? "document-evidence-retriever.v1",
      inputRefs: graph.entities.map((entity) => entity.id),
      outputRefs: (output) => output.items.map((item) => item.id),
      summary: (output) => `Retrieved ${output.items.length} governed evidence items.`,
      execute: () => this.dependencies.documentRetriever.retrieve(graph, baseline),
    });

    const evidencePack = await runStage({
      name: "evidence-pack",
      tool: this.dependencies.evidencePackBuilder.toolName ?? "evidence-pack-builder.v1",
      inputRefs: [semanticPlan.planId, graph.graphPlanId, ...documents.items.map((item) => item.id)],
      outputRefs: (output) => [output.id],
      summary: (output) => `Built Evidence Pack with ${output.items.length} items and ${output.limitations.length} explicit limitations.`,
      execute: () => this.dependencies.evidencePackBuilder.build(semanticPlan, graph, documents, baseline, this.dependencies.clock.now().toISOString()),
    });

    const answer = await runStage({
      name: "answer-composition",
      tool: this.dependencies.answerComposer.toolName ?? "answer-composer.v1",
      inputRefs: [evidencePack.id],
      outputRefs: (output) => output.claims.map((claim) => claim.id),
      summary: (output) => `Composed ${output.claims.length} structured claims from the Evidence Pack.`,
      execute: () => this.dependencies.answerComposer.compose(request, graph, evidencePack, signal, baseline),
    });

    const citationValidation = await runStage({
      name: "citation-validation",
      tool: "strict-citation-validator.v1",
      inputRefs: [evidencePack.id, ...answer.claims.map((claim) => claim.id)],
      outputRefs: (output) => output.checkedClaimIds,
      summary: (output) => `Citation validation ${output.status} for ${output.checkedClaimIds.length} claims.`,
      execute: () => this.dependencies.citationValidator.validate(answer, evidencePack),
    });

    if (citationValidation.status !== "passed") {
      throw new AgentPipelineError("CITATION_INVALID", "Citation validation failed; answer release is blocked.", "citation-validation", { issueCount: citationValidation.issues.length }).withTrace(traceStages);
    }

    const response: AgentTurnResponse = {
      contractVersion: AGENT_CONTRACT_VERSION,
      requestId: request.requestId,
      turnId: identifiers.turnId,
      sessionId: request.sessionId,
      status: "completed",
      queryPlan: semanticPlan,
      graphQueryPlan: graphPlan,
      evidencePack,
      answer,
      citationValidation,
      trace: { traceId: identifiers.traceId, requestId: request.requestId, stages: traceStages },
      completedAt: this.dependencies.clock.now().toISOString(),
    };
    await onEvent?.({
      type: "pipeline-completed",
      requestId: request.requestId,
      turnId: identifiers.turnId,
      traceId: identifiers.traceId,
      occurredAt: response.completedAt,
    });
    return response;
  }

  private async runStage<T>(
    traceStages: AgentTraceStage[],
    signal: AbortSignal | undefined,
    descriptor: StageDescriptor<T>,
    eventContext: { requestId: string; turnId: string; traceId: string },
    onEvent?: AgentPipelineEventHandler,
  ): Promise<T> {
    if (signal?.aborted) throw new AgentPipelineError("PIPELINE_CANCELLED", "Agent pipeline execution was cancelled.", descriptor.name);
    const started = this.dependencies.clock.now();
    const stageId = `stage.${String(traceStages.length + 1).padStart(2, "0")}`;
    await onEvent?.({
      type: "stage-started",
      ...eventContext,
      stage: {
        id: stageId,
        stage: descriptor.name,
        startedAt: started.toISOString(),
        tool: descriptor.tool,
        inputRefs: descriptor.inputRefs,
      },
      occurredAt: started.toISOString(),
    });
    try {
      const output = await descriptor.execute();
      if (signal?.aborted) throw new AgentPipelineError("PIPELINE_CANCELLED", "Agent pipeline execution was cancelled.", descriptor.name);
      const completed = this.dependencies.clock.now();
      const stage: AgentTraceStage = {
        id: stageId,
        stage: descriptor.name,
        status: "completed",
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        tool: descriptor.tool,
        inputRefs: descriptor.inputRefs,
        outputRefs: descriptor.outputRefs(output),
        summary: descriptor.summary(output),
      };
      traceStages.push(stage);
      await onEvent?.({ type: "stage-completed", ...eventContext, stage, occurredAt: completed.toISOString() });
      return output;
    } catch (error) {
      const pipelineError = error instanceof AgentPipelineError
        ? error
        : new AgentPipelineError("PIPELINE_FAILED", error instanceof Error ? error.message : "Pipeline stage failed.", descriptor.name);
      const completed = this.dependencies.clock.now();
      const stage: AgentTraceStage = {
        id: stageId,
        stage: descriptor.name,
        status: "failed",
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        tool: descriptor.tool,
        inputRefs: descriptor.inputRefs,
        outputRefs: [],
        summary: pipelineError.message,
        errorCode: pipelineError.detail.code,
      };
      traceStages.push(stage);
      await onEvent?.({ type: "stage-failed", ...eventContext, stage, occurredAt: completed.toISOString() });
      throw pipelineError.withTrace(traceStages);
    }
  }
}
