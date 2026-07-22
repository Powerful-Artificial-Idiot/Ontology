import {
  AGENT_CONTRACT_VERSION,
  type AgentApiErrorResponse,
  type AgentEvidenceResource,
  type AgentPipelineStageStart,
  type AgentRunEvent as AgentServerRunEvent,
  type AgentScenarioListResource,
  type AgentSessionResource,
  type AgentTraceResource,
  type AgentTraceStage,
  type AgentTurnListResource,
  type AgentTurnRequest,
  type AgentTurnResource,
  type AgentTurnRun,
  type AgentTurnRunListResource,
  type AgentTurnRunResource,
  type AgentTurnResponse,
  type EvidenceItem,
  type StructuredAgentTrace,
} from "../../../packages/knowledge-contracts/src/index";
import { agentReference, agentRelatedObject } from "../../data/mockKnowledgeRegistry/agentAdapters";
import { evidenceDocumentById } from "../../data/mockKnowledgeRegistry/evidenceDocuments";
import { manufacturingObjectById } from "../../data/mockKnowledgeRegistry/manufacturingObjects";
import type { AgentClient, AgentRunTurnOptions, AgentTurnDetails } from "./agentClient";
import { agentDemoScenarios } from "./agentDemoData";
import type {
  AgentConversationSession,
  AgentConversationTurn,
  AgentLanguage,
  AgentReasoningStep,
  AgentReference,
  AgentReferenceType,
  AgentRelatedObject,
  AgentScenario,
  AgentSharedContext,
  AgentToolName,
} from "./agentDemoTypes";

type FetchImplementation = typeof fetch;

export class ApiAgentClient implements AgentClient {
  readonly runtimeMode = "api" as const;
  private readonly baseUrl: string;
  private scenarios: AgentScenario[] = [];

