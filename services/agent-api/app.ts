import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AGENT_CONTRACT_VERSION,
  type AgentAuthorizationContext,
  type AgentApiErrorResponse,
  type AgentAuditResource,
  type AgentErrorCode,
  type AgentEvidenceResource,
  type AgentScenarioDescriptor,
  type AgentRunEvent,
  type AgentTurnRun,
  type PersistedAgentTurnRun,
  type AgentSession,
  type AgentSessionResource,
  type AgentTraceResource,
  type AgentTurnListResource,
  type AgentTurnRequest,
  type AgentTurnResource,
  type AgentTurnRunListResource,
  type AgentTurnRunResource,
  type CreateAgentSessionRequest,
} from "../../packages/knowledge-contracts/src/index";
import {
  AgentPipelineError,
  type AgentAuditStore,
  type AgentRunEventStore,
  type AgentRunStore,
  type AgentSessionStore,
  type AgentTurnStore,
  type DeterministicAgentClient,
  type SemanticParserMode,
  type AnswerComposerMode,
} from "../../packages/agent-core/src/index";
import { AgentTurnRunService, isTerminalRun } from "./turnRunService";
import { AgentAuthenticationError, createAgentApiSecurity, type AgentApiSecurityRuntime } from "./security";

const qualityScenario: AgentScenarioDescriptor = {
  id: "quality-issue-trace",
  title: "Leak Rate Quality Issue Trace",
  description: "Trace an OP30 Leak Rate abnormality across product, equipment, quality risk, and governed evidence.",
  domain: "quality",
  supportedModes: ["live"],
  supportedLanguages: ["zh", "en"],
  suggestedQuestions: [
    {
      zh: "OP30 的 Leak Rate 容许范围是多少？",
      en: "What is the allowable Leak Rate range at OP30?",
    },
    {
      zh: "OP30 的 Leak Rate 提升 50% 是否超标？",
      en: "Would a 50% increase in OP30 Leak Rate exceed the governed limits?",
    },
    {
      zh: "OP30 当前 Leak Rate 水平、最大值和 Cpk 是多少？",
      en: "What are the current OP30 Leak Rate mean, maximum and Cpk?",
    },
    {
      zh: "超过 0.27 sccm 后需要执行哪些措施？ OP30 Leak Rate",
      en: "Which governed actions are required after OP30 Leak Rate exceeds 0.27 sccm?",
    },
    {
      zh: "M220 程序 v3.5 是否已经可以用于正式生产？ OP30 Leak Rate",
      en: "Is M220 program V3.5 approved and effective for production at OP30?",
    },
    {
      zh: "OP20 是瓶颈，是否证明它导致了 OP30 Leak Rate 上升？",
      en: "Does the OP20 bottleneck prove that it caused the OP30 Leak Rate increase?",
    },
  ],
};

const agentScenarios: AgentScenarioDescriptor[] = [
  qualityScenario,
  {
    id: "engineering-change-impact",
    title: "Engineering Change Impact Analysis",
    description: "Assess governed operation, quality-control, document, validation, and release impacts for an M220 program change.",
    domain: "engineering",
    supportedModes: ["live"],
    supportedLanguages: ["zh", "en"],
    suggestedQuestions: [{
      zh: "M220 的程序版本从 V3.4 变更到 V3.5，会影响哪些工序、质量控制和放行文件？",
      en: "What operations, quality controls, documents and release gates are affected by changing M220 from LeakTestProgram V3.4 to V3.5?",
    }],
  },
  {
    id: "bottleneck-analysis",
    title: "Bottleneck Analysis",
    description: "Analyze bounded value-stream evidence for OP20 and the downstream constraint-shift risk from OP30 retest.",
    domain: "valueStream",
    supportedModes: ["live"],
    supportedLanguages: ["zh", "en"],
    suggestedQuestions: [{
      zh: "OP20 是当前瓶颈吗？如果 OP30 漏率复测增加，瓶颈会不会转移？",
      en: "Is OP20 the current bottleneck, and could OP30 Leak Rate retest shift the constraint downstream?",
    }],
  },
];

