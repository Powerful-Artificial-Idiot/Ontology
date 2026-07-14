import type { SemanticCatalogLane } from "../../../../packages/knowledge-contracts/src/index";
import { getBundleEntities, getSemanticLaneId } from "../semanticUtils";
import type { SemanticConceptBundle, SemanticEntity, SemanticMapping } from "../semanticTypes";
import { SemanticMappingLane } from "./SemanticMappingLane";

export function SemanticMappingCanvas({ bundle, lanes, entitiesById, mappingsById, selectedEntityId, onSelectEntity }: { bundle?: SemanticConceptBundle; lanes: SemanticCatalogLane[]; entitiesById: Map<string, SemanticEntity>; mappingsById: Map<string, SemanticMapping>; selectedEntityId: string; onSelectEntity: (entityId: string) => void }) {
  if (!bundle) {
    return <div className="flex h-full items-center justify-center p-8"><div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-sm font-bold text-slate-800">No semantic concept in this filter</div><p className="mt-2 text-xs text-slate-500">Choose another domain or reset the semantic view.</p></div></div>;
  }

  const entities = getBundleEntities(bundle, entitiesById);
  const mappings = bundle.mappingIds.map((id) => mappingsById.get(id)).filter(Boolean);
  const relatedIds = new Set<string>();
  mappings.forEach((mapping) => {
    if (!mapping) return;
    if (mapping.sourceId === selectedEntityId) relatedIds.add(mapping.targetId);
    if (mapping.targetId === selectedEntityId) relatedIds.add(mapping.sourceId);
  });
  if (selectedEntityId === bundle.primaryTermId) {
    mappings.filter((mapping) => mapping?.sourceId === selectedEntityId || mapping?.targetId === selectedEntityId).forEach((mapping) => {
      if (mapping) { relatedIds.add(mapping.sourceId); relatedIds.add(mapping.targetId); }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="min-w-0"><h2 className="truncate text-sm font-bold text-slate-950">Semantic Mapping Canvas</h2><p className="truncate text-[11px] font-semibold text-slate-500">{bundle.title}: {bundle.summary}</p></div>
        <div className="ml-4 shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold text-slate-600">{entities.length} entities / {mappings.length} mappings</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid min-w-[1080px] grid-cols-5 rounded-lg border border-slate-200 bg-white py-3 shadow-sm">
          {lanes.map((lane) => {
            const laneEntities = entities.filter((entity) => getSemanticLaneId(entity) === lane.id);
            const relationLabels = Array.from(new Set(mappings.filter((mapping) => mapping && laneEntities.some((entity) => entity.id === mapping.targetId)).map((mapping) => mapping!.label)));
            return <SemanticMappingLane key={lane.id} laneId={lane.id} label={lane.label} description={lane.description} entities={laneEntities} selectedEntityId={selectedEntityId} relatedEntityIds={relatedIds} relationLabels={relationLabels} onSelect={onSelectEntity} />;
          })}
        </div>
      </div>
    </div>
  );
}
