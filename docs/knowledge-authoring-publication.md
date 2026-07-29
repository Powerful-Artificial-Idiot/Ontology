# Knowledge Authoring Publication

`KnowledgeRepository` remains read-only. The independent publication port exposes `stage`, `publish`, and `verify` operations. Mock and Neo4j implementations accept only approved, revalidated Change Sets passed by the workflow service.

Neo4j writes use static parameterized Cypher, allowlisted types and relations, a bounded mutation count, and a single transaction for entity and relation writes. The browser never submits Cypher. Verification runs after the graph transaction; the Change Set is marked published only after verification, provenance, audit, and publication journal updates complete.

Partial failures stay approved or become recovery-required in the journal and are never reported as published. Published-only overlay reads preserve Agent evidence isolation in Mock mode; Neo4j reads use committed graph records.