export type AgentApiLogger = {
  info(message: string, metadata: Record<string, string | number | boolean>): void;
  error(message: string, metadata: Record<string, string | number | boolean>): void;
};

export type AgentApiRuntime = {
  client: Pick<DeterministicAgentClient, "startSession" | "runTurn">;
  sessions: AgentSessionStore;
  turns: AgentTurnStore;
  audit: AgentAuditStore;
  runs: AgentRunStore;
  runEvents: AgentRunEventStore;
  runService: AgentTurnRunService;
  persistenceType?: "in-memory" | "file";
  knowledgeRepositoryType?: "mock" | "neo4j";
  semanticParserMode?: SemanticParserMode;
  answerComposerMode?: AnswerComposerMode;
  documentEvidenceMode?: "canonical" | "governed";
  llmProviderType?: "openai-responses" | "deepseek-chat-completions";
  readiness?: {
    dataDirectoryWritable: boolean;
    neo4jReachable: boolean;
    documentsVerified: boolean;
    authenticationConfigured: boolean;
    runtimePackagesAvailable: boolean;
  };
  timeoutMs?: number;
  logger?: AgentApiLogger;
  security?: AgentApiSecurityRuntime;
};

export function createAgentApi(runtime: AgentApiRuntime) {
  const timeoutMs = runtime.timeoutMs ?? 10_000;
  const logger = runtime.logger ?? noopLogger;
  runtime.security ??= createAgentApiSecurity({ MKG_AGENT_AUTH_MODE: "disabled" });
  return (request: IncomingMessage, response: ServerResponse) => {
    const requestTraceId = `api-trace.${randomUUID()}`;
    const startedAt = Date.now();
    handleRequest(runtime, request, response, requestTraceId, timeoutMs)
      .then(() => logger.info("Agent API request completed.", {
        method: request.method ?? "UNKNOWN",
        path: safePath(request.url),
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
        traceId: requestTraceId,
      }))
      .catch(async (error: unknown) => {
        const mapped = mapError(error);
        if (error instanceof AgentAuthenticationError) {
          await runtime.audit.append({
            id: `audit.security.${randomUUID()}`,
            traceId: requestTraceId,
            actorId: "anonymous",
            action: "security.authenticate",
            resourceIds: [safePath(request.url)],
            outcome: "denied",
            occurredAt: new Date().toISOString(),
            metadata: { reasonCode: error.code, authenticationMethod: "unknown" },
          });
        }
        logger.error("Agent API request failed.", {
          method: request.method ?? "UNKNOWN",
          path: safePath(request.url),
          status: mapped.status,
          code: mapped.code,
          durationMs: Date.now() - startedAt,
          traceId: requestTraceId,
        });
        if (response.destroyed || response.writableEnded) return;
        sendJson<AgentApiErrorResponse>(response, mapped.status, {
          error: { code: mapped.code, message: mapped.message, stage: mapped.stage, details: mapped.details },
          requestId: mapped.requestId,
          traceId: requestTraceId,
        }, requestTraceId);
      });
  };
}

