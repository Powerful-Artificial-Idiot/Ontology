import { Bot, ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import type { SemanticConceptBundle } from "../semanticTypes";

export function AIContextPreview({ bundle, collapsed, onToggle }: { bundle?: SemanticConceptBundle; collapsed: boolean; onToggle: () => void }) {
  return (
    <section className={`shrink-0 border-t border-slate-200 bg-white transition-[height] ${collapsed ? "h-11" : "h-[218px]"}`}>
      <button type="button" onClick={onToggle} className="flex h-11 w-full items-center justify-between px-4 text-left">
        <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-700"><Bot className="h-4 w-4" /></span><span><span className="block text-xs font-bold uppercase tracking-wide text-slate-600">AI Context Preview</span>{bundle ? <span className="block text-[10px] font-semibold text-slate-400">Agent-ready context for {bundle.title}</span> : null}</span></span>
        {collapsed ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {!collapsed ? bundle ? (
        <div className="grid h-[174px] grid-cols-[0.8fr_1.2fr_1fr_1.6fr] gap-0 overflow-hidden border-t border-slate-100">
          <ContextCell title="User Term"><div className="text-lg font-bold text-slate-950">“{bundle.title.toLowerCase()}”</div><p className="mt-2 text-xs leading-5 text-slate-500">{bundle.aiContext.resolvedMeaning}</p></ContextCell>
          <ContextCell title="Relevant Objects"><CompactList values={bundle.aiContext.relevantObjects} /></ContextCell>
          <ContextCell title="Available AI Actions"><CompactList values={bundle.aiContext.availableActions} /></ContextCell>
          <ContextCell title="Agent Context"><div className="h-full overflow-auto rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 font-mono text-[11px] leading-5 text-indigo-950">{bundle.aiContext.promptContext}{bundle.aiContext.ambiguityNotes?.length ? <div className="mt-2 border-t border-indigo-100 pt-2 text-amber-800">Ambiguity: {bundle.aiContext.ambiguityNotes.join(" ")}</div> : null}</div></ContextCell>
        </div>
      ) : <div className="flex h-[174px] items-center justify-center border-t border-slate-100 text-sm text-slate-400">Select a concept to build AI context.</div> : null}
    </section>
  );
}

function ContextCell({ title, children }: { title: string; children: ReactNode }) { return <div className="min-w-0 overflow-auto border-r border-slate-100 p-3 last:border-r-0"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</div>{children}</div>; }
function CompactList({ values }: { values: string[] }) { return <div className="space-y-1.5">{values.map((value) => <div key={value} className="flex gap-2 text-[11px] font-semibold leading-4 text-slate-600"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{value}</div>)}</div>; }
