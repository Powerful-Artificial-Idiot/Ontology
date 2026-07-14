import { useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Header } from "../../components/Header";
import type { AppPage } from "../../types";
import { AIContextPreview } from "./components/AIContextPreview";
import { SemanticCatalogSidebar } from "./components/SemanticCatalogSidebar";
import { SemanticDetailPanel } from "./components/SemanticDetailPanel";
import { SemanticMappingCanvas } from "./components/SemanticMappingCanvas";
import { semanticConceptBundles, semanticConceptById, semanticEntityById } from "./semanticData";
import { searchSemanticCatalog } from "./semanticUtils";
import type { SemanticConceptBundle, SemanticDomainFilter } from "./semanticTypes";

export function SemanticExplorerPage({ activePage, onPageChange }: { activePage: AppPage; onPageChange: (page: AppPage) => void }) {
  const defaultBundle = semanticConceptById.get("cycle-time") ?? semanticConceptBundles[0];
  const [searchKeyword, setSearchKeyword] = useState("");
  const [domainFilter, setDomainFilter] = useState<SemanticDomainFilter>("all");
  const [selectedConceptId, setSelectedConceptId] = useState(defaultBundle.id);
  const [selectedEntityId, setSelectedEntityId] = useState(defaultBundle.primaryTermId);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [contextCollapsed, setContextCollapsed] = useState(false);

  const searchMatches = useMemo(() => searchSemanticCatalog(searchKeyword), [searchKeyword]);
  const selectedBundle = semanticConceptById.get(selectedConceptId);
  const selectedEntity = semanticEntityById.get(selectedEntityId);
  const visibleBundleCount = semanticConceptBundles.filter((bundle) => domainFilter === "all" || bundle.domain === domainFilter).length;
  const searchSummary = searchKeyword.trim() ? `${searchMatches.length} semantic matches` : "";

  const selectConcept = (bundle: SemanticConceptBundle) => {
    setSelectedConceptId(bundle.id);
    setSelectedEntityId(bundle.primaryTermId);
  };

  const changeFilter = (filter: SemanticDomainFilter) => {
    setDomainFilter(filter);
    const current = semanticConceptById.get(selectedConceptId);
    if (filter === "all" || current?.domain === filter) return;
    const firstMatch = semanticConceptBundles.find((bundle) => bundle.domain === filter);
    if (firstMatch) selectConcept(firstMatch);
  };

  const selectSearchResult = (conceptId: string, entityId: string) => {
    const bundle = semanticConceptById.get(conceptId);
    if (!bundle) return;
    if (domainFilter !== "all" && bundle.domain !== domainFilter) setDomainFilter("all");
    setSelectedConceptId(conceptId);
    setSelectedEntityId(entityId);
  };

  const reset = () => {
    setSearchKeyword("");
    setDomainFilter("all");
    setSelectedConceptId(defaultBundle.id);
    setSelectedEntityId(defaultBundle.primaryTermId);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <Header activePage={activePage} searchKeyword={searchKeyword} searchSummary={searchSummary} searchPlaceholder="Search term, synonym, field, evidence..." onPageChange={onPageChange} onSearchChange={setSearchKeyword} />
      <div className="flex min-h-0 flex-1">
        {leftPanelOpen ? <SemanticCatalogSidebar searchKeyword={searchKeyword} searchMatches={searchMatches} domainFilter={domainFilter} selectedConceptId={selectedConceptId} onSearchChange={setSearchKeyword} onFilterChange={changeFilter} onSelectConcept={selectConcept} onSelectSearchResult={selectSearchResult} onReset={reset} /> : null}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1">
            <main className="relative min-w-0 flex-1 overflow-hidden">
              <div className="pointer-events-none absolute left-4 right-4 top-3 z-10 flex h-9 items-center rounded-full border border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur">
                <div className="truncate text-sm font-bold text-slate-950">Enterprise Semantic Layer</div>
                <div className="ml-2 truncate text-xs font-semibold text-slate-500">{selectedBundle?.title ?? "No concept selected"}</div>
                <div className="ml-auto hidden shrink-0 text-[10px] font-bold text-slate-400 min-[1440px]:block">{visibleBundleCount} concepts / {semanticConceptBundles.length} total</div>
              </div>
              <button type="button" title={leftPanelOpen ? "Hide semantic catalog" : "Show semantic catalog"} onClick={() => setLeftPanelOpen((value) => !value)} className="ontology-sidebar-toggle semantic-sidebar-toggle left-3">{leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
              <button type="button" title={rightPanelOpen ? "Hide semantic detail" : "Show semantic detail"} onClick={() => setRightPanelOpen((value) => !value)} className="ontology-sidebar-toggle semantic-sidebar-toggle right-3">{rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}</button>
              <div className="h-full pt-[60px]"><SemanticMappingCanvas bundle={selectedBundle} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} /></div>
            </main>
            {rightPanelOpen ? <SemanticDetailPanel entity={selectedEntity} bundle={selectedBundle} onPageChange={onPageChange} /> : null}
          </div>
          <AIContextPreview bundle={selectedBundle} collapsed={contextCollapsed} onToggle={() => setContextCollapsed((value) => !value)} />
        </section>
      </div>
    </div>
  );
}