async function handleRequest(runtime: AgentApiRuntime, request: IncomingMessage, response: ServerResponse, traceId: string, timeoutMs: number) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(traceId));
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.shift() !== "api" || segments.shift() !== "agent") {
    throw new AgentApiError(404, "SCENARIO_NOT_FOUND", "Agent API route not found.");
  }

  if (segments.length === 2 && segments[0] === "health" && segments[1] === "live") {
    requireMethod(request, "GET");
    sendJson(response, 200, { status: "ok", service: "deterministic-agent-api" }, traceId);
    return;
  }

  if (segments.length === 2 && segments[0] === "health" && segments[1] === "ready") {
    requireMethod(request, "GET");
    const checks = runtime.readiness ?? {
      dataDirectoryWritable: true,
      neo4jReachable: runtime.knowledgeRepositoryType === "neo4j",
      documentsVerified: true,
      authenticationConfigured: runtime.security?.profile !== "production",
      runtimePackagesAvailable: true,
    };
    const ready = checks.dataDirectoryWritable
      && checks.documentsVerified
      && checks.runtimePackagesAvailable
      && (runtime.knowledgeRepositoryType !== "neo4j" || checks.neo4jReachable)
      && (runtime.security?.profile !== "production" || checks.authenticationConfigured);
    sendJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "not-ready",
      deepseek: { configured: runtime.llmProviderType === "deepseek-chat-completions" },
      neo4j: { reachable: checks.neo4jReachable },
      documents: { verified: checks.documentsVerified },
      dataDirectory: { writable: checks.dataDirectoryWritable },
      authentication: { configured: checks.authenticationConfigured },
      runtime: { packagesAvailable: checks.runtimePackagesAvailable },
    }, traceId);
    return;
  }

  if (segments.length === 1 && segments[0] === "health") {
    requireMethod(request, "GET");
    sendJson(response, 200, {
      service: "deterministic-agent-api",
      status: "ok",
      contractVersion: AGENT_CONTRACT_VERSION,
      pipeline: "deterministic",
      persistence: runtime.persistenceType ?? "in-memory",
      knowledgeRepository: runtime.knowledgeRepositoryType ?? "mock",
      semanticParser: runtime.semanticParserMode ?? "deterministic",
      answerComposer: runtime.answerComposerMode ?? "template",
      documentEvidence: runtime.documentEvidenceMode ?? "governed",
      llmProvider: runtime.llmProviderType,
      authentication: runtime.security?.authenticator.mode ?? "disabled",
      securityProfile: runtime.security?.profile ?? "development",
      capabilities: ["sessions", "turns", "runs", "sse", "event-replay", "retry", "trace", "evidence", "governed-document-chunks", "audit", "cancellation", "timeout"],
    }, traceId);
    return;
  }

  if (segments.length === 1 && segments[0] === "scenarios") {
    requireMethod(request, "GET");
    sendJson(response, 200, { scenarios: agentScenarios }, traceId);
    return;
  }

  const authorization = await runtime.security!.authenticator.authenticate(request, traceId);

  if (segments.length === 1 && segments[0] === "sessions") {
    requireMethod(request, "POST");
    const body = assertCreateSessionRequest(await readJson(request));
    const scenario = agentScenarios.find((candidate) => candidate.id === body.scenarioId);
    if (!scenario) {
      throw new AgentApiError(404, "SCENARIO_NOT_FOUND", `Scenario not found: ${body.scenarioId}`, { scenarioId: body.scenarioId });
    }
    if (body.mode !== "live") {
      throw new AgentApiError(422, "AGENT_REQUEST_INVALID", "The Agent API only accepts live mode sessions.", { mode: body.mode });
    }
    await requireAuthorized(runtime, authorization, "session:create", {
      type: "scenario",
      id: scenario.id,
      domainIds: [scenario.domain],
    }, traceId);
    const session = await runtime.client.startSession({
      id: `session.${randomUUID()}`,
      scenarioId: body.scenarioId,
      mode: body.mode,
      language: body.language,
      activeTopic: scenario.title,
      authorization,
      domainIds: [scenario.domain],
    });
    sendJson<AgentSessionResource>(response, 201, { session }, traceId);
    return;
  }

  if (segments[0] === "sessions" && segments[1]) {
    const sessionId = decodeURIComponent(segments[1]);
    const session = await runtime.sessions.get(sessionId);
    if (!session) throw new AgentApiError(404, "SESSION_NOT_FOUND", `Session not found: ${sessionId}`, { sessionId });
    const sessionResource = resourceForSession(session);

    if (segments.length === 2) {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "session:read", sessionResource, traceId);
      sendJson<AgentSessionResource>(response, 200, { session }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "turns") {
      if (request.method === "GET") {
        await requireAuthorized(runtime, authorization, "session:read", sessionResource, traceId);
        sendJson<AgentTurnListResource>(response, 200, { sessionId, turns: await runtime.turns.listBySession(sessionId) }, traceId);
        return;
      }
      requireMethod(request, "POST");
      await requireAuthorized(runtime, authorization, "turn:execute", sessionResource, traceId);
      const body = assertTurnRequest(await readJson(request), sessionId, session.scenarioId);
      const expectedTurnId = `turn.${body.requestId.replace(/[^a-zA-Z0-9._-]/gu, "-")}`;
      if (await runtime.turns.get(expectedTurnId)) {
        throw new AgentApiError(409, "TURN_ALREADY_EXISTS", `A turn already exists for requestId ${body.requestId}.`, { turnId: expectedTurnId });
      }
      const turnResponse = await runWithDeadline(request, response, timeoutMs, (signal) => runtime.client.runTurn(body, signal, undefined, authorization));
      const turn = await runtime.turns.get(turnResponse.turnId);
      if (!turn) throw new AgentApiError(500, "PIPELINE_FAILED", "Completed turn was not persisted.", { turnId: turnResponse.turnId });
      sendJson<AgentTurnResource>(response, 201, { turn }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "runs") {
      if (request.method === "GET") {
        await requireAuthorized(runtime, authorization, "run:read", sessionResource, traceId);
        sendJson<AgentTurnRunListResource>(response, 200, { sessionId, runs: (await runtime.runs.listBySession(sessionId)).map(publicRun) }, traceId);
        return;
      }
      requireMethod(request, "POST");
      await requireAuthorized(runtime, authorization, "turn:execute", sessionResource, traceId);
      const body = assertTurnRequest(await readJson(request), sessionId, session.scenarioId);
      const existing = (await runtime.runs.listBySession(sessionId)).find((run) => run.requestId === body.requestId);
      if (existing) throw new AgentApiError(409, "TURN_ALREADY_EXISTS", `A run already exists for requestId ${body.requestId}.`, { runId: existing.id });
      const run = await runtime.runService.create(body, authorization);
      sendJson<AgentTurnRunResource>(response, 202, { run: publicRun(run) }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "audit") {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "audit:read", { ...sessionResource, type: "audit" }, traceId);
      sendJson<AgentAuditResource>(response, 200, { sessionId, events: runtime.audit.list({ sessionId }) }, traceId);
      return;
    }
  }

  if (segments[0] === "turns" && segments[1]) {
    const turnId = decodeURIComponent(segments[1]);
    const turn = await runtime.turns.get(turnId);
    if (!turn) throw new AgentApiError(404, "TURN_NOT_FOUND", `Turn not found: ${turnId}`, { turnId });
    const turnSession = await requiredSession(runtime, turn.sessionId);
    const turnResource = { ...resourceForSession(turnSession), type: "turn" as const, id: turnId, turnId };

    if (segments.length === 2) {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "session:read", turnResource, traceId);
      sendJson<AgentTurnResource>(response, 200, { turn }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "trace") {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "trace:read", { ...turnResource, type: "trace" }, traceId);
      sendJson<AgentTraceResource>(response, 200, { turnId, trace: turn.response.trace }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "evidence") {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "evidence:read", { ...turnResource, type: "evidence", objectIds: turn.response.evidencePack.items.flatMap((item) => item.linkedEntityIds) }, traceId);
      sendJson<AgentEvidenceResource>(response, 200, {
        turnId,
        evidencePack: turn.response.evidencePack,
        citationValidation: turn.response.citationValidation,
      }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "audit") {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "audit:read", { ...turnResource, type: "audit" }, traceId);
      sendJson<AgentAuditResource>(response, 200, { turnId, events: runtime.audit.list({ turnId }) }, traceId);
      return;
    }
  }

  if (segments[0] === "runs" && segments[1]) {
    const runId = decodeURIComponent(segments[1]);
    const run = await runtime.runs.get(runId);
    if (!run) throw new AgentApiError(404, "RUN_NOT_FOUND", `Run not found: ${runId}`, { runId });
    const runSession = await requiredSession(runtime, run.sessionId);
    const runResource = { ...resourceForSession(runSession), type: "run" as const, id: runId };

    if (segments.length === 2) {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "run:read", runResource, traceId);
      sendJson<AgentTurnRunResource>(response, 200, { run: publicRun(run) }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "events") {
      requireMethod(request, "GET");
      await requireAuthorized(runtime, authorization, "run:read", runResource, traceId);
      await streamRunEvents(runtime, request, response, runId, traceId, url);
      return;
    }

    if (segments.length === 3 && segments[2] === "retry") {
      requireMethod(request, "POST");
      await requireAuthorized(runtime, authorization, "run:control", runResource, traceId);
      const retry = await runtime.runService.retry(runId, authorization);
      sendJson<AgentTurnRunResource>(response, 202, { run: publicRun(retry) }, traceId);
      return;
    }

    if (segments.length === 3 && segments[2] === "cancel") {
      requireMethod(request, "POST");
      await requireAuthorized(runtime, authorization, "run:control", runResource, traceId);
      if (!runtime.runService.cancel(runId)) throw new AgentApiError(409, "RUN_NOT_RETRYABLE", `Run is not active: ${runId}`, { runId });
      sendJson<AgentTurnRunResource>(response, 202, { run: publicRun(run) }, traceId);
      return;
    }
  }

  throw new AgentApiError(404, "SCENARIO_NOT_FOUND", "Agent API route not found.");
}

