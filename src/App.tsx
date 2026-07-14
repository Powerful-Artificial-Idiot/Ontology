import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Node,
  OnNodesChange,
  Position,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { CustomMetadataEdge } from "./components/BusinessEdge";
import { DetailPanel } from "./components/DetailPanel";
import { Header } from "./components/Header";
import { LeftSidebar } from "./components/LeftSidebar";
import { StackNode as StackNodeComponent } from "./components/StackNode";
import { buildRouteGraphFromResponse, type RouteGraphViewModel } from "./features/route/routeRepositoryAdapter";
import { knowledgeRepository, type KnowledgeRepository } from "./repositories";
import { buildExplorerUrl, pageRoute, parseExplorerLocation, type ExplorerRoute } from "./router/explorerRouter";
import {
  getFocusedGraphElements,
  getNodeByObjectId,
  getNodePosition,
  getTopObject,
  getObjectsByType,
  highlightNeighborhood,
  searchGraph,
  selectStackObject,
} from "./lib/graphUtils";
import { OntologyExplorer } from "./pages/OntologyExplorer";
import { SemanticExplorerPage } from "./features/semantic/SemanticExplorerPage";
import type { AppPage, StackNode, StackNodeRenderData, StackObjectType, ViewMode } from "./types";

type RouteLaneId = "source" | "process" | "output";

const nodeTypes = {
  stackNode: StackNodeComponent,
};

const edgeTypes = {
  businessEdge: CustomMetadataEdge,
};

export default function App() {
  const [route, setRoute] = useState<ExplorerRoute>(() => parseExplorerLocation(window.location));

  useEffect(() => {
    const handlePopState = () => setRoute(parseExplorerLocation(window.location));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: ExplorerRoute, replace = false) => {
    const url = buildExplorerUrl(nextRoute);
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoute(nextRoute);
  }, []);
  const handlePageChange = useCallback((page: AppPage) => navigate(pageRoute(page)), [navigate]);

  if (route.page === "route") return (
    <ReactFlowProvider key="route-flow">
        <GraphExplorer
          activePage="route"
          onPageChange={handlePageChange}
          route={route}
          onRouteChange={navigate}
        />
    </ReactFlowProvider>
  );

  if (route.page === "ontology") return (
    <ReactFlowProvider key="ontology-flow">
        <OntologyExplorer activePage="ontology" onPageChange={handlePageChange} />
    </ReactFlowProvider>
  );

  return <SemanticExplorerPage activePage="semantic" onPageChange={handlePageChange} />;
}

