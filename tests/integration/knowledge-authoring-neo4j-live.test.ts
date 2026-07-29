import neo4j from "neo4j-driver";
import { describe, expect, it } from "vitest";
import type { AgentAuthorizationContext, KnowledgeRepository } from "../../packages/knowledge-contracts/src/index";
import {
  InMemoryKnowledgeAuthoringStore,
  KnowledgeAuthoringService,
  KnowledgeAuthoringValidator,
  Neo4jKnowledgeAuthoringPublicationStore,
} from "../../packages/knowledge-authoring/src/index";
import { Neo4jKnowledgeRepository } from "../../packages/neo4j-repository/src/index";

const enabled = process.env.MKG_NEO4J_TEST === "1";

describe.runIf(enabled)("Phase 5E Neo4j authoring live acceptance", () => {
  it("publishes an approved entity-relation change atomically with static templates", async () => {
    const options = {
      uri: process.env.MKG_NEO4J_URI ?? "bolt://127.0.0.1:7687",
      username: process.env.MKG_NEO4J_USERNAME ?? "neo4j",
      password: process.env.MKG_NEO4J_PASSWORD ?? "development-password",
      database: process.env.MKG_NEO4J_DATABASE ?? "neo4j",
    };
    const driver = neo4j.driver(options.uri, neo4j.auth.basic(options.username, options.password), { disableLosslessIntegers: true });
    const repository: KnowledgeRepository = new Neo4jKnowledgeRepository({ ...options, driver });
    const store = new InMemoryKnowledgeAuthoringStore();
    await store.initialize();
    const publication = new Neo4jKnowledgeAuthoringPublicationStore({ driver, repository, database: options.database });
    const validator = new KnowledgeAuthoringValidator({ repository, store });
    const service = new KnowledgeAuthoringService({ store, validator, publication });
    const cleanup = driver.session({ database: options.database });
    await cleanup.run("MATCH (entity:KnowledgeEntity) WHERE entity.id IN $ids DETACH DELETE entity", { ids: ["operation.phase5e-live", "machine.phase5e-live"] });
    await cleanup.close();
    try {
      const draft = await service.createDraft({
        title: "Phase 5E Neo4j live publication",
        domain: "production",
        entityMutations: [
          { operation: "create", canonicalId: "operation.phase5e-live", canonicalType: "Operation", proposedVersion: "1.0", properties: { label: "Phase 5E Operation", description: "Live acceptance", status: "active", owner: "Test", operationCode: "P5E" }, ownershipMode: "manual" },
          { operation: "create", canonicalId: "machine.phase5e-live", canonicalType: "Machine", proposedVersion: "1.0", properties: { label: "Phase 5E Machine", description: "Live acceptance", status: "active", owner: "Test", machineCode: "P5E-M" }, ownershipMode: "manual" },
        ],
        relationMutations: [{ operation: "create", canonicalId: "relation.phase5e-live.executed-by", relationType: "executedBy", sourceCanonicalId: "operation.phase5e-live", targetCanonicalId: "machine.phase5e-live", proposedVersion: "1.0" }],
      }, command("create"));
      await service.submit(draft.id, command("submit"));
      await service.approve(draft.id, command("approve"));
      const published = await service.publish(draft.id, command("publish"));
      expect(published.status).toBe("published");
      expect(published.publicationResult).toMatchObject({ target: "neo4j", status: "published" });
      expect(await repository.getEntityById("operation.phase5e-live")).toMatchObject({ type: "Operation", version: "1.0" });
      expect((await repository.getEntityRelations("operation.phase5e-live")).map((relation) => relation.id)).toContain("relation.phase5e-live.executed-by");

      const entityRevision = await service.createDraft({
        title: "Update Phase 5E machine",
        domain: "production",
        entityMutations: [{ operation: "update", canonicalId: "machine.phase5e-live", canonicalType: "Machine", expectedCurrentVersion: "1.0", proposedVersion: "1.1", changedProperties: { description: "Governed Neo4j revision", owner: "Test" } }],
      }, command("entity-update"));
      await service.submit(entityRevision.id, command("entity-update-submit"));
      await service.approve(entityRevision.id, command("entity-update-approve"));
      await service.publish(entityRevision.id, command("entity-update-publish"));
      expect(await repository.getEntityById("machine.phase5e-live")).toMatchObject({ version: "1.1", description: "Governed Neo4j revision" });

      const relationRevision = await service.createDraft({
        title: "Update Phase 5E relation",
        domain: "production",
        relationMutations: [{ operation: "update", canonicalId: "relation.phase5e-live.executed-by", relationType: "executedBy", expectedCurrentVersion: "1.0", proposedVersion: "1.1", changedProperties: { annotation: "Neo4j relation revision" } }],
      }, command("relation-update"));
      await service.submit(relationRevision.id, command("relation-update-submit"));
      await service.approve(relationRevision.id, command("relation-update-approve"));
      await service.publish(relationRevision.id, command("relation-update-publish"));
      expect(await repository.getRelationById?.("relation.phase5e-live.executed-by")).toMatchObject({ version: "1.1", properties: { annotation: "Neo4j relation revision" } });

      const relationDeactivation = await service.createDraft({
        title: "Deactivate Phase 5E relation",
        domain: "production",
        relationMutations: [{ operation: "deactivate", canonicalId: "relation.phase5e-live.executed-by", relationType: "executedBy", expectedCurrentVersion: "1.1", proposedVersion: "1.2", reason: "Live soft-deactivation acceptance" }],
      }, command("relation-deactivate"));
      await service.submit(relationDeactivation.id, command("relation-deactivate-submit"));
      await service.approve(relationDeactivation.id, command("relation-deactivate-approve"));
      await service.publish(relationDeactivation.id, command("relation-deactivate-publish"));
      expect(await repository.getRelationById?.("relation.phase5e-live.executed-by")).toMatchObject({ version: "1.2", status: "inactive" });
    } finally {
      const session = driver.session({ database: options.database });
      await session.run("MATCH (entity:KnowledgeEntity) WHERE entity.id IN $ids DETACH DELETE entity", { ids: ["operation.phase5e-live", "machine.phase5e-live"] });
      await session.close();
      await driver.close();
    }
  });
});

function command(key: string) { return { authorization: admin(), idempotencyKey: `phase5e-neo4j.${key}` }; }
function admin(): AgentAuthorizationContext { return { principal: { id: "phase5e-live-admin", tenantId: "tenant.demo-manufacturing", roleIds: ["demo-knowledge-admin"], domainIds: ["*"], objectIds: ["*"], authenticationMethod: "static-bearer" }, authenticatedAt: "2026-07-29T00:00:00.000Z", requestId: "phase5e-neo4j-live" }; }