async function runWithDeadline<T>(request: IncomingMessage, response: ServerResponse, timeoutMs: number, execute: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  const close = () => {
    if (!response.writableEnded) controller.abort();
  };
  request.once("aborted", abort);
  response.once("close", close);
  try {
    return await execute(controller.signal);
  } catch (error) {
    if (timedOut) throw new AgentApiError(504, "REQUEST_TIMEOUT", `Agent turn exceeded the ${timeoutMs} ms deadline.`, { timeoutMs });
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    request.off("aborted", abort);
    response.off("close", close);
  }
}

function assertCreateSessionRequest(value: unknown): CreateAgentSessionRequest {
  if (!isRecord(value)) throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "Session request must be a JSON object.");
  assertContractVersion(value.contractVersion);
  if (typeof value.scenarioId !== "string" || !value.scenarioId.trim()) throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "scenarioId is required.");
  if (value.mode !== "scripted" && value.mode !== "live") throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "mode must be scripted or live.");
  if (value.language !== "zh" && value.language !== "en") throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "language must be zh or en.");
  return { contractVersion: AGENT_CONTRACT_VERSION, scenarioId: value.scenarioId, mode: value.mode, language: value.language };
}

function assertTurnRequest(value: unknown, sessionId: string, scenarioId: string): AgentTurnRequest {
  if (!isRecord(value)) throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "Turn request must be a JSON object.");
  assertContractVersion(value.contractVersion);
  if (typeof value.requestId !== "string" || !value.requestId.trim()) throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "requestId is required.");
  if (value.sessionId !== sessionId) throw new AgentApiError(409, "AGENT_REQUEST_INVALID", "Request sessionId does not match the route.", { sessionId });
  if (value.scenarioId !== scenarioId) throw new AgentApiError(409, "AGENT_REQUEST_INVALID", "Request scenarioId does not match the session.", { scenarioId });
  if (value.mode !== "live") throw new AgentApiError(422, "AGENT_REQUEST_INVALID", "The Agent API only executes live turns.", { mode: String(value.mode) });
  if (value.language !== "zh" && value.language !== "en") throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "language must be zh or en.");
  if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 4_000) {
    throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "message must contain 1 to 4000 characters.");
  }
  if (value.requestedAt !== undefined && (typeof value.requestedAt !== "string" || !Number.isFinite(Date.parse(value.requestedAt)))) {
    throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "requestedAt must be an ISO date-time string.");
  }
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId: value.requestId,
    sessionId,
    scenarioId,
    mode: "live",
    language: value.language,
    message: value.message.trim(),
    requestedAt: value.requestedAt as string | undefined,
  };
}

