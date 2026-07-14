import type { AppPage, ViewMode } from "../types";

export type OntologyRouteTarget =
  | { kind: "class"; id: string }
  | { kind: "property"; id: string };

export type SemanticRouteTarget =
  | { kind: "scenario"; id: string }
  | { kind: "entity"; id: string };

export type ExplorerRoute = {
  page: AppPage;
  viewMode?: ViewMode;
  ontologyTarget?: OntologyRouteTarget;
  semanticTarget?: SemanticRouteTarget;
  selectedEntityId?: string;
  focusEntityId?: string;
  query?: string;
  invalidPath?: string;
};

const viewModes = new Set<ViewMode>(["production", "quality", "engineering", "valueStream"]);

export function parseExplorerLocation(input: Pick<Location, "pathname" | "search">): ExplorerRoute {
  const segments = input.pathname.split("/").filter(Boolean).map(decodeSegment);
  const params = new URLSearchParams(input.search);
  const shared = {
    selectedEntityId: optionalParam(params, "selected"),
    focusEntityId: optionalParam(params, "focus"),
    query: optionalParam(params, "q"),
  };

  if (segments.length === 0) return { page: "route", viewMode: "production", ...shared };
  if (segments[0] === "routes" && segments.length <= 2) {
    const requestedView = segments[1];
    if (!requestedView) return { page: "route", viewMode: "production", ...shared };
    if (viewModes.has(requestedView as ViewMode)) {
      return { page: "route", viewMode: requestedView as ViewMode, ...shared };
    }
    return { page: "route", viewMode: "production", invalidPath: input.pathname, ...shared };
  }
  if (segments[0] === "ontology") {
    if (segments.length === 1) return { page: "ontology", ...shared };
    if (segments.length === 3 && segments[1] === "classes") {
      return { page: "ontology", ontologyTarget: { kind: "class", id: segments[2] }, ...shared };
    }
    if (segments.length === 3 && segments[1] === "properties") {
      return { page: "ontology", ontologyTarget: { kind: "property", id: segments[2] }, ...shared };
    }
    return { page: "ontology", invalidPath: input.pathname, ...shared };
  }
  if (segments[0] === "semantic") {
    if (segments.length === 1) return { page: "semantic", ...shared };
    if (segments.length === 3 && segments[1] === "scenarios") {
      return { page: "semantic", semanticTarget: { kind: "scenario", id: segments[2] }, ...shared };
    }
    if (segments.length === 3 && segments[1] === "entities") {
      return { page: "semantic", semanticTarget: { kind: "entity", id: segments[2] }, ...shared };
    }
    return { page: "semantic", invalidPath: input.pathname, ...shared };
  }
  return { page: "route", viewMode: "production", invalidPath: input.pathname, ...shared };
}

export function buildExplorerUrl(route: ExplorerRoute): string {
  let pathname: string;
  if (route.page === "route") pathname = `/routes/${route.viewMode ?? "production"}`;
  else if (route.page === "ontology" && route.ontologyTarget) {
    pathname = `/ontology/${route.ontologyTarget.kind === "class" ? "classes" : "properties"}/${encodeURIComponent(route.ontologyTarget.id)}`;
  } else if (route.page === "ontology") pathname = "/ontology";
  else if (route.semanticTarget) {
    pathname = `/semantic/${route.semanticTarget.kind === "scenario" ? "scenarios" : "entities"}/${encodeURIComponent(route.semanticTarget.id)}`;
  } else pathname = "/semantic";

  const params = new URLSearchParams();
  if (route.selectedEntityId) params.set("selected", route.selectedEntityId);
  if (route.focusEntityId) params.set("focus", route.focusEntityId);
  if (route.query) params.set("q", route.query);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function pageRoute(page: AppPage): ExplorerRoute {
  if (page === "route") return { page, viewMode: "production" };
  return { page };
}

function optionalParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
