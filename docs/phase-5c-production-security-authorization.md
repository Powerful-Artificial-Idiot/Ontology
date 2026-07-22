# Phase 5C - Production Security and Authorization

## Status

Implemented as a production-oriented authorization baseline. Enterprise identity-provider acceptance remains **pending**.

- Shared Principal and Authorization Context: implemented
- API authentication adapter boundary: implemented
- Static Bearer acceptance adapter: implemented
- Production fail-closed profile: implemented
- Session ownership and tenant isolation: implemented
- Role and domain authorization: implemented
- Object-level graph filtering: implemented
- Request-principal document filtering: implemented
- Citation-level publication control: implemented
- Security decision audit events: implemented
- Security release gate: implemented
- Enterprise OIDC/JWKS validation: pending
- Token revocation and enterprise group mapping: pending

The static Bearer adapter proves the HTTP and policy boundary but is not represented as enterprise authentication. A production deployment must replace it with a reviewed OIDC adapter or place the service behind a trusted identity-aware gateway with an equivalent authenticated context contract.

## Control Flow

```text
Credential
  -> AgentAuthenticator
  -> server-derived AgentAuthorizationContext
  -> role / tenant / owner / domain policy
  -> Session and Run authorization
  -> object-filtered graph retrieval
  -> principal-filtered document evidence
  -> citation publication authorization
  -> structured security audit event
```

Credentials are never copied into Session, Run, Trace, Evidence, Audit, telemetry, or API responses. An asynchronous Run persists only the non-secret authorization snapshot required for deterministic execution and retry.

## Role Matrix

| Role | Sessions / turns | Runs | Trace / evidence | Audit |
| --- | --- | --- | --- | --- |
| `agent-user` | own, scoped | read own | read own | denied |
| `agent-operator` | own, scoped | read/control own | read own | denied |
| `agent-auditor` | same-tenant scoped read | read | read | read |
| `agent-admin` | all | all | all | all |

All non-admin access remains constrained by tenant and domain. Non-admin/non-auditor resources without ownership metadata are denied as legacy unowned resources. `objectIds`, when present, is an additional allowlist and never expands domain access.

## Runtime Configuration

Local scripted/demo compatibility:

```bash
MKG_AGENT_SECURITY_PROFILE=development
MKG_AGENT_AUTH_MODE=disabled
```

Controlled static-token acceptance:

```bash
MKG_AGENT_SECURITY_PROFILE=production
MKG_AGENT_AUTH_MODE=static-bearer
MKG_AGENT_AUTH_STATIC_TOKEN=<server-secret>
MKG_AGENT_AUTH_PRINCIPAL_ID=<principal-id>
MKG_AGENT_AUTH_TENANT_ID=<tenant-id>
MKG_AGENT_AUTH_ROLE_IDS=agent-operator,agent-evidence-reader
MKG_AGENT_AUTH_DOMAIN_IDS=quality,production,engineering
```

The browser token is optional and only used for this controlled adapter:

```bash
VITE_AGENT_API_TOKEN=<short-lived-demo-token>
```

Do not build a long-lived enterprise token into a public frontend bundle. Real deployments must acquire short-lived credentials through the approved identity flow.

## Release Gate

```bash
npm run security:acceptance
```

The gate verifies fail-closed production configuration, role enforcement, tenant isolation, horizontal ownership isolation, domain scope, object scope, and citation publication control. The sanitized report is written to `.data/evaluations/phase5c-security-acceptance.json`; `.data` is not tracked.

HTTP integration tests additionally cover missing/invalid credentials, domain-denied Session creation, cross-user access, auditor behavior, asynchronous authorization persistence, and public Run redaction.

## Remaining Production Work

Before connecting enterprise systems, complete an IAM ADR and implement OIDC issuer/audience validation, JWKS rotation, expiry/revocation handling, enterprise group-to-role mapping, plant/data-domain mapping, rate limiting, TLS termination, secret management, centralized immutable audit export, retention policy, and penetration testing. These items are deliberately not simulated by the current adapter.
