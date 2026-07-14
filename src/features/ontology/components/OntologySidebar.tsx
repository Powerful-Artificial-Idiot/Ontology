import { useEffect, useRef, useState, type ReactNode } from "react";
import { Boxes, ChevronDown, Crosshair, GitBranch, Layers3, PlayCircle, RotateCcw } from "lucide-react";
import type { OntologyDomain, OntologyFilter } from "../../../types";
import { domainLabel, domainStyles, relationshipGroups } from "../ontologyData";
import { laneByObjectId } from "../ontologyLayout";
import type { OntologyEntity, OntologyHighlightMode, OntologyInteractionState, OntologySearchResult, OntologySourceData } from "../ontologyTypes";

const filterOptions: Array<{ value: OntologyFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "production", label: "Production" },
  { value: "quality", label: "Quality" },
  { value: "engineering", label: "Engineering" },
  { value: "valueStream", label: "Value Stream" },
  { value: "shared", label: "Governance" },
];

const highlightOptions: Array<{ value: OntologyHighlightMode; label: string }> = [
  { value: "direct", label: "Direct Relations" },
  { value: "upstreamDownstream", label: "Upstream / Downstream" },
  { value: "domain", label: "Domain Context" },
];

interface SidebarProps {
  source: OntologySourceData;
  interaction: OntologyInteractionState;
  search: OntologySearchResult;
  searchKeyword: string;
  onFilter: (filter: OntologyFilter) => void;
  onHighlightMode: (mode: OntologyHighlightMode) => void;
  onReset: () => void;
  onHover: (entity: OntologyEntity) => void;
  onLeave: (entity: OntologyEntity) => void;
  onSelect: (entity: OntologyEntity | null) => void;
  onFocusLane: (laneId: string) => void;
}

