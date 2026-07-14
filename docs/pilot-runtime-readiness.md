# Pilot Runtime Readiness

## Purpose

The Pilot validates that the executable Demo architecture can operate on governed manufacturing data behind the existing Knowledge Contract. It is not a production rollout, graph-database procurement exercise, or replacement for MES, QMS, PLM, and DMS.

## Bounded Dataset

The first Pilot dataset must stay small enough for evidence review and large enough to exercise cross-domain queries:

- One product family and one released manufacturing route.
- Five to ten machines with current and historical configuration versions.
- Three to five Critical or CTQ characteristics.
- One released Control Plan and one released PFMEA.
- Representative measurement results linked to operation, machine, characteristic, lot, and time.
- One or two quality incident cases with evidence and corrective-action context.
- Source records from MES, QMS, PLM, and document management represented through non-production extracts or governed synthetic data.

Every entity and relationship requires a stable business identifier, source-system reference, provenance, owner, status, version where applicable, and validity interval where time affects meaning.

## Runtime Boundary

The frontend continues to depend only on `KnowledgeRepository` and Knowledge Contract responses. A Pilot adapter replaces the Mock API internally while preserving:

- `GET /api/meta`
- `GET /api/entities/:id`
- `GET /api/entities/:id/relations`
- `GET /api/graph/views/:viewId`
- `GET /api/ontology/graph`
- `GET /api/semantic/catalog`
- `POST /api/semantic/search`

Ontology layout, React Flow positions, focus state, colors, icons, and canvas interaction state remain View Model concerns and are not persisted as manufacturing ontology facts.

## Readiness Workstreams

### Data Governance

- Confirm product, route, operation, machine, characteristic, Control Plan, and PFMEA owners.
- Define source-of-record precedence and duplicate resolution.
- Approve identifier mapping and version/effective-time rules.
- Review inferred statements separately from asserted source facts.
- Define retention and redaction for measurements and incident evidence.

### Ingestion and Validation

- Produce repeatable source extracts with checksums and dataset version.
- Normalize extracts into contract-native entities and relations.
- Run ontology parse, SHACL, source mapping, and referential-integrity checks before publish.
- Quarantine invalid records; do not silently substitute Demo fixtures.
- Publish a data-quality report with rejected counts and reasons.

### Operations and Security

- Isolate Pilot environments and credentials from the frontend bundle.
- Use read-only source credentials and least-privilege runtime access.
- Record request trace IDs, query duration, result counts, dataset version, and ontology version.
- Define backup/restore, re-index, rollback, and dataset promotion procedures.
- Establish support ownership and an incident path before management demonstrations.

## Pilot Acceptance Gate

The Pilot is ready for evaluation when:

1. The bounded dataset is approved by domain owners.
2. All five competency queries return reviewed results or an explicitly approved empty result.
3. SHACL and mapping validation pass with no unexplained violations.
4. Local Mock and Pilot HTTP modes remain contract-compatible.
5. Route, Ontology, and Semantic Explorer baselines render without UI regressions.
6. Provenance can be traced from each benchmark answer to source evidence.
7. Effective-time queries return the correct historical version.
8. Performance, recovery, access-control, and operational evidence is captured using the evaluation plan.

## Explicit Non-Goals

Production cutover, write-back to source systems, production authorization design, global enterprise ontology coverage, a full ontology editor, unrestricted AI retrieval, and high-availability architecture are deferred until the Pilot exit review.

## Exit Decision

The Pilot produces one of three outcomes: proceed to production architecture, extend the Pilot for a named evidence gap, or stop because a contract, governance, query, security, or operational requirement cannot be met. Runtime selection follows benchmark evidence; it does not precede it.
