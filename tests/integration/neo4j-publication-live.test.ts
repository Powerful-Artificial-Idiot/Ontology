import { describe, expect, it } from "vitest";
import type { CanonicalMutation } from "../../packages/knowledge-contracts/src/index";
import { Neo4jCanonicalPublicationStore } from "../../packages/neo4j-repository/src/index";

const enabled = process.env.MKG_NEO4J_TEST === "1";

describe.runIf(enabled)("Neo4j publication live acceptance", () => {
  it("publishes and verifies governed entities and a relation with static templates", async () => {
    const store = new Neo4jCanonicalPublicationStore({
      uri: process.env.MKG_NEO4J_URI ?? "bolt://127.0.0.1:7687",
      username: process.env.MKG_NEO4J_USERNAME ?? "neo4j",
      password: process.env.MKG_NEO4J_PASSWORD,
      authDisabled: process.env.MKG_NEO4J_AUTH_DISABLED === "true",
      database: process.env.MKG_NEO4J_DATABASE ?? "neo4j",
      allowedTypes: ["mfg:Operation", "mfg:Machine"],
      allowedPredicates: ["mfg:executedBy"],
    });
    const mutations: CanonicalMutation[] = [entity("operation.phase5d-live", "mfg:Operation"), entity("machine.phase5d-live", "mfg:Machine"), relation()];
    try {
      expect((await store.stage("run.phase5d.neo4j-live", mutations)).staged).toBeGreaterThanOrEqual(0);
      await store.publish("run.phase5d.neo4j-live");
      expect((await store.verify("run.phase5d.neo4j-live")).verified).toBe(true);
      await store.stage("run.phase5d.neo4j-live-replay", mutations);
      expect((await store.publish("run.phase5d.neo4j-live-replay")).published).toBe(0);
      expect((await store.verify("run.phase5d.neo4j-live-replay")).verified).toBe(true);
      const published = await store.listPublished();
      expect(published.some((item) => item.canonicalId === "operation.phase5d-live")).toBe(true);
      expect(published.some((item) => item.canonicalId === "relation.phase5d-live.executed-by")).toBe(true);
    } finally { await store.close(); }
  });
});

function entity(id: string, type: string): CanonicalMutation { return { id: `mutation.${id}.v1`, kind: "entity-upsert", tenantId: "tenant.demo-manufacturing", domainId: "production", canonicalId: id, canonicalType: type, proposedVersion: "phase5d-v1", contentHash: `sha256:${id.startsWith("operation") ? "b" : "c".repeat(64)}`.replace("b", "b".repeat(64)), properties: { fixture: true } }; }
function relation(): CanonicalMutation { return { id: "mutation.relation.phase5d-live.executed-by.v1", kind: "relation-upsert", tenantId: "tenant.demo-manufacturing", domainId: "production", canonicalId: "relation.phase5d-live.executed-by", relation: { sourceId: "operation.phase5d-live", targetId: "machine.phase5d-live", predicate: "mfg:executedBy", label: "executedBy" }, proposedVersion: "phase5d-v1", contentHash: `sha256:${"d".repeat(64)}`, properties: { fixture: true } }; }
