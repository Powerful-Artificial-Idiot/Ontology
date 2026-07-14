import { useEffect, useMemo, useRef, useState } from "react";
import { getObjectsByType } from "../lib/graphUtils";
import type { StackNode, StackObjectType, ViewMode } from "../types";
import { CollapsibleSection } from "./CollapsibleSection";

interface LeftSidebarProps {
  nodes: StackNode[];
  viewMode: ViewMode;
  activeCategory: StackObjectType;
  scrollRequest?: number;
  selectedObjectId?: string;
  onCategoryChange: (category: StackObjectType) => void;
  onObjectClick: (objectId: string) => void;
}

export function LeftSidebar({
  nodes,
  viewMode,
  activeCategory,
  scrollRequest = 0,
  selectedObjectId,
  onCategoryChange,
  onObjectClick,
}: LeftSidebarProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [currentGroupOpen, setCurrentGroupOpen] = useState(true);
  const [otherGroupOpen, setOtherGroupOpen] = useState(false);
  const objectListRef = useRef<HTMLDivElement | null>(null);
  const objects = useMemo(() => getObjectsByType(nodes, activeCategory), [nodes, activeCategory]);
  const groupedCategories = useMemo(() => getCategoryGroups(viewMode, nodes), [nodes, viewMode]);

  useEffect(() => {
    objectListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeCategory, scrollRequest]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex-none border-b border-slate-200 p-3">
        <CollapsibleSection
          title="Object Categories"
          count={groupedCategories.totalCount}
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
        >
          <div className="space-y-2 pt-2">
            <CollapsibleSection
              title={`Current View: ${viewModeLabel[viewMode]}`}
              count={groupedCategories.current.length}
              open={currentGroupOpen}
              onOpenChange={setCurrentGroupOpen}
              tone="active"
            >
              <CategoryList
                categories={groupedCategories.current}
                nodes={nodes}
                activeCategory={activeCategory}
                onCategoryChange={onCategoryChange}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Other Views"
              count={groupedCategories.other.length}
              open={otherGroupOpen}
              onOpenChange={setOtherGroupOpen}
              tone="muted"
            >
              <CategoryList
                categories={groupedCategories.other}
                nodes={nodes}
                activeCategory={activeCategory}
                onCategoryChange={onCategoryChange}
              />
            </CollapsibleSection>
          </div>
        </CollapsibleSection>
      </div>

      <div ref={objectListRef} className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{activeCategory}</div>
          <div className="text-xs font-semibold text-slate-400">{objects.length} objects</div>
        </div>
        <div className="space-y-2">
          {objects.length > 0 ? (
            objects.map((object) => (
            <button
              key={object.id}
              onClick={() => onObjectClick(object.id)}
              className={[
                "w-full rounded-lg border p-3 text-left transition",
                selectedObjectId === object.id
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="text-sm font-bold leading-snug text-slate-900">{object.label}</div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{object.sourceSystem}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{object.nodeId}</span>
              </div>
            </button>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              No visible objects in this category for the current view.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function CategoryList({
  categories,
  nodes,
  activeCategory,
  onCategoryChange,
}: {
  categories: StackObjectType[];
  nodes: StackNode[];
  activeCategory: StackObjectType;
  onCategoryChange: (category: StackObjectType) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2">
      {categories.map((category) => {
        const count = getObjectsByType(nodes, category).length;
        return (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={[
              "flex items-center justify-between rounded-md px-3 py-1.5 text-left text-xs font-semibold transition",
              activeCategory === category
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
            ].join(" ")}
          >
            <span className="truncate">{categoryLabel[category] ?? category}</span>
            <span className={activeCategory === category ? "text-slate-300" : "text-slate-400"}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function getCategoryGroups(viewMode: ViewMode, nodes: StackNode[]) {
  const groups = categoryGroupsByView[viewMode];
  const current = filterVisibleCategories(groups.current, nodes);
  const other = filterVisibleCategories(groups.other, nodes);

  return {
    current,
    other,
    totalCount: current.length + other.length,
  };
}

function filterVisibleCategories(categories: StackObjectType[], nodes: StackNode[]) {
  return categories.filter((category, index, array) => {
    const isFirst = array.indexOf(category) === index;
    return isFirst && getObjectsByType(nodes, category).length > 0;
  });
}

const viewModeLabel: Record<ViewMode, string> = {
  production: "Production",
  quality: "Quality",
  engineering: "Engineering",
  valueStream: "Value Stream",
};

const categoryLabel: Partial<Record<StackObjectType, string>> = {
  Quality: "Quality Characteristic",
  CTQ: "CTQ",
  "PFMEA Risk": "PFMEA Risk",
};

const categoryGroupsByView: Record<ViewMode, { current: StackObjectType[]; other: StackObjectType[] }> = {
  production: {
    current: ["Product", "Material", "Component", "Operation", "Machine", "Fixture"],
    other: [
      "Quality",
      "Document",
      "Engineering Spec",
      "Program",
      "Supplier",
      "Customer",
      "Inventory Buffer",
      "WIP Buffer",
      "Finished Goods Inventory",
      "Value Stream Metric",
    ],
  },
  quality: {
    current: [
      "Product",
      "Operation",
      "Quality",
      "Quality Characteristic",
      "Inspection Method",
      "Control Method",
      "PFMEA Risk",
      "Control Plan Item",
      "CTQ",
      "Key Characteristic",
      "Document",
    ],
    other: [
      "Material",
      "Component",
      "Machine",
      "Fixture",
      "Engineering Spec",
      "Program",
      "Supplier",
      "Customer",
      "Inventory Buffer",
      "WIP Buffer",
      "Value Stream Metric",
    ],
  },
  engineering: {
    current: ["Product", "Operation", "Machine", "Fixture", "Engineering Spec", "Program", "Document"],
    other: [
      "Material",
      "Component",
      "Quality",
      "Inspection",
      "PFMEA",
      "Supplier",
      "Customer",
      "Inventory Buffer",
      "WIP Buffer",
      "Value Stream Metric",
    ],
  },
  valueStream: {
    current: [
      "Supplier",
      "Customer",
      "Process Box",
      "Inventory Buffer",
      "WIP Buffer",
      "Finished Goods Inventory",
      "Value Stream Metric",
      "Operation",
    ],
    other: [
      "Product",
      "Material",
      "Component",
      "Machine",
      "Fixture",
      "Quality",
      "Inspection",
      "Engineering Spec",
      "Program",
      "Document",
      "PFMEA",
    ],
  },
};
