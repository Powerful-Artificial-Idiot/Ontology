# Source Synchronization Evaluation And Release Gates

The versioned dataset is `packages/demo-data/source-sync/phase5d-evaluation.v1.json`. It contains 40 unique effective cases: 10 each for MES, PLM, QMS and cross-source/recovery.

Release evaluation rejects duplicate IDs, skipped coverage, empty assertions, missing observations, missing domains and missing metrics. Every zero-tolerance security/governance metric must be zero; idempotency, checkpoint monotonicity, deterministic mapping, publication verification, authorization, recovery, lineage and SSRF rates must be 100%.

Commands:

```bash
npm run source-sync:formal-tests
npm run source-sync:fixture-live
npm run source-sync:formal
```

Fixture acceptance and enterprise readiness are separate fields. Enterprise readiness remains pending until real endpoint, identity, credential, scale, penetration, recovery and operational acceptance is complete.
