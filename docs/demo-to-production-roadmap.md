# Demo to Production Roadmap

## Phase 0: Management Demo

- Static TypeScript fixtures and local simulation.
- Blueprint presentation and interaction validation.
- Stable visual and interaction baseline.
- No production data authority or runtime service.

Current status: complete for the present demonstration scope.

## Phase 1: Ontology-Connected Demo

- Generate Ontology Explorer artifacts from released TTL.
- Continue migration to shared contracts and centralized Demo data.
- Exercise the mock or static repository adapter.
- Validate JSON Schema, SHACL, mappings, and competency queries in CI.

Current status: foundation implemented; complete runtime migration remains incremental.

## Phase 2: Pilot Backend

- Graph database and document index.
- Graph View API and Semantic Search API.
- Identity, authorization, tenant or plant scope, and audit logs.
- Source-system ingestion with provenance and temporal handling.
- Contract tests between frontend and API.

## Phase 3: Production Knowledge Platform

- Governed MES, QMS, PLM, DMS, and ERP integration.
- Data lineage, quality observability, and ontology lifecycle governance.
- Event and bi-temporal modeling.
- Ontology-grounded RAG and agent services.
- Controlled inference, human approval, and evidence-aware automation.

## Frontend Move Decision

Moving the Demo to `apps/knowledge-explorer-demo` is deferred until Phase 1 contract adoption is complete. The move must preserve commands and deployment through root aliases and must be covered by browser regression tests.
