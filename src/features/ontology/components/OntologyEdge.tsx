import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";
import { domainStyles } from "../ontologyData";
import type { OntologyEdgeData } from "../ontologyTypes";

export const OntologyEdge = memo(function OntologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<OntologyEdgeData>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return <BaseEdge id={id} path={path} markerEnd={markerEnd} />;

  const { linkType, visualState } = data;
  const style = domainStyles[linkType.domain];
  const selectedLike = ["selected", "focused", "highlighted", "hovered"].includes(visualState);
  const related = visualState === "related";
  const dimmed = visualState === "dimmed";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: style.edge,
          strokeWidth: selectedLike ? 3 : related ? 2.4 : 1.7,
          opacity: dimmed ? 0.14 : selectedLike ? 1 : related ? 0.88 : 0.62,
          transition: "opacity 150ms ease, stroke-width 150ms ease",
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        className="react-flow__edge-interaction"
        onMouseEnter={() => data.onHover({ kind: "edge", id })}
        onMouseLeave={() => data.onLeave({ kind: "edge", id })}
      />
      <EdgeLabelRenderer>
        <div
          className="ontology-edge-label pointer-events-none absolute rounded-full border bg-white/95 px-2 py-0.5 text-[10px] font-bold shadow-sm backdrop-blur"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            borderColor: style.borderColor,
            color: style.edge,
            opacity: dimmed ? 0.18 : 1,
          }}
        >
          {linkType.label}
          {visualState === "hovered" ? (
            <span className="ontology-edge-tooltip pointer-events-none absolute left-1/2 top-full mt-1.5 min-w-[240px] -translate-x-1/2 rounded-lg border bg-white px-3 py-2 text-left text-[11px] leading-snug text-slate-700 shadow-md" style={{ borderColor: style.borderColor }}>
              <span className="block font-bold text-slate-950">{linkType.sourceObjectType} {linkType.label} {linkType.targetObjectType}</span>
              <span className="mt-1 block font-medium">{linkType.description}</span>
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
