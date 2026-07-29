# Knowledge Authoring Evaluation

The versioned dataset is `packages/demo-data/authoring/phase5e-evaluation.v1.json`. It contains 36 non-skipped deterministic cases: 9 workflow, 9 entity/relation, 10 authorization/governance, and 8 integration/UI cases.

The release gate requires zero direct publication bypass, unapproved or stale publication, authorization bypass, cross-tenant publication, source-owned mutation, canonical/ontology/SHACL/version violation, partial publication, draft/submitted/approved evidence leakage, missing audit/provenance, and secret leakage. Enforcement accuracy metrics must all equal 100%.

Run `npm run phase5e:release-gate`. The runtime tests exercise state transitions, isolation, idempotency, validation, atomic Mock publication, API sanitization, and audit. Neo4j publication uses a separate explicit live suite when a container is available; a conditional skip is not reported as a pass.
