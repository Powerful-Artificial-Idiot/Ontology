import type { AppPage, ViewMode } from "../types";

interface HeaderProps {
  activePage: AppPage;
  viewMode?: ViewMode;
  searchKeyword: string;
  searchSummary: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  onPageChange: (page: AppPage) => void;
  onViewModeChange?: (viewMode: ViewMode) => void;
  onSearchChange: (keyword: string) => void;
}

const viewOptions: Array<{ value: ViewMode; label: string }> = [
  { value: "production", label: "Production" },
  { value: "quality", label: "Quality" },
  { value: "engineering", label: "Engineering" },
  { value: "valueStream", label: "Value Stream" },
];

export function Header({
  activePage,
  viewMode,
  searchKeyword,
  searchSummary,
  searchPlaceholder = "Search material, operation, machine, fixture, CTQ, document...",
  showSearch = true,
  onPageChange,
  onViewModeChange,
  onSearchChange,
}: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <div className="min-w-[240px] shrink-0">
        <div className="text-lg font-bold text-slate-950">Manufacturing Graph Explorer</div>
        <div className="text-xs font-semibold text-slate-500">Manufacturing Graph Explorer v0.1</div>
      </div>

      <nav className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-100 p-1">
        {[
          { value: "route" as const, label: "Route Explorer" },
          { value: "ontology" as const, label: "Ontology Explorer" },
          { value: "semantic" as const, label: "Semantic Explorer" },
          { value: "agent" as const, label: "Agent Demo" },
        ].map((page) => (
          <button
            key={page.value}
            onClick={() => onPageChange(page.value)}
            className={[
              "whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-semibold transition",
              activePage === page.value
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-900",
            ].join(" ")}
          >
            {page.label}
          </button>
        ))}
      </nav>

      {showSearch ? (
        <div className="relative min-w-[180px] flex-1">
          <input
            value={searchKeyword}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-500 focus:bg-white"
          />
          {searchSummary && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
              {searchSummary}
            </div>
          )}
        </div>
      ) : <div className="min-w-6 flex-1" />}

      {activePage === "route" && viewMode && onViewModeChange ? (
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
          {viewOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onViewModeChange(option.value)}
              className={[
                "whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-semibold transition",
                viewMode === option.value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              ].join(" ")}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
          {activePage === "semantic" ? "Semantic Layer" : activePage === "agent" ? "Agent Runtime" : "Schema Layer"}
        </span>
      )}

      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
        v0.1
      </span>
    </header>
  );
}
