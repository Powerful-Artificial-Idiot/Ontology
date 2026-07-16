import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { AlertTriangle, LoaderCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import ReactFlow, { Background, Controls, MiniMap, Panel, useReactFlow } from "reactflow";
import type { KnowledgeRepository } from "../../../packages/knowledge-contracts/src/index";
import { Header } from "../../components/Header";
import { knowledgeRepository } from "../../repositories";
import type { ExplorerRoute } from "../../router/explorerRouter";
import { resolveOntologyTarget } from "../../router/explorerDeepLinks";
import type { AppPage, OntologyFilter } from "../../types";
import { OntologyDetailPanel } from "./components/OntologyDetailPanel";
import { OntologyDomainDock } from "./components/OntologyDomainDock";
import { OntologyEdge } from "./components/OntologyEdge";
import { OntologyNode } from "./components/OntologyNode";
import { OntologySidebar } from "./components/OntologySidebar";
import { domainStyles } from "./ontologyData";
import { getEntityScope, getFocusLabel, getPrimaryInteractionEntity, initialOntologyInteractionState, ontologyInteractionReducer } from "./ontologyInteraction";
import { buildRenderedEdges, buildRenderedNodes } from "./ontologyRender";
import { buildOntologySourceDataFromResponse } from "./ontologyRepositoryAdapter";
import { searchOntology } from "./ontologySearch";
import type { OntologyEntity, OntologyFocusState, OntologyHighlightMode, OntologySourceData } from "./ontologyTypes";
import { getBaseVisibleOntologyElements } from "./ontologyVisibility";

const nodeTypes = { ontologyObject: OntologyNode };
const edgeTypes = { ontologyLink: OntologyEdge };

export interface OntologyExplorerPageProps {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  repository?: KnowledgeRepository;
  route?: ExplorerRoute;
  onRouteChange?: (route: ExplorerRoute, replace?: boolean) => void;
}

type OntologyLoadState =
  | { status: "loading" }
  | { status: "ready"; source: OntologySourceData }
  | { status: "error"; message: string };

export function OntologyExplorerPage({ activePage, onPageChange, repository = knowledgeRepository, route, onRouteChange }: OntologyExplorerPageProps) {
  const [loadState, setLoadState] = useState<OntologyLoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState({ status: "loading" });
    repository.getOntologyGraph({ version: "1.1.0" })
      .then((response) => {
        if (active) setLoadState({ status: "ready", source: buildOntologySourceDataFromResponse(response) });
      })
      .catch((error: unknown) => {
        if (active) setLoadState({ status: "error", message: error instanceof Error ? error.message : "Unknown ontology repository error." });
      });
    return () => { active = false; };
  }, [reloadToken, repository]);

  if (loadState.status !== "ready") {
    return <OntologyRepositoryState activePage={activePage} onPageChange={onPageChange} state={loadState} onRetry={() => setReloadToken((value) => value + 1)} />;
  }
  return <OntologyExplorerCanvas activePage={activePage} onPageChange={onPageChange} source={loadState.source} route={route} onRouteChange={onRouteChange} />;
}

