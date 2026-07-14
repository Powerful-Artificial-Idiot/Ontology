import { Handle, NodeProps, Position } from "reactflow";
import { getKeyQualityObjects, getQualityBadges, getQualityObjects, getTopObject } from "../lib/graphUtils";
import type { StackNodeRenderData, ViewMode } from "../types";
import { NodeVisual } from "./NodeVisual";

const viewClasses: Record<ViewMode, string> = {
  production: "border-blue-400 bg-blue-50/95 text-blue-950",
  quality: "border-orange-400 bg-orange-50/95 text-orange-950",
  engineering: "border-violet-400 bg-slate-50/95 text-slate-950",
  valueStream: "border-teal-500 bg-teal-50/95 text-teal-950",
};

const typeTone: Record<string, string> = {
  Product: "bg-emerald-100 text-emerald-700",
  Material: "bg-slate-100 text-slate-700",
  Component: "bg-cyan-100 text-cyan-700",
  Operation: "bg-blue-100 text-blue-700",
  Machine: "bg-indigo-100 text-indigo-700",
  Fixture: "bg-violet-100 text-violet-700",
  Quality: "bg-orange-100 text-orange-700",
  Document: "bg-amber-100 text-amber-700",
  "Engineering Spec": "bg-zinc-200 text-zinc-700",
  Program: "bg-purple-100 text-purple-700",
  Supplier: "bg-slate-100 text-slate-700",
  Customer: "bg-blue-100 text-blue-700",
  "Inventory Buffer": "bg-teal-100 text-teal-700",
  "WIP Buffer": "bg-emerald-100 text-emerald-700",
  "FIFO Lane": "bg-cyan-100 text-cyan-700",
  Supermarket: "bg-indigo-100 text-indigo-700",
  "Process Box": "bg-slate-200 text-slate-700",
  "Bottleneck Marker": "bg-red-100 text-red-700",
  "Value Stream Metric": "bg-amber-100 text-amber-700",
  "Finished Goods Inventory": "bg-green-100 text-green-700",
};

export function StackNode({ data }: NodeProps<StackNodeRenderData>) {
  const topObject = getTopObject(data.stackNode, data.viewMode);
  const isExpanded = data.expanded;
  const qualityObjects = data.viewMode === "quality" ? getQualityObjects(data.stackNode) : [];
  const keyQualityObjects = data.viewMode === "quality" ? getKeyQualityObjects(data.stackNode) : [];
  const qualityBadges = data.viewMode === "quality" ? getQualityBadges(data.stackNode) : [];

  return (
    <div
      className={[
        "stack-node w-[216px] rounded-lg border-2 shadow-graph transition-all",
        viewClasses[data.viewMode],
        data.selected ? "ring-4 ring-slate-900/15" : "",
        data.highlighted ? "scale-[1.02]" : "",
        data.dimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-white !bg-slate-600" />
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-2.5">
          <NodeVisual object={topObject} viewMode={data.viewMode} size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-snug text-slate-950">{topObject.label}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeTone[topObject.type] ?? "bg-slate-100 text-slate-700"}`}>
                {topObject.type}
              </span>
              <span className="rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {topObject.sourceSystem}
              </span>
              {data.viewMode === "valueStream" && topObject.attributes.bottleneck === "Yes" && (
                <span className="rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                  Bottleneck
                </span>
              )}
              {data.viewMode === "quality" &&
                qualityBadges.map((badge) => (
                  <span key={badge} className={qualityBadgeClassName(badge)}>
                    {badge}
                  </span>
                ))}
            </div>
            {data.viewMode === "quality" && qualityObjects.length > 0 && (
              <div className="mt-2 rounded-md border border-orange-200 bg-white/70 px-2 py-1 text-[10px] font-semibold text-orange-800">
                {qualityObjects.length} Quality Objects
                {keyQualityObjects.length > 0 ? ` · ${keyQualityObjects.length} key` : ""}
              </div>
            )}
          </div>
          <button
            className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleExpand(data.stackNode.id);
            }}
            title={isExpanded ? "Collapse stack" : "Expand stack"}
          >
            {isExpanded ? "-" : "+"}
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-slate-900/10 pt-2 text-[11px] text-slate-600">
          <span>{data.stackNode.stackObjects.length} stack objects</span>
          <span className="font-medium uppercase tracking-wide">{data.stackNode.nodeCategory.replace("-", " ")}</span>
        </div>

        {isExpanded && (
          <div className="space-y-1.5">
            {data.stackNode.stackObjects.map((object) => (
              <button
                key={object.id}
                className={[
                  "w-full rounded-md border px-2 py-1.5 text-left shadow-sm transition hover:border-slate-400 hover:bg-white",
                  object.id === topObject.id ? "border-slate-400 bg-white" : "border-slate-200 bg-white/90",
                ].join(" ")}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onSelectStackObject(data.stackNode.id, object.id);
                }}
              >
                <div className="flex items-center gap-2">
                  <NodeVisual object={object} viewMode={data.viewMode} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{object.label}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {object.type}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-white !bg-slate-600" />
    </div>
  );
}

function qualityBadgeClassName(badge: string) {
  const classes: Record<string, string> = {
    Critical: "rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700",
    CTQ: "rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700",
    Key: "rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700",
    "High Risk": "rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700",
  };

  return classes[badge] ?? "rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700";
}
