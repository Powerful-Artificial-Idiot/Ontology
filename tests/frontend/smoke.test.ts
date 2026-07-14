import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("frontend smoke baseline", () => {
  it("retains all three explorer entry points", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("GraphExplorer");
    expect(app).toContain("OntologyExplorer");
    expect(app).toContain("SemanticExplorerPage");
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
});
