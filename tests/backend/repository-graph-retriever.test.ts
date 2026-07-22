import { describe, expect, it } from "vitest";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { InMemoryCanonicalGraphRetriever, RepositoryGraphRetriever } from "../../packages/agent-core/src/index";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("RepositoryGraphRetriever", () => {
  it("keeps MockKnowledgeRepository semantically equivalent to the canonical retriever", async () => {
    const plan = leakRateQualityIssueTraceBaseline.graphQueryPlan;
    const canonical = await new InMemoryCanonicalGraphRetriever().retrieve(plan, leakRateQualityIssueTraceBaseline);
    const repository = await new RepositoryGraphRetriever(new MockKnowledgeRepository()).retrieve(plan, leakRateQualityIssueTraceBaseline);

    expect(repository.repositoryType).toBe("mock");
    expect(repository.entities.map((entity) => entity.id).sort()).toEqual(canonical.entities.map((entity) => entity.id).sort());
    expect(repository.relations.map((relation) => relation.id).sort()).toEqual(canonical.relations.map((relation) => relation.id).sort());
  });

  it("rejects repository output outside the validated relation allowlist", async () => {
    const unsafeRepository = {
      async traverseGraph() {
        return {
          metadata: { contractVersion: "1.1.0", ontologyVersion: "1.1.0", dataVersion: "1.0.0", traceId: "unsafe", generatedAt: new Date().toISOString() },
          graphPlanId: leakRateQualityIssueTraceBaseline.graphQueryPlan.graphPlanId,
          templateId: leakRateQualityIssueTraceBaseline.graphQueryPlan.templateId,
          repositoryType: "mock" as const,
          entities: leakRateQualityIssueTraceBaseline.entities,
          relations: [{ id: "unsafe", sourceId: "operation.op30", targetId: "machine.m220", predicate: "unsafe", label: "unapprovedRelation" }],
        };
      },
    } as MockKnowledgeRepository;

    await expect(new RepositoryGraphRetriever(unsafeRepository).retrieve(leakRateQualityIssueTraceBaseline.graphQueryPlan, leakRateQualityIssueTraceBaseline)).rejects.toMatchObject({
      detail: { code: "QUERY_PLAN_INVALID", stage: "graph-retrieval" },
    });
  });
});
