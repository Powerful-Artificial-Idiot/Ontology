import { Bot, Braces, Database, FileCheck2, Gauge, Languages, Link2, Network, ShieldCheck } from "lucide-react";
import type { SemanticEntity } from "../semanticTypes";
import { semanticDomainLabels } from "../semanticData";

const domainTone = {
  production: "border-blue-200 bg-blue-50 text-blue-700",
  quality: "border-orange-200 bg-orange-50 text-orange-700",
  engineering: "border-violet-200 bg-violet-50 text-violet-700",
  valueStream: "border-teal-200 bg-teal-50 text-teal-700",
  governance: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export function SemanticMappingCard({ entity, selected, related, dimmed, onSelect }: { entity: SemanticEntity; selected: boolean; related: boolean; dimmed: boolean; onSelect: (entityId: string) => void }) {
  return (
    <button
      type="button"
      data-semantic-entity={entity.id}
      onClick={() => onSelect(entity.id)}
      className={[
        "group min-h-[88px] w-full rounded-lg border bg-white p-3 text-left shadow-sm transition-[border-color,box-shadow,opacity,transform] duration-150",
        selected ? "border-slate-950 shadow-md" : related ? "border-slate-400" : "border-slate-200 hover:border-slate-400 hover:shadow-md",
        dimmed ? "opacity-30" : "opacity-100",
        "active:scale-[0.99]",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 group-hover:bg-slate-200">
          <EntityIcon entity={entity} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-xs font-bold leading-4 text-slate-950">{entity.label}</span>
          <span className="mt-1 block line-clamp-2 text-[10px] font-medium leading-4 text-slate-500">{entity.description}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${domainTone[entity.domain]}`}>{semanticDomainLabels[entity.domain]}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{formatType(entity.type)}</span>
        {entity.confidence ? <span className="ml-auto text-[9px] font-bold text-slate-400">{entity.confidence}</span> : null}
      </div>
    </button>
  );
}

function EntityIcon({ entity }: { entity: SemanticEntity }) {
  if (entity.type === "businessTerm") return <Languages className="h-3.5 w-3.5" />;
  if (entity.type === "synonym") return <Link2 className="h-3.5 w-3.5" />;
  if (entity.type === "metric") return <Gauge className="h-3.5 w-3.5" />;
  if (entity.type === "systemField") return <Database className="h-3.5 w-3.5" />;
  if (entity.type === "sourceEvidence") return <FileCheck2 className="h-3.5 w-3.5" />;
  if (entity.type === "aiContext") return <Bot className="h-3.5 w-3.5" />;
  if (entity.type === "governance") return <ShieldCheck className="h-3.5 w-3.5" />;
  if (entity.type === "ontologyRelationship") return <Network className="h-3.5 w-3.5" />;
  return <Braces className="h-3.5 w-3.5" />;
}

function formatType(type: SemanticEntity["type"]) {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

