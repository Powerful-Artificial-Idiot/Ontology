import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  getEdgeMetadata,
  getKeyQualityObjects,
  getObjectById,
  getQualityObjects,
  getTopObject,
  humanizeKey,
} from "../lib/graphUtils";
import type { GraphEdge, StackNode, StackObject, ViewMode } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";
import { NodeVisual } from "./NodeVisual";

interface DetailPanelProps {
  nodes: StackNode[];
  edges: GraphEdge[];
  selectedNode?: StackNode;
  selectedObject?: StackObject;
  viewMode: ViewMode;
  focusMode?: boolean;
  onSelectObject: (objectId: string) => void;
}

export function DetailPanel({
  nodes,
  edges,
  selectedNode,
  selectedObject,
  viewMode,
  focusMode = false,
  onSelectObject,
}: DetailPanelProps) {
  const [stackListOpen, setStackListOpen] = useState(false);

  useEffect(() => {
    if (focusMode) {
      setStackListOpen(true);
    }
  }, [focusMode, selectedNode?.id]);

  if (!selectedNode) {
    return (
      <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white p-5">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="text-sm font-bold text-slate-900">No stack selected</div>
          <div className="mt-2 text-sm leading-6 text-slate-500">
            Select a Stack Node to inspect top object, contained knowledge objects, source mapping, and view-specific metadata.
          </div>
        </div>
      </aside>
    );
  }

  const topObject = getTopObject(selectedNode, viewMode);
  const activeObject = selectedObject ?? topObject;
  const connectedEdges = edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id);
  const qualityObjects = getQualityObjects(selectedNode);
  const keyQualityObjects = getKeyQualityObjects(selectedNode);
  const highRiskQualityObjects = qualityObjects.filter(
    (object) => object.qualityMeta?.severity === "high" || object.qualityMeta?.severity === "critical",
  );

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Selected Stack Node</div>
            <div className="mt-1 text-lg font-bold text-slate-950">{selectedNode.id}</div>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {selectedNode.nodeCategory.replace("-", " ")}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <section className="mb-5">
          <SectionTitle>Selected Object Header</SectionTitle>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-3">
              <NodeVisual object={activeObject} viewMode={viewMode} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold leading-snug text-slate-950">{activeObject.label}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    {activeObject.type}
                  </span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    {activeObject.sourceSystem}
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{activeObject.description}</p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              {Object.entries(activeObject.attributes).map(([key, value]) => (
                <div key={key} className="rounded-md bg-white px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{humanizeKey(key)}</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>
            {activeObject.qualityMeta && (
              <div className="mt-4 rounded-lg border border-orange-200 bg-white p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-500">
                  Selected Quality Object
                </div>
                <KeyValueGrid rows={qualityMetaRows(activeObject)} />
              </div>
            )}
          </div>
        </section>

        {viewMode === "quality" && (
          <section className="mb-5">
            <SectionTitle>Quality Summary</SectionTitle>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <KeyValueGrid
                rows={[
                  ["Total Quality Objects", String(qualityObjects.length)],
                  ["CTQ", String(qualityObjects.filter((object) => object.qualityMeta?.isCTQ).length)],
                  ["Key Characteristics", String(keyQualityObjects.length)],
                  ["High / Critical Risk", String(highRiskQualityObjects.length)],
                ]}
              />
            </div>
          </section>
        )}

        <section className="mb-5">
          <SectionTitle>View-Specific Metadata</SectionTitle>
          <div className="space-y-2">
            {connectedEdges.map((edge) => {
              const metadata = getEdgeMetadata(edge, viewMode);
              return (
                <div key={edge.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {edge.source} {"->"} {edge.target}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      {edge.relationType}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(metadata).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-500">{humanizeKey(key)}</span>
                        <span className="text-right font-bold text-slate-800">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-5">
          <SectionTitle>Source System Mapping</SectionTitle>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <KeyValueGrid
              rows={[
                ["Source System", activeObject.sourceSystem],
                ["Source ID", activeObject.sourceId],
                ["Version", activeObject.version],
                ["Owner", activeObject.owner],
                ["Last Updated", activeObject.lastUpdated],
                ["Stack Node", selectedNode.id],
                ["Current View", viewMode],
                ["Top Object ID", topObject.id],
                ["Active Object ID", activeObject.id],
              ]}
            />
          </div>
        </section>

        <section className="mb-5">
          <SectionTitle>Related Objects</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {(activeObject.relatedObjectIds ?? []).map((objectId) => {
              const related = getObjectById(nodes, objectId);
              if (!related) {
                return null;
              }
              return (
                <button
                  key={objectId}
                  onClick={() => onSelectObject(objectId)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-500"
                >
                  {related.label}
                </button>
              );
            })}
            {!activeObject.relatedObjectIds?.length && (
              <span className="text-sm text-slate-400">No related objects mapped.</span>
            )}
          </div>
        </section>

        <section>
          <CollapsibleSection
            title="Stacked Object List"
            count={selectedNode.stackObjects.length}
            open={stackListOpen}
            onOpenChange={setStackListOpen}
          >
            <GroupedStackObjectList
              key={`${selectedNode.id}-${viewMode}`}
              objects={selectedNode.stackObjects}
              topObject={topObject}
              activeObject={activeObject}
              viewMode={viewMode}
              onSelectObject={onSelectObject}
            />
          </CollapsibleSection>
        </section>
      </div>
    </aside>
  );
}

function GroupedStackObjectList({
  objects,
  topObject,
  activeObject,
  viewMode,
  onSelectObject,
}: {
  objects: StackObject[];
  topObject: StackObject;
  activeObject: StackObject;
  viewMode: ViewMode;
  onSelectObject: (objectId: string) => void;
}) {
  const groups = getStackObjectGroups(objects, topObject, viewMode);

  return (
    <div className="space-y-2 pt-2">
      {groups.map((group) => (
        <CollapsibleSection
          key={`${group.title}-${viewMode}`}
          title={group.title}
          count={group.objects.length}
          defaultOpen={group.defaultOpen}
          tone={group.defaultOpen ? "active" : "muted"}
        >
          <div className="space-y-2 py-2">
            {group.objects.length > 0 ? (
              group.objects.map((object) => (
                <ObjectCard
                  key={object.id}
                  object={object}
                  active={activeObject.id === object.id}
                  viewMode={viewMode}
                  onClick={() => onSelectObject(object.id)}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
                No objects in this group.
              </div>
            )}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

function getStackObjectGroups(objects: StackObject[], topObject: StackObject, viewMode: ViewMode) {
  const withoutTopObject = objects.filter((object) => object.id !== topObject.id);
  const groupDefinitions: Array<{
    title: string;
    types: string[];
    relevantViews: ViewMode[];
  }> = [
    {
      title: "Production Objects",
      types: ["Product", "Material", "Component", "Operation", "Process", "Machine", "Fixture"],
      relevantViews: ["production"],
    },
    {
      title: "Quality Objects",
      types: [
        "Quality",
        "Quality Characteristic",
        "Inspection",
        "Inspection Method",
        "Control Method",
        "PFMEA",
        "PFMEA Risk",
        "Control Plan Item",
        "Key Characteristic",
        "CTQ",
      ],
      relevantViews: ["quality"],
    },
    {
      title: "Engineering Objects",
      types: ["Machine", "Fixture", "Engineering Spec", "Program"],
      relevantViews: ["engineering"],
    },
    {
      title: "Value Stream Objects",
      types: [
        "Supplier",
        "Customer",
        "Inventory Buffer",
        "WIP Buffer",
        "FIFO Lane",
        "Supermarket",
        "Process Box",
        "Bottleneck Marker",
        "Value Stream Metric",
        "Finished Goods Inventory",
      ],
      relevantViews: ["valueStream"],
    },
    {
      title: "Documents",
      types: ["Document"],
      relevantViews: ["engineering", "quality"],
    },
  ];

  return [
    {
      title: "Current Top Object",
      objects: [topObject],
      defaultOpen: true,
    },
    ...groupDefinitions.map((definition) => ({
      title: definition.title,
      objects: withoutTopObject.filter((object) => definition.types.includes(object.type)),
      defaultOpen: definition.relevantViews.includes(viewMode),
    })),
  ].filter((group) => group.title === "Current Top Object" || group.objects.length > 0);
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</div>;
}

function ObjectCard({
  object,
  active,
  viewMode,
  onClick,
}: {
  object: StackObject;
  active: boolean;
  viewMode: ViewMode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full rounded-lg border p-3 text-left transition",
        active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-400",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <NodeVisual object={object} viewMode={viewMode} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-950">{object.label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {qualityObjectBadges(object).map((badge) => (
              <span key={badge} className={qualityBadgeClassName(badge)}>
                {badge}
              </span>
            ))}
            <span className="text-xs text-slate-500">{object.sourceSystem}</span>
          </div>
        </div>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
          {object.type}
        </span>
      </div>
    </button>
  );
}

function qualityObjectBadges(object: StackObject): string[] {
  const badges: string[] = [];

  if (object.qualityMeta?.severity === "critical") {
    badges.push("Critical");
  }
  if (object.qualityMeta?.isCTQ) {
    badges.push("CTQ");
  }
  if (object.qualityMeta?.isKeyCharacteristic) {
    badges.push("Key");
  }
  if (object.qualityMeta?.severity === "high") {
    badges.push("High Risk");
  }

  return badges.slice(0, 2);
}

function qualityBadgeClassName(badge: string) {
  const classes: Record<string, string> = {
    Critical: "rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700",
    CTQ: "rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700",
    Key: "rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700",
    "High Risk": "rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700",
  };

  return classes[badge] ?? "rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700";
}

function qualityMetaRows(object: StackObject): Array<[string, string]> {
  const meta = object.qualityMeta;
  if (!meta) {
    return [];
  }

  return [
    ["Specification", meta.specification],
    ["Inspection Frequency", meta.inspectionFrequency],
    ["Control Method", meta.controlMethod],
    ["Severity", meta.severity],
    ["PFMEA Ref", meta.pfmeaRef],
    ["Control Plan Ref", meta.controlPlanRef],
    ["Reaction Plan", meta.reactionPlan],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function KeyValueGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-1.5">
      {rows.map(([key, value]) => (
        <div key={key} className="flex justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-500">{key}</span>
          <span className="text-right font-bold text-slate-800">{value}</span>
        </div>
      ))}
    </div>
  );
}
