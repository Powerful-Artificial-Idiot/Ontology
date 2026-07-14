import { ontologyLanes, domainStyles } from "../ontologyData";
import { getLaneVisualState } from "../ontologyInteraction";
import type { OntologyEntity, OntologyInteractionState, OntologyScope } from "../ontologyTypes";

export function OntologyDomainDock({ visible, interaction, activeScope, onHover, onLeave, onSelect, onFocusLane }: { visible: OntologyScope; interaction: OntologyInteractionState; activeScope: OntologyScope; onHover: (entity: OntologyEntity) => void; onLeave: (entity: OntologyEntity) => void; onSelect: (entity: OntologyEntity) => void; onFocusLane: (laneId: string) => void }) {
  return (
    <div className="ontology-domain-dock">
      <div className="scrollbar-none flex h-full min-w-max items-center gap-2 overflow-x-auto px-3">
        {ontologyLanes.filter((lane) => visible.laneIds.has(lane.id)).map((lane) => {
          const state = getLaneVisualState(lane.id, interaction, activeScope);
          const style = domainStyles[lane.domain];
          const entity: OntologyEntity = { kind: "lane", id: lane.id };
          return (
            <button
              type="button"
              key={lane.id}
              title="Double click to focus this lane"
              onMouseEnter={() => onHover(entity)}
              onMouseLeave={() => onLeave(entity)}
              onClick={() => onSelect(entity)}
              onDoubleClick={() => onFocusLane(lane.id)}
              className={[
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-[0.98]",
                state === "selected" || state === "focused" ? "border-slate-950 bg-slate-950 text-white" : "",
                state === "hovered" || state === "highlighted" ? `${style.filterActive} ${style.filterBorder}` : "",
                state === "related" ? `bg-white ${style.filterText} ${style.filterBorder}` : "",
                state === "dimmed" ? "opacity-30" : "",
                state === "default" ? "border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-950" : "",
              ].join(" ")}
            >
              {lane.label}<span className="ml-2 opacity-70">{lane.objectTypeIds.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

