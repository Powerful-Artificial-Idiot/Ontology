import {
  AGENT_CONTRACT_VERSION,
  type AgentAuditEvent,
  type AgentLanguage,
  type AgentMode,
  type AgentPipelineEventHandler,
  type AgentRunEvent,
  type AgentSession,
  type AgentTurnRecord,
  type AgentTurnRequest,
  type AgentTurnResponse,
  type AgentTurnRun,
  type ContractAgentClient,
} from "../../knowledge-contracts/src/index";
import { AgentPipelineError } from "./errors";
import { DeterministicAgentPipeline } from "./pipeline";
import type { AgentAuditQuery, AgentAuditStore, AgentClock, AgentRunEventStore, AgentRunStore, AgentSessionStore, AgentTurnStore } from "./types";

export class InMemoryAgentSessionStore implements AgentSessionStore {
  private readonly sessions = new Map<string, AgentSession>();

  async create(session: AgentSession): Promise<void> {
    if (this.sessions.has(session.id)) throw new Error(`Session already exists: ${session.id}`);
    this.sessions.set(session.id, cloneSession(session));
  }

  async get(id: string): Promise<AgentSession | null> {
    const session = this.sessions.get(id);
    return session ? cloneSession(session) : null;
  }

  async save(session: AgentSession): Promise<void> {
    this.sessions.set(session.id, cloneSession(session));
  }
}

export class InMemoryAgentTurnStore implements AgentTurnStore {
  private readonly turns = new Map<string, AgentTurnRecord>();

  async create(turn: AgentTurnRecord): Promise<void> {
    if (this.turns.has(turn.response.turnId)) {
      throw new AgentPipelineError("TURN_ALREADY_EXISTS", `Turn already exists: ${turn.response.turnId}`);
    }
    this.turns.set(turn.response.turnId, cloneJson(turn));
  }

  async get(turnId: string): Promise<AgentTurnRecord | null> {
    const turn = this.turns.get(turnId);
    return turn ? cloneJson(turn) : null;
  }

  async listBySession(sessionId: string): Promise<AgentTurnRecord[]> {
    return [...this.turns.values()]
      .filter((turn) => turn.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneJson);
  }
}

export class InMemoryAgentRunStore implements AgentRunStore {
  private readonly runs = new Map<string, AgentTurnRun>();

  async create(run: AgentTurnRun): Promise<void> {
    if (this.runs.has(run.id)) throw new AgentPipelineError("TURN_ALREADY_EXISTS", `Run already exists: ${run.id}`);
    this.runs.set(run.id, cloneJson(run));
  }

  async get(runId: string): Promise<AgentTurnRun | null> {
    const run = this.runs.get(runId);
    return run ? cloneJson(run) : null;
  }

  async save(run: AgentTurnRun): Promise<void> {
    this.runs.set(run.id, cloneJson(run));
  }

  async listBySession(sessionId: string): Promise<AgentTurnRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneJson);
  }
}

export class InMemoryAgentRunEventStore implements AgentRunEventStore {
  private readonly events = new Map<string, AgentRunEvent[]>();

  async append(event: AgentRunEvent): Promise<void> {
    const current = this.events.get(event.runId) ?? [];
    if (current.some((item) => item.sequence === event.sequence)) return;
    this.events.set(event.runId, [...current, cloneJson(event)].sort((left, right) => left.sequence - right.sequence));
  }

  async list(runId: string, afterSequence = 0): Promise<AgentRunEvent[]> {
    return (this.events.get(runId) ?? []).filter((event) => event.sequence > afterSequence).map(cloneJson);
  }
}

export class InMemoryAgentAuditSink implements AgentAuditStore {
  private readonly records: AgentAuditEvent[] = [];

  async append(event: AgentAuditEvent): Promise<void> {
    this.records.push({ ...event, resourceIds: [...event.resourceIds], metadata: { ...event.metadata } });
  }

  list(query: AgentAuditQuery = {}): AgentAuditEvent[] {
    return this.records
      .filter((event) => !query.sessionId || event.sessionId === query.sessionId)
      .filter((event) => !query.turnId || event.turnId === query.turnId)
      .filter((event) => !query.traceId || event.traceId === query.traceId)
      .map((event) => ({ ...event, resourceIds: [...event.resourceIds], metadata: { ...event.metadata } }));
  }
}

