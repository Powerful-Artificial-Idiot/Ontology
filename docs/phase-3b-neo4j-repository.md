# Phase 3B — Neo4j Knowledge Repository

## Scope

Phase 3B adds a server-only Neo4j implementation of the existing `KnowledgeRepository` contract without changing Agent API DTOs, frontend Turn Bundles, Evidence Packs, citations, or Pipeline stages.

```text
DeterministicAgentPipeline
  -> RepositoryGraphRetriever
  -> KnowledgeRepository.traverseGraph
       -> MockKnowledgeRepository
       -> Neo4jKnowledgeRepository
```

The default remains Mock. Neo4j mode is explicit and does not silently fall back when credentials, connectivity, seed data, or query execution fail.

## Local Run

Docker with Compose support is required. Use a development-only password:

```bash
export MKG_NEO4J_PASSWORD=development-password
npm run neo4j:up
npm run neo4j:seed
npm run neo4j:verify
```

Then run the API and frontend:

```bash
# terminal 1
export MKG_NEO4J_PASSWORD=development-password
npm run agent-api:neo4j

# terminal 2
npm run dev:agent
```

Neo4j Browser is available at `http://127.0.0.1:7474`. Bolt uses `bolt://127.0.0.1:7687`.

## Data Model

Canonical entities are stored as `(:KnowledgeEntity {id, type, label, ...})`. Canonical relationships use the single physical relationship type `:RELATED_TO` and preserve the governed business relationship in `businessType` and `predicate` properties.

This prevents dynamic Cypher relationship-type interpolation. Nested contract values such as entity properties, provenance, and sources are stored as JSON strings and normalized back into shared contract objects by the repository adapter.

The seed command is deterministic and idempotent for `canonical-baseline.leak-rate-quality-issue-trace`. It removes only nodes carrying that baseline ID before recreating the canonical entity and relationship set.

## Query Safety

- Runtime queries are static constants in `packages/neo4j-repository/src/queries.ts`.
- The only traversal template is `quality-issue-trace.direct-neighborhood.v1`.
- Traversal is physically bounded to depth 2 and limited to 200 entities.
- Seed IDs, status, relation allowlist, entity IDs, and limits are parameters.
- Runtime sessions use Neo4j READ access mode.
- `RepositoryGraphRetriever` revalidates seed presence, relation allowlist, endpoints, graphPlanId, and result limit.
- Seed write queries live separately and are never imported by the Agent Pipeline.

The local Community container uses a development account that can seed data. This is not presented as production read-only identity governance. A production pilot must use database-supported least-privilege credentials and secret management.

## Capabilities

Phase 3B implements bounded graph traversal, entity lookup, direct relation lookup, connectivity verification, and canonical seeding. Graph view projection, Ontology Registry, Semantic Catalog, and semantic search raise `CAPABILITY_NOT_IMPLEMENTED`; they do not fall back to local fixtures.

## Verification

Always-runnable tests use a driver contract double to verify normalization, static query usage, parameters, Pipeline parity, and no-fallback behavior. A real-container acceptance path is available through:

```bash
MKG_NEO4J_TEST=1 npm run neo4j:test
```

or the more concise `npm run neo4j:verify` after seeding. Both require a reachable Neo4j instance.
