import type { AgentLayer } from "../agentDemoTypes";

const layerStyles: Record<AgentLayer, { label: string; badge: string; dot: string }> = {
  user: { label: "User Request", badge: "border-slate-200 bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  context: { label: "Context Resolution", badge: "border-cyan-200 bg-cyan-50 text-cyan-700", dot: "bg-cyan-500" },
  semantic: { label: "Semantic Layer", badge: "border-indigo-200 bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  ontology: { label: "Ontology Layer", badge: "border-purple-200 bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  knowledge: { label: "Knowledge Layer", badge: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  crossView: { label: "Cross-view Index", badge: "border-teal-200 bg-teal-50 text-teal-700", dot: "bg-teal-500" },
  evidence: { label: "Evidence Layer", badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  answer: { label: "Answer Generation", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
};

export function AgentLayerBadge({ layer, compact = false }: { layer: AgentLayer; compact?: boolean }) {
  const style = layerStyles[layer];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-bold ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

export function getAgentLayerLabel(layer: AgentLayer) {
  return layerStyles[layer].label;
}
