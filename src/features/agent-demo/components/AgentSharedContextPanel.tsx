import { Boxes, Database, Link2 } from "lucide-react";
import type { AgentSharedContext } from "../agentDemoTypes";

function contextValue(id: string | undefined, context: AgentSharedContext) {
  if (!id) return undefined;
  return context.resolvedEntities.find((item) => item.id === id)?.label ?? id;
}

export function AgentSharedContextPanel({ context }: { context: AgentSharedContext }) {
  const values = [
    ["Topic", context.activeTopic],
    ["Operation", contextValue(context.activeOperationId, context)],
    ["Machine", contextValue(context.activeMachineId, context)],
    ["Quality", contextValue(context.activeQualityCharacteristicId, context)],
    ["Program", contextValue(context.activeProgramId, context)],
    ["Candidate Bottleneck", contextValue(context.candidateBottleneckId, context)],
    ["Related Metrics", context.relatedMetricIds?.map((id) => contextValue(id, context)).filter(Boolean).join(", ")],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <section className="border-t border-slate-200 px-3 py-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Boxes className="h-3.5 w-3.5" />Shared Context</div>
      {values.length ? <div className="mt-2 space-y-1.5">{values.map(([label, value]) => <div key={label} className="rounded border border-cyan-100 bg-cyan-50 px-2 py-1.5"><div className="text-[8px] font-bold uppercase text-cyan-600">{label}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-slate-800" title={value}>{value}</div></div>)}</div> : <p className="mt-2 text-[10px] leading-4 text-slate-400">Context is accumulated as each turn resolves governed entities.</p>}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="rounded border border-slate-200 bg-white p-2"><div className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-400"><Link2 className="h-2.5 w-2.5" />Entities</div><div className="mt-1 text-sm font-bold text-slate-800">{context.resolvedEntities.length}</div></div>
        <div className="rounded border border-slate-200 bg-white p-2"><div className="flex items-center gap-1 text-[8px] font-bold uppercase text-slate-400"><Database className="h-2.5 w-2.5" />Evidence</div><div className="mt-1 text-sm font-bold text-slate-800">{context.accumulatedReferences.length}</div></div>
      </div>
      {context.assumptions.length ? <div className="mt-2 text-[9px] leading-3.5 text-slate-500"><span className="font-bold text-slate-700">Assumptions:</span> {context.assumptions.length}</div> : null}
    </section>
  );
}
