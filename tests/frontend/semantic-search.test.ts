import { describe, expect, it } from "vitest";
import { searchSemanticCatalog } from "../../src/features/semantic/semanticUtils";

describe("Semantic Explorer search", () => {
  it("returns governed Leak Rate fields and evidence", () => {
    const results = searchSemanticCatalog("leak");
    expect(results.some((result) => result.entity.label === "Leak Rate")).toBe(true);
    expect(results.some((result) => result.entity.label === "QMS.inspection_result.leak_rate")).toBe(true);
    expect(results.some((result) => result.group === "Evidence Documents")).toBe(true);
  });

  it("keeps the CT ambiguity explicit", () => {
    const results = searchSemanticCatalog("CT");
    expect(new Set(results.map((result) => result.concept.id))).toEqual(new Set(["cycle-time", "ctq"]));
    expect(results.every((result) => result.ambiguity)).toBe(true);
  });
});
