import type { GraphQueryPlan, KnowledgeRepository } from "../../knowledge-contracts/src/index";
import { AgentPipelineError, assertPipeline } from "./errors";
import type { GraphRetrievalResult, GraphRetriever } from "./types";

export class RepositoryGraphRetriever implements GraphRetriever {
  constructor(private readonly repository: KnowledgeRepository) {}

  async retrieve(plan: GraphQueryPlan): Promise<GraphRetrievalResult> {
    assertPipeline(plan.readOnly === true, "QUERY_PLAN_INVALID", "Repository traversal requires a read-only graph plan.", "graph-retrieval");
    assertPipeline(plan.maxDepth <= 3, "QUERY_PLAN_INVALID", "Repository traversal exceeds maximum depth.", "graph-retrieval", { maxDepth: plan.maxDepth });
    assertPipeline(plan.resultLimit <= 200, "QUERY_PLAN_INVALID", "Repository traversal exceeds result limit.", "graph-retrieval", { resultLimit: plan.resultLimit });
    try {
      const result = await this.repository.traverseGraph({
        graphPlanId: plan.graphPlanId,
        templateId: plan.templateId,
        readOnly: true,
        seedEntityIds: [...plan.seedEntityIds],
        allowedRelationTypes: [...plan.allowedRelationTypes],
        maxDepth: plan.maxDepth,
        resultLimit: plan.resultLimit,
        status: typeof plan.parameters.status === "string" ? plan.parameters.status : undefined,
      });
      const entityIds = new Set(result.entities.map((entity) => entity.id));
      const allowedRelations = new Set(plan.allowedRelationTypes);
      assertPipeline(result.graphPlanId === plan.graphPlanId, "PIPELINE_FAILED", "Repository returned a mismatched graph plan ID.", "graph-retrieval");
      assertPipeline(result.entities.length <= plan.resultLimit, "QUERY_PLAN_INVALID", "Repository returned more entities than the graph plan allows.", "graph-retrieval");
      assertPipeline(plan.seedEntityIds.every((id) => entityIds.has(id)), "EVIDENCE_INSUFFICIENT", "Repository result is missing one or more seed entities.", "graph-retrieval");
      assertPipeline(result.relations.every((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)), "PIPELINE_FAILED", "Repository returned a relation with an unknown endpoint.", "graph-retrieval");
      assertPipeline(result.relations.every((relation) => allowedRelations.has(relation.label ?? relation.predicate)), "QUERY_PLAN_INVALID", "Repository returned a relationship outside the allowlist.", "graph-retrieval");
      return {
        graphPlanId: result.graphPlanId,
        templateId: result.templateId,
        repositoryType: result.repositoryType,
        entities: result.entities,
        relations: result.relations,
      };
    } catch (error) {
      if (error instanceof AgentPipelineError) throw error;
      throw new AgentPipelineError("PIPELINE_FAILED", "Knowledge repository traversal failed.", "graph-retrieval", {
        repositoryError: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
