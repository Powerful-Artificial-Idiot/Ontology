# Phase 5D - Source-system Connectors and Governed Data Synchronization

## Status

Phase 5D establishes a provider-neutral synchronization boundary and validates controlled local MES, QMS, and PLM extracts plus a localhost HTTP fixture adapter. It does not claim live enterprise connectivity.

Validated scope:

- typed source record, extract manifest, checkpoint, change-set, report, and snapshot contracts;
- deterministic controlled-file connector with directory containment and SHA-256 checks;
- versioned declarative mappings with exact canonical ID allowlists;
- approval, effective-state, tenant, domain, role, cursor, stale-record, source-authority, and tombstone controls;
- dry-run and atomic apply modes;
- per-source checkpoints and extract-level idempotency;
- sanitized synchronization audit events;
- an optional read-only `SynchronizedKnowledgeRepository` decorator;
- controlled fixtures for MES `OP30/M220`, QMS `Leak Rate`, and PLM `Brake Booster`.
- governed connector profiles, runtime-only source authentication and a connector service principal;
- endpoint/path allowlists, redirect denial, SSRF checks and bounded HTTP extraction;
- persistent run, quarantine, journal and lineage stores;
- separate graph and document publication ports, including a static-query Neo4j publisher;
- reconciliation, CLI, protected management API and a 40-case formal release gate.

Live MES, QMS, and PLM endpoints, credentials, CDC, enterprise scheduling, owner approval workflow, and source writeback remain pending.

Formal controlled-fixture closure is evaluated separately from enterprise readiness. A passing fixture report does not imply that an enterprise endpoint, enterprise identity provider, or source credential has been accepted.

## Architecture

```text
Controlled MES / QMS / PLM extract
  -> SourceSystemConnector
  -> manifest, path, file checksum and record checksum validation
  -> approved versioned Sync Mapping
  -> canonical ID and ontology validation
  -> Phase 5C authorization
  -> deterministic change planning
  -> dry-run | atomic apply
  -> GovernedSyncSnapshot + per-source checkpoint
  -> optional SynchronizedKnowledgeRepository
  -> existing Agent retrieval and evidence pipeline
```

The Agent Pipeline does not know how source records are extracted or mapped. Source connectors do not call the LLM, generate ontology terms, generate canonical IDs, or execute database writes. The repository decorator only overlays synchronized facts on canonical objects already returned by the underlying read-only repository.

## Contracts And Fixtures

- contracts: `packages/knowledge-contracts/src/sourceSync.ts`;
- JSON Schemas: `packages/knowledge-contracts/schemas/source-*.schema.json`;
- runtime implementation: `packages/source-sync`;
- governed mappings: `mappings/mes`, `mappings/qms`, `mappings/plm`;
- controlled extracts: `packages/demo-data/source-extracts`.

The pilot intentionally uses exact source-to-canonical maps. An unknown source ID, source field, relation target, ontology type, or predicate fails validation or is quarantined. Connectors cannot manufacture a new canonical object.

## Governance Rules

An extract can be applied only when:

1. its manifest is approved and effective;
2. connector, manifest, request, and mapping source system agree;
3. the exact mapping ID and version are configured and effective;
4. file and stable record checksums match;
5. tenant and domain match the server-derived authorization context;
6. the principal has `source-sync:apply`;
7. the cursor advances beyond the last applied checkpoint;
8. every source ID and relation endpoint maps to an existing canonical ID;
9. no newer record or conflicting source authority owns the same synchronized object.

Deletion is explicit. Missing records do not imply deletion; a governed tombstone is required. Tombstoning also removes relations owned by that source record.

## Persistence And Data Minimization

The reference file store writes an atomic JSON snapshot through temporary-file rename. It persists mapped canonical facts, provenance, source record version/checksum, mapping version, checkpoints, and applied extract IDs. It does not persist the raw source payload or the extract body.

Audit events contain source, tenant, outcome, and aggregate counts. They exclude credentials, authorization headers, record checksums, and raw payloads.

The file store is a deterministic pilot implementation, not a production distributed transaction system. Multi-process locking, database transactions, retention, backup, disaster recovery, and centralized audit export remain future work.

## Formal Closure Commands

```bash
npm run source-sync:formal-tests
npm run source-sync:fixture-live
npm run source-sync:formal
npm run neo4j:publication-test
```

`fixture-live` binds localhost only and generates a process-local token. Sanitized reports are written below `.data/source-sync/`, which is ignored by Git. The Neo4j live command is conditional and must be reported independently from regular Vitest.

## Validation

```bash
npm run source-sync:acceptance
npm run typecheck
npm run lint
.venv/bin/python scripts/validate_mappings.py
.venv/bin/python scripts/validate_demo_contracts.py
```

The acceptance report and synchronization snapshot are written below `.data/`, which is excluded from Git. The release gate validates source coverage, canonical resolution, ontology direction, checkpoint recovery, idempotency, authorization denial, derived-state-only persistence, and audit sanitization.

## Deferred Production Acceptance

- enterprise endpoint authentication and secret rotation;
- incremental/CDC adapters and scheduler ownership;
- policy-configurable cross-source precedence;
- source-side schema registry and compatibility negotiation;
- distributed transactional store and concurrent worker coordination;
- operator review UI and domain-owner approval;
- live source latency, volume, replay, recovery, and penetration testing;
- controlled writeback to source systems.

Until these controls pass formal acceptance, the implementation must be described as a governed synchronization pilot, not a production MES/QMS/PLM integration.
