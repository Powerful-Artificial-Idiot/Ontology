import { describe, expect, it } from "vitest";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { RepositoryGraphRetriever, createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import { Neo4jKnowledgeRepository, seedLeakRateCanonicalBaselineWithCredentials } from "../../packages/neo4j-repository/src/index";

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
      const pipeline = createDeterministicAgentPipeline({ graphRetriever: new RepositoryGraphRetriever(repository) });
      const response = await pipeline.run({ ...leakRateQualityIssueTraceBaseline.request, requestId: "request.neo4j-live", mode: "live" });
      expect(response.status).toBe("completed");
      expect(response.citationValidation.status).toBe("passed");
      expect(response.trace.stages.find((stage) => stage.stage === "graph-retrieval")?.summary).toContain("neo4j");
    } finally {
      await repository.close();
    }
  });
});
