import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, KeyRound, RotateCcw } from "lucide-react";
import { Header } from "../../components/Header";
import type { AppPage } from "../../types";
import type { AgentClient, AgentRunEvent } from "./agentClient";
import type { AgentConversationSession, AgentConversationTurn, AgentLanguage, AgentScenario, AgentSharedContext } from "./agentDemoTypes";
import { AgentContextPanel } from "./components/AgentContextPanel";
import { AgentConversationThread } from "./components/AgentConversationThread";
import { AgentReferencesPanel } from "./components/AgentReferencesPanel";
import { AgentTurnTraceInspector } from "./components/AgentTurnTraceInspector";
import { AgentWorkspaceHeader } from "./components/AgentWorkspaceHeader";
import { createAgentClient } from "./agentClientFactory";
import { mockKnowledgeValidationReport } from "../../data/mockKnowledgeRegistry/runtimeValidation";

const defaultScenarioId = "quality-issue-trace";
const accessTokenStorageKey = "mkg-live-agent-access";

export function AgentDemoPage({ activePage, onPageChange, client: providedClient }: { activePage: AppPage; onPageChange: (page: AppPage) => void; client?: AgentClient }) {
  const configuredMode = providedClient?.runtimeMode ?? (import.meta.env.VITE_AGENT_MODE === "api" ? "api" : "scripted");
  const [runtimeMode, setRuntimeMode] = useState(configuredMode);
  const [accessToken, setAccessToken] = useState(() => configuredMode === "api" && !providedClient ? readSessionToken() : undefined);
  const [accessTokenDraft, setAccessTokenDraft] = useState("");
  const client = useMemo(
    () => providedClient ?? createAgentClient({ mode: runtimeMode, bearerToken: accessToken }),
    [accessToken, providedClient, runtimeMode],
  );
  const [scenarios, setScenarios] = useState<AgentScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState(defaultScenarioId);
  const [session, setSession] = useState<AgentConversationSession | null>(null);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [conversationLanguage, setConversationLanguage] = useState<AgentLanguage>(() => typeof window !== "undefined" && window.localStorage.getItem("agent-question-language") === "en" ? "en" : "zh");
  const initialLanguageRef = useRef(conversationLanguage);
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController>();

  const cancelRun = useCallback(() => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = undefined;
  }, []);

  useEffect(() => {
    if (runtimeMode === "api" && !providedClient && !accessToken) return;
    let mounted = true;
    const initialize = async () => {
      try {
        const items = await client.listScenarios();
        if (!mounted) return;
        const initial = items.find((item) => item.id === defaultScenarioId) ?? items[0];
        setScenarios(items);
        if (!initial) throw new Error("No scripted agent scenarios are available.");
        setSelectedScenarioId(initial.id);
        const initialSession = await client.resumeSession?.(initial.id, initialLanguageRef.current)
          ?? await client.startSession(initial.id, initialLanguageRef.current);
        if (!mounted) return;
        setSession(initialSession);
      } catch (loadError) {
        if (mounted) setError(errorMessage(loadError));
      }
    };
    void initialize();
    return () => {
      mounted = false;
      cancelRun();
    };
  }, [accessToken, cancelRun, client, providedClient, runtimeMode]);

  useEffect(() => {
    window.localStorage.setItem("agent-question-language", conversationLanguage);
  }, [conversationLanguage]);

  const startNewSession = useCallback(async (scenarioId: string) => {
    cancelRun();
    const runId = runIdRef.current;
    setIsRunning(false);
    setSelectedTurnId(null);
    setSelectedReferenceId(null);
    setDraft("");
    setError(undefined);
    try {
      const nextSession = await client.startSession(scenarioId, conversationLanguage);
      if (runId !== runIdRef.current) return undefined;
      setSession(nextSession);
      return nextSession;
    } catch (sessionError) {
      if (runId === runIdRef.current) setError(errorMessage(sessionError));
      return undefined;
    }
  }, [cancelRun, client, conversationLanguage]);

  const applyEvent = useCallback((event: AgentRunEvent, runId: number, sessionId: string) => {
    if (runId !== runIdRef.current) return;
    if (event.type === "session-started") return;
    if (event.type === "error") {
      setError(event.message);
      if (event.turnId) setSession((current) => current?.id === sessionId ? { ...current, turns: updateTurn(current.turns, event.turnId!, (turn) => ({ ...turn, status: "error" })) } : current);
      return;
    }
    if (event.type === "turn-started") {
      setSelectedTurnId(event.turn.id);
      setSelectedReferenceId(null);
      setSession((current) => current?.id === sessionId ? { ...current, turns: [...current.turns.filter((turn) => turn.id !== event.turn.id), event.turn].sort((a, b) => a.order - b.order) } : current);
      return;
    }
    if (event.type === "run-accepted") {
      setSelectedTurnId(event.turnId);
      setSession((current) => current?.id === sessionId ? {
        ...current,
        turns: current.turns.map((turn) => turn.id === event.provisionalTurnId ? {
          ...turn,
          id: event.turnId,
          runId: event.runId,
          userMessage: { ...turn.userMessage, id: `${event.turnId}.user` },
        } : turn),
      } : current);
      return;
    }
    if (event.type === "step-started" || event.type === "step-completed") {
      setSession((current) => current?.id === sessionId ? { ...current, turns: updateTurn(current.turns, event.turnId, (turn) => ({ ...turn, trace: upsertStep(turn.trace, event.step) })) } : current);
      return;
    }
    if (event.type === "turn-completed") {
      setSelectedTurnId(event.turn.id);
      setSelectedReferenceId(null);
      setSession((current) => current?.id === sessionId ? { ...current, turns: [...current.turns.filter((turn) => turn.id !== event.turn.id), event.turn].sort((a, b) => a.order - b.order), sharedContext: event.sharedContext, updatedAt: event.turn.completedAt ?? new Date().toISOString() } : current);
    }
  }, []);

  const executeTurn = useCallback(async (sessionSnapshot: AgentConversationSession, question: string, runId: number, signal: AbortSignal) => {
    let completedTurn: AgentConversationTurn | undefined;
    let sharedContext: AgentSharedContext | undefined;
    await client.runTurn({
      sessionId: sessionSnapshot.id,
      scenarioId: sessionSnapshot.scenarioId,
      userMessage: question,
      language: conversationLanguage,
      previousTurns: sessionSnapshot.turns,
      sharedContext: sessionSnapshot.sharedContext,
      signal,
      onEvent: (event) => {
        applyEvent(event, runId, sessionSnapshot.id);
        if (event.type === "turn-completed") {
          completedTurn = event.turn;
          sharedContext = event.sharedContext;
        }
      },
    });
    return completedTurn && sharedContext ? { turn: completedTurn, sharedContext } : undefined;
  }, [applyEvent, client, conversationLanguage]);

  const submitQuestion = useCallback(async (question: string) => {
    const normalized = question.trim();
    if (!normalized || !session || isRunning) return;
    cancelRun();
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft("");
    setError(undefined);
    setIsRunning(true);
    try {
      await executeTurn(session, normalized, runId, controller.signal);
    } catch (runError) {
      if (!controller.signal.aborted && runId === runIdRef.current) setError(errorMessage(runError));
    } finally {
      if (runId === runIdRef.current) {
        setIsRunning(false);
        abortRef.current = undefined;
      }
    }
  }, [cancelRun, executeTurn, isRunning, session]);

  const selectedTurn = useMemo(() => session?.turns.find((turn) => turn.id === selectedTurnId), [selectedTurnId, session?.turns]);

  const retrySelectedTurn = useCallback(async () => {
    if (!session || !selectedTurn?.runId || !client.retryRun || isRunning) return;
    cancelRun();
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(undefined);
    setIsRunning(true);
    try {
      await client.retryRun(selectedTurn.runId, {
        sessionId: session.id,
        scenarioId: session.scenarioId,
        userMessage: selectedTurn.userMessage.content,
        language: conversationLanguage,
        previousTurns: session.turns,
        sharedContext: session.sharedContext,
        signal: controller.signal,
        onEvent: (event) => applyEvent(event, runId, session.id),
      });
    } catch (runError) {
      if (!controller.signal.aborted && runId === runIdRef.current) setError(errorMessage(runError));
    } finally {
      if (runId === runIdRef.current) {
        setIsRunning(false);
        abortRef.current = undefined;
      }
    }
  }, [applyEvent, cancelRun, client, conversationLanguage, isRunning, selectedTurn, session]);

  const loadExampleConversation = useCallback(async () => {
    const scenario = scenarios.find((item) => item.id === selectedScenarioId);
    if (!scenario || isRunning) return;
    cancelRun();
    const runId = ++runIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setError(undefined);
    setSelectedTurnId(null);
    setSelectedReferenceId(null);
    try {
      let cursor = await client.startSession(scenario.id, conversationLanguage);
      if (runId !== runIdRef.current) return;
      setSession(cursor);
      const localizedExamples = scenario.suggestedQuestionOptions?.slice(0, 3).map((question) => question[conversationLanguage]);
      const questions = localizedExamples?.length ? localizedExamples : scenario.exampleQuestions?.length ? scenario.exampleQuestions : [scenario.userQuestion];
      for (const question of questions) {
        if (controller.signal.aborted || runId !== runIdRef.current) return;
        const result = await executeTurn(cursor, question, runId, controller.signal);
        if (!result) return;
        cursor = { ...cursor, turns: [...cursor.turns, result.turn], sharedContext: result.sharedContext, updatedAt: result.turn.completedAt ?? cursor.updatedAt };
      }
    } catch (runError) {
      if (!controller.signal.aborted && runId === runIdRef.current) setError(errorMessage(runError));
    } finally {
      if (runId === runIdRef.current) {
        setIsRunning(false);
        abortRef.current = undefined;
      }
    }
  }, [cancelRun, client, conversationLanguage, executeTurn, isRunning, scenarios, selectedScenarioId]);

  const handleScenarioChange = useCallback((scenarioId: string) => {
    if (scenarioId === selectedScenarioId) return;
    setSelectedScenarioId(scenarioId);
    void startNewSession(scenarioId);
  }, [selectedScenarioId, startNewSession]);

  const handleSelectTurn = useCallback((turnId: string) => {
    setSelectedTurnId(turnId);
    setSelectedReferenceId(null);
    void client.getTurnDetails(turnId).then((details) => {
      if (!details) return;
      setSession((current) => current ? { ...current, turns: updateTurn(current.turns, turnId, (turn) => ({ ...turn, ...details })) } : current);
    }).catch((detailsError) => setError(errorMessage(detailsError)));
  }, [client]);

  const sharedContext = session?.sharedContext ?? emptyContext;

  if (runtimeMode === "api" && !providedClient && !accessToken) {
    return (
      <div className="flex h-screen flex-col bg-slate-100">
        <Header activePage={activePage} searchKeyword="" searchSummary="" showSearch={false} onPageChange={onPageChange} onSearchChange={() => undefined} />
        <main className="flex flex-1 items-center justify-center px-6">
          <form
            aria-label="Live Agent controlled access"
            className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              const token = accessTokenDraft.trim();
              if (!token) return;
              window.sessionStorage.setItem(accessTokenStorageKey, token);
              setAccessToken(token);
              setAccessTokenDraft("");
              setError(undefined);
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white"><KeyRound className="h-5 w-5" /></div>
              <div><h1 className="text-base font-bold text-slate-950">Live Agent Access</h1><p className="text-[11px] font-medium text-slate-500">Controlled demonstration access. Enterprise OIDC/JWKS remains pending.</p></div>
            </div>
            <label htmlFor="agent-access-token" className="mt-5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Access token</label>
            <input id="agent-access-token" type="password" autoComplete="off" value={accessTokenDraft} onChange={(event) => setAccessTokenDraft(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Stored only for this browser tab and sent only to the same-origin Agent API.</p>
            <button type="submit" disabled={!accessTokenDraft.trim()} className="mt-4 h-10 w-full rounded-md bg-slate-950 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Connect</button>
            <button type="button" onClick={() => setRuntimeMode("scripted")} className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white text-xs font-bold text-slate-700 transition hover:bg-slate-50">Continue with Scripted Demo</button>
          </form>
        </main>
      </div>
    );
  }

  if (!session && !error) {
    return <div className="flex h-screen flex-col bg-slate-100"><Header activePage={activePage} searchKeyword="" searchSummary="" showSearch={false} onPageChange={onPageChange} onSearchChange={() => undefined} /><main className="flex flex-1 items-center justify-center text-xs font-semibold text-slate-500">Initializing traceable agent workspace...</main></div>;
  }

  return (
    <div className="flex h-screen min-w-[1280px] flex-col overflow-hidden bg-slate-100">
      <Header activePage={activePage} searchKeyword="" searchSummary="" showSearch={false} onPageChange={onPageChange} onSearchChange={() => undefined} />
      <AgentWorkspaceHeader sessionId={session?.id} turnCount={session?.turns.length ?? 0} isRunning={isRunning} runtimeMode={client.runtimeMode} onLoadExample={() => void loadExampleConversation()} onReset={() => void startNewSession(selectedScenarioId)} onClearAccess={configuredMode === "api" && !providedClient ? () => {
        cancelRun();
        window.sessionStorage.removeItem(accessTokenStorageKey);
        setAccessToken(undefined);
        setSession(null);
        setError(undefined);
      } : undefined} onOpenLiveAgent={configuredMode === "api" && runtimeMode === "scripted" && !providedClient ? () => {
        cancelRun();
        setSession(null);
        setError(undefined);
        setRuntimeMode("api");
      } : undefined} />
      {error ? <div className="flex shrink-0 items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-[10px] font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />Agent workspace error: {error}{selectedTurn?.status === "error" && selectedTurn.runId && client.retryRun ? <button type="button" disabled={isRunning} onClick={() => void retrySelectedTurn()} className="ml-auto inline-flex items-center gap-1 rounded border border-red-300 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"><RotateCcw className="h-3 w-3" />Retry turn</button> : null}</div> : null}
      <div className="flex min-h-0 flex-1">
        <AgentContextPanel scenarios={scenarios} selectedScenarioId={selectedScenarioId} selectedTurn={selectedTurn} sharedContext={sharedContext} validationReport={mockKnowledgeValidationReport} isRunning={isRunning} questionLanguage={conversationLanguage} onQuestionLanguageChange={setConversationLanguage} onSelectScenario={handleScenarioChange} onAskQuestion={(question) => void submitQuestion(question)} />
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1">
            <AgentConversationThread turns={session?.turns ?? []} selectedTurnId={selectedTurnId} selectedReferenceId={selectedReferenceId} draft={draft} isRunning={isRunning} onDraftChange={setDraft} onSubmit={() => void submitQuestion(draft)} onSelectTurn={handleSelectTurn} onSelectReference={(turnId, referenceId) => { setSelectedTurnId(turnId); setSelectedReferenceId(referenceId); }} />
            <AgentTurnTraceInspector turn={selectedTurn} selectedReferenceId={selectedReferenceId} onSelectReference={setSelectedReferenceId} />
          </div>
          <AgentReferencesPanel turn={selectedTurn} selectedReferenceId={selectedReferenceId} onSelectReference={setSelectedReferenceId} />
        </section>
      </div>
    </div>
  );
}

const emptyContext: AgentSharedContext = { resolvedEntities: [], accumulatedReferences: [], assumptions: [] };

function updateTurn(turns: AgentConversationTurn[], turnId: string, update: (turn: AgentConversationTurn) => AgentConversationTurn) {
  return turns.map((turn) => turn.id === turnId ? update(turn) : turn);
}

function upsertStep(steps: AgentConversationTurn["trace"], step: AgentConversationTurn["trace"][number]) {
  return [...steps.filter((item) => item.id !== step.id), step].sort((a, b) => a.order - b.order);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown agent workspace error.";
}

function readSessionToken() {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage.getItem(accessTokenStorageKey) ?? undefined;
}