function GraphExplorer({
  activePage,
  onPageChange,
  route,
  onRouteChange,
  repository = knowledgeRepository,
}: {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  route: ExplorerRoute;
  onRouteChange: (route: ExplorerRoute, replace?: boolean) => void;
  repository?: KnowledgeRepository;
}) {
  const [loadRequest, setLoadRequest] = useState(0);
  const [routeState, setRouteState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; graphs: Record<ViewMode, RouteGraphViewModel> }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setRouteState({ status: "loading" });

    Promise.all(
      routeViewModes.map(async (viewMode) => {
        const response = await repository.getGraphView({ viewId: viewMode });
        return [viewMode, buildRouteGraphFromResponse(response, viewMode)] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setRouteState({ status: "ready", graphs: Object.fromEntries(entries) as Record<ViewMode, RouteGraphViewModel> });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRouteState({
            status: "error",
            message: error instanceof Error ? error.message : "The route graph could not be loaded.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadRequest, repository]);

  if (routeState.status === "loading") {
    return <RouteLoadState title="Loading route graph" message="Connecting the manufacturing route to the knowledge repository." />;
  }
  if (routeState.status === "error") {
    return (
      <RouteLoadState
        title="Route graph unavailable"
        message={routeState.message}
        actionLabel="Retry"
        onAction={() => setLoadRequest((request) => request + 1)}
      />
    );
  }

  return (
    <GraphExplorerCanvas
      activePage={activePage}
      onPageChange={onPageChange}
      routeGraphs={routeState.graphs}
      route={route}
      onRouteChange={onRouteChange}
    />
  );
}

const routeViewModes: ViewMode[] = ["production", "quality", "engineering", "valueStream"];

function GraphExplorerCanvas({
  activePage,
  onPageChange,
  routeGraphs,
  route,
  onRouteChange,
}: {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  routeGraphs: Record<ViewMode, RouteGraphViewModel>;
  route: ExplorerRoute;
  onRouteChange: (route: ExplorerRoute, replace?: boolean) => void;
}) {
  const reactFlow = useReactFlow();
  const [viewMode, setViewMode] = useState<ViewMode>(route.viewMode ?? "production");
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(route.selectedEntityId ?? "OP30");
  const [selectedObjectId, setSelectedObjectId] = useState<string>("obj-op30-operation");
  const [searchKeyword, setSearchKeyword] = useState(route.query ?? "");
  const [activeCategory, setActiveCategory] = useState<StackObjectType>("Machine");
  const [activeRouteLane, setActiveRouteLane] = useState<RouteLaneId | null>(null);
  const [sidebarScrollRequest, setSidebarScrollRequest] = useState(0);

  const viewVisibleNodes = routeGraphs[viewMode].nodes;
  const viewVisibleEdges = routeGraphs[viewMode].edges;
  const focusedElements = useMemo(
    () =>
      focusMode && expandedNodeId
        ? getFocusedGraphElements(viewVisibleNodes, viewVisibleEdges, expandedNodeId, viewMode)
        : null,
    [expandedNodeId, focusMode, viewMode, viewVisibleEdges, viewVisibleNodes],
  );
  const graphVisibleNodes = useMemo(
    () =>
      focusedElements
        ? viewVisibleNodes.filter((node) => focusedElements.visibleNodeIds.has(node.id))
        : viewVisibleNodes,
    [focusedElements, viewVisibleNodes],
  );
  const graphVisibleEdges = useMemo(
    () =>
      focusedElements
        ? viewVisibleEdges.filter((edge) => focusedElements.visibleEdgeIds.has(edge.id))
        : viewVisibleEdges,
    [focusedElements, viewVisibleEdges],
  );
  const detailScopeNodes = focusMode ? graphVisibleNodes : viewVisibleNodes;

  const searchResult = useMemo(() => searchGraph(viewVisibleNodes, searchKeyword), [searchKeyword, viewVisibleNodes]);
  const selectedNode = viewVisibleNodes.find((node) => node.id === selectedNodeId);
  const selectedObject = selectedObjectId ? selectStackObject(viewVisibleNodes, selectedObjectId)?.object : undefined;
  const expandedNode = expandedNodeId ? viewVisibleNodes.find((node) => node.id === expandedNodeId) : undefined;
  const expandedTopObject = expandedNode ? getTopObject(expandedNode, viewMode) : undefined;

  useEffect(() => {
    const nextView = route.viewMode ?? "production";
    setViewMode(nextView);
    setSearchKeyword(route.query ?? "");
    const nextNodes = routeGraphs[nextView].nodes;
    const requestedNode = route.selectedEntityId
      ? nextNodes.find((node) => node.id === route.selectedEntityId)
      : undefined;
    const nextNode = requestedNode ?? nextNodes.find((node) => node.id === "OP30") ?? nextNodes[0];
    if (nextNode) {
      setSelectedNodeId(nextNode.id);
      setSelectedObjectId(getTopObject(nextNode, nextView).id);
    }
    const focusNode = route.focusEntityId
      ? nextNodes.find((node) => node.id === route.focusEntityId)
      : undefined;
    setExpandedNodeId(focusNode?.id ?? null);
    setFocusMode(Boolean(focusNode));
  }, [route.focusEntityId, route.query, route.selectedEntityId, route.viewMode, routeGraphs]);

  const neighborhood = useMemo(() => {
    if (!selectedNodeId) {
      return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
    }
    return highlightNeighborhood(selectedNodeId, graphVisibleEdges);
  }, [selectedNodeId, graphVisibleEdges]);

  const searchNodeIds = useMemo(() => new Set(searchResult.nodeIds), [searchResult.nodeIds]);
  const selectedRouteLane = selectedNode ? getRouteLaneId(selectedNode.nodeCategory, viewMode) : undefined;
  const neighborhoodRouteLanes = useMemo(
    () =>
      new Set(
        graphVisibleNodes
          .filter((node) => neighborhood.nodeIds.has(node.id))
          .map((node) => getRouteLaneId(node.nodeCategory, viewMode)),
      ),
    [graphVisibleNodes, neighborhood.nodeIds, viewMode],
  );

  const exitFocusMode = useCallback(() => {
    setExpandedNodeId(null);
    setFocusMode(false);
  }, []);

  const handleRouteLaneClick = useCallback(
    (laneId: RouteLaneId) => {
      exitFocusMode();
      const laneCategory = getRouteLaneCategory(laneId, viewMode, viewVisibleNodes);
      if (laneCategory) {
        setActiveCategory(laneCategory);
        setSidebarScrollRequest((request) => request + 1);
      }
      setActiveRouteLane((currentLane) => (currentLane === laneId ? null : laneId));
    },
    [exitFocusMode, viewMode, viewVisibleNodes],
  );

  const handleToggleExpandNode = useCallback(
    (nodeId: string) => {
      if (focusMode && expandedNodeId === nodeId) {
        exitFocusMode();
        onRouteChange({ ...route, page: "route", viewMode, selectedEntityId: nodeId, focusEntityId: undefined });
        return;
      }

      const node = viewVisibleNodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }

      setExpandedNodeId(nodeId);
      setFocusMode(true);
      setSelectedNodeId(nodeId);
      setSelectedObjectId(getTopObject(node, viewMode).id);
      onRouteChange({ ...route, page: "route", viewMode, selectedEntityId: nodeId, focusEntityId: nodeId });
    },
    [expandedNodeId, exitFocusMode, focusMode, onRouteChange, route, viewMode, viewVisibleNodes],
  );

  const handleSelectNode = useCallback(
    (nodeId: string, objectId?: string) => {
      const node = viewVisibleNodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }

      setSelectedNodeId(nodeId);
      setSelectedObjectId(objectId ?? getTopObject(node, viewMode).id);
      setActiveRouteLane(null);
      onRouteChange({ ...route, page: "route", viewMode, selectedEntityId: nodeId });
    },
    [onRouteChange, route, viewMode, viewVisibleNodes],
  );

  const handleSelectStackObject = useCallback(
    (nodeId: string, objectId: string) => {
      setSelectedNodeId(nodeId);
      setSelectedObjectId(objectId);
    },
    [],
  );

  const handleSelectObjectById = useCallback((objectId: string) => {
    const match = selectStackObject(viewVisibleNodes, objectId);
    if (!match) {
      return;
    }

    exitFocusMode();
    setActiveRouteLane(null);
    setSelectedNodeId(match.node.id);
    setSelectedObjectId(objectId);
    onRouteChange({ ...route, page: "route", viewMode, selectedEntityId: match.node.id, focusEntityId: undefined });
  }, [exitFocusMode, onRouteChange, route, viewMode, viewVisibleNodes]);

  const handleSearchChange = useCallback((keyword: string) => {
    setSearchKeyword(keyword);
    const result = searchGraph(viewVisibleNodes, keyword);
    if (result.nodeIds.length === 0) {
      onRouteChange({ ...route, page: "route", viewMode, query: keyword || undefined }, true);
      return;
    }

    exitFocusMode();
    setActiveRouteLane(null);
    const objectId = result.objectIds[0];
    const nodeFromObject = objectId ? getNodeByObjectId(viewVisibleNodes, objectId) : undefined;
    const nodeId = nodeFromObject?.id ?? result.nodeIds[0];
    setSelectedNodeId(nodeId);
    if (objectId) {
      setSelectedObjectId(objectId);
    } else {
      const node = viewVisibleNodes.find((item) => item.id === nodeId);
      if (node) {
        setSelectedObjectId(getTopObject(node, viewMode).id);
      }
    }
    onRouteChange({ ...route, page: "route", viewMode, query: keyword || undefined, selectedEntityId: nodeId, focusEntityId: undefined }, true);
  }, [exitFocusMode, onRouteChange, route, viewMode, viewVisibleNodes]);

  useEffect(() => {
    if (selectedNode) {
      return;
    }

    const fallbackNode = viewVisibleNodes[0];
    if (!fallbackNode) {
      return;
    }

    setSelectedNodeId(fallbackNode.id);
    setSelectedObjectId(getTopObject(fallbackNode, viewMode).id);
  }, [selectedNode, viewMode, viewVisibleNodes]);

  const handleFitVisible = useCallback(() => {
    reactFlow.fitView({
      nodes: graphVisibleNodes.map((node) => ({ id: node.id })),
      padding: 0.3,
      duration: 300,
    });
  }, [graphVisibleNodes, reactFlow]);

  const buildFlowNode = useCallback(
    (node: StackNode, previous?: Node<StackNodeRenderData>): Node<StackNodeRenderData> => {
      const isSearchActive = searchKeyword.trim().length > 0 && searchNodeIds.size > 0;
      const isSearchMatch = searchNodeIds.has(node.id);
      const isLaneMatch = activeRouteLane ? getRouteLaneId(node.nodeCategory, viewMode) === activeRouteLane : false;
      const isNeighborhoodNode = neighborhood.nodeIds.has(node.id);
      const highlighted = isSearchActive ? isSearchMatch : activeRouteLane ? isLaneMatch : isNeighborhoodNode;
      const dimmed = isSearchActive
        ? !isSearchMatch
        : activeRouteLane
          ? !isLaneMatch
          : selectedNodeId
            ? !isNeighborhoodNode
            : false;

      return {
        id: node.id,
        type: "stackNode",
        position: previous?.data.viewMode === viewMode ? previous.position : getNodePosition(node, viewMode),
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: true,
        data: {
          stackNode: node,
          viewMode,
          expanded: focusMode && expandedNodeId === node.id,
          selected: selectedNodeId === node.id,
          highlighted,
          dimmed,
          onToggleExpand: handleToggleExpandNode,
          onSelectStackObject: handleSelectStackObject,
        },
      };
    },
    [
      expandedNodeId,
      activeRouteLane,
      focusMode,
      handleSelectStackObject,
      handleToggleExpandNode,
      neighborhood.nodeIds,
      searchKeyword,
      searchNodeIds,
      selectedNodeId,
      viewMode,
    ],
  );

  const [flowNodes, setFlowNodes] = useState<Node<StackNodeRenderData>[]>(
    graphVisibleNodes.map((node) => buildInitialNode(node, viewMode, handleToggleExpandNode, handleSelectStackObject)),
  );

  useEffect(() => {
    setFlowNodes((currentNodes) =>
      graphVisibleNodes.map((node) => {
        const previous = currentNodes.find((flowNode) => flowNode.id === node.id);
        return buildFlowNode(node, previous);
      }),
    );
  }, [buildFlowNode, graphVisibleNodes]);

  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, []);

  const flowEdges = useMemo(
    () =>
      graphVisibleEdges.map((edge) => {
        const isSearchActive = searchKeyword.trim().length > 0 && searchNodeIds.size > 0;
        const highlighted = isSearchActive
          ? searchNodeIds.has(edge.source) || searchNodeIds.has(edge.target)
          : activeRouteLane
            ? edgeTouchesRouteLane(edge, activeRouteLane, graphVisibleNodes, viewMode)
            : neighborhood.edgeIds.has(edge.id);
        const dimmed = isSearchActive
          ? !highlighted
          : activeRouteLane
            ? !highlighted
            : selectedNodeId
              ? !neighborhood.edgeIds.has(edge.id)
              : false;

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "businessEdge",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color:
              viewMode === "production"
                ? "#2563eb"
                : viewMode === "quality"
                  ? "#ea580c"
                  : viewMode === "engineering"
                    ? "#6d28d9"
                    : "#0f766e",
            width: 18,
            height: 18,
          },
          data: {
            graphEdge: edge,
            viewMode,
            highlighted,
            dimmed,
          },
        };
      }),
    [activeRouteLane, graphVisibleNodes, neighborhood.edgeIds, searchKeyword, searchNodeIds, selectedNodeId, viewMode, graphVisibleEdges],
  );

  const searchSummary =
    searchKeyword.trim().length > 0
      ? `${searchResult.nodeIds.length} node / ${searchResult.objectIds.length} object`
      : "";

  return (
    <div className={`flex h-screen flex-col overflow-hidden bg-slate-100 view-${viewMode}`}>
      <Header
        activePage={activePage}
        viewMode={viewMode}
        searchKeyword={searchKeyword}
        searchSummary={searchSummary}
        onPageChange={onPageChange}
        onViewModeChange={(nextView) => {
          exitFocusMode();
          setActiveRouteLane(null);
          setViewMode(nextView);
          const nextVisibleNodes = routeGraphs[nextView].nodes;
          const nextSelectedNode =
            nextVisibleNodes.find((node) => node.id === selectedNodeId) ?? nextVisibleNodes[0];
          if (nextSelectedNode) {
            setSelectedNodeId(nextSelectedNode.id);
            setSelectedObjectId(getTopObject(nextSelectedNode, nextView).id);
          }
          onRouteChange({ page: "route", viewMode: nextView, selectedEntityId: nextSelectedNode?.id });
        }}
        onSearchChange={handleSearchChange}
      />

      <div className="flex min-h-0 flex-1">
        <LeftSidebar
          nodes={viewVisibleNodes}
          viewMode={viewMode}
          activeCategory={activeCategory}
          scrollRequest={sidebarScrollRequest}
          selectedObjectId={selectedObjectId}
          onCategoryChange={setActiveCategory}
          onObjectClick={handleSelectObjectById}
        />

        <main className="relative min-w-0 flex-1">
          <div className="absolute left-5 top-4 z-10 flex gap-2">
            {viewMode === "valueStream" ? (
              <>
                <LaneBadge label="Supplier / Inventory" active={activeRouteLane === "source"} contextual={!activeRouteLane && selectedRouteLane === "source"} related={neighborhoodRouteLanes.has("source")} onClick={() => handleRouteLaneClick("source")} />
                <LaneBadge label="Process / WIP Flow" active={activeRouteLane === "process"} contextual={!activeRouteLane && selectedRouteLane === "process"} related={neighborhoodRouteLanes.has("process")} onClick={() => handleRouteLaneClick("process")} />
                <LaneBadge label="Finished Goods / Customer" active={activeRouteLane === "output"} contextual={!activeRouteLane && selectedRouteLane === "output"} related={neighborhoodRouteLanes.has("output")} onClick={() => handleRouteLaneClick("output")} />
              </>
            ) : (
              <>
                <LaneBadge label="Raw Material / Component" active={activeRouteLane === "source"} contextual={!activeRouteLane && selectedRouteLane === "source"} related={neighborhoodRouteLanes.has("source")} onClick={() => handleRouteLaneClick("source")} />
                <LaneBadge label="Operation / Process / WIP" active={activeRouteLane === "process"} contextual={!activeRouteLane && selectedRouteLane === "process"} related={neighborhoodRouteLanes.has("process")} onClick={() => handleRouteLaneClick("process")} />
                <LaneBadge label="Finished Product" active={activeRouteLane === "output"} contextual={!activeRouteLane && selectedRouteLane === "output"} related={neighborhoodRouteLanes.has("output")} onClick={() => handleRouteLaneClick("output")} />
              </>
            )}
          </div>
          {focusMode && expandedNode && expandedTopObject && (
            <FocusModeBar
              label={expandedTopObject.label}
              onFitVisible={handleFitVisible}
              onExit={() => {
                exitFocusMode();
                onRouteChange({ ...route, page: "route", viewMode, selectedEntityId: selectedNodeId, focusEntityId: undefined });
              }}
            />
          )}
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            key={viewMode}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => handleSelectNode(node.id)}
            fitView
            fitViewOptions={{ padding: 0.16 }}
            minZoom={0.35}
            maxZoom={1.45}
            proOptions={{ hideAttribution: true }}
            className="manufacturing-flow"
          >
            {viewMode === "valueStream" && <ValueStreamTimeline />}
            <Background color="#cbd5e1" gap={28} size={1.2} />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => (node.id === selectedNodeId ? "#0f172a" : "#94a3b8")}
              maskColor="rgba(248, 250, 252, 0.65)"
            />
          </ReactFlow>
        </main>

        <DetailPanel
          nodes={detailScopeNodes}
          edges={graphVisibleEdges}
          selectedNode={selectedNode}
          selectedObject={selectedObject}
          viewMode={viewMode}
          focusMode={focusMode}
          onSelectObject={handleSelectObjectById}
        />
      </div>
    </div>
  );
}

