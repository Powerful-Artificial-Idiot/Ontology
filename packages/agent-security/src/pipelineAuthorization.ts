import type {
  AgentAnswer,
  AgentAuthorizationContext,
  CanonicalKnowledgeBaseline,
  CitationValidationIssue,
  CitationValidationResult,
  EvidencePack,
  GraphQueryPlan,
} from "../../knowledge-contracts/src/index";
import type {
  CitationValidator,
  GraphRetrievalResult,
  GraphRetriever,
} from "../../agent-core/src/index";
import { AgentPipelineError } from "../../agent-core/src/index";
import { DefaultAgentAuthorizer } from "./policy";

export class AuthorizedGraphRetriever implements GraphRetriever {
  constructor(
    private readonly delegate: GraphRetriever,
    private readonly authorizer = new DefaultAgentAuthorizer(),
  ) {}

  async retrieve(plan: GraphQueryPlan, baseline: CanonicalKnowledgeBaseline, authorization?: AgentAuthorizationContext): Promise<GraphRetrievalResult> {
    if (authorization) {
      const deniedSeed = plan.seedEntityIds.find((id) => !this.authorizer.canAccessObject(authorization, id));
      if (deniedSeed) {
        throw new AgentPipelineError("AUTHORIZATION_DENIED", "Graph query seed is outside the principal object scope.", "graph-retrieval", { objectId: deniedSeed });
      }
    }
    const result = await this.delegate.retrieve(plan, baseline, authorization);
    if (!authorization) return result;
    const entities = result.entities.filter((entity) => this.authorizer.canAccessEntity(authorization, entity));
    const entityIds = new Set(entities.map((entity) => entity.id));
    const deniedSeed = plan.seedEntityIds.find((id) => !entityIds.has(id));
    if (deniedSeed) {
      throw new AgentPipelineError("AUTHORIZATION_DENIED", "Graph query seed is outside the principal domain scope.", "graph-retrieval", { objectId: deniedSeed });
    }
    return {
      ...result,
      entities,
      relations: result.relations.filter((relation) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)),
    };
  }
}

export class AuthorizationAwareCitationValidator implements CitationValidator {
  constructor(
    private readonly delegate: CitationValidator,
    private readonly authorizer = new DefaultAgentAuthorizer(),
  ) {}

  async validate(answer: AgentAnswer, evidencePack: EvidencePack, authorization?: AgentAuthorizationContext): Promise<CitationValidationResult> {
    const base = await this.delegate.validate(answer, evidencePack, authorization);
    if (!authorization) return base;
    const evidenceById = new Map(evidencePack.items.map((item) => [item.id, item]));
    const accessIssues: CitationValidationIssue[] = [];
    for (const claim of answer.claims) {
      for (const citation of claim.citations) {
        const evidence = evidenceById.get(citation.evidenceId);
        if (!evidence) continue;
        const deniedObjectIds = evidence.linkedEntityIds.filter((id) => !this.authorizer.canAccessObject(authorization, id));
        if (evidence.governance?.accessDecision === "denied" || deniedObjectIds.length) {
          accessIssues.push({
            claimId: claim.id,
            code: "access-denied",
            message: `Citation publication is not authorized for evidence: ${citation.evidenceId}`,
          });
        }
      }
    }
    const issues = [...base.issues, ...accessIssues];
    return { ...base, status: issues.length ? "failed" : "passed", issues };
  }
}
