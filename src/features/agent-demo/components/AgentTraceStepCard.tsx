import { Box, CheckCircle2, Clock3, Database, Wrench } from "lucide-react";
import type { AgentReasoningStep, AgentReference, AgentRelatedObject } from "../agentDemoTypes";
import { AgentLayerBadge } from "./AgentLayerBadge";

export function AgentTraceStepCard({ step, references, objects, selectedReferenceId, onSelectReference }: { step: AgentReasoningStep; references: AgentReference[]; objects: AgentRelatedObject[]; selectedReferenceId: string | null; onSelectReference: (referenceId: string) => void }) {
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  return (
    <article className={`rounded-md border bg-white p-3 ${step.referenceIds?.includes(selectedReferenceId ?? "") ? "border-amber-300 ring-1 ring-amber-100" : "border-slate-200"}`}>
      <div className="flex items-start gap-2"><div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[8px] font-bold text-white">{step.order}</div><div className="min-w-0 flex-1"><AgentLayerBadge layer={step.layer} compact /><h3 className="mt-1.5 text-[11px] font-bold text-slate-900">{step.title}</h3><p className="mt-0.5 text-[9px] leading-4 text-slate-500">{step.description}</p></div><span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase text-emerald-600"><CheckCircle2 className="h-3 w-3" />{step.confidence}</span></div>
      <div className="mt-2 grid gap-2">
        <div className="rounded border border-slate-100 bg-slate-50 p-2"><div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Inputs</div><div className="mt-1 space-y-0.5">{step.input.map((input) => <div key={input} className="text-[9px] leading-3.5 text-slate-600">{input}</div>)}</div></div>
        <div className="px-1"><div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Action</div><p className="mt-1 text-[9px] leading-3.5 text-slate-700">{step.action}</p></div>
        <div className="rounded border border-blue-100 bg-blue-50 p-2"><div className="text-[8px] font-bold uppercase tracking-wide text-blue-500">Outputs</div><div className="mt-1 space-y-0.5">{step.output.map((output) => <div key={output} className="text-[9px] leading-3.5 text-slate-700">{output}</div>)}</div></div>
      </div>
      {step.toolName ? <div className="mt-2 rounded border border-indigo-100 bg-indigo-50/60 p-2"><div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-indigo-600"><Wrench className="h-2.5 w-2.5" />Tool called · {step.toolName}</div><div className="mt-1.5 grid grid-cols-2 gap-2"><ToolPayload label="Input" value={step.toolInput} /><ToolPayload label="Output" value={step.toolOutput} /></div></div> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {step.durationMs ? <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[8px] font-semibold text-slate-500"><Clock3 className="h-2.5 w-2.5" />{step.durationMs} ms</span> : null}
        {step.referencedObjectIds?.map((id) => { const object = objectById.get(id); return <span key={id} title={object?.description} className="inline-flex flex-wrap items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-[8px] font-semibold text-slate-600"><Box className="h-2.5 w-2.5" />{object?.label ?? id}{object?.sourcePage ? <span className="rounded bg-emerald-50 px-1 py-0.5 text-[7px] font-bold text-emerald-700">{object.sourcePage}</span> : null}{object?.sourceViews?.[0] ? <span className="rounded bg-slate-100 px-1 py-0.5 text-[7px] font-bold text-slate-500">{object.sourceViews[0]}</span> : null}</span>; })}
        {step.referenceIds?.map((id) => <button key={id} type="button" onClick={() => onSelectReference(id)} className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[8px] font-bold ${selectedReferenceId === id ? "border-amber-400 bg-amber-100 text-amber-800" : "border-amber-200 bg-amber-50 text-amber-700"}`}><Database className="h-2.5 w-2.5" />{referenceById.get(id)?.title ?? id}</button>)}
      </div>
    </article>
  );
}

function ToolPayload({ label, value }: { label: string; value?: Record<string, unknown> }) {
  return <div className="min-w-0"><div className="text-[7px] font-bold uppercase text-indigo-400">{label}</div><div className="mt-0.5 break-words font-mono text-[7px] leading-3 text-slate-600">{value ? JSON.stringify(value) : "Not reported"}</div></div>;
}
