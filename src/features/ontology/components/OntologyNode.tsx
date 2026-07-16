import { memo } from "react";
import { BookOpen, Boxes, ChevronDown, CircleDot, GitBranch, Layers3 } from "lucide-react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { OntologyDomain, OntologyObjectType } from "../../../types";
import { domainLabel, domainStyles } from "../ontologyData";
import type { OntologyNodeData } from "../ontologyTypes";

export const OntologyNode = memo(function OntologyNode({ data }: NodeProps<OntologyNodeData>) {
  const { objectType, visualState } = data;
  const style = domainStyles[objectType.domain];
  const properties = getPriorityProperties(objectType);
  const shownProperties = properties.slice(0, 5);
  const selectedLike = visualState === "selected" || visualState === "focused";
  const emphasized = visualState === "hovered" || visualState === "highlighted";

  return (
    <div
      className={[
        "ontology-object-node w-[218px] rounded-lg border bg-white shadow-sm transition-[opacity,border-color,box-shadow] duration-150",
        selectedLike ? "border-slate-950 shadow-lg" : visualState === "related" ? "border-slate-400" : style.border,
        emphasized ? "ring-2 ring-slate-300/70" : "",
        visualState === "dimmed" ? "opacity-[0.22]" : "opacity-100",
      ].join(" ")}
      data-visual-state={visualState}
      onDoubleClick={(event) => {
        event.stopPropagation();
        data.onFocus(objectType.id);
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5" />
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5" />
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5" />
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.softBg} ${style.text}`}>
            <DomainIcon domain={objectType.domain} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-950">{objectType.label}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}>{domainLabel[objectType.domain]}</span>
              <span className="text-[10px] font-semibold text-slate-400">
                {objectType.properties.length} props / {data.inboundCount + data.outboundCount} links
              </span>
            </div>
          </div>
          <button
            type="button"
            className="nodrag nopan rounded-md border border-slate-200 bg-white p-1 text-slate-500 transition hover:border-slate-400 hover:text-slate-900 active:scale-[0.96]"
            title={data.expanded ? "Collapse properties" : "Expand properties"}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleExpand(objectType.id);
            }}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${data.expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div className="mt-2 truncate text-[10px] font-semibold text-slate-400">{objectType.sourceSystems.slice(0, 2).join(" / ")}</div>
        {objectType.badges?.length ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {objectType.badges.slice(0, 2).map((badge) => (
              <span key={badge} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">{badge}</span>
            ))}
          </div>
        ) : null}
        {data.expanded ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            {shownProperties.map((property) => (
              <button
                type="button"
                key={property.id}
                className={[
                  "nodrag nopan rounded-full border px-2 py-1 text-[10px] font-bold transition active:scale-[0.97]",
                  data.highlightedPropertyIds.has(property.id)
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400 hover:bg-white",
                ].join(" ")}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onSelectProperty(objectType.id, property.id);
                }}
              >
                {property.name}
              </button>
            ))}
            {properties.length > shownProperties.length ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400">+{properties.length - shownProperties.length} more</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

function DomainIcon({ domain }: { domain: OntologyDomain }) {
  if (domain === "production") return <Boxes className="h-4 w-4" strokeWidth={2} />;
  if (domain === "quality") return <CircleDot className="h-4 w-4" strokeWidth={2} />;
  if (domain === "engineering") return <GitBranch className="h-4 w-4" strokeWidth={2} />;
  if (domain === "valueStream") return <Layers3 className="h-4 w-4" strokeWidth={2} />;
  return <BookOpen className="h-4 w-4" strokeWidth={2} />;
}

export function getPriorityProperties(objectType: OntologyObjectType) {
  const priority = new Set([
    "operationId", "productId", "machineId", "fixtureId", "programId", "characteristicId", "isCTQ",
    "severity", "cycleTime", "taktTime", "batchSize", "uptime", "status", "valueAddedTime", "leadTime",
    "sourceSystem", "sourceId", "version",
  ]);
  return [...objectType.properties].sort((a, b) => Number(priority.has(b.name)) - Number(priority.has(a.name)));
}
