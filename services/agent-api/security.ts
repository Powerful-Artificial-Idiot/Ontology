import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AgentAuthorizationContext, AgentPrincipal } from "../../packages/knowledge-contracts/src/index";
import { DefaultAgentAuthorizer } from "../../packages/agent-security/src/index";

export type AgentAuthenticationMode = "disabled" | "static-bearer";

export interface AgentAuthenticator {
  readonly mode: AgentAuthenticationMode;
  authenticate(request: IncomingMessage, requestId: string): Promise<AgentAuthorizationContext>;
}

export type AgentApiSecurityRuntime = {
  authenticator: AgentAuthenticator;
  authorizer: DefaultAgentAuthorizer;
  profile: "development" | "production";
};

export class AgentAuthenticationError extends Error {
  constructor(readonly code: "AUTHENTICATION_REQUIRED" | "AUTHENTICATION_INVALID", message: string) {
    super(message);
    this.name = "AgentAuthenticationError";
  }
}

export class DisabledAgentAuthenticator implements AgentAuthenticator {
  readonly mode = "disabled" as const;
  private readonly principal: AgentPrincipal = {
    id: "demo-user",
    tenantId: "local-demo",
    roleIds: ["agent-admin", "agent-evidence-reader"],
    domainIds: ["*"],
    objectIds: ["*"],
    authenticationMethod: "none",
  };

  async authenticate(_request: IncomingMessage, requestId: string): Promise<AgentAuthorizationContext> {
    return { principal: clonePrincipal(this.principal), authenticatedAt: new Date().toISOString(), requestId };
  }
}

export class StaticBearerAgentAuthenticator implements AgentAuthenticator {
  readonly mode = "static-bearer" as const;

  constructor(private readonly token: string, private readonly principal: AgentPrincipal) {
    if (token.length < 16) throw new Error("MKG_AGENT_AUTH_STATIC_TOKEN must contain at least 16 characters.");
  }

  async authenticate(request: IncomingMessage, requestId: string): Promise<AgentAuthorizationContext> {
    const authorization = request.headers.authorization;
    if (!authorization) throw new AgentAuthenticationError("AUTHENTICATION_REQUIRED", "A Bearer token is required.");
    const [scheme, token] = authorization.split(" ", 2);
    if (scheme !== "Bearer" || !token || !safeEqual(token, this.token)) {
      throw new AgentAuthenticationError("AUTHENTICATION_INVALID", "The supplied Bearer token is invalid.");
    }
    return { principal: clonePrincipal(this.principal), authenticatedAt: new Date().toISOString(), requestId };
  }
}

export function createAgentApiSecurity(environment: NodeJS.ProcessEnv = process.env): AgentApiSecurityRuntime {
  const profile = environment.MKG_AGENT_SECURITY_PROFILE === "production" ? "production" : "development";
  const mode = parseAuthenticationMode(environment.MKG_AGENT_AUTH_MODE);
  if (profile === "production" && mode === "disabled") {
    throw new Error("Production security profile requires MKG_AGENT_AUTH_MODE=static-bearer or a future enterprise authenticator.");
  }
  const authenticator = mode === "disabled"
    ? new DisabledAgentAuthenticator()
    : new StaticBearerAgentAuthenticator(required(environment.MKG_AGENT_AUTH_STATIC_TOKEN, "MKG_AGENT_AUTH_STATIC_TOKEN"), {
        id: required(environment.MKG_AGENT_AUTH_PRINCIPAL_ID, "MKG_AGENT_AUTH_PRINCIPAL_ID"),
        tenantId: required(environment.MKG_AGENT_AUTH_TENANT_ID, "MKG_AGENT_AUTH_TENANT_ID"),
        roleIds: splitList(environment.MKG_AGENT_AUTH_ROLE_IDS),
        domainIds: splitList(environment.MKG_AGENT_AUTH_DOMAIN_IDS),
        objectIds: environment.MKG_AGENT_AUTH_OBJECT_IDS ? splitList(environment.MKG_AGENT_AUTH_OBJECT_IDS) : undefined,
        authenticationMethod: "static-bearer",
      });
  return { authenticator, authorizer: new DefaultAgentAuthorizer(), profile };
}

function parseAuthenticationMode(value?: string): AgentAuthenticationMode {
  if (!value || value === "disabled") return "disabled";
  if (value === "static-bearer") return value;
  throw new Error(`Unsupported MKG_AGENT_AUTH_MODE ${value}. Use disabled or static-bearer.`);
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required for static Bearer authentication.`);
  return value.trim();
}

function splitList(value: string | undefined): string[] {
  const result = [...new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
  if (!result.length) throw new Error("Static Bearer principal role and domain lists must not be empty.");
  return result;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function clonePrincipal(principal: AgentPrincipal): AgentPrincipal {
  return {
    ...principal,
    roleIds: [...principal.roleIds],
    domainIds: [...principal.domainIds],
    objectIds: principal.objectIds ? [...principal.objectIds] : undefined,
  };
}
