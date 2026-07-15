import { MessageSquareText } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AgentConversationTurn } from "../agentDemoTypes";
import { AgentFollowUpInput } from "./AgentFollowUpInput";
import { AgentTurnBubbleGroup } from "./AgentTurnBubbleGroup";

export function AgentConversationThread({ turns, selectedTurnId, selectedReferenceId, draft, isRunning, onDraftChange, onSubmit, onSelectTurn, onSelectReference }: { turns: AgentConversationTurn[]; selectedTurnId: string | null; selectedReferenceId: string | null; draft: string; isRunning: boolean; onDraftChange: (value: string) => void; onSubmit: () => void; onSelectTurn: (turnId: string) => void; onSelectReference: (turnId: string, referenceId: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastTurn = turns[turns.length - 1];
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns.length, lastTurn?.trace.length, lastTurn?.status]);
  return (
    <section className="flex min-w-[520px] flex-1 flex-col bg-slate-100">
      <div className="flex h-11 shrink-0 items-center border-b border-slate-200 bg-white px-4"><MessageSquareText className="h-4 w-4 text-slate-600" /><div className="ml-2 text-xs font-bold text-slate-900">Conversation Thread</div><span className="ml-2 text-[9px] font-semibold text-slate-400">{turns.length ? `${turns.length} governed turns` : "Start with a suggested question"}</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {turns.length ? <div className="mx-auto max-w-[850px] space-y-6">{turns.map((turn) => <AgentTurnBubbleGroup key={turn.id} turn={turn} selected={selectedTurnId === turn.id} selectedReferenceId={selectedTurnId === turn.id ? selectedReferenceId : null} onSelectTurn={() => onSelectTurn(turn.id)} onSelectReference={(referenceId) => onSelectReference(turn.id, referenceId)} />)}<div ref={endRef} /></div> : <div className="flex h-full items-center justify-center"><div className="max-w-sm text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500"><MessageSquareText className="h-5 w-5" /></div><h2 className="mt-3 text-sm font-bold text-slate-800">No conversation turns yet</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">Select a suggested question or enter a manufacturing request. Each answer will preserve its own trace and evidence.</p></div></div>}
      </div>
      <AgentFollowUpInput value={draft} disabled={isRunning} onChange={onDraftChange} onSubmit={onSubmit} />
    </section>
  );
}