function assertContractVersion(value: unknown): asserts value is typeof AGENT_CONTRACT_VERSION {
  if (value !== AGENT_CONTRACT_VERSION) {
    throw new AgentApiError(409, "AGENT_CONTRACT_INCOMPATIBLE", `Agent contract ${String(value)} is not supported.`, { supportedVersion: AGENT_CONTRACT_VERSION });
  }
}

function requireMethod(request: IncomingMessage, expected: string) {
  if (request.method !== expected) throw new AgentApiError(405, "AGENT_REQUEST_INVALID", `Use ${expected} for this endpoint.`, { allowedMethod: expected });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new AgentApiError(413, "AGENT_REQUEST_INVALID", "Request payload exceeds 1 MB.");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "Request body must be valid JSON.");
  }
}

function sendJson<T>(response: ServerResponse, status: number, payload: T, traceId: string) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, { ...corsHeaders(traceId), "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function streamRunEvents(
  runtime: AgentApiRuntime,
  request: IncomingMessage,
  response: ServerResponse,
  runId: string,
  traceId: string,
  url: URL,
): Promise<void> {
  const afterSequence = parseEventCursor(request.headers["last-event-id"], url.searchParams.get("after"));
  response.writeHead(200, {
    ...corsHeaders(traceId),
    "Content-Type": "text/event-stream; charset=utf-8",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 1000\n\n");
  let latestSequence = afterSequence;
  let ended = false;
  const send = (event: AgentRunEvent) => {
    if (ended || event.sequence <= latestSequence) return;
    latestSequence = event.sequence;
    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    if (event.type === "run-completed" || event.type === "run-failed" || event.type === "run-cancelled") {
      ended = true;
      response.end();
    }
  };
  const unsubscribe = runtime.runService.subscribe(runId, send);
  try {
    (await runtime.runService.eventsAfter(runId, afterSequence)).forEach(send);
    (await runtime.runService.eventsAfter(runId, latestSequence)).forEach(send);
    const current = await runtime.runService.get(runId);
    if (!ended && current && isTerminalRun(current)) {
      ended = true;
      response.end();
    }
    if (ended) return;
    await new Promise<void>((resolve) => {
      const heartbeat = globalThis.setInterval(() => response.write(": heartbeat\n\n"), 15_000);
      const finish = () => {
        globalThis.clearInterval(heartbeat);
        resolve();
      };
      request.once("close", finish);
      response.once("finish", finish);
    });
  } finally {
    unsubscribe();
    if (!response.writableEnded) response.end();
  }
}

function parseEventCursor(lastEventId: string | string[] | undefined, after: string | null): number {
  const raw = after ?? (Array.isArray(lastEventId) ? lastEventId[0] : lastEventId)?.split(":").at(-1);
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new AgentApiError(400, "AGENT_REQUEST_INVALID", "SSE event cursor must be a non-negative integer.");
  return value;
}

function corsHeaders(traceId: string) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Last-Event-ID",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "X-Trace-Id": traceId,
  };
}