export type StartDeterministicSessionOptions = {
  id: string;
  scenarioId: string;
  mode?: AgentMode;
  language?: AgentLanguage;
  activeTopic?: string;
};

export class DeterministicAgentClient implements ContractAgentClient {
  constructor(
    private readonly pipeline: DeterministicAgentPipeline,
    private readonly sessions: AgentSessionStore,
    private readonly turns: AgentTurnStore,
    private readonly audit: AgentAuditStore,
    private readonly clock: AgentClock,
    private readonly actorId = "demo-user",
  ) {}

  async startSession(options: StartDeterministicSessionOptions): Promise<AgentSession> {
    const now = this.clock.now().toISOString();
    const session: AgentSession = {
      id: options.id,
      contractVersion: AGENT_CONTRACT_VERSION,
      scenarioId: options.scenarioId,
      mode: options.mode ?? "live",
      language: options.language ?? "zh",
      turnIds: [],
      context: { previousTurnIds: [], resolvedEntityIds: [], activeTopic: options.activeTopic, assumptions: [] },
      createdAt: now,
      updatedAt: now,
    };
    await this.sessions.create(session);
    return session;
  }

  async runTurn(request: AgentTurnRequest, signal?: AbortSignal, onEvent?: AgentPipelineEventHandler): Promise<AgentTurnResponse> {
    const session = request.sessionId ? await this.sessions.get(request.sessionId) : null;
    if (request.sessionId && !session) throw new AgentPipelineError("SESSION_NOT_FOUND", `Session not found: ${request.sessionId}`);
    try {
      const contextualRequest = session
        ? { ...request, context: request.context ?? session.context }
        : request;
      const response = await this.pipeline.run(contextualRequest, signal, onEvent);
      if (session) {
        const resolvedEntityIds = response.queryPlan.entities.map((entity) => entity.id);
        const updated: AgentSession = {
          ...session,
          turnIds: [...session.turnIds, response.turnId],
          context: {
            previousTurnIds: [...session.context.previousTurnIds, response.turnId],
            resolvedEntityIds: [...new Set([...session.context.resolvedEntityIds, ...resolvedEntityIds])],
            activeTopic: session.context.activeTopic ?? response.queryPlan.intent,
            assumptions: [...new Set([...session.context.assumptions, ...response.answer.assumptions])],
          },
          updatedAt: response.completedAt,
        };
        await this.sessions.save(updated);
      }
      const auditEvent = this.auditEvent(request, response.trace.traceId, response.turnId, "completed", response.queryPlan.entities.map((entity) => entity.id));
      await this.audit.append(auditEvent);
      if (request.sessionId) {
        await this.turns.create({
          sessionId: request.sessionId,
          request: contextualRequest,
          response,
          auditEventIds: [auditEvent.id],
          createdAt: request.requestedAt ?? response.completedAt,
          persistedAt: this.clock.now().toISOString(),
        });
      }
      return response;
    } catch (error) {
      await this.audit.append(this.auditEvent(request, `trace.${request.requestId}`, undefined, "failed", [], error instanceof AgentPipelineError ? error.detail.code : "PIPELINE_FAILED"));
      throw error;
    }
  }

  private auditEvent(request: AgentTurnRequest, traceId: string, turnId: string | undefined, outcome: AgentAuditEvent["outcome"], resourceIds: string[], errorCode?: string): AgentAuditEvent {
    return {
      id: `audit.${request.requestId}.${outcome}`,
      traceId,
      sessionId: request.sessionId,
      turnId,
      actorId: this.actorId,
      action: "agent.turn.execute",
      resourceIds,
      outcome,
      occurredAt: this.clock.now().toISOString(),
      metadata: { mode: request.mode, language: request.language, ...(errorCode ? { errorCode } : {}) },
    };
  }
}

function cloneSession(session: AgentSession): AgentSession {
  return {
    ...session,
    turnIds: [...session.turnIds],
    context: {
      ...session.context,
      previousTurnIds: [...session.context.previousTurnIds],
      resolvedEntityIds: [...session.context.resolvedEntityIds],
      assumptions: [...session.context.assumptions],
    },
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
