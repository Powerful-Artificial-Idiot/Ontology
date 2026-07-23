import { describe, expect, it } from "vitest";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { RepositoryGraphRetriever, createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import {
  Neo4jKnowledgeRepository,
  QUALITY_RICH_TEMPLATE_IDS,
  seedLeakRateCanonicalBaselineWithCredentials,
} from "../../packages/neo4j-repository/src/index";
import { createDefaultGovernedDocumentRetriever } from "../../services/agent-api/governedDocumentEvidence";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

const enabled = process.env.MKG_NEO4J_TEST === "1";

describe.runIf(enabled)("Neo4j live acceptance", () => {
  it("seeds and retrieves the Leak Rate scenario through the full pipeline", async () => {
    const options = {
      uri: process.env.MKG_NEO4J_URI ?? "bolt://127.0.0.1:7687",
      username: process.env.MKG_NEO4J_USERNAME ?? "neo4j",
      password: process.env.MKG_NEO4J_PASSWORD ?? "development-password",
      database: process.env.MKG_NEO4J_DATABASE ?? "neo4j",
    };
    await seedLeakRateCanonicalBaselineWithCredentials(options);
    const repository = new Neo4jKnowledgeRepository(options);
    try {
      const pipeline = createDeterministicAgentPipeline({
        graphRetriever: new RepositoryGraphRetriever(repository),
        documentRetriever: createDefaultGovernedDocumentRetriever(),
      });
      const response = await pipeline.run({ ...leakRateQualityIssueTraceBaseline.request, requestId: "request.neo4j-live", mode: "live" });
      expect(response.status).toBe("completed");
      expect(response.citationValidation.status).toBe("passed");
      expect(response.evidencePack.items.filter((item) => item.kind === "document" || item.kind === "system-record").every((item) => item.id.startsWith("evidence-chunk.") && Boolean(item.governance))).toBe(true);
      expect(response.trace.stages.find((stage) => stage.stage === "graph-retrieval")?.summary).toContain("neo4j");
    } finally {
      await repository.close();
    }
  });

  it("keeps every rich quality template in parity between Mock and Neo4j", async () => {
    const options = {
      uri: process.env.MKG_NEO4J_URI ?? "bolt://127.0.0.1:7687",
      username: process.env.MKG_NEO4J_USERNAME ?? "neo4j",
      password: process.env.MKG_NEO4J_PASSWORD ?? "development-password",
      database: process.env.MKG_NEO4J_DATABASE ?? "neo4j",
    };
    await seedLeakRateCanonicalBaselineWithCredentials(options);
    const mockRepository = new MockKnowledgeRepository();
    const neo4jRepository = new Neo4jKnowledgeRepository(options);
    try {
      for (const templateId of QUALITY_RICH_TEMPLATE_IDS) {
        const request = {
          graphPlanId: `graph-plan.parity.${templateId.toLowerCase()}`,
          templateId,
          readOnly: true as const,
          seedEntityIds: [...leakRateQualityIssueTraceBaseline.scenario.seedEntityIds],
          allowedRelationTypes: [...leakRateQualityIssueTraceBaseline.queryPlan.relationTypes],
          maxDepth: 3,
          resultLimit: 200,
        };
        const [mockResult, neo4jResult] = await Promise.all([
          mockRepository.traverseGraph(request),
          neo4jRepository.traverseGraph(request),
        ]);

        expect(neo4jResult.templateId).toBe(templateId);
        expect(sortedIds(neo4jResult.entities)).toEqual(sortedIds(mockResult.entities));
        expect(sortedIds(neo4jResult.relations)).toEqual(sortedIds(mockResult.relations));
        expect(neo4jResult.entities.length).toBeLessThanOrEqual(request.resultLimit);

        const entityIds = new Set(neo4jResult.entities.map((entity) => entity.id));
        expect(neo4jResult.relations.every((relation) =>
          entityIds.has(relation.sourceId)
          && entityIds.has(relation.targetId)
          && request.allowedRelationTypes.includes(relation.label ?? relation.predicate),
        )).toBe(true);
      }
    } finally {
      await neo4jRepository.close();
    }
  });
});

function sortedIds(values: Array<{ id: string }>): string[] {
  return values.map((value) => value.id).sort();
}
