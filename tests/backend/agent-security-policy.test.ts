import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StrictCitationValidator } from "../../packages/agent-core/src/index";
import { AuthorizationAwareCitationValidator, DefaultAgentAuthorizer } from "../../packages/agent-security/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import type { AgentAuthorizationContext } from "../../packages/knowledge-contracts/src/index";
import { GovernedDocumentEvidenceRetriever } from "../../services/agent-api/governedDocumentEvidence";

const authorizer = new DefaultAgentAuthorizer();

describe("Phase 5C authorization policy", () => {
  it("enforces role, tenant, owner, domain, and object scope independently", () => {
    const user = context("user-a", ["agent-user"], ["quality"], ["operation.op30"]);
    const resource = { type: "session" as const, id: "session-a", tenantId: "tenant-a", ownerPrincipalId: "user-a", domainIds: ["quality"] };

    expect(authorizer.authorize(user, "session:read", resource).decision).toBe("allowed");
    expect(authorizer.authorize(user, "audit:read", resource)).toMatchObject({ decision: "denied", reasonCode: "role-missing" });
    expect(authorizer.authorize(user, "session:read", { ...resource, tenantId: "tenant-b" })).toMatchObject({ decision: "denied", reasonCode: "tenant-mismatch" });
    expect(authorizer.authorize(user, "session:read", { ...resource, ownerPrincipalId: "user-b" })).toMatchObject({ decision: "denied", reasonCode: "owner-mismatch" });
    expect(authorizer.authorize(user, "session:read", { ...resource, domainIds: ["engineering"] })).toMatchObject({ decision: "denied", reasonCode: "domain-denied" });
    expect(authorizer.authorize(user, "session:read", { ...resource, objectIds: ["machine.m220"] })).toMatchObject({ decision: "denied", reasonCode: "object-denied" });
  });

  it("allows an auditor to read same-tenant resources without assuming ownership", () => {
    const auditor = context("auditor", ["agent-auditor"], ["quality"]);
    expect(authorizer.authorize(auditor, "audit:read", {
      type: "audit",
      id: "session-a",
      tenantId: "tenant-a",
      ownerPrincipalId: "user-a",
      domainIds: ["quality"],
    }).decision).toBe("allowed");
  });

  it("blocks citation publication when cited evidence exceeds object scope", async () => {
    const validation = await new AuthorizationAwareCitationValidator(new StrictCitationValidator()).validate(
      leakRateQualityIssueTraceBaseline.expectedResponse.answer,
      leakRateQualityIssueTraceBaseline.evidencePack,
      context("user-a", ["agent-user"], ["quality", "production", "engineering"], ["operation.op30"]),
    );

    expect(validation.status).toBe("failed");
    expect(validation.issues.some((issue) => issue.code === "access-denied")).toBe(true);
  });

  it("uses the current principal for governed document filtering", async () => {
    const retriever = new GovernedDocumentEvidenceRetriever({
      registryPath: resolve("packages/demo-data/documents/leak-rate/document-registry.json"),
      access: { principalId: "service-default", roleIds: ["agent-evidence-reader"], domainIds: ["quality", "manufacturing", "engineering"] },
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });
    const graph = {
      graphPlanId: "graph.security",
      repositoryType: "mock",
      entities: leakRateQualityIssueTraceBaseline.entities,
      relations: leakRateQualityIssueTraceBaseline.relations,
    };
    const denied = await retriever.retrieve(graph, leakRateQualityIssueTraceBaseline, context("user-a", ["agent-user"], ["quality", "production", "engineering"]));
    const allowed = await retriever.retrieve(graph, leakRateQualityIssueTraceBaseline, context("user-a", ["agent-user", "agent-evidence-reader"], ["quality", "production", "engineering"]));

    expect(denied.items).toHaveLength(0);
    expect(allowed.items.length).toBeGreaterThan(0);
    expect(allowed.items.every((item) => item.governance?.accessDecision === "allowed")).toBe(true);
  });
});

function context(id: string, roleIds: string[], domainIds: string[], objectIds?: string[]): AgentAuthorizationContext {
  return {
    principal: { id, tenantId: "tenant-a", roleIds, domainIds, objectIds, authenticationMethod: "static-bearer" },
    authenticatedAt: "2026-07-22T00:00:00.000Z",
    requestId: `request.${id}`,
  };
}
