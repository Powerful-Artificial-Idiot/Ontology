import { canonicalKnowledgeBaselines } from "../../packages/demo-data/src/index";
import { RepositoryGraphRetriever, createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import { Neo4jKnowledgeRepository } from "../../packages/neo4j-repository/src/index";
import { neo4jOptionsFromEnvironment } from "./runtime";

const repository = new Neo4jKnowledgeRepository(neo4jOptionsFromEnvironment({ ...process.env, MKG_AGENT_KNOWLEDGE_MODE: "neo4j" }));
try {
  await repository.verifyConnectivity();
  const pipeline = createDeterministicAgentPipeline({ graphRetriever: new RepositoryGraphRetriever(repository) });
  for (const baseline of canonicalKnowledgeBaselines) {
    const graph = await repository.traverseGraph({
      graphPlanId: baseline.graphQueryPlan.graphPlanId,
      templateId: baseline.graphQueryPlan.templateId,
      readOnly: true,
      seedEntityIds: baseline.graphQueryPlan.seedEntityIds,
      allowedRelationTypes: baseline.graphQueryPlan.allowedRelationTypes,
      maxDepth: baseline.graphQueryPlan.maxDepth,
      resultLimit: baseline.graphQueryPlan.resultLimit,
      status: "active",
    });
    const entityIds = new Set(graph.entities.map((entity) => entity.id));
    const missingSeeds = baseline.scenario.seedEntityIds.filter((id) => !entityIds.has(id));
    if (missingSeeds.length) throw new Error(`Neo4j traversal for ${baseline.scenario.id} is missing seed entities: ${missingSeeds.join(", ")}`);

    const response = await pipeline.run({
      ...baseline.request,
      requestId: `request.neo4j.acceptance.${baseline.scenario.id}`,
      mode: "live",
    });
    const graphStage = response.trace.stages.find((stage) => stage.stage === "graph-retrieval");
    if (!graphStage?.summary.includes("neo4j")) throw new Error(`Pipeline trace for ${baseline.scenario.id} did not identify the Neo4j repository.`);
    if (response.citationValidation.status !== "passed") throw new Error(`Citation validation failed for ${baseline.scenario.id}.`);
    console.info(`Neo4j acceptance passed for ${baseline.scenario.id}: ${graph.entities.length} entities, ${graph.relations.length} relations, ${response.answer.claims.length} cited claims.`);
  }
} finally {
  await repository.close();
}
