export function AgentCitationBadge({ referenceId, index, selected, onClick }: { referenceId: string; index: number; selected: boolean; onClick: () => void }) {
  return <button data-citation-reference-id={referenceId} type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={`ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-text-top text-[8px] font-bold transition ${selected ? "bg-amber-500 text-white" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>[{index}]</button>;
}
