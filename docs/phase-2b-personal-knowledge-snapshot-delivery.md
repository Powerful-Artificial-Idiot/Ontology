# Phase 2B: Governed Personal Knowledge Snapshot Delivery

## Domain boundary

The Agent runtime keeps `manufacturing-knowledge` and `personal-knowledge` as
separate repository domains. A Personal Knowledge request must explicitly select
`personal-knowledge`; it is never routed to the manufacturing repository and does
not broaden manufacturing queries.

## Ingestion and promotion

`PersonalKnowledgeSnapshotIngestionService` accepts a local artifact directory or
an explicit snapshot path. The companion manifest, checksum list, and pinned JSON
Schema are mandatory. Validation covers file checksums, schema hash and major
version, JSON Schema, snapshot content hash, zero diagnostics, canonical identity,
relations, provenance, manifest counts, source identity, and a repository smoke
query.

Validated bytes are stored under immutable content-hash version directories. The
active version is selected through an atomically replaced pointer. A rejected
candidate cannot change the in-memory repository or active pointer. Previous
validated pointers are retained and revalidated before rollback.

## Read-only query path

The formal path is:

```text
POST /api/personal-knowledge/query
-> authenticated domain check
-> allowlisted deterministic Query Plan
-> active SnapshotKnowledgeRepository
-> public provenance filter
-> Evidence Pack
-> Strict Citation Validator
-> Structured Trace and Audit
```

`GET /api/personal-knowledge/status` returns only availability and version/count
metadata. It never returns runtime or source filesystem paths.

## Runtime configuration

- `MKG_PERSONAL_KNOWLEDGE_RUNTIME_DIR`: optional version-store location.
- `MKG_PERSONAL_KNOWLEDGE_ARTIFACT_DIR`: optional artifact root to validate and
  promote during startup.
- `MKG_PERSONAL_KNOWLEDGE_SNAPSHOT_PATH`: optional explicit snapshot path; its
  companion artifact files remain required.

If neither candidate variable is supplied, the service restores an existing
validated active pointer. If none exists, status reports `available: false` and
queries fail closed.

## Deferred

This phase does not implement GitHub Artifact download, scheduling, a production
UI, LLM planning, vector retrieval, Neo4j integration, source write-back, or
automatic remote synchronization.