function mapError(error: unknown): AgentApiError {
  if (error instanceof AgentApiError) return error;
  if (error instanceof AgentAuthenticationError) return new AgentApiError(401, error.code, error.message);
  if (error instanceof AgentPipelineError) {
    const statusByCode: Partial<Record<AgentErrorCode, number>> = {
      AGENT_CONTRACT_INCOMPATIBLE: 409,
      AGENT_REQUEST_INVALID: 400,
      CLARIFICATION_REQUIRED: 422,
      QUERY_PLAN_INVALID: 422,
      ONTOLOGY_TERM_INVALID: 422,
      QUERY_INTENT_UNSUPPORTED: 422,
      EVIDENCE_INSUFFICIENT: 422,
      CITATION_INVALID: 422,
      SESSION_NOT_FOUND: 404,
      TURN_NOT_FOUND: 404,
      TURN_ALREADY_EXISTS: 409,
      RUN_NOT_FOUND: 404,
      RUN_NOT_RETRYABLE: 409,
      RUN_INTERRUPTED: 409,
      LLM_PROVIDER_UNAVAILABLE: 503,
      LLM_RESPONSE_INVALID: 422,
      LLM_ENTITY_UNRESOLVED: 422,
      PIPELINE_CANCELLED: 499,
      AUTHENTICATION_REQUIRED: 401,
      AUTHENTICATION_INVALID: 401,
      AUTHORIZATION_DENIED: 403,
    };
    return new AgentApiError(statusByCode[error.detail.code] ?? 500, error.detail.code, error.detail.message, error.detail.details, error.detail.stage);
  }
  return new AgentApiError(500, "PIPELINE_FAILED", "The Agent API could not complete the request.");
}

class AgentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: AgentErrorCode,
    message: string,
    readonly details: Record<string, string | number | boolean> = {},
    readonly stage?: AgentApiErrorResponse["error"]["stage"],
    readonly requestId?: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safePath(rawUrl: string | undefined) {
  try {
    return new URL(rawUrl ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return "/";
  }
}

const noopLogger: AgentApiLogger = {
  info: () => undefined,
  error: () => undefined,
};

async function requiredSession(runtime: AgentApiRuntime, sessionId: string) {
  const session = await runtime.sessions.get(sessionId);
  if (!session) throw new AgentApiError(404, "SESSION_NOT_FOUND", `Session not found: ${sessionId}`, { sessionId });
  return session;
}

function resourceForSession(session: AgentSession) {
  return {
    type: "session" as const,
    id: session.id,
    sessionId: session.id,
    tenantId: session.security?.tenantId,
    ownerPrincipalId: session.security?.ownerPrincipalId,
    domainIds: session.security?.allowedDomainIds,
  };
}

async function requireAuthorized(
  runtime: AgentApiRuntime,
  authorization: AgentAuthorizationContext,
  action: Parameters<AgentApiSecurityRuntime["authorizer"]["authorize"]>[1],
  resource: Parameters<AgentApiSecurityRuntime["authorizer"]["authorize"]>[2],
  traceId: string,
) {
  const decision = runtime.security!.authorizer.authorize(authorization, action, resource);
  if (runtime.security!.authenticator.mode !== "disabled" || decision.decision === "denied") {
    await runtime.audit.append({
      id: `audit.security.${randomUUID()}`,
      traceId,
      sessionId: resource.sessionId,
      turnId: resource.turnId,
      actorId: authorization.principal.id,
      action: `security.${action}`,
      resourceIds: [resource.id],
      outcome: decision.decision,
      occurredAt: new Date().toISOString(),
      metadata: {
        tenantId: authorization.principal.tenantId,
        resourceType: resource.type,
        reasonCode: decision.reasonCode,
        authenticationMethod: authorization.principal.authenticationMethod,
      },
    });
  }
  if (decision.decision === "denied") {
    throw new AgentApiError(403, "AUTHORIZATION_DENIED", "The authenticated principal is not authorized for this resource.", {
      action,
      resourceType: resource.type,
      reasonCode: decision.reasonCode,
    });
  }
}

function publicRun(run: PersistedAgentTurnRun): AgentTurnRun {
  const result = { ...run };
  delete result.authorizationContext;
  return result;
}
