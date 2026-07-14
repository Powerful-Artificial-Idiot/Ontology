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
});
