# Knowledge Authoring Contracts

The shared contracts live in `packages/knowledge-contracts/src/authoring.ts`, with a JSON Schema in `packages/knowledge-contracts/schemas/knowledge-change-set.schema.json`.

A `KnowledgeChangeSet` contains versioned entity and relation mutations, expected canonical versions, a sanitized authorization snapshot, validation and approval hashes, lifecycle actors and timestamps, and publication results. It never stores a bearer token, authorization header, raw principal token, provider response, prompt, or chain of thought.

Canonical IDs are immutable after creation. Creates use a type prefix and lowercase stable segments. Updates and deactivations require `expectedCurrentVersion` and produce a new version. Relation types are selected from the ontology-backed authoring allowlist; arbitrary relation names are rejected.

React Flow position and selection are presentation state and are intentionally absent from canonical entity mutations.
