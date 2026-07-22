import { Bot, CircleDot, RotateCcw, Sparkles } from "lucide-react";

export function AgentWorkspaceHeader({ sessionId, turnCount, isRunning, runtimeMode, onLoadExample, onReset }: { sessionId?: string; turnCount: number; isRunning: boolean; runtimeMode: "scripted" | "api"; onLoadExample: () => void; onReset: () => void }) {
  return (
    <section className="flex h-[74px] shrink-0 items-center gap-5 border-b border-slate-200 bg-white px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white"><Bot className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h1 className="truncate text-base font-bold text-slate-950">Traceable Agent Workspace</h1><span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700"><CircleDot className="h-2.5 w-2.5" />{runtimeMode === "api" ? "Deterministic API" : "Scripted"}</span></div>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">Multi-turn manufacturing analysis with governed context, structured trace and cited evidence.</p>
        </div>
      </div>
      <div className="hidden text-right xl:block"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Active session</div><div className="mt-0.5 font-mono text-[10px] font-semibold text-slate-600">{sessionId ?? "initializing"} · {turnCount} turns</div></div>
      <div className="flex shrink-0 items-center gap-2">
        <button data-testid="load-example" type="button" disabled={isRunning} onClick={onLoadExample} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[11px] font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" />Load example conversation</button>
        <button data-testid="reset-session" type="button" onClick={onReset} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" />Reset session</button>
      </div>
    </section>
  );
}