function OntologyExplorerCanvas({ activePage, onPageChange, source, route, onRouteChange }: { activePage: AppPage; onPageChange: (page: AppPage) => void; source: OntologySourceData; route?: ExplorerRoute; onRouteChange?: (route: ExplorerRoute, replace?: boolean) => void }) {
  const reactFlow = useReactFlow();
  const [interaction, dispatch] = useReducer(ontologyInteractionReducer, initialOntologyInteractionState);
  const [searchKeyword, setSearchKeyword] = useState(route?.query ?? "");
  const [routeError, setRouteError] = useState<string>();
  const [expandedObjectIds, setExpandedObjectIds] = useState<Set<string>>(() => new Set(["Operation"]));
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  const search = useMemo(() => searchOntology(searchKeyword, source), [searchKeyword, source]);
  const baseVisible = useMemo(
    () => getBaseVisibleOntologyElements({
      nodes: source.nodes,
      edges: source.edges,
      domainFilter: interaction.domainFilter,
      focusState: interaction.focusState,
    }),
    [interaction.domainFilter, interaction.focusState, source],
  );
  const activeEntity = getPrimaryInteractionEntity(interaction);
  const activeScope = useMemo(
    () => getEntityScope(activeEntity, interaction.highlightMode, source.nodes, source.edges),
    [activeEntity, interaction.highlightMode, source],
  );

  const handleHover = useCallback((entity: OntologyEntity) => dispatch({ type: "hover", entity }), []);
  const handleLeave = useCallback((entity: OntologyEntity) => dispatch({ type: "leave", entity }), []);
  const handleSelect = useCallback((entity: OntologyEntity | null) => {
    dispatch({ type: "select", entity });
    if (!onRouteChange) return;
    if (entity?.kind === "node") {
      onRouteChange({ page: "ontology", ontologyTarget: { kind: "class", id: entity.id }, query: searchKeyword || undefined });
    } else if (entity?.kind === "property") {
      onRouteChange({ page: "ontology", ontologyTarget: { kind: "property", id: entity.propertyId }, selectedEntityId: entity.objectTypeId, query: searchKeyword || undefined });
    } else {
      onRouteChange({ page: "ontology", selectedEntityId: entity && "id" in entity ? entity.id : undefined, query: searchKeyword || undefined });
    }
  }, [onRouteChange, searchKeyword]);
  const handleFocus = useCallback((focus: OntologyFocusState) => {
    dispatch({ type: "focus", focus });
    onRouteChange?.({
      page: "ontology",
      ontologyTarget: route?.ontologyTarget,
      selectedEntityId: route?.selectedEntityId,
      focusEntityId: focus.mode === "node-focus" ? focus.nodeId : undefined,
      query: searchKeyword || undefined,
    });
  }, [onRouteChange, route?.ontologyTarget, route?.selectedEntityId, searchKeyword]);
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
    handleSelect({ kind: "property", objectTypeId, propertyId });
  }, [handleSelect]);

  useEffect(() => {
    setSearchKeyword(route?.query ?? "");
    setRouteError(route?.invalidPath ? `Unsupported Ontology URL: ${route.invalidPath}` : undefined);
    const target = route?.ontologyTarget;
    if (!target) return;
    const resolution = resolveOntologyTarget(target, source);
    if (resolution.status === "invalid") {
      dispatch({ type: "select", entity: null });
      setRouteError(resolution.message);
      return;
    }
    const entity = resolution.value;
    if (entity.kind === "property") {
      setExpandedObjectIds((current) => new Set(current).add(entity.objectTypeId));
    }
    dispatch({ type: "select", entity });
    setRouteError(undefined);
  }, [route?.invalidPath, route?.ontologyTarget, route?.query, source]);

  const renderParams = useMemo(() => ({
    source,
    baseVisible,
    activeScope,
    interaction,
    search,
    expandedObjectIds,
    onToggleExpand: handleToggleExpand,
    onSelectProperty: handleSelectProperty,
    onFocus: (nodeId: string) => handleFocus({ mode: "node-focus", nodeId }),
  }), [activeScope, baseVisible, expandedObjectIds, handleFocus, handleSelectProperty, handleToggleExpand, interaction, search, source]);

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
        onSearchChange={(keyword) => {
          setSearchKeyword(keyword);
          onRouteChange?.({ ...route, page: "ontology", query: keyword || undefined }, true);
        }}
      />
      <div className="flex min-h-0 flex-1">
        {leftPanelOpen ? (
          <OntologySidebar
            source={source}
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
              <div data-route-status className={`min-w-0 truncate text-xs font-semibold ${routeError ? "text-amber-700" : "text-slate-500"}`}>{routeError ?? describeStatus(interaction.selectedEntity, interaction.hoveredEntity)}</div>
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
            onNodeMouseEnter={(_, node) => handleHover({ kind: "node", id: node.id })}
            onNodeMouseLeave={(_, node) => handleLeave({ kind: "node", id: node.id })}
            onEdgeMouseEnter={(_, edge) => handleHover({ kind: "edge", id: edge.id })}
            onEdgeMouseLeave={(_, edge) => handleLeave({ kind: "edge", id: edge.id })}
            onNodeClick={(_, node) => handleSelect({ kind: "node", id: node.id })}
            onEdgeClick={(_, edge) => handleSelect({ kind: "edge", id: edge.id })}
            onPaneClick={() => handleSelect(null)}
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
              nodeColor={(node) => domainStyles[source.nodes.find((item) => item.id === node.id)?.domain ?? "shared"].edge}
              maskColor="rgba(248, 250, 252, 0.68)"
            />
          </ReactFlow>

          <OntologyDomainDock
            lanes={source.lanes}
            visible={baseVisible}
            interaction={interaction}
            activeScope={activeScope}
            onHover={handleHover}
            onLeave={handleLeave}
            onSelect={handleSelect}
            onFocusLane={(laneId) => handleFocus({ mode: "lane-focus", laneId })}
          />
        </main>

        {rightPanelOpen ? <OntologyDetailPanel source={source} interaction={interaction} onSelect={handleSelect} onFocus={handleFocus} /> : null}
      </div>
    </div>
  );
}

function OntologyRepositoryState({ activePage, onPageChange, state, onRetry }: { activePage: AppPage; onPageChange: (page: AppPage) => void; state: Exclude<OntologyLoadState, { status: "ready" }>; onRetry: () => void }) {
  const loading = state.status === "loading";
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <Header activePage={activePage} searchKeyword="" searchSummary="" searchPlaceholder="Search ontology type, relation, lane, source system..." onPageChange={onPageChange} onSearchChange={() => undefined} />
      <main className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
          {loading ? <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-slate-500" /> : <AlertTriangle className="mx-auto h-5 w-5 text-amber-600" />}
          <h2 className="mt-3 text-sm font-bold text-slate-950">{loading ? "Loading ontology graph" : "Ontology graph unavailable"}</h2>
          <p className="mt-2 text-xs font-medium leading-5 text-slate-500">{loading ? "Reading released ontology definitions through the knowledge repository." : state.message}</p>
          {!loading ? <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-500"><RefreshCw className="h-3.5 w-3.5" />Retry</button> : null}
        </div>
      </main>
    </div>
  );
}

function describeStatus(selected: OntologyEntity | null, hovered: OntologyEntity | null) {
  const entity = selected ?? hovered;
  if (!entity) return "No selection";
  const prefix = selected ? "Selected" : "Hover";
  if (entity.kind === "property") return `${prefix}: ${entity.objectTypeId}.${entity.propertyId.replace(/^prop-/, "")}`;
  if (entity.kind === "relationshipType") return `${prefix}: ${entity.id}`;
  return `${prefix}: ${entity.id}`;
}
