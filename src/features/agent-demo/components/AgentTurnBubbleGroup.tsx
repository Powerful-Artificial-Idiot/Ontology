import { Bot, CheckCircle2, Clock3, ExternalLink, UserRound } from "lucide-react";
import type { AgentConversationTurn } from "../agentDemoTypes";
import { AgentCitationBadge } from "./AgentCitationBadge";
import { AgentLayerBadge } from "./AgentLayerBadge";

export function AgentTurnBubbleGroup({ turn, selected, selectedReferenceId, onSelectTurn, onSelectReference }: { turn: AgentConversationTurn; selected: boolean; selectedReferenceId: string | null; onSelectTurn: () => void; onSelectReference: (referenceId: string) => void }) {
  const response = turn.agentResponse;
  const activeStep = turn.status === "running" ? turn.trace[turn.trace.length - 1] : undefined;
  const referenceIndex = new Map(turn.references.map((reference, index) => [reference.id, index + 1]));
  return (
    <article data-turn-id={turn.id} className="space-y-3">
      <div className="flex justify-end gap-2">
        <div className="max-w-[78%] rounded-md rounded-tr-sm bg-slate-900 px-4 py-3 text-xs leading-5 text-white shadow-sm"><div className="mb-1 flex items-center justify-end gap-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-400">Turn {turn.order}<UserRound className="h-3 w-3" /></div>{turn.userMessage.content}</div>
      </div>
      <div className="flex items-start gap-2">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-700 text-white"><Bot className="h-3.5 w-3.5" /></div>
        <div data-answer-turn-id={turn.id} role="button" tabIndex={0} onClick={onSelectTurn} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectTurn(); }} className={`max-w-[90%] flex-1 cursor-pointer rounded-md rounded-tl-sm border p-4 text-left transition ${selected ? "border-blue-400 bg-white shadow-sm ring-1 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
          {response ? <>
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-emerald-700"><CheckCircle2 className="h-3 w-3" />Grounded response</div><p className="mt-2 text-xs font-semibold leading-5 text-slate-800">{response.summary}</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-bold uppercase text-emerald-700">{response.confidence}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-1 border-y border-slate-100 py-2 text-[8px] font-bold text-slate-500">{["Prompt", "Semantic", "Ontology", "Knowledge", "Cross-view", "Evidence", "Response"].map((item, index) => <span key={item} className="inline-flex items-center gap-1"><span className="rounded bg-slate-50 px-1.5 py-0.5">{item}</span>{index < 6 ? <span className="text-slate-300">→</span> : null}</span>)}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">{[["Findings", response.findings.length], ["Actions", response.recommendedActions.length], ["References", turn.references.length]].map(([label, count]) => <span key={label} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[8px] font-bold text-slate-600">{label}: {count}</span>)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Key findings</div><ul className="mt-1.5 space-y-1">{response.findings.slice(0, 3).map((finding) => <li key={finding} className="flex gap-1.5 text-[10px] leading-4 text-slate-600"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-blue-500" />{finding}</li>)}</ul></div>
              <div><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Recommended actions</div><ol className="mt-1.5 space-y-1">{response.recommendedActions.slice(0, 3).map((action, index) => <li key={action} className="flex gap-1.5 text-[10px] leading-4 text-slate-600"><span className="font-bold text-blue-600">{index + 1}.</span>{action}</li>)}</ol></div>
            </div>
            {response.citations.length ? <div className="mt-3 border-t border-slate-100 pt-2"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Cited claims</div><div className="mt-1.5 space-y-1">{response.citations.slice(0, 3).map((citation) => { const claimSelected = citation.referenceIds.includes(selectedReferenceId ?? ""); return <div key={citation.claim} className={`rounded px-1 text-[9px] leading-4 ${claimSelected ? "bg-amber-50 text-amber-900" : "text-slate-500"}`}>{citation.claim}{citation.referenceIds.map((referenceId) => <AgentCitationBadge key={referenceId} referenceId={referenceId} index={referenceIndex.get(referenceId) ?? 0} selected={selectedReferenceId === referenceId} onClick={() => onSelectReference(referenceId)} />)}</div>; })}</div></div> : null}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-[9px] font-semibold text-slate-400">{turn.trace.length} trace steps · {turn.references.length} governed references</span><span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700">View structured trace<ExternalLink className="h-3 w-3" /></span></div>
          </> : <div className="flex items-center gap-3"><Clock3 className="h-4 w-4 animate-pulse text-blue-600" /><div><div className="text-[11px] font-bold text-slate-800">Resolving governed context</div><div className="mt-1 flex items-center gap-2">{activeStep ? <AgentLayerBadge layer={activeStep.layer} compact /> : null}<span className="text-[9px] text-slate-400">{turn.trace.length} steps completed</span></div></div></div>}
        </div>
      </div>
    </article>
  );
}
