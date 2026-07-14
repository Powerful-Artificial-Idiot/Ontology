import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { buildExplorerUrl, pageRoute, parseExplorerLocation, type ExplorerRoute } from "./router/explorerRouter";
import type { AppPage } from "./types";

const RouteExplorerPage = lazy(() => import("./pages/RouteExplorerPage"));
const OntologyExplorer = lazy(() => import("./pages/OntologyExplorer"));
const SemanticExplorerPage = lazy(() =>
  import("./features/semantic/SemanticExplorerPage").then((module) => ({ default: module.SemanticExplorerPage })),
);

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

  return (
    <Suspense fallback={<ExplorerLoadingFallback />}>
      {route.page === "route" ? (
        <RouteExplorerPage activePage="route" onPageChange={handlePageChange} route={route} onRouteChange={navigate} />
      ) : route.page === "ontology" ? (
        <OntologyExplorer activePage="ontology" onPageChange={handlePageChange} route={route} onRouteChange={navigate} />
      ) : (
        <SemanticExplorerPage activePage="semantic" onPageChange={handlePageChange} route={route} onRouteChange={navigate} />
      )}
    </Suspense>
  );
}

function ExplorerLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 px-6">
      <div className="rounded-lg border border-slate-200 bg-white px-8 py-6 text-center shadow-sm">
        <div className="mx-auto mb-3 h-2 w-14 animate-pulse rounded-full bg-slate-500" />
        <div className="text-sm font-bold text-slate-950">Loading explorer</div>
        <div className="mt-1 text-xs font-medium text-slate-500">Preparing the requested knowledge view.</div>
      </div>
    </div>
  );
}
