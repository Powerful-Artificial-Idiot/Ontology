import { Send } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useRef } from "react";

type AgentInputKeyState = {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
};

export function shouldSubmitAgentInput(event: AgentInputKeyState): boolean {
  return event.key === "Enter"
    && !event.shiftKey
    && !event.isComposing
    && event.keyCode !== 229;
}

export function AgentFollowUpInput({ value, disabled, onChange, onSubmit }: { value: string; disabled: boolean; onChange: (value: string) => void; onSubmit: () => void }) {
  const isComposingRef = useRef(false);
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent;
    if (shouldSubmitAgentInput({
      key: event.key,
      shiftKey: event.shiftKey,
      isComposing: isComposingRef.current || nativeEvent.isComposing,
      keyCode: nativeEvent.keyCode,
    })) {
      event.preventDefault();
      onSubmit();
    }
  };
  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex items-end gap-2 rounded-md border border-slate-300 bg-slate-50 p-2 focus-within:border-blue-400 focus-within:bg-white">
        <textarea data-testid="follow-up-input" rows={2} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} onCompositionStart={() => { isComposingRef.current = true; }} onCompositionEnd={() => { isComposingRef.current = false; }} onKeyDown={handleKeyDown} placeholder="Ask a follow-up question about this issue..." className="min-h-[42px] flex-1 resize-none bg-transparent px-1 text-xs leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" />
        <button data-testid="send-follow-up" type="button" onClick={onSubmit} disabled={disabled || !value.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Send className="h-4 w-4" /></button>
      </div>
      <div className="mt-1.5 flex justify-between text-[8px] font-semibold text-slate-400"><span>Enter to send · Shift + Enter for a new line · IME Enter confirms text</span><span>{disabled ? "Agent is resolving the current turn" : "Context carries across turns"}</span></div>
    </div>
  );
}
