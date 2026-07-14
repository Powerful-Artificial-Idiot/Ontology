import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from "reactflow";
import { getCompactEdgeLabels } from "../lib/graphUtils";
import type { CompactEdgeLabel, EdgeLabelCategory, GraphEdge, ViewMode } from "../types";

interface BusinessEdgeData {
  graphEdge: GraphEdge;
  viewMode: ViewMode;
  highlighted: boolean;
  dimmed: boolean;
}

const edgeStroke: Record<ViewMode, string> = {
  production: "#2563eb",
  quality: "#ea580c",
  engineering: "#6d28d9",
  valueStream: "#0f766e",
};

const categoryStyles: Record<
  EdgeLabelCategory,
  { text: string; border: string; bg: string; tooltipText: string }
> = {
  partsQty: {
    text: "#2563eb",
    border: "#93c5fd",
    bg: "#eff6ff",
    tooltipText: "#1e3a8a",
  },
  cycleTime: {
    text: "#9333ea",
    border: "#d8b4fe",
    bg: "#faf5ff",
    tooltipText: "#581c87",
  },
  batchSize: {
    text: "#0891b2",
    border: "#67e8f9",
    bg: "#ecfeff",
    tooltipText: "#164e63",
  },
  wip: {
    text: "#059669",
    border: "#6ee7b7",
    bg: "#ecfdf5",
    tooltipText: "#064e3b",
  },
  ctq: {
    text: "#ea580c",
    border: "#fdba74",
    bg: "#fff7ed",
    tooltipText: "#7c2d12",
  },
  inspectionFrequency: {
    text: "#d97706",
    border: "#fcd34d",
    bg: "#fffbeb",
    tooltipText: "#78350f",
  },
  qualityRisk: {
    text: "#dc2626",
    border: "#fca5a5",
    bg: "#fef2f2",
    tooltipText: "#7f1d1d",
  },
  fixture: {
    text: "#4f46e5",
    border: "#a5b4fc",
    bg: "#eef2ff",
    tooltipText: "#312e81",
  },
  program: {
    text: "#7c3aed",
    border: "#c4b5fd",
    bg: "#f5f3ff",
    tooltipText: "#4c1d95",
  },
  processParameter: {
    text: "#475569",
    border: "#cbd5e1",
    bg: "#f8fafc",
    tooltipText: "#0f172a",
  },
  materialSpec: {
    text: "#0d9488",
    border: "#5eead4",
    bg: "#f0fdfa",
    tooltipText: "#134e4a",
  },
  drawing: {
    text: "#52525b",
    border: "#d4d4d8",
    bg: "#fafafa",
    tooltipText: "#27272a",
  },
  spec: {
    text: "#52525b",
    border: "#d4d4d8",
    bg: "#fafafa",
    tooltipText: "#27272a",
  },
  inventoryQty: {
    text: "#0d9488",
    border: "#5eead4",
    bg: "#f0fdfa",
    tooltipText: "#134e4a",
  },
  waitingTime: {
    text: "#d97706",
    border: "#fcd34d",
    bg: "#fffbeb",
    tooltipText: "#78350f",
  },
  inventoryDays: {
    text: "#b45309",
    border: "#fcd34d",
    bg: "#fffbeb",
    tooltipText: "#78350f",
  },
  customerDemand: {
    text: "#2563eb",
    border: "#93c5fd",
    bg: "#eff6ff",
    tooltipText: "#1e3a8a",
  },
  transferBatch: {
    text: "#4f46e5",
    border: "#a5b4fc",
    bg: "#eef2ff",
    tooltipText: "#312e81",
  },
  leadTime: {
    text: "#e11d48",
    border: "#fda4af",
    bg: "#fff1f2",
    tooltipText: "#881337",
  },
  valueAddedTime: {
    text: "#16a34a",
    border: "#86efac",
    bg: "#f0fdf4",
    tooltipText: "#14532d",
  },
  nonValueAddedTime: {
    text: "#ea580c",
    border: "#fdba74",
    bg: "#fff7ed",
    tooltipText: "#7c2d12",
  },
  other: {
    text: "#475569",
    border: "#cbd5e1",
    bg: "#f8fafc",
    tooltipText: "#0f172a",
  },
};

export function CustomMetadataEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<BusinessEdgeData>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
  });
  const viewMode = data?.viewMode ?? "production";
  const labels = data?.graphEdge ? getCompactEdgeLabels(data.graphEdge, viewMode) : {};
  const stroke = edgeStroke[viewMode];
  const distance = Math.max(0, targetX - sourceX);
  const labelOffset = Math.min(120, Math.max(60, distance * 0.35));
  const labelX = sourceX + labelOffset;
  const opacity = data?.dimmed ? 0.25 : 0.95;
  const textOpacity = data?.dimmed ? 0.3 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: data?.highlighted ? 3.2 : 2.2,
          opacity,
        }}
      />
      <EdgeLabelRenderer>
        {labels.top && (
          <EdgeLabelPill
            label={labels.top}
            highlighted={Boolean(data?.highlighted)}
            opacity={textOpacity}
            placement="top"
            transform={`translate(-50%, -100%) translate(${labelX}px, ${sourceY - 8}px)`}
          />
        )}
        {labels.bottom && (
          <EdgeLabelPill
            label={labels.bottom}
            highlighted={Boolean(data?.highlighted)}
            opacity={textOpacity}
            placement="bottom"
            transform={`translate(-50%, 0) translate(${labelX}px, ${sourceY + 8}px)`}
          />
        )}
      </EdgeLabelRenderer>
    </>
  );
}

function EdgeLabelPill({
  label,
  highlighted,
  opacity,
  placement,
  transform,
}: {
  label: CompactEdgeLabel;
  highlighted: boolean;
  opacity: number;
  placement: "top" | "bottom";
  transform: string;
}) {
  const style = categoryStyles[label.category] ?? categoryStyles.other;
  const tooltipPosition =
    placement === "top"
      ? "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
      : "left-1/2 top-full mt-1.5 -translate-x-1/2";

  return (
    <span
      className="nodrag nopan group pointer-events-auto absolute z-30 inline-flex whitespace-nowrap text-[11px] font-medium leading-none"
      style={{
        color: style.text,
        opacity,
        transform,
        textShadow: "0 1px 0 rgba(255,255,255,0.9), 0 -1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <span className={highlighted ? "font-semibold" : ""}>{label.value}</span>
      <span
        className={[
          "pointer-events-none absolute hidden min-w-max max-w-[260px] rounded-full border px-3 py-1.5 text-[11px] leading-snug shadow-md group-hover:block",
          tooltipPosition,
        ].join(" ")}
        style={{
          backgroundColor: style.bg,
          borderColor: style.border,
          color: style.tooltipText,
          textShadow: "none",
          zIndex: 50,
        }}
      >
        <span className="block font-semibold">
          {label.fullLabel}: {label.value}
        </span>
        {label.description && <span className="mt-0.5 block text-[10px] font-normal">{label.description}</span>}
      </span>
    </span>
  );
}
