import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import type { KnowledgeRepository } from "../../../packages/knowledge-contracts/src/index";
import { Header } from "../../components/Header";
import { knowledgeRepository } from "../../repositories";
import type { ExplorerRoute } from "../../router/explorerRouter";
import { resolveSemanticTarget } from "../../router/explorerDeepLinks";
import { assertSemanticCatalogResponse, assertSemanticSearchResponse } from "../../repositories/semanticCatalogValidation";
import type { AppPage } from "../../types";
import { AIContextPreview } from "./components/AIContextPreview";
import { SemanticCatalogSidebar } from "./components/SemanticCatalogSidebar";
import { SemanticDetailPanel } from "./components/SemanticDetailPanel";
import { SemanticMappingCanvas } from "./components/SemanticMappingCanvas";
import { createSemanticCatalogModel, createSemanticSearchMatches, type SemanticCatalogModel } from "./semanticCatalogModel";
import type { SemanticConceptBundle, SemanticDomainFilter, SemanticSearchMatch } from "./semanticTypes";

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: SemanticCatalogModel }
  | { status: "empty"; catalog: SemanticCatalogModel }
  | { status: "error"; message: string };

type SemanticExplorerPageProps = {
  activePage: AppPage;
  onPageChange: (page: AppPage) => void;
  repository?: KnowledgeRepository;
  route?: ExplorerRoute;
  onRouteChange?: (route: ExplorerRoute, replace?: boolean) => void;
};

