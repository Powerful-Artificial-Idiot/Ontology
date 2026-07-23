import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const artifactRoot = "packages/demo-data/ontology/generated";
const manifest = JSON.parse(readFileSync(`${artifactRoot}/manifest.json`, "utf8")) as {
  ontologyVersion: string;
  counts: { classes: number; properties: number; relations: number; modules: number };
  files: Array<{ path: string; sha256: string }>;
};

describe("TTL-derived ontology artifact", () => {
  it("has stable governed counts and version metadata", () => {
    expect(manifest.ontologyVersion).toBe("1.2.0");
    expect(manifest.counts).toEqual({ classes: 66, modules: 8, properties: 200, relations: 54 });
  });

  it("matches every declared checksum", () => {
    for (const file of manifest.files) {
      const digest = createHash("sha256").update(readFileSync(`${artifactRoot}/${file.path}`)).digest("hex");
      expect(digest, file.path).toBe(file.sha256);
    }
  });

  it("contains no canvas layout fields", () => {
    const forbidden = new Set(["position", "x", "y", "lane", "column", "color", "thumbnail", "visualType", "viewMetadata"]);
    for (const file of manifest.files) {
      const payload = JSON.parse(readFileSync(`${artifactRoot}/${file.path}`, "utf8"));
      expect(findForbiddenKeys(payload, forbidden), file.path).toEqual([]);
    }
  });
});

function findForbiddenKeys(value: unknown, forbidden: Set<string>): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => findForbiddenKeys(item, forbidden));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbidden.has(key) ? [key] : []),
    ...findForbiddenKeys(child, forbidden),
  ]);
}
