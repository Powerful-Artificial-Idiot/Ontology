import { ArrowRight } from "lucide-react";
import type { SemanticEntity, SemanticLaneId } from "../semanticTypes";
import { SemanticMappingCard } from "./SemanticMappingCard";

export function SemanticMappingLane({ laneId, label, description, entities, selectedEntityId, relatedEntityIds, relationLabels, onSelect }: { laneId: SemanticLaneId; label: string; description: string; entities: SemanticEntity[]; selectedEntityId: string; relatedEntityIds: Set<string>; relationLabels: string[]; onSelect: (entityId: string) => void }) {
  return (
    <section data-semantic-lane={laneId} className="relative min-w-0 border-r border-slate-200/80 px-3 last:border-r-0">
      {laneId !== "business" ? (
        <div className="pointer-events-none absolute -left-4 top-10 z-[1] flex w-8 flex-col items-center gap-1 text-slate-400">
          <ArrowRight className="h-4 w-4" />
          <span className="max-w-[70px] -rotate-90 whitespace-nowrap text-[8px] font-bold uppercase tracking-wide">{relationLabels[0] ?? "mapsTo"}</span>
        </div>
      ) : null}
      <div className="mb-3 h-[46px] border-b border-slate-200 pb-2">
        <h3 className="text-xs font-bold text-slate-950">{label}</h3>
        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{description}</p>
      </div>
      <div className="space-y-2.5">
        {entities.map((entity) => {
          const selected = entity.id === selectedEntityId;
          const related = relatedEntityIds.has(entity.id);
          const dimmed = Boolean(selectedEntityId) && !selected && !related;
          return <SemanticMappingCard key={entity.id} entity={entity} selected={selected} related={related} dimmed={dimmed} onSelect={onSelect} />;
        })}
      </div>
    </section>
  );
}

