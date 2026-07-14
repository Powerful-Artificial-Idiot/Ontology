import { useCallback, useMemo, useReducer, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import ReactFlow, { Background, Controls, MiniMap, Panel, useReactFlow } from "reactflow";
import { Header } from "../../components/Header";
import type { AppPage, OntologyFilter } from "../../types";
import { OntologyDetailPanel } from "./components/OntologyDetailPanel";
import { OntologyDomainDock } from "./components/OntologyDomainDock";
import { OntologyEdge } from "./components/OntologyEdge";
import { OntologyNode } from "./components/OntologyNode";
import { OntologySidebar } from "./components/OntologySidebar";
import { domainStyles, ontologySourceData } from "./ontologyData";
import { getEntityScope, getFocusLabel, initialOntologyInteractionState, ontologyInteractionReducer } from "./ontologyInteraction";
import { buildRenderedEdges, buildRenderedNodes } from "./ontologyRender";
import { searchOntology } from "./ontologySearch";
import type { OntologyEntity, OntologyFocusState, OntologyHighlightMode } from "./ontologyTypes";
import { getBaseVisibleOntologyElements } from "./ontologyVisibility";

const nodeTypes = { ontologyObject: OntologyNode };
const edgeTypes = { ontologyLink: OntologyEdge };

export interface OntologyExplorerPageProps {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
}

export function OntologyExplorerPage({ activePage, onPageChange }: OntologyExplorerPageProps) {
  const reactFlow = useReactFlow();
  const [interaction, dispatch] = useReducer(ontologyInteractionReducer, initialOntologyInteractionState);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [expandedObjectIds, setExpandedObjectIds] = useState<Set<string>>(() => new Set(["Operation"]));
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const search = useMemo(() => searchOntology(searchKeyword), [searchKeyword]);
  const baseVisible = useMemo(
    () => getBaseVisibleOntologyElements({
      nodes: ontologySourceData.nodes,
      edges: ontologySourceData.edges,
      domainFilter: interaction.domainFilter,
      focusState: interaction.focusState,
    }),
    [interaction.domainFilter, interaction.focusState],
  );
  const activeEntity = interaction.hoveredEntity ?? interaction.selectedEntity;
  const activeScope = useMemo(
    () => getEntityScope(activeEntity, interaction.highlightMode, ontologySourceData.nodes, ontologySourceData.edges),
    [activeEntity, interaction.highlightMode],
  );

  const handleHover = useCallback((entity: OntologyEntity) => dispatch({ type: "hover", entity }), []);
  const handleLeave = useCallback((entity: OntologyEntity) => dispatch({ type: "leave", entity }), []);
  const handleSelect = useCallback((entity: OntologyEntity | null) => dispatch({ type: "select", entity }), []);
  const handleFocus = useCallback((focus: OntologyFocusState) => dispatch({ type: "focus", focus }), []);
  const handleFilter = useCallback((filter: OntologyFilter) => dispatch({ type: "filter", filter }), []);
  const handleHighlightMode = useCallback((mode: OntologyHighlightMode) => dispatch({ type: "highlight-mode", mode }), []);
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedObjectIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const handleSelectProperty = useCallback((objectTypeId: string, propertyId: string) => {
    setExpandedObjectIds((current) => new Set(current).add(objectTypeId));
    dispatch({ type: "select", entity: { kind: "property", objectTypeId, propertyId } });
  }, []);

  const renderParams = useMemo(() => ({
    source: ontologySourceData,
    baseVisible,
    activeScope,
    interaction,
    search,
    expandedObjectIds,
    onToggleExpand: handleToggleExpand,
    onSelectProperty: handleSelectProperty,
    onFocus: (nodeId: string) => handleFocus({ mode: "node-focus", nodeId }),
    onHover: handleHover,
    onLeave: handleLeave,
  }), [activeScope, baseVisible, expandedObjectIds, handleFocus, handleHover, handleLeave, handleSelectProperty, handleToggleExpand, interaction, search]);

  const renderedNodes = useMemo(() => buildRenderedNodes(renderParams), [renderParams]);
  const renderedEdges = useMemo(() => buildRenderedEdges(renderParams), [renderParams]);
  const searchSummary = searchKeyword.trim()
    ? `${search.objectIds.size} type / ${search.edgeIds.size} link / ${search.laneIds.size} lane`
    : "";
  const focusLabel = getFocusLabel(interaction.focusState);

  const handleReset = useCallback(() => {
    dispatch({ type: "reset" });
    setSearchKeyword("");
    setExpandedObjectIds(new Set(["Operation"]));
    requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2, duration: 260 }));
  }, [reactFlow]);

  const fitVisible = useCallback(() => {
    reactFlow.fitView({ nodes: renderedNodes.map((node) => ({ id: node.id })), padding: 0.25, duration: 260 });
  }, [reactFlow, renderedNodes]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <Header
        activePage={activePage}
        searchKeyword={searchKeyword}
        searchSummary={searchSummary}
        searchPlaceholder="Search ontology type, relation, lane, source system..."
        onPageChange={onPageChange}
        onSearchChange={setSearchKeyword}
      />
      <div className="flex min-h-0 flex-1">
        {leftPanelOpen ? (
          <OntologySidebar
            interaction={interaction}
            search={search}
            searchKeyword={searchKeyword}
            onFilter={handleFilter}
            onHighlightMode={handleHighlightMode}
            onReset={handleReset}
            onHover={handleHover}
            onLeave={handleLeave}
            onSelect={handleSelect}
            onFocusLane={(laneId) => handleFocus({ mode: "lane-focus", laneId })}
          />
        ) : null}

        <main className="ontology-canvas-shell relative min-w-0 flex-1 overflow-hidden">
          <div className="ontology-status-strip-wrap">
            <div className="canvas-status-strip">
              <div className="min-w-0 truncate text-sm font-bold text-slate-950">Manufacturing Ontology Explorer</div>
              <div className="min-w-0 truncate text-xs font-semibold text-slate-500">{describeStatus(interaction.selectedEntity, interaction.hoveredEntity)}</div>
              <div className="ml-auto hidden shrink-0 text-[11px] font-bold text-slate-400 min-[1500px]:block">{renderedNodes.length} nodes / {renderedEdges.length} edges</div>
            </div>
          </div>

          <button type="button" title={leftPanelOpen ? "Hide left sidebar" : "Show left sidebar"} onClick={() => setLeftPanelOpen((value) => !value)} className="ontology-sidebar-toggle left-3">
            {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <button type="button" title={rightPanelOpen ? "Hide detail panel" : "Show detail panel"} onClick={() => setRightPanelOpen((value) => !value)} className="ontology-sidebar-toggle right-3">
            {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>

          <ReactFlow
            nodes={renderedNodes}
            edges={renderedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => handleSelect({ kind: "node", id: node.id })}
            onEdgeClick={(_, edge) => handleSelect({ kind: "edge", id: edge.id })}
            onPaneClick={() => { dispatch({ type: "clear-hover" }); handleSelect(null); }}
            onMoveStart={() => dispatch({ type: "clear-hover" })}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            panOnScroll={false}
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.23}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
            className="ontology-flow"
          >
            {focusLabel ? (
              <Panel position="top-right" className="ontology-focus-panel !m-0">
                <div className="ontology-focus-banner flex items-center gap-3 rounded-full border border-teal-200 bg-white/95 px-3 py-2 text-xs shadow-graph backdrop-blur">
                  <span className="font-bold text-slate-900">{focusLabel}</span>
                  <span className="text-slate-500">Explicit scope only</span>
                  <button type="button" onClick={fitVisible} className="rounded-full border border-teal-200 bg-white px-3 py-1 font-bold text-teal-700 hover:bg-teal-50 active:scale-[0.98]">Fit Visible</button>
                  <button type="button" onClick={() => handleFocus({ mode: "normal" })} className="rounded-full bg-teal-700 px-3 py-1 font-bold text-white hover:bg-teal-800 active:scale-[0.98]">Show All</button>
                </div>
              </Panel>
            ) : null}
            <Background color="#cbd5e1" gap={30} size={1.2} />
            <Controls position="bottom-left" className="ontology-flow-controls" />
            <MiniMap
              position="bottom-right"
              className="ontology-flow-minimap"
              pannable
              zoomable
              nodeColor={(node) => domainStyles[ontologySourceData.nodes.find((item) => item.id === node.id)?.domain ?? "shared"].edge}
              maskColor="rgba(248, 250, 252, 0.68)"
            />
          </ReactFlow>

          <OntologyDomainDock
            visible={baseVisible}
            interaction={interaction}
            activeScope={activeScope}
            onHover={handleHover}
            onLeave={handleLeave}
            onSelect={handleSelect}
            onFocusLane={(laneId) => handleFocus({ mode: "lane-focus", laneId })}
          />
        </main>

        {rightPanelOpen ? <OntologyDetailPanel interaction={interaction} onSelect={handleSelect} onFocus={handleFocus} /> : null}
      </div>
    </div>
  );
}

function describeStatus(selected: OntologyEntity | null, hovered: OntologyEntity | null) {
  const entity = hovered ?? selected;
  if (!entity) return "No selection";
  const prefix = hovered ? "Hover" : "Selected";
  if (entity.kind === "property") return `${prefix}: ${entity.objectTypeId}.${entity.propertyId.replace(/^prop-/, "")}`;
  if (entity.kind === "relationshipType") return `${prefix}: ${entity.id}`;
  return `${prefix}: ${entity.id}`;
}
