export type AgentAuthenticationMethod = "none" | "static-bearer" | "oidc";

export type AgentPrincipal = {
  id: string;
  tenantId: string;
  roleIds: string[];
  domainIds: string[];
  objectIds?: string[];
  authenticationMethod: AgentAuthenticationMethod;
};

export type AgentAuthorizationContext = {
  principal: AgentPrincipal;
  authenticatedAt: string;
  requestId: string;
};

export type AgentSessionSecurityContext = {
  ownerPrincipalId: string;
  tenantId: string;
  allowedDomainIds: string[];
  authenticationMethod: AgentAuthenticationMethod;
};

export type AgentSecurityAction =
  | "session:create"
  | "session:read"
  | "turn:execute"
  | "run:read"
  | "run:control"
  | "trace:read"
  | "evidence:read"
  | "audit:read";

export type AgentSecurityResource = {
  type: "scenario" | "session" | "turn" | "run" | "trace" | "evidence" | "audit";
  id: string;
  sessionId?: string;
  turnId?: string;
  tenantId?: string;
  ownerPrincipalId?: string;
  domainIds?: string[];
  objectIds?: string[];
};

export type AgentAuthorizationDecision = {
  decision: "allowed" | "denied";
  action: AgentSecurityAction;
  principalId: string;
  resourceType: AgentSecurityResource["type"];
  resourceId: string;
  reasonCode:
    | "allowed"
    | "role-missing"
    | "tenant-mismatch"
    | "owner-mismatch"
    | "domain-denied"
    | "object-denied"
    | "legacy-resource-unowned";
};
