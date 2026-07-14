# ADR 0001: Preserve the Frontend Demo at Repository Root

- Status: accepted
- Date: 2026-07-14

## Context

The stable Vite Demo already lives at the repository root and is used for management presentations. Moving it into an application workspace would change paths and release assumptions while the shared contract is still being introduced.

## Decision

Keep the Demo at the root. Add npm workspaces for reusable packages and root command aliases through Make. Introduce `src/repositories/legacyDemoData.ts` as the migration boundary.

## Consequences

Current commands and interactions remain stable. The repository is a compatibility-first monorepo rather than a visually uniform directory tree. A later move requires regression coverage and a root compatibility wrapper.