export function OntologySidebar({ source, interaction, search, searchKeyword, onFilter, onHighlightMode, onReset, onHover, onLeave, onSelect, onFocusLane }: SidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedLaneId = getSelectedLaneId(interaction.selectedEntity);

  useEffect(() => {
    if (!selectedLaneId) return;
    scrollRef.current?.querySelector<HTMLElement>(`[data-sidebar-lane="${selectedLaneId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedLaneId]);

  const hasSearch = Boolean(searchKeyword.trim());
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Ontology Browser</div>
        <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">Browse governed object types, relationships, domains, and actions.</p>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3">
        <SidebarSection icon={<Layers3 className="h-4 w-4" />} title="Ontology Controls" count={3} defaultOpen>
          <div className="space-y-3">
            <ControlGroup label="Domain Filter">
              <div className="grid grid-cols-2 gap-1.5">
                {filterOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => onFilter(option.value)} className={controlButton(interaction.domainFilter === option.value)}>{option.label}</button>
                ))}
              </div>
            </ControlGroup>
            <ControlGroup label="Highlight Mode">
              <div className="space-y-1.5">
                {highlightOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => onHighlightMode(option.value)} className={`${controlButton(interaction.highlightMode === option.value)} w-full`}>{option.label}</button>
                ))}
              </div>
            </ControlGroup>
            <button type="button" onClick={onReset} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 active:scale-[0.98]">
              <RotateCcw className="h-3.5 w-3.5" /> Reset View
            </button>
          </div>
        </SidebarSection>

        {hasSearch ? (
          <SidebarSection icon={<Crosshair className="h-4 w-4" />} title="Search Results" count={search.objectIds.size + search.edgeIds.size + search.laneIds.size} defaultOpen>
            <SearchResults source={source} search={search} interaction={interaction} onHover={onHover} onLeave={onLeave} onSelect={onSelect} />
          </SidebarSection>
        ) : null}

        <SidebarSection icon={<Boxes className="h-4 w-4" />} title="Object Type Groups" count={source.lanes.length} defaultOpen>
          <div className="space-y-2">
            {source.lanes.map((lane) => (
              <LaneGroup
                key={lane.id}
                laneId={lane.id}
                source={source}
                interaction={interaction}
                onHover={onHover}
                onLeave={onLeave}
                onSelect={onSelect}
                onFocusLane={onFocusLane}
              />
            ))}
          </div>
        </SidebarSection>

        <SidebarSection icon={<GitBranch className="h-4 w-4" />} title="Relationship Types" count={new Set(source.edges.map((edge) => edge.label)).size} defaultOpen>
          <div className="space-y-3">
            {relationshipGroups.map((group) => (
              <div key={group.title}>
                <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.title}</div>
                <div className="space-y-1">
                  {group.relationTypes.map((relationType) => {
                    const edges = source.edges.filter((edge) => edge.label === relationType);
                    if (!edges.length) return null;
                    const entity: OntologyEntity = { kind: "relationshipType", id: relationType };
                    return (
                      <SidebarItem
                        key={relationType}
                        label={relationType}
                        meta={`${edges.length} relation${edges.length > 1 ? "s" : ""}`}
                        tone={edges[0].domain}
                        active={isSame(interaction.selectedEntity, entity)}
                        highlighted={isSame(interaction.hoveredEntity, entity) || search.relationTypes.has(relationType)}
                        dimmed={false}
                        onMouseEnter={() => onHover(entity)}
                        onMouseLeave={() => onLeave(entity)}
                        onClick={() => onSelect(entity)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection icon={<PlayCircle className="h-4 w-4" />} title="Actions" count={source.actions.length}>
          <div className="space-y-1">
            {source.actions.map((action) => {
              const entity: OntologyEntity = { kind: "action", id: action.id };
              return <SidebarItem key={action.id} label={action.label} meta={action.appliesTo.join(", ")} tone={action.domain} active={isSame(interaction.selectedEntity, entity)} highlighted={isSame(interaction.hoveredEntity, entity) || search.actionIds.has(action.id)} dimmed={false} onMouseEnter={() => onHover(entity)} onMouseLeave={() => onLeave(entity)} onClick={() => onSelect(entity)} />;
            })}
          </div>
        </SidebarSection>
      </div>
    </aside>
  );
}

function LaneGroup({ source, laneId, interaction, onHover, onLeave, onSelect, onFocusLane }: Pick<SidebarProps, "source" | "interaction" | "onHover" | "onLeave" | "onSelect" | "onFocusLane"> & { laneId: string }) {
  const lane = source.lanes.find((item) => item.id === laneId)!;
  const selectedInLane = interaction.selectedEntity?.kind === "node" && lane.objectTypeIds.includes(interaction.selectedEntity.id);
  const laneSelected = interaction.selectedEntity?.kind === "lane" && interaction.selectedEntity.id === lane.id;
  const [open, setOpen] = useState(["product-material", "process", "resource"].includes(lane.id));

  useEffect(() => {
    if (selectedInLane || laneSelected) setOpen(true);
  }, [laneSelected, selectedInLane]);

  const laneEntity: OntologyEntity = { kind: "lane", id: lane.id };
  const domainMismatch = interaction.domainFilter !== "all" && lane.domain !== interaction.domainFilter && !(
    interaction.domainFilter === "production" && lane.id === "resource"
  );
  return (
    <div data-sidebar-lane={lane.id} className={`rounded-lg border bg-white transition ${laneSelected ? "border-slate-950" : "border-slate-200"} ${domainMismatch ? "opacity-45" : ""}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        onMouseEnter={() => onHover(laneEntity)}
        onMouseLeave={() => onLeave(laneEntity)}
        onClick={() => { setOpen((value) => !value); onSelect(laneEntity); }}
        onDoubleClick={() => onFocusLane(lane.id)}
      >
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold text-slate-900">{lane.label}</span>
          <span className="block text-[10px] font-semibold text-slate-400">{lane.objectTypeIds.length} object types</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="space-y-1 border-t border-slate-100 p-2">
          {lane.objectTypeIds.map((nodeId) => {
            const node = source.nodes.find((item) => item.id === nodeId);
            if (!node) return null;
            const entity: OntologyEntity = { kind: "node", id: node.id };
            return <SidebarItem key={node.id} label={node.label} meta={`${node.properties.length} props`} tone={node.domain} active={isSame(interaction.selectedEntity, entity)} highlighted={isSame(interaction.hoveredEntity, entity)} dimmed={false} onMouseEnter={() => onHover(entity)} onMouseLeave={() => onLeave(entity)} onClick={() => onSelect(entity)} />;
          })}
        </div>
      ) : null}
    </div>
  );
}

