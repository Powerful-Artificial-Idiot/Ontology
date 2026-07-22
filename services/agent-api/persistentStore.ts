import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AgentAuditEvent,
  AgentError,
  AgentRunEvent,
  AgentSession,
  AgentTurnRecord,
  AgentTurnRun,
} from "../../packages/knowledge-contracts/src/index";
import type {
  AgentAuditQuery,
  AgentAuditStore,
  AgentRunEventStore,
  AgentRunStore,
  AgentSessionStore,
  AgentTurnStore,
} from "../../packages/agent-core/src/index";

type PersistentAgentState = {
  version: 1;
  sessions: Record<string, AgentSession>;
  turns: Record<string, AgentTurnRecord>;
  auditEvents: AgentAuditEvent[];
  runs: Record<string, AgentTurnRun>;
  runEvents: Record<string, AgentRunEvent[]>;
};

export class FileAgentStore {
  private state: PersistentAgentState = emptyState();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      this.state = parseState(await readFile(this.filePath, "utf8"));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      await this.persist();
    }
    await this.markInterruptedRuns();
  }

  async create(value: AgentSession | AgentTurnRecord | AgentTurnRun): Promise<void> {
    if (isSession(value)) {
      if (this.state.sessions[value.id]) throw new Error(`Session already exists: ${value.id}`);
      this.state.sessions[value.id] = cloneJson(value);
    } else if (isTurnRecord(value)) {
      const turnId = value.response.turnId;
      if (this.state.turns[turnId]) throw new Error(`Turn already exists: ${turnId}`);
      this.state.turns[turnId] = cloneJson(value);
    } else {
      if (this.state.runs[value.id]) throw new Error(`Run already exists: ${value.id}`);
      this.state.runs[value.id] = cloneJson(value);
    }
    await this.persist();
  }

  async get(id: string): Promise<AgentSession | AgentTurnRecord | AgentTurnRun | null> {
    const value = this.state.sessions[id] ?? this.state.turns[id] ?? this.state.runs[id];
    return value ? cloneJson(value) : null;
  }

  async save(value: AgentSession | AgentTurnRun): Promise<void> {
    if (isSession(value)) this.state.sessions[value.id] = cloneJson(value);
    else this.state.runs[value.id] = cloneJson(value);
    await this.persist();
  }

  async listBySession(sessionId: string): Promise<Array<AgentTurnRecord | AgentTurnRun>> {
    const turns = Object.values(this.state.turns).filter((turn) => turn.sessionId === sessionId);
    const runs = Object.values(this.state.runs).filter((run) => run.sessionId === sessionId);
    return [...turns, ...runs].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).map(cloneJson);
  }

  async append(value: AgentAuditEvent | AgentRunEvent): Promise<void> {
    if (isRunEvent(value)) {
      const events = this.state.runEvents[value.runId] ?? [];
      if (!events.some((event) => event.sequence === value.sequence)) {
        this.state.runEvents[value.runId] = [...events, cloneJson(value)].sort((left, right) => left.sequence - right.sequence);
      }
    } else {
      if (!this.state.auditEvents.some((event) => event.id === value.id)) this.state.auditEvents.push(cloneJson(value));
    }
    await this.persist();
  }

  list(query: AgentAuditQuery = {}): AgentAuditEvent[] {
    return this.state.auditEvents
      .filter((event) => !query.sessionId || event.sessionId === query.sessionId)
      .filter((event) => !query.turnId || event.turnId === query.turnId)
      .filter((event) => !query.traceId || event.traceId === query.traceId)
      .map(cloneJson);
  }

  async listEvents(runId: string, afterSequence = 0): Promise<AgentRunEvent[]> {
    return (this.state.runEvents[runId] ?? []).filter((event) => event.sequence > afterSequence).map(cloneJson);
  }

  private async markInterruptedRuns(): Promise<void> {
    const now = new Date().toISOString();
    let changed = false;
    for (const run of Object.values(this.state.runs)) {
      if (run.status !== "queued" && run.status !== "running") continue;
      const error: AgentError = {
        code: "RUN_INTERRUPTED",
        message: "The Agent API restarted before this run completed. Retry the failed run to continue.",
        details: { previousStatus: run.status },
      };
      run.status = "failed";
      run.error = error;
      run.completedAt = now;
      const events = this.state.runEvents[run.id] ?? [];
      const sequence = events.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1;
      events.push({
        id: `${run.id}:${sequence}`,
        sequence,
        runId: run.id,
        sessionId: run.sessionId,
        turnId: run.turnId,
        type: "run-failed",
        occurredAt: now,
        error,
      });
      this.state.runEvents[run.id] = events;
      changed = true;
    }
    if (changed) await this.persist();
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, "utf8");
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }
}

export class FileAgentSessionStore implements AgentSessionStore {
  constructor(private readonly store: FileAgentStore) {}
  create(session: AgentSession) { return this.store.create(session); }
  async get(id: string) { return await this.store.get(id) as AgentSession | null; }
  save(session: AgentSession) { return this.store.save(session); }
}

export class FileAgentTurnStore implements AgentTurnStore {
  constructor(private readonly store: FileAgentStore) {}
  create(turn: AgentTurnRecord) { return this.store.create(turn); }
  async get(id: string) { return await this.store.get(id) as AgentTurnRecord | null; }
  async listBySession(sessionId: string) {
    const values = await this.store.listBySession(sessionId);
    return values.filter(isTurnRecord);
  }
}

export class FileAgentRunStore implements AgentRunStore {
  constructor(private readonly store: FileAgentStore) {}
  create(run: AgentTurnRun) { return this.store.create(run); }
  async get(id: string) { return await this.store.get(id) as AgentTurnRun | null; }
  save(run: AgentTurnRun) { return this.store.save(run); }
  async listBySession(sessionId: string) {
    const values = await this.store.listBySession(sessionId);
    return values.filter(isTurnRun);
  }
}

export class FileAgentRunEventStore implements AgentRunEventStore {
  constructor(private readonly store: FileAgentStore) {}
  append(event: AgentRunEvent) { return this.store.append(event); }
  list(runId: string, afterSequence = 0) { return this.store.listEvents(runId, afterSequence); }
}

export class FileAgentAuditStore implements AgentAuditStore {
  constructor(private readonly store: FileAgentStore) {}
  append(event: AgentAuditEvent) { return this.store.append(event); }
  list(query: AgentAuditQuery = {}) { return this.store.list(query); }
}

function emptyState(): PersistentAgentState {
  return { version: 1, sessions: {}, turns: {}, auditEvents: [], runs: {}, runEvents: {} };
}

function parseState(raw: string): PersistentAgentState {
  const value = JSON.parse(raw) as Partial<PersistentAgentState>;
  if (value.version !== 1 || !value.sessions || !value.turns || !value.runs || !value.runEvents || !Array.isArray(value.auditEvents)) {
    throw new Error("Persistent Agent Store contains an unsupported or invalid state document.");
  }
  return value as PersistentAgentState;
}

function isSession(value: AgentSession | AgentTurnRecord | AgentTurnRun): value is AgentSession {
  return "turnIds" in value;
}

function isTurnRecord(value: AgentSession | AgentTurnRecord | AgentTurnRun): value is AgentTurnRecord {
  return "response" in value;
}

function isTurnRun(value: AgentTurnRecord | AgentTurnRun): value is AgentTurnRun {
  return "attempt" in value;
}

function isRunEvent(value: AgentAuditEvent | AgentRunEvent): value is AgentRunEvent {
  return "sequence" in value && "runId" in value;
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
