import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { RepositoryGraphRetriever, createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import { Neo4jKnowledgeRepository } from "../../packages/neo4j-repository/src/index";
import { neo4jOptionsFromEnvironment } from "./runtime";

const repository = new Neo4jKnowledgeRepository(neo4jOptionsFromEnvironment({ ...process.env, MKG_AGENT_KNOWLEDGE_MODE: "neo4j" }));
try {
  await repository.verifyConnectivity();
  const graph = await repository.traverseGraph({
    graphPlanId: leakRateQualityIssueTraceBaseline.graphQueryPlan.graphPlanId,
    templateId: leakRateQualityIssueTraceBaseline.graphQueryPlan.templateId,
    readOnly: true,
    seedEntityIds: leakRateQualityIssueTraceBaseline.graphQueryPlan.seedEntityIds,
    allowedRelationTypes: leakRateQualityIssueTraceBaseline.graphQueryPlan.allowedRelationTypes,
    maxDepth: leakRateQualityIssueTraceBaseline.graphQueryPlan.maxDepth,
    resultLimit: leakRateQualityIssueTraceBaseline.graphQueryPlan.resultLimit,
    status: "active",
  });
  const requiredIds = ["operation.op30", "quality-characteristic.leak-rate", "machine.m220", "product.brake-booster"];
  const entityIds = new Set(graph.entities.map((entity) => entity.id));
  if (!requiredIds.every((id) => entityIds.has(id))) throw new Error(`Neo4j traversal is missing required entities: ${requiredIds.filter((id) => !entityIds.has(id)).join(", ")}`);

  const pipeline = createDeterministicAgentPipeline({ graphRetriever: new RepositoryGraphRetriever(repository) });
  const response = await pipeline.run({
    ...leakRateQualityIssueTraceBaseline.request,
    requestId: "request.neo4j.acceptance",
    mode: "live",
  });
  const graphStage = response.trace.stages.find((stage) => stage.stage === "graph-retrieval");
  if (!graphStage?.summary.includes("neo4j")) throw new Error("Pipeline trace did not identify the Neo4j repository.");
  console.info(`Neo4j acceptance passed: ${graph.entities.length} entities, ${graph.relations.length} relations, ${response.answer.claims.length} cited claims.`);
} finally {
  await repository.close();
}
