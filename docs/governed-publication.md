# Governed Publication

The read-only `KnowledgeRepository` contract remains unchanged. Writes use independent ports:

- `CanonicalPublicationStore` for graph mutations;
- `DocumentPublicationStore` for controlled document metadata.

Both support stage, publish and verify. Policies enforce tenant/domain, canonical type, predicate, stable ID, version, hash and maximum write count. Permanent delete is disabled; tombstones map to deactivate, supersede, obsolete or expire.

`Neo4jCanonicalPublicationStore` uses fixed parameterized templates and explicit write transactions. It does not accept Cypher from users, APIs, mappings or LLMs. `FileDocumentPublicationStore` persists registry metadata only; draft, obsolete, invalid-hash or unsafe-locator changes are rejected.