function SearchResults({ source, search, interaction, onHover, onLeave, onSelect }: Pick<SidebarProps, "source" | "search" | "interaction" | "onHover" | "onLeave" | "onSelect">) {
  const entries: Array<{ entity: OntologyEntity; label: string; meta: string; tone: OntologyDomain }> = [];
  search.objectIds.forEach((id) => {
    const node = source.nodes.find((item) => item.id === id);
    if (node) entries.push({ entity: { kind: "node", id }, label: node.label, meta: source.lanes.find((lane) => lane.id === laneByObjectId.get(id))?.label ?? "Object Type", tone: node.domain });
  });
  search.edgeIds.forEach((id) => {
    const edge = source.edges.find((item) => item.id === id);
    if (edge) entries.push({ entity: { kind: "edge", id }, label: edge.label, meta: `${edge.sourceObjectType} -> ${edge.targetObjectType}`, tone: edge.domain });
  });
  search.laneIds.forEach((id) => {
    const lane = source.lanes.find((item) => item.id === id);
    if (lane) entries.push({ entity: { kind: "lane", id }, label: lane.label, meta: `${lane.objectTypeIds.length} object types`, tone: lane.domain });
  });
  if (!entries.length) return <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">No ontology matches.</div>;
  return <div className="space-y-1">{entries.slice(0, 18).map(({ entity, label, meta, tone }) => <SidebarItem key={`${entity.kind}-${"id" in entity ? entity.id : "property"}`} label={label} meta={meta} tone={tone} active={isSame(interaction.selectedEntity, entity)} highlighted dimmed={false} onMouseEnter={() => onHover(entity)} onMouseLeave={() => onLeave(entity)} onClick={() => onSelect(entity)} />)}</div>;
}

function SidebarSection({ icon, title, count, defaultOpen = false, children }: { icon: ReactNode; title: string; count: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-3 rounded-lg border border-slate-200 bg-slate-50">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">{icon}{title}</span>
        <span className="flex items-center gap-2 text-xs font-bold text-slate-400">{count}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      </button>
      {open ? <div className="border-t border-slate-200 p-2">{children}</div> : null}
    </section>
  );
}

function SidebarItem({ label, meta, tone, active, highlighted, dimmed, onMouseEnter, onMouseLeave, onClick }: { label: string; meta: string; tone: OntologyDomain; active: boolean; highlighted: boolean; dimmed: boolean; onMouseEnter: () => void; onMouseLeave: () => void; onClick: () => void }) {
  return (
    <button type="button" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={onClick} className={["w-full rounded-lg border px-3 py-2 text-left transition active:scale-[0.99]", active ? "border-slate-950 bg-white shadow-sm" : highlighted ? "border-slate-300 bg-white" : "border-transparent hover:border-slate-200 hover:bg-white", dimmed ? "opacity-35" : ""].join(" ")}>
      <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-slate-900">{label}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${domainStyles[tone].badge}`}>{domainLabel[tone]}</span></div>
      <div className="mt-1 truncate text-[11px] font-semibold text-slate-500">{meta}</div>
    </button>
  );
}

function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>{children}</div>;
}

function controlButton(active: boolean) {
  return ["rounded-lg border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98]", active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"].join(" ");
}

function isSame(a: OntologyEntity | null, b: OntologyEntity) {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === "property" && b.kind === "property") return a.objectTypeId === b.objectTypeId && a.propertyId === b.propertyId;
  return "id" in a && "id" in b && a.id === b.id;
}

function getSelectedLaneId(entity: OntologyEntity | null) {
  if (entity?.kind === "lane") return entity.id;
  if (entity?.kind === "node") return laneByObjectId.get(entity.id);
  if (entity?.kind === "property") return laneByObjectId.get(entity.objectTypeId);
  return undefined;
}
