import type { AgentClient, AgentRunTurnOptions } from "./agentClient";
import { selectScriptedTurnTemplate, type ScriptedTurnTemplate } from "./agentConversationData";
import { agentDemoScenarios } from "./agentDemoData";
import type { AgentConversationSession, AgentConversationTurn, AgentReasoningStep, AgentReference, AgentRelatedObject, AgentSharedContext } from "./agentDemoTypes";

let sessionSequence = 0;

export class ScriptedAgentClient implements AgentClient {
  constructor(private readonly latencyScale = 1) {}

  async listScenarios() {
    return agentDemoScenarios;
  }

  async startSession(scenarioId: string): Promise<AgentConversationSession> {
    const scenario = agentDemoScenarios.find((item) => item.id === scenarioId);
    if (!scenario) throw new Error(`Scenario not found: ${scenarioId}`);
    const now = new Date().toISOString();
    sessionSequence += 1;
    return {
      id: `scripted-session-${sessionSequence}`,
      title: scenario.title,
      scenarioId: scenario.id,
      domain: scenario.domain,
      turns: [],
      sharedContext: cloneSharedContext(scenario.initialContext),
      createdAt: now,
      updatedAt: now,
    };
  }

  async runTurn(options: AgentRunTurnOptions) {
    const scenario = agentDemoScenarios.find((item) => item.id === options.scenarioId);
    if (!scenario) {
      options.onEvent({ type: "error", message: `Scenario not found: ${options.scenarioId}` });
      return;
    }
    if (options.signal?.aborted) return;

    const template = selectScriptedTurnTemplate(options.scenarioId, options.userMessage, options.previousTurns, options.sharedContext);
    const order = options.previousTurns.length + 1;
    const turnId = `${options.sessionId}-turn-${order}`;
    const now = new Date().toISOString();
    const steps = hydrateTrace(template.trace, turnId, options.sharedContext, options.previousTurns.length);
    const runningTurn: AgentConversationTurn = {
      id: turnId,
      order,
      userMessage: {
        id: `${turnId}-user`,
        content: options.userMessage,
        intent: template.intent,
        detectedTerms: template.detectedTerms,
      },
      agentResponse: null,
      trace: [],
      references: [],
      relatedObjects: [],
      viewIndexes: [],
      status: "running",
      createdAt: now,
    };

    if (!options.previousTurns.length) {
      options.onEvent({
        type: "session-started",
        session: {
          id: options.sessionId,
          title: scenario.title,
          scenarioId: scenario.id,
          domain: scenario.domain,
          turns: [],
          sharedContext: options.sharedContext,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    options.onEvent({ type: "turn-started", turn: runningTurn });

    for (const step of steps) {
      if (options.signal?.aborted) return;
      options.onEvent({ type: "step-started", turnId, step });
      const completed = await wait(Math.max(0, (step.durationMs ?? 600) * this.latencyScale), options.signal);
      if (!completed || options.signal?.aborted) return;
      options.onEvent({ type: "step-completed", turnId, step });
    }

    if (options.signal?.aborted) return;
    const completedAt = new Date().toISOString();
    const completedTurn: AgentConversationTurn = {
      ...runningTurn,
      agentResponse: { ...template.response, id: `${turnId}-response` },
      trace: steps,
      references: template.references,
      relatedObjects: template.relatedObjects,
      viewIndexes: template.viewIndexes,
      status: "completed",
      confidence: template.response.confidence,
      completedAt,
    };
    const sharedContext = mergeSharedContext(options.sharedContext, template);
    options.onEvent({ type: "turn-completed", turn: completedTurn, sharedContext });
  }
}

export function emptySharedContext(): AgentSharedContext {
  return { resolvedEntities: [], accumulatedReferences: [], assumptions: [] };
}

function hydrateTrace(steps: AgentReasoningStep[], turnId: string, context: AgentSharedContext, previousTurnCount: number) {
  const contextLines = describeContext(context);
  return steps.map((step) => ({
    ...step,
    id: `${turnId}-${step.id}`,
    input: step.layer === "context"
      ? previousTurnCount > 0 && contextLines.length
        ? [`Previous completed turns: ${previousTurnCount}`, ...contextLines]
        : ["No previous context. Start from user prompt."]
      : [...step.input],
    output: [...step.output],
    toolInput: step.toolInput ? { ...step.toolInput, previousTurnCount } : undefined,
  }));
}

function describeContext(context: AgentSharedContext) {
  const lines: string[] = [];
  if (context.activeTopic) lines.push(`Active topic: ${context.activeTopic}`);
  if (context.activeOperationId) lines.push(`Operation context: ${labelFor(context.activeOperationId, context.resolvedEntities)}`);
  if (context.activeMachineId) lines.push(`Machine context: ${labelFor(context.activeMachineId, context.resolvedEntities)}`);
  if (context.activeQualityCharacteristicId) lines.push(`Quality context: ${labelFor(context.activeQualityCharacteristicId, context.resolvedEntities)}`);
  if (context.activeProgramId) lines.push(`Program context: ${labelFor(context.activeProgramId, context.resolvedEntities)}`);
  if (context.candidateBottleneckId) lines.push(`Candidate bottleneck: ${labelFor(context.candidateBottleneckId, context.resolvedEntities)}`);
  if (context.relatedMetricIds?.length) lines.push(`Related metrics: ${context.relatedMetricIds.map((id) => labelFor(id, context.resolvedEntities)).join(", ")}`);
  return lines;
}

function mergeSharedContext(current: AgentSharedContext, template: ScriptedTurnTemplate): AgentSharedContext {
  const nextObjects = template.relatedObjects.filter((object) => template.contextUpdate.resolvedObjectIds.includes(object.id));
  const nextReferences = template.references.filter((reference) => template.contextUpdate.referenceIds.includes(reference.id));
  return {
    activeTopic: template.contextUpdate.activeTopic ?? current.activeTopic,
    activeOperationId: template.contextUpdate.activeOperationId ?? current.activeOperationId,
    activeMachineId: template.contextUpdate.activeMachineId ?? current.activeMachineId,
    activeQualityCharacteristicId: template.contextUpdate.activeQualityCharacteristicId ?? current.activeQualityCharacteristicId,
    activeProgramId: template.contextUpdate.activeProgramId ?? current.activeProgramId,
    candidateBottleneckId: template.contextUpdate.candidateBottleneckId ?? current.candidateBottleneckId,
    relatedMetricIds: template.contextUpdate.relatedMetricIds ?? current.relatedMetricIds,
    resolvedEntities: uniqueById([...current.resolvedEntities, ...nextObjects]),
    accumulatedReferences: uniqueById([...current.accumulatedReferences, ...nextReferences]),
    assumptions: [...new Set([...current.assumptions, ...template.contextUpdate.assumptions])],
  };
}

function cloneSharedContext(context: AgentSharedContext): AgentSharedContext {
  return { ...context, relatedMetricIds: context.relatedMetricIds ? [...context.relatedMetricIds] : undefined, resolvedEntities: [...context.resolvedEntities], accumulatedReferences: [], assumptions: [...context.assumptions] };
}

function uniqueById<T extends AgentRelatedObject | AgentReference>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function labelFor(id: string, objects: AgentRelatedObject[]) {
  return objects.find((object) => object.id === id)?.label ?? id;
}

function wait(durationMs: number, signal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve(true);
    }, durationMs);
    const cancel = () => {
      globalThis.clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
