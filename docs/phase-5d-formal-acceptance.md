# Phase 5D Formal Acceptance

## Decision Boundary

Formal closure validates governed synchronization against controlled files, a localhost JSON fixture server, Mock publication stores, local Neo4j, and a local document registry. Real MES, PLM, and QMS connectivity remains pending.

## Required Gates

- 40 unique evaluation cases: MES 10, PLM 10, QMS 10, cross-source/recovery 10;
- zero unauthorized or cross-tenant publication;
- zero canonical, ontology, SHACL, stale-overwrite, duplicate-mutation, permanent-delete, lineage, secret, or raw-payload violations;
- 100% idempotency, checkpoint monotonicity, mapping determinism, publication verification, authorization, recovery detection, lineage, and SSRF enforcement;
- Mock and explicit local Neo4j publication verification;
- localhost HTTP fixture acceptance with runtime-only bearer authentication;
- Phase 5A, 5B, 5C and core Agent regressions.

Missing metrics, skipped cases, duplicate IDs, empty assertions, and missing domains fail the release gate. Conditional Neo4j skips are never counted as a live pass.

## Reports

Sanitized runtime reports are generated at:

- `.data/source-sync/fixture-live-report.json`
- `.data/source-sync/phase5d-formal-report.json`

These files are local acceptance artifacts and must remain untracked.

## Deferred Enterprise Acceptance

Real endpoints, enterprise source OAuth, enterprise OIDC/JWKS, token revocation, CDC, Kafka, distributed transaction coordination, bidirectional writeback, and centralized SIEM are not accepted in Phase 5D.