export function SemanticExplorerPage({ activePage, onPageChange, repository = knowledgeRepository, route, onRouteChange }: SemanticExplorerPageProps) {
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState(route?.query ?? "");
  const [searchMatches, setSearchMatches] = useState<SemanticSearchMatch[]>([]);
  const [searchError, setSearchError] = useState<string>();
  const [domainFilter, setDomainFilter] = useState<SemanticDomainFilter>("all");
  const [selectedConceptId, setSelectedConceptId] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [routeError, setRouteError] = useState<string>();

  useEffect(() => {
    let active = true;
    setCatalogState({ status: "loading" });
    repository.getSemanticCatalog()
      .then((payload) => {
        assertSemanticCatalogResponse(payload);
        if (!active) return;
        const catalog = createSemanticCatalogModel(payload);
        const defaultBundle = catalog.conceptById.get("cycle-time") ?? catalog.bundles[0];
        if (!defaultBundle) {
          setSelectedConceptId("");
          setSelectedEntityId("");
          setCatalogState({ status: "empty", catalog });
          return;
        }
        setSelectedConceptId(defaultBundle.id);
        setSelectedEntityId(defaultBundle.primaryTermId);
        setCatalogState({ status: "ready", catalog });
      })
      .catch((error: unknown) => {
        if (active) setCatalogState({ status: "error", message: errorMessage(error) });
      });
    return () => { active = false; };
  }, [reloadToken, repository]);

  useEffect(() => {
    if (!catalogState || catalogState.status !== "ready") return;
    const catalog = catalogState.catalog;
    setSearchKeyword(route?.semanticTarget?.kind === "scenario" && route.semanticTarget.id === "machine-impact-analysis" ? route.query ?? "CQ-004" : route?.query ?? "");
    const target = route?.semanticTarget;
    if (!target) {
      setRouteError(route?.invalidPath ? `Unsupported Semantic URL: ${route.invalidPath}` : undefined);
      return;
    }
    const resolution = resolveSemanticTarget(target, catalog);
    if (resolution.status === "invalid") {
      setRouteError(resolution.message);
      return;
    }
    setSelectedConceptId(resolution.value.conceptId);
    setSelectedEntityId(resolution.value.entityId);
    if (resolution.value.defaultQuery) setSearchKeyword(route?.query ?? resolution.value.defaultQuery);
    setRouteError(undefined);
  }, [catalogState, route?.invalidPath, route?.query, route?.semanticTarget]);

  const catalog = catalogState.status === "ready" || catalogState.status === "empty" ? catalogState.catalog : undefined;

  useEffect(() => {
    let active = true;
    const query = searchKeyword.trim();
    if (!catalog || !query) {
      setSearchMatches([]);
      setSearchError(undefined);
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      repository.searchSemantic({ query, limit: 50 })
        .then((payload) => {
          assertSemanticSearchResponse(payload);
          if (!active) return;
          setSearchMatches(createSemanticSearchMatches(payload, catalog));
          setSearchError(undefined);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setSearchMatches([]);
          setSearchError(errorMessage(error));
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [catalog, repository, searchKeyword]);

  const selectedBundle = catalog?.conceptById.get(selectedConceptId);
  const selectedEntity = catalog?.entityById.get(selectedEntityId);
  const visibleBundleCount = useMemo(() => catalog?.bundles.filter((bundle) => domainFilter === "all" || bundle.domain === domainFilter).length ?? 0, [catalog, domainFilter]);
  const searchSummary = searchError ?? (searchKeyword.trim() ? `${searchMatches.length} semantic matches` : "");

  const selectConcept = (bundle: SemanticConceptBundle) => {
    setSelectedConceptId(bundle.id);
    setSelectedEntityId(bundle.primaryTermId);
    onRouteChange?.({ page: "semantic", semanticTarget: { kind: "entity", id: bundle.primaryTermId }, query: searchKeyword || undefined });
  };

  const changeFilter = (filter: SemanticDomainFilter) => {
    setDomainFilter(filter);
    const current = catalog?.conceptById.get(selectedConceptId);
    if (!catalog || filter === "all" || current?.domain === filter) return;
    const firstMatch = catalog.bundles.find((bundle) => bundle.domain === filter);
    if (firstMatch) selectConcept(firstMatch);
  };

  const selectSearchResult = (conceptId: string, entityId: string) => {
    const bundle = catalog?.conceptById.get(conceptId);
    if (!bundle) return;
    if (domainFilter !== "all" && bundle.domain !== domainFilter) setDomainFilter("all");
    setSelectedConceptId(conceptId);
    setSelectedEntityId(entityId);
    onRouteChange?.({ page: "semantic", semanticTarget: { kind: "entity", id: entityId }, query: searchKeyword || undefined });
  };

  const reset = () => {
    const defaultBundle = catalog?.conceptById.get("cycle-time") ?? catalog?.bundles[0];
    setSearchKeyword("");
    setDomainFilter("all");
    if (defaultBundle) selectConcept(defaultBundle);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <Header activePage={activePage} searchKeyword={searchKeyword} searchSummary={searchSummary} searchPlaceholder="Search term, synonym, field, evidence..." onPageChange={onPageChange} onSearchChange={(keyword) => { setSearchKeyword(keyword); onRouteChange?.({ ...route, page: "semantic", query: keyword || undefined }, true); }} />
      {catalogState.status !== "ready" || !catalog ? (
        <SemanticRepositoryState state={catalogState} onRetry={() => setReloadToken((value) => value + 1)} />
      ) : (
        <div className="flex min-h-0 flex-1">
          {leftPanelOpen ? <SemanticCatalogSidebar bundles={catalog.bundles} entities={catalog.entities} domainLabels={catalog.domainLabels} searchKeyword={searchKeyword} searchMatches={searchMatches} domainFilter={domainFilter} selectedConceptId={selectedConceptId} onSearchChange={setSearchKeyword} onFilterChange={changeFilter} onSelectConcept={selectConcept} onSelectSearchResult={selectSearchResult} onReset={reset} /> : null}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1">
              <main className="relative min-w-0 flex-1 overflow-hidden">
                <div className="pointer-events-none absolute left-4 right-4 top-3 z-10 flex h-9 items-center rounded-full border border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur">
                  <div className="truncate text-sm font-bold text-slate-950">Enterprise Semantic Layer</div>
                  <div data-route-status className={`ml-2 truncate text-xs font-semibold ${routeError ? "text-amber-700" : "text-slate-500"}`}>{routeError ?? selectedBundle?.title ?? "No concept selected"}</div>
                  <div className="ml-auto hidden shrink-0 text-[10px] font-bold text-slate-400 min-[1440px]:block">{visibleBundleCount} concepts / {catalog.bundles.length} total</div>
                </div>
                <button type="button" title={leftPanelOpen ? "Hide semantic catalog" : "Show semantic catalog"} onClick={() => setLeftPanelOpen((value) => !value)} className="ontology-sidebar-toggle semantic-sidebar-toggle left-3">{leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
                <button type="button" title={rightPanelOpen ? "Hide semantic detail" : "Show semantic detail"} onClick={() => setRightPanelOpen((value) => !value)} className="ontology-sidebar-toggle semantic-sidebar-toggle right-3">{rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}</button>
                <div className="h-full pt-[60px]"><SemanticMappingCanvas bundle={selectedBundle} lanes={catalog.lanes} entitiesById={catalog.entityById} mappingsById={catalog.mappingById} selectedEntityId={selectedEntityId} onSelectEntity={(entityId) => { setSelectedEntityId(entityId); onRouteChange?.({ page: "semantic", semanticTarget: { kind: "entity", id: entityId }, query: searchKeyword || undefined }); }} /></div>
              </main>
              {rightPanelOpen ? <SemanticDetailPanel entity={selectedEntity} bundle={selectedBundle} entitiesById={catalog.entityById} mappingsById={catalog.mappingById} domainLabels={catalog.domainLabels} onPageChange={onPageChange} /> : null}
            </div>
            <AIContextPreview bundle={selectedBundle} collapsed={contextCollapsed} onToggle={() => setContextCollapsed((value) => !value)} />
          </section>
        </div>
      )}
    </div>
  );
}

function SemanticRepositoryState({ state, onRetry }: { state: CatalogState; onRetry: () => void }) {
  const loading = state.status === "loading";
  const empty = state.status === "empty";
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-8">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
        {loading ? <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-slate-500" /> : <AlertTriangle className="mx-auto h-5 w-5 text-amber-600" />}
        <h2 className="mt-3 text-sm font-bold text-slate-950">{loading ? "Loading semantic catalog" : empty ? "Semantic catalog is empty" : "Semantic catalog unavailable"}</h2>
        <p className="mt-2 text-xs font-medium leading-5 text-slate-500">{loading ? "Reading the governed catalog through the knowledge repository." : empty ? "The repository returned a valid catalog with no concept bundles." : state.status === "error" ? state.message : "No semantic concepts are available."}</p>
        {!loading ? <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-500"><RefreshCw className="h-3.5 w-3.5" />Retry</button> : null}
      </div>
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown knowledge repository error.";
}
