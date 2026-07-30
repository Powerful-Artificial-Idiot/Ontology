# Snapshot Knowledge Repository

Read-only, database-free consumer for governed Personal Knowledge Snapshot
artifacts. It validates the complete artifact, atomically promotes verified
versions, retains rollback candidates, and supports bounded deterministic queries
through the existing Evidence Pack, trace, audit, and citation boundaries.

This package deliberately does not implement the manufacturing
`KnowledgeRepository` interface. That interface also owns graph views, ontology
graphs, and the manufacturing semantic catalog. A formal implementation should
extract a smaller read-model repository contract before both domains share it.

The package does not call an LLM, write to Neo4j, or mutate source content.

## Contract governance

The reader uses JSON Schema 2020-12 and pins the byte-identical `0.1.0` schema
fixture to SHA-256
`d6750ab1b22080055542faefc6a02da513bba681b5cf5d0d633965bfa87f246f`.
It accepts compatible versions with major `0`, ignores unknown optional fields,
and fails closed for unsupported majors, missing required fields, schema drift,
invalid content hashes, governance errors, missing provenance, duplicate IDs,
and dangling relations.

## Governed runtime boundary

The formal runtime accepts only an artifact directory or explicit snapshot path
with the companion manifest, checksums, and pinned schema. It rejects checksum,
schema, version, content hash, diagnostics, canonical identity, relation, and
provenance failures before repository construction. An immutable version directory
and atomically replaced `active.json` pointer prevent partially loaded candidates
from replacing the current repository.

The `personal-knowledge` domain exposes only four allowlisted operations:

- `find-content-about`
- `find-projects-related-to`
- `find-documents-related-to`
- `show-neighbors`

The planner has a maximum result limit of 25 and cannot emit Cypher. Public
evidence retains canonical ID, type, source URL, relative source path, heading,
content hash, and source commit. The manufacturing repository remains separate.

## Non-production experiment

The original three-query runner remains under `experimental/personal-knowledge`.
It is not imported by the Agent API. The formal API uses
`GovernedPersonalKnowledgePlanner` instead.
