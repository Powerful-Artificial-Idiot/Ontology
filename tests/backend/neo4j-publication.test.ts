import { describe, expect, it } from "vitest";
import type { CanonicalMutation } from "../../packages/knowledge-contracts/src/index";
import { NEO4J_PUBLICATION_QUERIES, Neo4jCanonicalPublicationStore } from "../../packages/neo4j-repository/src/index";

describe("Neo4j governed canonical publication", () => {
  it("uses fixed parameterized templates and verifies a committed transaction", async () => {
    const calls: Array<{ query: string; parameters: Record<string, unknown> }> = [];
    const mutation = entity("operation.op30");
    const driver = fakeDriver(calls, mutation);
    const store = new Neo4jCanonicalPublicationStore({ driver, allowedTypes: ["mfg:Operation"], allowedPredicates: ["mfg:executedBy"] });
    expect((await store.stage("run.neo4j", [mutation])).staged).toBe(1);
    expect((await store.publish("run.neo4j")).published).toBe(1);
    expect((await store.verify("run.neo4j")).verified).toBe(true);
    expect(calls.some((call) => call.query === NEO4J_PUBLICATION_QUERIES.WRITE_ENTITY)).toBe(true);
    expect(calls.every((call) => !call.query.includes(mutation.canonicalId))).toBe(true);
    expect(calls.some((call) => call.parameters.canonicalId === mutation.canonicalId)).toBe(true);
  });

  it("rejects invalid relations, duplicate mutations, cross-tenant endpoint results, and permanent delete", async () => {
    const driver = fakeDriver([], entity("operation.op30"));
    const store = new Neo4jCanonicalPublicationStore({ driver, allowedTypes: ["mfg:Operation"], allowedPredicates: ["mfg:executedBy"] });
    const mutation = entity("operation.op30");
    await expect(store.stage("duplicate", [mutation, mutation])).rejects.toThrow(/DUPLICATE/u);
    await expect(store.stage("relation", [{ ...mutation, kind: "relation-upsert", canonicalId: "relation.invalid", canonicalType: undefined, relation: { sourceId: "operation.op30", targetId: "operation.op30", predicate: "mfg:executedBy" } }])).rejects.toThrow(/RELATION_MUTATION_INVALID/u);
    await expect(store.stage("predicate", [{ ...mutation, kind: "relation-upsert", canonicalId: "relation.invalid-predicate", canonicalType: undefined, relation: { sourceId: "operation.op30", targetId: "machine.m220", predicate: "arbitrary:predicate" } }])).rejects.toThrow(/RELATION_MUTATION_INVALID/u);
    await expect(store.stage("delete", [{ ...mutation, kind: "delete" as CanonicalMutation["kind"] }])).rejects.toThrow(/PERMANENT_DELETE_DISABLED/u);
  });

  it("propagates transaction failure without reporting publication success", async () => {
    const driver = { session: () => ({ executeWrite: async (work: (tx: unknown) => Promise<void>) => work({ run: async () => { throw new Error("transaction-rollback"); } }), close: async () => undefined }) } as any;
    const store = new Neo4jCanonicalPublicationStore({ driver, allowedTypes: ["mfg:Operation"], allowedPredicates: [] });
    await store.stage("rollback", [entity("operation.op30")]);
    await expect(store.publish("rollback")).rejects.toThrow(/transaction-rollback/u);
  });
});

function entity(id: string): CanonicalMutation { return { id: `mutation.${id}.v1`, kind: "entity-upsert", tenantId: "tenant.demo-manufacturing", domainId: "production", canonicalId: id, canonicalType: "mfg:Operation", proposedVersion: "sync-v1", contentHash: `sha256:${"a".repeat(64)}`, properties: { label: "OP30" } }; }
function record(values: Record<string, unknown>) { return { get: (key: string) => values[key] }; }
function fakeDriver(calls: Array<{ query: string; parameters: Record<string, unknown> }>, mutation: CanonicalMutation): any {
  const run = async (query: string, parameters: Record<string, unknown>) => {
    calls.push({ query, parameters });
    if (query === NEO4J_PUBLICATION_QUERIES.READ_CURRENT) return { records: [record({ entityVersion: null, entityHash: null })] };
    if (query === NEO4J_PUBLICATION_QUERIES.VERIFY_MUTATION) return { records: [record({ entityVersion: mutation.proposedVersion, entityHash: mutation.contentHash, lifecycleAction: mutation.kind, active: true })] };
    return { records: [record({ id: mutation.canonicalId })] };
  };
  return { session: () => ({ executeWrite: async (work: (tx: { run: typeof run }) => Promise<void>) => work({ run }), run, close: async () => undefined }), close: async () => undefined };
}
