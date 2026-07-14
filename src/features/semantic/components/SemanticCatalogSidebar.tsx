import { Bot, ChevronDown, Database, FileCheck2, Gauge, Languages, Link2, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { semanticConceptBundles, semanticDomainLabels, semanticEntities } from "../semanticData";
import { searchGroupOrder } from "../semanticUtils";
import type { SemanticConceptBundle, SemanticDomainFilter, SemanticSearchMatch } from "../semanticTypes";

const filters: Array<{ id: SemanticDomainFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "production", label: "Production" },
  { id: "quality", label: "Quality" },
  { id: "engineering", label: "Engineering" },
  { id: "valueStream", label: "Value Stream" },
  { id: "governance", label: "Governance" },
];

const semanticGroups = [
  { label: "Business Terms", icon: <Languages className="h-3.5 w-3.5" />, types: ["businessTerm"] },
  { label: "Synonyms / Aliases", icon: <Link2 className="h-3.5 w-3.5" />, types: ["synonym"] },
  { label: "Metrics", icon: <Gauge className="h-3.5 w-3.5" />, types: ["metric"] },
  { label: "System Fields", icon: <Database className="h-3.5 w-3.5" />, types: ["systemField"] },
  { label: "Source Evidence", icon: <FileCheck2 className="h-3.5 w-3.5" />, types: ["sourceEvidence"] },
  { label: "AI Context", icon: <Bot className="h-3.5 w-3.5" />, types: ["aiContext"] },
];

export function SemanticCatalogSidebar({ searchKeyword, searchMatches, domainFilter, selectedConceptId, onSearchChange, onFilterChange, onSelectConcept, onSelectSearchResult, onReset }: { searchKeyword: string; searchMatches: SemanticSearchMatch[]; domainFilter: SemanticDomainFilter; selectedConceptId: string; onSearchChange: (value: string) => void; onFilterChange: (filter: SemanticDomainFilter) => void; onSelectConcept: (bundle: SemanticConceptBundle) => void; onSelectSearchResult: (conceptId: string, entityId: string) => void; onReset: () => void }) {
  const visibleBundles = semanticConceptBundles.filter((bundle) => domainFilter === "all" || bundle.domain === domainFilter);
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Semantic Catalog</div>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Business language mapped to governed enterprise context.</p>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={searchKeyword} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search term, synonym, field, evidence..." className="h-9 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-xs outline-none transition focus:border-slate-500 focus:bg-white" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <CatalogSection title="Domain Filter" count={filters.length} defaultOpen>
          <div className="grid grid-cols-2 gap-1.5">
            {filters.map((filter) => <button type="button" key={filter.id} onClick={() => onFilterChange(filter.id)} className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-bold transition active:scale-[0.98] ${domainFilter === filter.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{filter.label}</button>)}
          </div>
        </CatalogSection>

        {searchKeyword.trim() ? (
          <CatalogSection title="Search Results" count={searchMatches.length} defaultOpen>
            {searchMatches.length ? <div className="space-y-3">{searchGroupOrder.map((group) => {
              const matches = searchMatches.filter((match) => match.group === group);
              if (!matches.length) return null;
              return <div key={group}><div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group}</div><div className="space-y-1">{matches.slice(0, 8).map((match) => <button type="button" key={`${match.entity.id}-${group}`} onClick={() => onSelectSearchResult(match.concept.id, match.entity.id)} className="w-full rounded-lg border border-transparent bg-white px-2.5 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50 active:scale-[0.99]"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-slate-900">{match.entity.label}</span><span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{match.concept.title}</span></div>{match.ambiguity ? <div className="mt-1.5 flex gap-1 text-[10px] leading-4 text-amber-700"><TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />{match.ambiguity}</div> : null}</button>)}</div></div>;
            })}</div> : <EmptyCatalogText>No semantic matches.</EmptyCatalogText>}
          </CatalogSection>
        ) : null}

        <CatalogSection title="Semantic Groups" count={semanticGroups.length} defaultOpen>
          <div className="grid grid-cols-2 gap-1.5">
            {semanticGroups.map((group) => <div key={group.label} className="rounded-lg border border-slate-200 bg-white p-2"><div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700">{group.icon}<span className="truncate">{group.label}</span></div><div className="mt-1 text-lg font-bold text-slate-950">{semanticEntities.filter((entity) => group.types.includes(entity.type)).length}</div></div>)}
          </div>
        </CatalogSection>

        <CatalogSection title="Concept Bundles" count={visibleBundles.length} defaultOpen>
          {visibleBundles.length ? <div className="space-y-1.5">{visibleBundles.map((bundle) => <button type="button" key={bundle.id} data-semantic-concept={bundle.id} onClick={() => onSelectConcept(bundle)} className={`w-full rounded-lg border p-3 text-left transition active:scale-[0.99] ${selectedConceptId === bundle.id ? "border-slate-950 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-400"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-950">{bundle.title}</span><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{semanticDomainLabels[bundle.domain]}</span></div><p className="mt-1 line-clamp-2 text-[10px] font-medium leading-4 text-slate-500">{bundle.summary}</p></button>)}</div> : <EmptyCatalogText>No concepts in this domain.</EmptyCatalogText>}
        </CatalogSection>

        <button type="button" onClick={onReset} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 active:scale-[0.98]"><RotateCcw className="h-3.5 w-3.5" />Reset Semantic View</button>
      </div>
    </aside>
  );
}

function CatalogSection({ title, count, defaultOpen = false, children }: { title: string; count: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className="mb-3 rounded-lg border border-slate-200 bg-slate-50"><button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"><span className="text-xs font-bold uppercase tracking-wide text-slate-600">{title}</span><span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">{count}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></span></button>{open ? <div className="border-t border-slate-200 p-2">{children}</div> : null}</section>;
}

function EmptyCatalogText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-400">{children}</div>;
}

