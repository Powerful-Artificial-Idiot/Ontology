import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { StrictCitationValidator } from "../../packages/agent-core/src/index";
import { AuthorizationAwareCitationValidator, DefaultAgentAuthorizer } from "../../packages/agent-security/src/index";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import type { AgentAuthorizationContext } from "../../packages/knowledge-contracts/src/index";
import { createAgentApiSecurity } from "./security";
import { runtimeDataPath } from "../runtimePaths";

type SecurityCheck = { id: string; status: "passed" | "failed"; detail: string };

const reportPath = runtimeDataPath(process.env, "evaluations/phase5c-security-acceptance.json", process.env.MKG_SECURITY_ACCEPTANCE_PATH);
const authorizer = new DefaultAgentAuthorizer();
const user = context("security-user", ["agent-user", "agent-evidence-reader"], ["quality"], ["operation.op30"]);
const resource = { type: "session" as const, id: "session.security", tenantId: "tenant-security", ownerPrincipalId: "security-user", domainIds: ["quality"] };
const checks: SecurityCheck[] = [];

checks.push(check("production-fail-closed", () => {
  try {
    createAgentApiSecurity({ MKG_AGENT_SECURITY_PROFILE: "production", MKG_AGENT_AUTH_MODE: "disabled" });
    return false;
  } catch {
    return true;
  }
}, "Production profile rejects disabled authentication."));
checks.push(check("role-enforcement", () => authorizer.authorize(user, "audit:read", resource).reasonCode === "role-missing", "Role policy denies audit access to agent-user."));
checks.push(check("tenant-isolation", () => authorizer.authorize(user, "session:read", { ...resource, tenantId: "other-tenant" }).reasonCode === "tenant-mismatch", "Cross-tenant access is denied."));
checks.push(check("owner-isolation", () => authorizer.authorize(user, "session:read", { ...resource, ownerPrincipalId: "other-user" }).reasonCode === "owner-mismatch", "Horizontal session access is denied."));
checks.push(check("domain-scope", () => authorizer.authorize(user, "session:read", { ...resource, domainIds: ["engineering"] }).reasonCode === "domain-denied", "Cross-domain access is denied."));
checks.push(check("object-scope", () => authorizer.authorize(user, "session:read", { ...resource, objectIds: ["machine.m220"] }).reasonCode === "object-denied", "Out-of-scope object access is denied."));

const citation = await new AuthorizationAwareCitationValidator(new StrictCitationValidator()).validate(
  leakRateQualityIssueTraceBaseline.expectedResponse.answer,
  leakRateQualityIssueTraceBaseline.evidencePack,
  user,
);
checks.push({
  id: "citation-publication-control",
  status: citation.status === "failed" && citation.issues.some((issue) => issue.code === "access-denied") ? "passed" : "failed",
  detail: "Citation publication is blocked when linked evidence exceeds object scope.",
});

const report = {
  phase: "5C",
  reportVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
  authentication: {
    localAcceptanceAdapter: "static-bearer",
    externalIdentityProvider: "pending",
    credentialsPersisted: false,
  },
  controls: checks,
  limitations: [
    "The static Bearer adapter is for controlled acceptance and is not an enterprise identity provider.",
    "OIDC discovery, signature validation, key rotation, revocation, and enterprise group mapping remain pending.",
  ],
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.info(`Phase 5C security acceptance: ${report.status} (${checks.filter((item) => item.status === "passed").length}/${checks.length})`);
console.info(`Report: ${reportPath}`);
if (report.status !== "passed") process.exitCode = 1;

function check(id: string, evaluate: () => boolean, detail: string): SecurityCheck {
  return { id, status: evaluate() ? "passed" : "failed", detail };
}

function context(id: string, roleIds: string[], domainIds: string[], objectIds?: string[]): AgentAuthorizationContext {
  return {
    principal: { id, tenantId: "tenant-security", roleIds, domainIds, objectIds, authenticationMethod: "static-bearer" },
    authenticatedAt: "2026-07-22T00:00:00.000Z",
    requestId: "security-acceptance",
  };
}
