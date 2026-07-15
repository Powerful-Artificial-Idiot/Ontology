import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("frontend smoke baseline", () => {
  it("retains all explorer and agent entry points", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("RouteExplorerPage");
    expect(app).toContain("OntologyExplorer");
    expect(app).toContain("SemanticExplorerPage");
    expect(app).toContain("AgentDemoPage");
    expect(app).toContain("lazy(");
    expect(existsSync("src/pages/RouteExplorerPage.tsx")).toBe(true);
    expect(existsSync("index.html")).toBe(true);
  });

  it("keeps Semantic Explorer behind the repository boundary", () => {
    const page = readFileSync("src/features/semantic/SemanticExplorerPage.tsx", "utf8");
    expect(page).toContain("getSemanticCatalog");
    expect(page).toContain("Loading semantic catalog");
    expect(page).toContain("Semantic catalog is empty");
    expect(page).toContain("Semantic catalog unavailable");
    expect(page).not.toContain("legacyDemoData");
  });

  it("keeps Ontology Explorer behind the repository boundary", () => {
    const page = readFileSync("src/features/ontology/OntologyExplorerPage.tsx", "utf8");
    expect(page).toContain("getOntologyGraph");
    expect(page).toContain("Loading ontology graph");
    expect(page).toContain("Ontology graph unavailable");
    expect(page).not.toContain("legacyDemoData");
    expect(page).not.toContain("ontologyArtifactAdapter");
    expect(page).not.toContain("ontologySourceData");
  });

  it("keeps Route Explorer behind the repository boundary", () => {
    const page = readFileSync("src/pages/RouteExplorerPage.tsx", "utf8");
    expect(page).toContain("getGraphView");
    expect(page).toContain("Loading route graph");
    expect(page).toContain("Route graph unavailable");
    expect(page).not.toContain("legacyDemoData");
  });

  it("keeps page-level bundles lazy and independently reversible", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('import("./pages/RouteExplorerPage")');
    expect(app).toContain('import("./pages/OntologyExplorer")');
    expect(app).toContain('import("./features/semantic/SemanticExplorerPage")');
    expect(app).toContain('import("./features/agent-demo/AgentDemoPage")');
    expect(app).not.toContain("reactflow");
  });
});
