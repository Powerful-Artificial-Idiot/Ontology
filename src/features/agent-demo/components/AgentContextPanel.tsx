import { BookOpenCheck, ChevronRight, Layers3, Lightbulb, Wrench } from "lucide-react";
import { agentSourceCatalog, agentToolCatalog } from "../agentUiCatalog";
import type { AgentConversationTurn, AgentScenario, AgentSharedContext, AgentToolName } from "../agentDemoTypes";
import type { MockKnowledgeValidationReport } from "../../../data/mockKnowledgeRegistry/types";
import { AgentSharedContextPanel } from "./AgentSharedContextPanel";

const domainStyles = { quality: "bg-orange-500", engineering: "bg-indigo-500", valueStream: "bg-emerald-500", production: "bg-blue-500" };

export function AgentContextPanel({ scenarios, selectedScenarioId, selectedTurn, sharedContext, validationReport, isRunning, onSelectScenario, onAskQuestion }: { scenarios: AgentScenario[]; selectedScenarioId: string; selectedTurn?: AgentConversationTurn; sharedContext: AgentSharedContext; validationReport: MockKnowledgeValidationReport; isRunning: boolean; onSelectScenario: (scenarioId: string) => void; onAskQuestion: (question: string) => void }) {
  const scenario = scenarios.find((item) => item.id === selectedScenarioId);
  const activeTools = new Set(selectedTurn?.trace.map((step) => step.toolName).filter((tool): tool is AgentToolName => Boolean(tool)) ?? scenario?.tools ?? []);
  const activeSources = new Set(selectedTurn?.references.map((reference) => reference.type) ?? scenario?.knowledgeSources ?? []);
  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-3 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Layers3 className="h-3.5 w-3.5" />Scenarios</div>
          <div className="mt-2 space-y-1.5">{scenarios.map((item) => { const active = item.id === selectedScenarioId; return <button key={item.id} type="button" onClick={() => onSelectScenario(item.id)} className={`group flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${active ? "border-slate-400 bg-white shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-white"}`}><span className={`h-7 w-1 rounded-full ${domainStyles[item.domain]}`} /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-slate-800">{item.sidebarLabel}</span><span className="mt-0.5 block truncate text-[9px] font-medium text-slate-400">{item.expectedOutcome}</span></span><ChevronRight className={`h-3.5 w-3.5 ${active ? "text-slate-700" : "text-slate-300"}`} /></button>; })}</div>
        </section>
        <section className="border-t border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Lightbulb className="h-3.5 w-3.5" />Suggested Questions</div>
          <div className="mt-2 space-y-1.5">{scenario?.suggestedQuestions?.map((question) => <button data-suggested-question={question} key={question} type="button" disabled={isRunning} onClick={() => onAskQuestion(question)} className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[10px] font-medium leading-4 text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{question}</button>)}</div>
        </section>
        <section className="border-t border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Wrench className="h-3.5 w-3.5" />Agent Tools</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">{agentToolCatalog.map((tool) => { const active = activeTools.has(tool.id); return <div key={tool.id} title={tool.role} className={`rounded border px-2 py-1.5 ${active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}><div className="truncate text-[9px] font-bold">{tool.label}</div><div className="mt-0.5 text-[8px] opacity-70">{active ? "Used in turn" : "Available"}</div></div>; })}</div>
        </section>
        <section className="border-t border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500"><BookOpenCheck className="h-3.5 w-3.5" />Knowledge Sources</div>
          <div className="mt-2 flex flex-wrap gap-1">{agentSourceCatalog.map((source) => <span key={source.type} title={source.description} className={`rounded-full border px-2 py-1 text-[8px] font-bold ${activeSources.has(source.type) ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500"}`}>{source.type}</span>)}</div>
        </section>
        <section className="border-t border-slate-200 px-3 py-3">
          <div className={`rounded-md border px-2.5 py-2 ${validationReport.passed ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wide ${validationReport.passed ? "text-emerald-700" : "text-red-700"}`}>Mock Knowledge Consistency: {validationReport.passed ? "Passed" : `${validationReport.errors} errors`}</div>
            <div className="mt-1 text-[8px] leading-3 text-slate-500">Canonical object, relation, semantic mapping and evidence IDs checked across all explorers.</div>
          </div>
        </section>
      </div>
      <AgentSharedContextPanel context={sharedContext} />
    </aside>
  );
}
