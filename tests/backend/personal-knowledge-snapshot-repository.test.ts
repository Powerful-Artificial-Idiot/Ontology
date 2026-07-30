import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computePersonalSnapshotContentHash,
  parsePersonalKnowledgeSnapshot,
  PERSONAL_KNOWLEDGE_SCHEMA_SHA256,
  runPersonalKnowledgeQuery,
  SnapshotKnowledgeRepository,
  type PersonalKnowledgeSnapshot,
  type SnapshotProvenance,
} from "../../packages/snapshot-knowledge-repository/src/index";

function provenance(contentId: string, sourcePath: string): SnapshotProvenance {
  return {
    contentId,
    sourcePath,
    sourceUrl: `https://example.test/${contentId.replaceAll(".", "/")}`,
    contentHash: "a".repeat(64),
    visibility: "public",
    collection: sourcePath.split("/")[2] ?? "content",
    idSource: "explicit",
    extractedFields: ["title"],
  };
}

const snapshotWithoutHash: Omit<PersonalKnowledgeSnapshot, "contentHash"> = {
  schemaVersion: "0.1.0",
  generator: { name: "personal-knowledge-snapshot-builder", version: "0.1.0" },
  generatedAt: "2026-07-30T00:00:00.000Z",
  sourceCommit: "a".repeat(40),
  canonicalIdentity: { explicitIdCount: 5, fallbackIdCount: 0, fallbackIds: [] },
  diagnostics: { warnings: [], errors: [] },
  objects: [
    { id: "person.zhiyuan-zhang", type: "person", title: "Zhiyuan Zhang", sourcePath: "src/content/pages/about.md", provenance: provenance("person.zhiyuan-zhang", "src/content/pages/about.md") },
    { id: "concept.knowledge-engineering", type: "concept", title: "Knowledge Engineering", slug: "knowledge-engineering", sourcePath: "src/content/topics/knowledge-engineering.md", provenance: provenance("concept.knowledge-engineering", "src/content/topics/knowledge-engineering.md") },
    { id: "document.knowledge-system", type: "document", title: "Knowledge System", summary: "A governed knowledge engineering article.", sourcePath: "src/content/essays/knowledge-system.md", provenance: provenance("document.knowledge-system", "src/content/essays/knowledge-system.md") },
    { id: "project.manufacturing-graph-explorer", type: "project", title: "Manufacturing Graph Explorer", summary: "A knowledge graph project.", sourcePath: "src/content/projects/manufacturing-graph-explorer.md", provenance: provenance("project.manufacturing-graph-explorer", "src/content/projects/manufacturing-graph-explorer.md") },
    { id: "reference.example-paper", type: "reference", title: "Example Paper", sourcePath: "src/content/reading/example-paper.md", provenance: provenance("reference.example-paper", "src/content/reading/example-paper.md") },
  ],
  relations: [],
};

function relation(id: string, type: PersonalKnowledgeSnapshot["relations"][number]["type"], from: string, to: string, sourceDocumentId: string, sourcePath: string) {
  return { id, type, from, to, sourceDocumentId, sourcePath, confidence: "explicit" as const, provenance: provenance(sourceDocumentId, sourcePath) };
}

snapshotWithoutHash.relations = [
  relation("relation.interested-in.person-knowledge", "INTERESTED_IN", "person.zhiyuan-zhang", "concept.knowledge-engineering", "person.zhiyuan-zhang", "src/content/pages/about.md"),
  relation("relation.about.document-knowledge", "ABOUT", "document.knowledge-system", "concept.knowledge-engineering", "document.knowledge-system", "src/content/essays/knowledge-system.md"),
  relation("relation.about.project-knowledge", "ABOUT", "project.manufacturing-graph-explorer", "concept.knowledge-engineering", "project.manufacturing-graph-explorer", "src/content/projects/manufacturing-graph-explorer.md"),
  relation("relation.building.person-project", "BUILDING", "person.zhiyuan-zhang", "project.manufacturing-graph-explorer", "project.manufacturing-graph-explorer", "src/content/projects/manufacturing-graph-explorer.md"),
  relation("relation.supported-by.document-reference", "SUPPORTED_BY", "document.knowledge-system", "reference.example-paper", "document.knowledge-system", "src/content/essays/knowledge-system.md"),
];

const snapshotSeed = { ...snapshotWithoutHash, contentHash: "0".repeat(64) } as PersonalKnowledgeSnapshot;
const snapshot: PersonalKnowledgeSnapshot = { ...snapshotSeed, contentHash: computePersonalSnapshotContentHash(snapshotSeed) };

function withValidHash(value: PersonalKnowledgeSnapshot): PersonalKnowledgeSnapshot {
  return { ...value, contentHash: computePersonalSnapshotContentHash(value) };
}

