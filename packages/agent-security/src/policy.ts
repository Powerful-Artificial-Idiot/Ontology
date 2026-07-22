import type {
  AgentAuthorizationContext,
  AgentAuthorizationDecision,
  AgentSecurityAction,
  AgentSecurityResource,
  KnowledgeEntity,
} from "../../knowledge-contracts/src/index";

const roleActions: Record<string, AgentSecurityAction[]> = {
  "agent-user": ["session:create", "session:read", "turn:execute", "run:read", "trace:read", "evidence:read"],
  "agent-operator": ["session:create", "session:read", "turn:execute", "run:read", "run:control", "trace:read", "evidence:read"],
  "agent-auditor": ["session:read", "run:read", "trace:read", "evidence:read", "audit:read"],
  "agent-admin": ["session:create", "session:read", "turn:execute", "run:read", "run:control", "trace:read", "evidence:read", "audit:read"],
};

const domainAliases: Record<string, string> = {
  manufacturing: "production",
  valueStream: "value-stream",
  valuestream: "value-stream",
};

export class DefaultAgentAuthorizer {
  authorize(context: AgentAuthorizationContext, action: AgentSecurityAction, resource: AgentSecurityResource): AgentAuthorizationDecision {
    const principal = context.principal;
    const isAdmin = principal.roleIds.includes("agent-admin");
    const isAuditor = principal.roleIds.includes("agent-auditor");
    if (!isAdmin && !principal.roleIds.some((roleId) => roleActions[roleId]?.includes(action))) {
      return decision(context, action, resource, "role-missing");
    }
    if (!isAdmin && resource.tenantId && resource.tenantId !== principal.tenantId) {
      return decision(context, action, resource, "tenant-mismatch");
    }
    if (!isAdmin && !isAuditor && resource.ownerPrincipalId === undefined && resource.type !== "scenario") {
      return decision(context, action, resource, "legacy-resource-unowned");
    }
    if (!isAdmin && !isAuditor && resource.ownerPrincipalId && resource.ownerPrincipalId !== principal.id) {
      return decision(context, action, resource, "owner-mismatch");
    }
    if (!isAdmin && resource.domainIds?.length && !resource.domainIds.every((domainId) => this.canAccessDomain(context, domainId))) {
      return decision(context, action, resource, "domain-denied");
    }
    if (!isAdmin && resource.objectIds?.length && !resource.objectIds.every((objectId) => this.canAccessObject(context, objectId))) {
      return decision(context, action, resource, "object-denied");
    }
    return decision(context, action, resource, "allowed");
  }

  canAccessDomain(context: AgentAuthorizationContext, domainId: string): boolean {
    if (context.principal.roleIds.includes("agent-admin")) return true;
    const allowed = new Set(context.principal.domainIds.map(normalizeDomain));
    return allowed.has("*") || allowed.has(normalizeDomain(domainId));
  }

  canAccessObject(context: AgentAuthorizationContext, objectId: string): boolean {
    if (context.principal.roleIds.includes("agent-admin")) return true;
    const objectIds = context.principal.objectIds;
    return !objectIds?.length || objectIds.includes("*") || objectIds.includes(objectId);
  }

  canAccessEntity(context: AgentAuthorizationContext, entity: KnowledgeEntity): boolean {
    return (!entity.domain || this.canAccessDomain(context, entity.domain)) && this.canAccessObject(context, entity.id);
  }
}

export function normalizeSecurityDomain(domainId: string): string {
  return normalizeDomain(domainId);
}

function normalizeDomain(domainId: string): string {
  return domainAliases[domainId] ?? domainAliases[domainId.toLowerCase()] ?? domainId;
}

function decision(
  context: AgentAuthorizationContext,
  action: AgentSecurityAction,
  resource: AgentSecurityResource,
  reasonCode: AgentAuthorizationDecision["reasonCode"],
): AgentAuthorizationDecision {
  return {
    decision: reasonCode === "allowed" ? "allowed" : "denied",
    action,
    principalId: context.principal.id,
    resourceType: resource.type,
    resourceId: resource.id,
    reasonCode,
  };
}
