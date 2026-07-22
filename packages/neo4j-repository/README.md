# Neo4j Knowledge Repository

Server-only `KnowledgeRepository` adapter for the Phase 3B Leak Rate pilot. Runtime traversal uses reviewed, static, read-only Cypher templates and parameterized values. Canonical seed writes are isolated in `seed.ts` and are never called by the Agent Pipeline.

Implemented pilot capabilities:

- bounded Leak Rate graph traversal;
- entity lookup;
- direct entity relation lookup;
- connectivity verification;
- deterministic canonical baseline seeding.

Explorer graph projections, Ontology Registry, Semantic Catalog, and semantic search intentionally return an explicit `CAPABILITY_NOT_IMPLEMENTED` error in this pilot rather than silently using mock data.