  constructor(baseUrl: string, private readonly timeoutMs = 12_000, private readonly fetchImpl: FetchImplementation = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/u, "");
  }

  async listScenarios(): Promise<AgentScenario[]> {
    const resource = await this.fetchJson<AgentScenarioListResource>("/scenarios");
    this.scenarios = resource.scenarios.map((descriptor) => {
      const local = agentDemoScenarios.find((scenario) => scenario.id === descriptor.id);
      if (!local) throw new ApiAgentClientError("SCENARIO_NOT_FOUND", `No UI adapter is registered for API scenario: ${descriptor.id}`);
      return {
        ...local,
        title: descriptor.title,
        sidebarLabel: descriptor.title,
        subtitle: descriptor.description,
        suggestedQuestionOptions: descriptor.suggestedQuestions,
        suggestedQuestions: descriptor.suggestedQuestions.map((question) => question.zh),
      };
    });
    return this.scenarios;
  }

  async startSession(scenarioId: string, language: AgentLanguage = "zh"): Promise<AgentConversationSession> {
    const scenario = this.scenario(scenarioId);
    const resource = await this.fetchJson<AgentSessionResource>("/sessions", {
      method: "POST",
      body: JSON.stringify({ contractVersion: AGENT_CONTRACT_VERSION, scenarioId, mode: "live", language }),
    });
    const session = {
      id: resource.session.id,
      title: scenario.title,
      scenarioId,
      domain: scenario.domain,
      turns: [],
      sharedContext: cloneContext(scenario.initialContext),
      createdAt: resource.session.createdAt,
      updatedAt: resource.session.updatedAt,
    };
    this.storage()?.setItem(this.sessionStorageKey(scenarioId, language), session.id);
    return session;
  }

  async resumeSession(scenarioId: string, language: AgentLanguage = "zh"): Promise<AgentConversationSession | null> {
    const storage = this.storage();
    const key = this.sessionStorageKey(scenarioId, language);
    const sessionId = storage?.getItem(key);
    if (!sessionId) return null;
    try {
      const [sessionResource, turnResource, runResource] = await Promise.all([
        this.fetchJson<AgentSessionResource>(`/sessions/${encodeURIComponent(sessionId)}`),
        this.fetchJson<AgentTurnListResource>(`/sessions/${encodeURIComponent(sessionId)}/turns`),
        this.fetchJson<AgentTurnRunListResource>(`/sessions/${encodeURIComponent(sessionId)}/runs`),
      ]);
      const scenario = this.scenario(scenarioId);
      let sharedContext = cloneContext(scenario.initialContext);
      const recordsByTurnId = new Map(turnResource.turns.map((record) => [record.response.turnId, record]));
      const restoredTurnIds = new Set<string>();
      const runs = [...runResource.runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const turns = runs.flatMap((run, index) => {
        const record = recordsByTurnId.get(run.turnId);
        if (record) {
          restoredTurnIds.add(run.turnId);
          return [{ ...mapTurn(record.response, record.request.message, index + 1, scenario), runId: run.id }];
        }
        return run.status === "failed" || run.status === "cancelled" ? [mapFailedRun(run, index + 1)] : [];
      });
      for (const record of turnResource.turns) {
        if (restoredTurnIds.has(record.response.turnId)) continue;
        turns.push(mapTurn(record.response, record.request.message, turns.length + 1, scenario));
      }
      turns.sort((left, right) => left.createdAt.localeCompare(right.createdAt)).forEach((turn, index) => {
        turn.order = index + 1;
      });
      for (const turn of turns) {
        if (turn.status !== "completed") continue;
        sharedContext = mergeContext(sharedContext, turn);
      }
      return {
        id: sessionResource.session.id,
        title: scenario.title,
        scenarioId,
        domain: scenario.domain,
        turns,
        sharedContext,
        createdAt: sessionResource.session.createdAt,
        updatedAt: sessionResource.session.updatedAt,
      };
    } catch (error) {
      if (error instanceof ApiAgentClientError && error.status === 404) {
        storage?.removeItem(key);
        return null;
      }
      throw error;
    }
  }

  async runTurn(options: AgentRunTurnOptions): Promise<void> {
    const requestId = `agent-request.${createId()}`;
    let expectedTurnId = `turn.${requestId}`;
    const createdAt = new Date().toISOString();
    const runningTurn: AgentConversationTurn = {
      id: expectedTurnId,
      order: options.previousTurns.length + 1,
      userMessage: { id: `${expectedTurnId}.user`, content: options.userMessage },
      agentResponse: null,
      trace: [],
      references: [],
      relatedObjects: [],
      viewIndexes: [],
      status: "running",
      createdAt,
    };
    options.onEvent({ type: "turn-started", turn: runningTurn });

    const request: AgentTurnRequest = {
      contractVersion: AGENT_CONTRACT_VERSION,
      requestId,
      sessionId: options.sessionId,
      scenarioId: options.scenarioId,
      mode: "live",
      language: options.language ?? "zh",
      message: options.userMessage,
      requestedAt: createdAt,
    };
    let acceptedRunId: string | undefined;

    try {
      const created = await this.fetchJson<AgentTurnRunResource>(`/sessions/${encodeURIComponent(options.sessionId)}/runs`, {
        method: "POST",
        body: JSON.stringify(request),
        signal: options.signal,
      });
      acceptedRunId = created.run.id;
      options.onEvent({ type: "run-accepted", provisionalTurnId: expectedTurnId, runId: created.run.id, turnId: created.run.turnId });
      expectedTurnId = created.run.turnId;
      await this.completeAcceptedRun(created.run.id, created.run.turnId, runningTurn.order, options);
    } catch (error) {
      if (options.signal?.aborted && acceptedRunId) await this.cancelServerRun(acceptedRunId);
      if (!options.signal?.aborted) options.onEvent({ type: "error", turnId: expectedTurnId, message: errorMessage(error) });
      throw error;
    }
  }

  async retryRun(runId: string, options: AgentRunTurnOptions): Promise<void> {
    const created = await this.fetchJson<AgentTurnRunResource>(`/runs/${encodeURIComponent(runId)}/retry`, {
      method: "POST",
      body: JSON.stringify({}),
      signal: options.signal,
    });
    const runningTurn: AgentConversationTurn = {
      id: created.run.turnId,
      runId: created.run.id,
      order: options.previousTurns.length + 1,
      userMessage: { id: `${created.run.turnId}.user`, content: created.run.request.message },
      agentResponse: null,
      trace: [],
      references: [],
      relatedObjects: [],
      viewIndexes: [],
      status: "running",
      createdAt: created.run.createdAt,
    };
    options.onEvent({ type: "turn-started", turn: runningTurn });
    options.onEvent({ type: "run-accepted", provisionalTurnId: runningTurn.id, runId: created.run.id, turnId: created.run.turnId });
    try {
      await this.completeAcceptedRun(created.run.id, created.run.turnId, runningTurn.order, options);
    } catch (error) {
      if (options.signal?.aborted) await this.cancelServerRun(created.run.id);
      if (!options.signal?.aborted) options.onEvent({ type: "error", turnId: created.run.turnId, message: errorMessage(error) });
      throw error;
    }
  }

  async getTurnDetails(turnId: string): Promise<AgentTurnDetails> {
    const [trace, evidence] = await Promise.all([
      this.fetchJson<AgentTraceResource>(`/turns/${encodeURIComponent(turnId)}/trace`),
      this.fetchJson<AgentEvidenceResource>(`/turns/${encodeURIComponent(turnId)}/evidence`),
    ]);
    return {
      trace: mapTrace(trace.trace),
      references: evidence.evidencePack.items.map(toReference),
    };
  }

  private scenario(id: string) {
    const scenario = this.scenarios.find((item) => item.id === id) ?? agentDemoScenarios.find((item) => item.id === id);
    if (!scenario) throw new ApiAgentClientError("SCENARIO_NOT_FOUND", `Scenario not found: ${id}`);
    return scenario;
  }

  private storage(): Storage | undefined {
    try {
      return typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;
    } catch {
      return undefined;
    }
  }

  private sessionStorageKey(scenarioId: string, language: AgentLanguage): string {
    return `manufacturing-agent-session:${this.baseUrl}:${scenarioId}:${language}`;
  }

  private async completeAcceptedRun(runId: string, turnId: string, order: number, options: AgentRunTurnOptions): Promise<void> {
    let terminalError: AgentServerRunEvent["error"];
    await this.streamRunEvents(runId, (event) => {
      if (event.type === "pipeline-event" && event.pipelineEvent?.type === "stage-started") {
        options.onEvent({ type: "step-started", turnId: event.turnId, step: mapStageStart(event.pipelineEvent.stage) });
      }
      if (event.type === "pipeline-event" && (event.pipelineEvent?.type === "stage-completed" || event.pipelineEvent?.type === "stage-failed")) {
        options.onEvent({ type: "step-completed", turnId: event.turnId, step: mapStage(event.pipelineEvent.stage) });
      }
      if (event.type === "run-failed" || event.type === "run-cancelled") terminalError = event.error;
    }, options.signal);
    if (terminalError) throw new ApiAgentClientError(terminalError.code, terminalError.message);
    const resource = await this.fetchJson<AgentTurnResource>(`/turns/${encodeURIComponent(turnId)}`, { signal: options.signal });
    const completed = { ...mapTurn(resource.turn.response, resource.turn.request.message, order, this.scenario(options.scenarioId)), runId };
    options.onEvent({ type: "turn-completed", turn: completed, sharedContext: mergeContext(options.sharedContext, completed) });
  }

  private async cancelServerRun(runId: string): Promise<void> {
    try {
      await this.fetchImpl(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Cancellation is best effort; the server timeout remains the final guard.
    }
  }

  private async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const externalSignal = init.signal;
    const abort = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abort();
    else externalSignal?.addEventListener("abort", abort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(new Error("Agent API request timed out.")), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
      const payload = await response.json() as T | AgentApiErrorResponse;
      if (!response.ok) {
        const apiError = payload as AgentApiErrorResponse;
        throw new ApiAgentClientError(apiError.error?.code ?? "PIPELINE_FAILED", apiError.error?.message ?? `Agent API returned ${response.status}.`, response.status, apiError.traceId);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiAgentClientError) throw error;
      if (externalSignal?.aborted) throw new DOMException("Agent request was cancelled.", "AbortError");
      if (controller.signal.aborted) throw new ApiAgentClientError("REQUEST_TIMEOUT", `Agent API did not respond within ${this.timeoutMs} ms.`);
      throw new ApiAgentClientError("PIPELINE_FAILED", errorMessage(error));
    } finally {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }

  private async streamRunEvents(runId: string, onEvent: (event: AgentServerRunEvent) => void, signal?: AbortSignal): Promise<void> {
    let afterSequence = 0;
    let reconnects = 0;
    while (!signal?.aborted) {
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/runs/${encodeURIComponent(runId)}/events?after=${afterSequence}`, {
          headers: { Accept: "text/event-stream", ...(afterSequence ? { "Last-Event-ID": `${runId}:${afterSequence}` } : {}) },
          signal,
        });
        if (!response.ok) {
          const payload = await response.json() as AgentApiErrorResponse;
          throw new ApiAgentClientError(payload.error?.code ?? "PIPELINE_FAILED", payload.error?.message ?? `Agent event stream returned ${response.status}.`, response.status, payload.traceId);
        }
        if (!response.body) throw new ApiAgentClientError("PIPELINE_FAILED", "Agent event stream has no response body.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let terminal = false;
        while (!terminal) {
          const result = await reader.read();
          buffer += decoder.decode(result.value, { stream: !result.done });
          const frames = buffer.split(/\r?\n\r?\n/u);
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const event = parseSseFrame(frame);
            if (!event || event.sequence <= afterSequence) continue;
            afterSequence = event.sequence;
            onEvent(event);
            terminal = event.type === "run-completed" || event.type === "run-failed" || event.type === "run-cancelled";
          }
          if (result.done) break;
        }
        if (terminal) return;
      } catch (error) {
        if (signal?.aborted) throw new DOMException("Agent request was cancelled.", "AbortError");
        if (error instanceof ApiAgentClientError && error.status && error.status < 500) throw error;
      }
      reconnects += 1;
      if (reconnects > 8) throw new ApiAgentClientError("PIPELINE_FAILED", "Agent event stream could not be resumed.");
      await delay(Math.min(1_000, 100 * 2 ** (reconnects - 1)), signal);
    }
    throw new DOMException("Agent request was cancelled.", "AbortError");
  }
}

function mapFailedRun(run: AgentTurnRun, order: number): AgentConversationTurn {
  return {
    id: run.turnId,
    runId: run.id,
    order,
    userMessage: { id: `${run.turnId}.user`, content: run.request.message },
    agentResponse: null,
    trace: [],
    references: [],
    relatedObjects: [],
    viewIndexes: [],
    status: "error",
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  };
}

export class ApiAgentClientError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number, readonly traceId?: string) {
    super(message);
    this.name = "ApiAgentClientError";
  }
}

function mapTurn(response: AgentTurnResponse, message: string, order: number, scenario: AgentScenario): AgentConversationTurn {
  const references = response.evidencePack.items.map(toReference);
  const relatedObjects = relatedObjectsFor(response);
  return {
    id: response.turnId,
    order,
    userMessage: {
      id: `${response.turnId}.user`,
      content: message,
      intent: response.queryPlan.intent,
      detectedTerms: response.queryPlan.entities.map((entity) => entity.label ?? entity.id),
    },
    agentResponse: {
      id: `${response.turnId}.response`,
      summary: response.answer.summary,
      findings: response.answer.findings,
      recommendedActions: response.answer.recommendedActions,
      risks: response.answer.risks,
      assumptions: response.answer.assumptions,
      limitations: response.answer.limitations,
      citations: response.answer.claims.map((claim) => ({ claim: claim.text, referenceIds: claim.citations.map((citation) => citation.evidenceId) })),
      confidence: response.answer.confidence,
    },
    trace: mapTrace(response.trace),
    references,
    relatedObjects,
    viewIndexes: scenario.viewIndexes ?? [],
    status: "completed",
    confidence: response.answer.confidence,
    createdAt: response.completedAt,
    completedAt: response.completedAt,
  };
}

function mapTrace(trace: StructuredAgentTrace): AgentReasoningStep[] {
  return trace.stages.map(mapStage);
}

function mapStage(stage: AgentTraceStage): AgentReasoningStep {
  const presentation = tracePresentation[stage.stage];
  return {
      id: stage.id,
      order: stageOrder(stage.id),
      layer: presentation.layer,
      title: presentation.title,
      description: stage.summary,
      input: stage.inputRefs,
      action: `Execute ${stage.tool ?? stage.stage} within the validated pipeline boundary.`,
      output: stage.outputRefs,
      confidence: stage.status === "completed" ? "high" : "low",
      toolName: presentation.tool,
      toolInput: { inputRefs: stage.inputRefs },
      toolOutput: { outputRefs: stage.outputRefs, status: stage.status },
      referencedObjectIds: stage.outputRefs.filter((id) => manufacturingObjectById.has(id)),
      referenceIds: stage.outputRefs.filter((id) => evidenceDocumentById.has(id)),
      durationMs: stage.durationMs,
    };
}

function mapStageStart(stage: AgentPipelineStageStart): AgentReasoningStep {
  const presentation = tracePresentation[stage.stage];
  return {
    id: stage.id,
    order: stageOrder(stage.id),
    layer: presentation.layer,
    title: presentation.title,
    description: `Running ${presentation.title}...`,
    input: stage.inputRefs,
    action: `Execute ${stage.tool ?? stage.stage} within the validated pipeline boundary.`,
    output: [],
    confidence: "medium",
    toolName: presentation.tool,
    toolInput: { inputRefs: stage.inputRefs },
    toolOutput: { status: "running" },
  };
}

const tracePresentation: Record<StructuredAgentTrace["stages"][number]["stage"], { layer: AgentReasoningStep["layer"]; title: string; tool: AgentToolName }> = {
  "semantic-parsing": { layer: "semantic", title: "Semantic Parsing", tool: "semanticResolver" },
  "query-plan-validation": { layer: "semantic", title: "Query Plan Validation", tool: "semanticResolver" },
  "ontology-validation": { layer: "ontology", title: "Ontology Validation", tool: "ontologyMapper" },
  "query-compilation": { layer: "ontology", title: "Safe Query Compilation", tool: "ontologyMapper" },
  "graph-retrieval": { layer: "knowledge", title: "Graph Retrieval", tool: "knowledgeRetriever" },
  "document-retrieval": { layer: "evidence", title: "Document Retrieval", tool: "evidenceFinder" },
  "evidence-pack": { layer: "evidence", title: "Evidence Pack", tool: "evidenceFinder" },
  "answer-composition": { layer: "answer", title: "Answer Composition", tool: "answerComposer" },
  "citation-validation": { layer: "evidence", title: "Citation Validation", tool: "evidenceFinder" },
};

function toReference(item: EvidenceItem): AgentReference {
  if (evidenceDocumentById.has(item.id)) return agentReference(item.id);
  return {
    id: item.id,
    title: item.title,
    type: inferReferenceType(item),
    version: item.version,
    sourceSystem: item.source.sourceSystem,
    evidenceText: item.excerpt,
    supports: item.excerpt,
    linkedObjectIds: item.linkedEntityIds,
    sourcePage: item.kind === "semantic" ? "Semantic Explorer" : item.kind === "ontology" ? "Ontology Explorer" : "Route Explorer",
    sourceViews: item.kind === "semantic" ? ["Semantic View"] : item.kind === "ontology" ? ["Ontology View"] : ["Quality View"],
  };
}

function inferReferenceType(item: EvidenceItem): AgentReferenceType {
  const title = item.title.toLowerCase();
  if (item.kind === "semantic") return "Semantic Catalog";
  if (item.kind === "ontology") return "Ontology";
  if (title.includes("control plan")) return "Control Plan";
  if (title.includes("pfmea")) return "PFMEA";
  if (title.includes("sop")) return "SOP";
  if (title.includes("qms")) return "QMS Mock Data";
  return "Route Graph";
}

function relatedObjectsFor(response: AgentTurnResponse): AgentRelatedObject[] {
  const ids = new Set([
    ...response.queryPlan.entities.map((entity) => entity.id),
    ...response.evidencePack.items.flatMap((item) => item.linkedEntityIds),
  ]);
  return [...ids].filter((id) => manufacturingObjectById.has(id)).map(agentRelatedObject);
}

function mergeContext(current: AgentSharedContext, turn: AgentConversationTurn): AgentSharedContext {
  const ids = new Set(turn.relatedObjects.map((object) => object.id));
  return {
    ...current,
    activeTopic: current.activeTopic ?? turn.userMessage.intent,
    activeOperationId: ids.has("operation.op30") ? "operation.op30" : current.activeOperationId,
    activeMachineId: ids.has("machine.m220") ? "machine.m220" : current.activeMachineId,
    activeQualityCharacteristicId: ids.has("quality-characteristic.leak-rate") ? "quality-characteristic.leak-rate" : current.activeQualityCharacteristicId,
    resolvedEntities: uniqueById([...current.resolvedEntities, ...turn.relatedObjects]),
    accumulatedReferences: uniqueById([...current.accumulatedReferences, ...turn.references]),
    assumptions: [...new Set([...current.assumptions, ...(turn.agentResponse?.assumptions ?? [])])],
  };
}

function cloneContext(context: AgentSharedContext): AgentSharedContext {
  return {
    ...context,
    relatedMetricIds: context.relatedMetricIds ? [...context.relatedMetricIds] : undefined,
    resolvedEntities: [...context.resolvedEntities],
    accumulatedReferences: [...context.accumulatedReferences],
    assumptions: [...context.assumptions],
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseSseFrame(frame: string): AgentServerRunEvent | null {
  const data = frame.split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  return JSON.parse(data) as AgentServerRunEvent;
}

function stageOrder(id: string): number {
  const order = Number(id.split(".").at(-1));
  return Number.isInteger(order) && order > 0 ? order : 1;
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Agent request was cancelled.", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("Agent request was cancelled.", "AbortError"));
    }, { once: true });
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Agent API error.";
}
