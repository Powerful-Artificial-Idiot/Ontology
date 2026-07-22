import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { DefaultAgentAuthorizer } from "../../packages/agent-security/src/index";
import { AGENT_CONTRACT_VERSION, type AgentAuthorizationContext, type AgentPrincipal } from "../../packages/knowledge-contracts/src/index";
import { createAgentApi } from "../../services/agent-api/app";
import { createInMemoryAgentApiRuntime } from "../../services/agent-api/runtime";
import { AgentAuthenticationError, type AgentApiSecurityRuntime, type AgentAuthenticator } from "../../services/agent-api/security";

const servers: Server[] = [];
const tokens = new Map<string, AgentPrincipal>([
  [testCredential("user-a"), principal("user-a", ["agent-operator", "agent-evidence-reader"], ["quality", "production", "engineering"])],
  [testCredential("user-b"), principal("user-b", ["agent-operator", "agent-evidence-reader"], ["quality", "production", "engineering"])],
  [testCredential("auditor"), principal("auditor", ["agent-auditor", "agent-evidence-reader"], ["quality"])],
  [testCredential("engineer"), principal("engineer", ["agent-user", "agent-evidence-reader"], ["engineering"])],
]);

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("Phase 5C secured Agent API", () => {
  it("rejects missing and invalid credentials without exposing protected resources", async () => {
    const runtime = createInMemoryAgentApiRuntime();
    const { baseUrl } = await startApi(runtime);
    const missing = await json(`${baseUrl}/sessions`, { method: "POST", body: JSON.stringify(sessionRequest()) });
    const invalid = await json(`${baseUrl}/sessions`, { method: "POST", headers: auth(testCredential("unknown")), body: JSON.stringify(sessionRequest()) });

    expect(missing.response.status).toBe(401);
    expect(missing.payload.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(invalid.response.status).toBe(401);
    expect(invalid.payload.error.code).toBe("AUTHENTICATION_INVALID");
    expect(JSON.stringify([missing.payload, invalid.payload])).not.toContain("token-user");
    expect(runtime.audit.list().filter((event) => event.action === "security.authenticate")).toHaveLength(2);
  });

  it("enforces domain authorization and binds new sessions to the authenticated owner", async () => {
    const { baseUrl } = await startApi();
    const denied = await json(`${baseUrl}/sessions`, {
      method: "POST",
      headers: auth(testCredential("engineer")),
      body: JSON.stringify(sessionRequest()),
    });
    const created = await json(`${baseUrl}/sessions`, {
      method: "POST",
      headers: auth(testCredential("user-a")),
      body: JSON.stringify(sessionRequest()),
    });

    expect(denied.response.status).toBe(403);
    expect(denied.payload.error.code).toBe("AUTHORIZATION_DENIED");
    expect(created.response.status).toBe(201);
    expect(created.payload.session.security).toEqual({
      ownerPrincipalId: "user-a",
      tenantId: "tenant-a",
      allowedDomainIds: ["quality"],
      authenticationMethod: "static-bearer",
    });
  });

  it("prevents horizontal access while permitting governed same-tenant audit access", async () => {
    const { baseUrl } = await startApi();
    const created = await json(`${baseUrl}/sessions`, {
      method: "POST",
      headers: auth(testCredential("user-a")),
      body: JSON.stringify(sessionRequest()),
    });
    const sessionId = created.payload.session.id as string;
    const otherUser = await json(`${baseUrl}/sessions/${sessionId}`, { headers: auth(testCredential("user-b")) });
    const ownerAudit = await json(`${baseUrl}/sessions/${sessionId}/audit`, { headers: auth(testCredential("user-a")) });
    const auditor = await json(`${baseUrl}/sessions/${sessionId}/audit`, { headers: auth(testCredential("auditor")) });

    expect(otherUser.response.status).toBe(403);
    expect(ownerAudit.response.status).toBe(403);
    expect(auditor.response.status).toBe(200);
    expect(auditor.payload.events.some((event: { action: string; outcome: string }) => event.action === "security.audit:read" && event.outcome === "allowed")).toBe(true);
  });

  it("persists authorization for asynchronous execution but redacts it from public Run resources", async () => {
    const runtime = createInMemoryAgentApiRuntime();
    runtime.security = security();
    const { baseUrl } = await startApi(runtime);
    const created = await json(`${baseUrl}/sessions`, {
      method: "POST",
      headers: auth(testCredential("user-a")),
      body: JSON.stringify(sessionRequest()),
    });
    const sessionId = created.payload.session.id as string;
    const run = await json(`${baseUrl}/sessions/${sessionId}/runs`, {
      method: "POST",
      headers: auth(testCredential("user-a")),
      body: JSON.stringify(turnRequest(sessionId)),
    });
    const stored = await runtime.runs.get(run.payload.run.id);

    expect(run.response.status).toBe(202);
    expect(run.payload.run.authorizationContext).toBeUndefined();
    expect(stored?.authorizationContext?.principal).toMatchObject({ id: "user-a", tenantId: "tenant-a", authenticationMethod: "static-bearer" });
    expect(JSON.stringify(stored)).not.toContain(testCredential("user-a"));
  });
});

class TokenAuthenticator implements AgentAuthenticator {
  readonly mode = "static-bearer" as const;

  async authenticate(request: Parameters<AgentAuthenticator["authenticate"]>[0], requestId: string): Promise<AgentAuthorizationContext> {
    const raw = request.headers.authorization;
    if (!raw) throw new AgentAuthenticationError("AUTHENTICATION_REQUIRED", "A Bearer token is required.");
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    const value = tokens.get(token);
    if (!value) throw new AgentAuthenticationError("AUTHENTICATION_INVALID", "The supplied Bearer token is invalid.");
    return { principal: structuredClone(value), authenticatedAt: new Date().toISOString(), requestId };
  }
}

function security(): AgentApiSecurityRuntime {
  return { authenticator: new TokenAuthenticator(), authorizer: new DefaultAgentAuthorizer(), profile: "production" };
}

function principal(id: string, roleIds: string[], domainIds: string[]): AgentPrincipal {
  return { id, tenantId: "tenant-a", roleIds, domainIds, authenticationMethod: "static-bearer" };
}

function sessionRequest() {
  return { contractVersion: AGENT_CONTRACT_VERSION, scenarioId: "quality-issue-trace", mode: "live", language: "en" };
}

function turnRequest(sessionId: string) {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId: "security-run-1",
    sessionId,
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: "en",
    message: "OP30 Leak Rate is abnormal. Which equipment, quality risks, and documents may be affected?",
  };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function testCredential(principalId: string): string {
  return `test-only.${Buffer.from(principalId).toString("base64url")}.${"x".repeat(24)}`;
}

async function json(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  return { response, payload: await response.json() as any };
}

async function startApi(runtime = createInMemoryAgentApiRuntime()) {
  runtime.security = security();
  const server = createServer(createAgentApi(runtime));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Agent API did not allocate a TCP port.");
  return { baseUrl: `http://127.0.0.1:${address.port}/api/agent` };
}

async function closeServer(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
