# Source Lineage And Provenance

Every published entity, relation, metric and document version requires lineage containing canonical ID/version, source system, connector/run, source record/version/hash, mapping profile/version, publication target and timestamp.

Lineage keys are stable and replay-safe. Replaying the same source version and hash does not duplicate lineage; a newer version creates a new record. Raw payloads and credentials are never lineage fields.

Publication and lineage occur in the same governed orchestration flow. Reconciliation treats missing lineage as blocking.
