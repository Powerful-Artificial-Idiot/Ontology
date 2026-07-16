import {
  AGENT_CONTRACT_VERSION,
  type AgentAuditEvent,
  type AgentLanguage,
  type AgentMode,
  type AgentSession,
  type AgentTurnRequest,
  type AgentTurnResponse,
  type ContractAgentClient,
} from "../../knowledge-contracts/src/index";
import { AgentPipelineError } from "./errors";
import { DeterministicAgentPipeline } from "./pipeline";
import type { AgentAuditSink, AgentClock, AgentSessionStore } from "./types";

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

export class InMemoryAgentAuditSink implements AgentAuditSink {
  private readonly records: AgentAuditEvent[] = [];

  async append(event: AgentAuditEvent): Promise<void> {
    this.records.push({ ...event, resourceIds: [...event.resourceIds], metadata: { ...event.metadata } });
  }

  list(): AgentAuditEvent[] {
    return this.records.map((event) => ({ ...event, resourceIds: [...event.resourceIds], metadata: { ...event.metadata } }));
  }
}

export type StartDeterministicSessionOptions = {
  id: string;
  mode?: AgentMode;
  language?: AgentLanguage;
  activeTopic?: string;
};

export class DeterministicAgentClient implements ContractAgentClient {
  constructor(
    private readonly pipeline: DeterministicAgentPipeline,
    private readonly sessions: AgentSessionStore,
    private readonly audit: AgentAuditSink,
    private readonly clock: AgentClock,
    private readonly actorId = "demo-user",
  ) {}

  async startSession(options: StartDeterministicSessionOptions): Promise<AgentSession> {
    const now = this.clock.now().toISOString();
    const session: AgentSession = {
      id: options.id,
      contractVersion: AGENT_CONTRACT_VERSION,
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

  async runTurn(request: AgentTurnRequest, signal?: AbortSignal): Promise<AgentTurnResponse> {
    const session = request.sessionId ? await this.sessions.get(request.sessionId) : null;
    if (request.sessionId && !session) throw new AgentPipelineError("SESSION_NOT_FOUND", `Session not found: ${request.sessionId}`);
    try {
      const contextualRequest = session
        ? { ...request, context: request.context ?? session.context }
        : request;
      const response = await this.pipeline.run(contextualRequest, signal);
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
      await this.audit.append(this.auditEvent(request, response.trace.traceId, response.turnId, "completed", response.queryPlan.entities.map((entity) => entity.id)));
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