function buildInitialNode(
  node: StackNode,
  viewMode: ViewMode,
  onToggleExpand: (nodeId: string) => void,
  onSelectStackObject: (nodeId: string, objectId: string) => void,
): Node<StackNodeRenderData> {
  return {
    id: node.id,
    type: "stackNode",
    position: getNodePosition(node, viewMode),
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable: true,
    data: {
      stackNode: node,
      viewMode,
      expanded: false,
      selected: node.id === "OP30",
      highlighted: node.id === "OP30" || ["OP20", "OP40"].includes(node.id),
      dimmed: false,
      onToggleExpand,
      onSelectStackObject,
    },
  };
}

function LaneBadge({
  label,
  active,
  contextual,
  related,
  onClick,
}: {
  label: string;
  active: boolean;
  contextual: boolean;
  related: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur transition",
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : contextual
            ? "border-slate-300 bg-white text-slate-950 ring-2 ring-slate-300/60"
            : related
              ? "border-white/80 bg-white/90 text-slate-700"
              : "border-white/70 bg-white/70 text-slate-500 hover:bg-white hover:text-slate-900",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function getRouteLaneId(nodeCategory: string, viewMode: ViewMode): RouteLaneId {
  if (viewMode === "valueStream") {
    if (nodeCategory === "supplier" || nodeCategory === "inventory") {
      return "source";
    }
    if (nodeCategory === "customer" || nodeCategory === "finished-product") {
      return "output";
    }
    return "process";
  }

  if (nodeCategory === "raw-material" || nodeCategory === "component" || nodeCategory === "supplier") {
    return "source";
  }
  if (nodeCategory === "finished-product" || nodeCategory === "customer") {
    return "output";
  }
  return "process";
}

function edgeTouchesRouteLane(
  edge: { source: string; target: string },
  laneId: RouteLaneId,
  nodes: StackNode[],
  viewMode: ViewMode,
) {
  const sourceNode = nodes.find((node) => node.id === edge.source);
  const targetNode = nodes.find((node) => node.id === edge.target);

  return (
    Boolean(sourceNode && getRouteLaneId(sourceNode.nodeCategory, viewMode) === laneId) ||
    Boolean(targetNode && getRouteLaneId(targetNode.nodeCategory, viewMode) === laneId)
  );
}

function getRouteLaneCategory(
  laneId: RouteLaneId,
  viewMode: ViewMode,
  nodes: StackNode[],
): StackObjectType | undefined {
  const preferredCategories: Record<ViewMode, Record<RouteLaneId, StackObjectType[]>> = {
    production: {
      source: ["Material", "Component"],
      process: ["Operation", "Machine", "Fixture"],
      output: ["Product"],
    },
    quality: {
      source: ["Material", "Component"],
      process: ["Quality Characteristic", "Quality", "Operation", "Inspection Method", "PFMEA Risk"],
      output: ["Product"],
    },
    engineering: {
      source: ["Material", "Component"],
      process: ["Operation", "Machine", "Fixture", "Engineering Spec", "Program"],
      output: ["Product", "Document"],
    },
    valueStream: {
      source: ["Supplier", "Inventory Buffer"],
      process: ["Process Box", "WIP Buffer", "Value Stream Metric", "Operation"],
      output: ["Finished Goods Inventory", "Customer"],
    },
  };

  return preferredCategories[viewMode][laneId].find((category) => getObjectsByType(nodes, category).length > 0);
}

function FocusModeBar({
  label,
  onFitVisible,
  onExit,
}: {
  label: string;
  onFitVisible: () => void;
  onExit: () => void;
}) {
  return (
    <div className="absolute right-5 top-4 z-20 flex items-center gap-3 rounded-full border border-teal-200 bg-white/95 px-3 py-2 text-xs shadow-graph backdrop-blur">
      <span className="h-2 w-2 rounded-full bg-teal-600" />
      <span className="font-bold text-slate-900">Focus Mode: {label}</span>
      <span className="text-slate-500">Showing direct neighbors only</span>
      <button
        type="button"
        onClick={onFitVisible}
        className="rounded-full border border-teal-200 bg-white px-3 py-1 font-bold text-teal-700 transition hover:bg-teal-50"
      >
        Fit Visible
      </button>
      <button
        type="button"
        onClick={onExit}
        className="rounded-full bg-teal-700 px-3 py-1 font-bold text-white transition hover:bg-teal-800"
      >
        Show All
      </button>
    </div>
  );
}

function ValueStreamTimeline() {
  const metrics = [
    ["VA Time", "150s"],
    ["Waiting", "1.77 days"],
    ["Lead Time", "1.77 days"],
    ["PCE", "0.10%"],
    ["Bottleneck", "OP20"],
  ];

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-teal-200 bg-white/90 px-3 py-2 shadow-graph backdrop-blur">
      {metrics.map(([label, value]) => (
        <div key={label} className="flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs">
          <span className="font-semibold text-slate-500">{label}</span>
          <span className="font-bold text-teal-800">{value}</span>
        </div>
      ))}
    </div>
  );
}

function RouteLoadState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 h-2 w-14 rounded-full bg-blue-600" />
        <h1 className="text-base font-bold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