describe("SnapshotKnowledgeRepository", () => {
  const repository = new SnapshotKnowledgeRepository(snapshot);

  it("supports canonical lookup and deterministic search", () => {
    expect(repository.getById("concept.knowledge-engineering")?.title).toBe("Knowledge Engineering");
    expect(repository.search("knowledge engineering").map((item) => item.id)).toContain("concept.knowledge-engineering");
  });

  it("supports neighbors and relation filtering", () => {
    const neighbors = repository.neighbors("concept.knowledge-engineering", { direction: "incoming", relationTypes: ["ABOUT"] });
    expect(neighbors.objects.map((item) => item.id)).toEqual(["document.knowledge-system", "project.manufacturing-graph-explorer"]);
    expect(neighbors.relations.every((item) => item.type === "ABOUT")).toBe(true);
  });

  it("projects document-to-concept and concept-to-project paths", () => {
    expect(repository.getDocumentKnowledge("document.knowledge-system").objects.map((item) => item.id)).toEqual(["concept.knowledge-engineering", "reference.example-paper"]);
    expect(repository.getConceptKnowledge("concept.knowledge-engineering").objects.map((item) => item.id)).toContain("project.manufacturing-graph-explorer");
  });

  it("runs Query Plan through Evidence Pack and citation validation while preserving provenance", async () => {
    const result = await runPersonalKnowledgeQuery(repository, "Show content related to Knowledge Engineering.");
    expect(result.evidencePack.items.map((item) => item.source.locator)).toEqual(expect.arrayContaining([
      "src/content/essays/knowledge-system.md",
      "src/content/projects/manufacturing-graph-explorer.md",
    ]));
    expect(result.entities.every((entity) => entity.source?.[0]?.sourceSystem === "personal-website")).toBe(true);
    expect(result.citationValidation.status).toBe("passed");
  });

  it("does not invent a belief absent from the governed snapshot", async () => {
    const result = await runPersonalKnowledgeQuery(repository, "What do I currently believe about language and concept space?");
    expect(result.entities).toEqual([]);
    expect(result.answer.claims[0]).toMatchObject({ classification: "unknown", citations: [] });
    expect(result.citationValidation.status).toBe("passed");
  });
});

describe("versioned snapshot fail-closed validation", () => {
  it("accepts compatible minor versions and unknown optional fields", () => {
    const compatible = withValidHash({ ...snapshot, schemaVersion: "0.2.0", futureOptionalField: true } as PersonalKnowledgeSnapshot);
    expect((parsePersonalKnowledgeSnapshot(compatible) as PersonalKnowledgeSnapshot & { futureOptionalField: boolean }).futureOptionalField).toBe(true);
  });

  it("rejects an unsupported major version", () => {
    expect(() => parsePersonalKnowledgeSnapshot({ ...snapshot, schemaVersion: "1.0.0" })).toThrow("Unsupported snapshot schema major version");
  });

  it("rejects an invalid schema with a missing required field", () => {
    const invalid = { ...snapshot } as Partial<PersonalKnowledgeSnapshot>;
    delete invalid.generator;
    expect(() => parsePersonalKnowledgeSnapshot(invalid)).toThrow("schema validation failed");
  });

  it("rejects a duplicate canonical ID", () => {
    const invalid = withValidHash({ ...snapshot, objects: [...snapshot.objects, snapshot.objects[0]] });
    expect(() => parsePersonalKnowledgeSnapshot(invalid)).toThrow("Duplicate object ID");
  });

  it("rejects a dangling relation", () => {
    const invalid = withValidHash({ ...snapshot, relations: [{ ...snapshot.relations[0], to: "concept.missing" }] });
    expect(() => parsePersonalKnowledgeSnapshot(invalid)).toThrow("Dangling relation");
  });

  it("rejects a content hash mismatch", () => {
    expect(() => parsePersonalKnowledgeSnapshot({ ...snapshot, contentHash: "f".repeat(64) })).toThrow("content hash mismatch");
  });

  it("rejects missing provenance", () => {
    const object = { ...snapshot.objects[0] } as Partial<PersonalKnowledgeSnapshot["objects"][number]>;
    delete object.provenance;
    const invalid = { ...snapshot, objects: [object, ...snapshot.objects.slice(1)] };
    expect(() => parsePersonalKnowledgeSnapshot(invalid)).toThrow("schema validation failed");
  });

  it("rejects non-empty governance errors", () => {
    const invalid = withValidHash({ ...snapshot, diagnostics: { warnings: [], errors: [{ severity: "error", code: "fixture", message: "blocked" }] } });
    expect(() => parsePersonalKnowledgeSnapshot(invalid)).toThrow("contains validation errors");
  });
});

const actualSnapshotPath = resolve(process.cwd(), "../personal website/generated/knowledge-snapshot.json");
const canonicalSchemaPath = resolve(process.cwd(), "../personal website/schemas/personal-knowledge-snapshot/0.1.0.schema.json");
describe.skipIf(!existsSync(actualSnapshotPath))("Astro snapshot integration", () => {
  it("loads the real generated snapshot and answers all three governed queries", async () => {
    const repository = SnapshotKnowledgeRepository.fromFile(actualSnapshotPath);
    const results = await Promise.all([
      runPersonalKnowledgeQuery(repository, "Show content related to Knowledge Engineering."),
      runPersonalKnowledgeQuery(repository, "What projects demonstrate my interest in knowledge graphs?"),
      runPersonalKnowledgeQuery(repository, "What do I currently believe about language and concept space?"),
    ]);
    expect(results.every((result) => result.citationValidation.status === "passed")).toBe(true);
    expect(results[0].entities.some((entity) => entity.type === "document")).toBe(true);
    expect(results[1].entities.map((entity) => entity.id)).toContain("project.manufacturing-graph-explorer");
    expect(results[2].answer.claims[0].classification).toBe("unknown");
  });

  it.skipIf(!existsSync(canonicalSchemaPath))("pins a byte-identical copy of the canonical producer schema", () => {
    const canonical = readFileSync(canonicalSchemaPath);
    const controlled = readFileSync(resolve(process.cwd(), "packages/snapshot-knowledge-repository/schemas/0.1.0.schema.json"));
    expect(controlled.equals(canonical)).toBe(true);
    expect(createHash("sha256").update(controlled).digest("hex")).toBe(PERSONAL_KNOWLEDGE_SCHEMA_SHA256);
  });
});
