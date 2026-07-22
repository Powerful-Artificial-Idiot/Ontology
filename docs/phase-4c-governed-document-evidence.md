# Phase 4C - Governed Document Evidence Ingestion and Retrieval

## Scope

Phase 4C adds a deterministic document evidence subsystem without changing the Agent transport, graph repository, semantic parser, answer composer, or frontend layout.

```text
Controlled JSON documents
  -> governed registry
  -> approval/version/effective-date validation
  -> SHA-256 verification
  -> allowlisted parser and normalization
  -> stable locator-based chunks
  -> deterministic full-text index
  -> graph and metadata filters
  -> access-policy filter
  -> EvidenceItem conversion
  -> graph/document Evidence Pack merge
  -> existing Answer Composer
  -> existing Citation Validator
```

The Leak Rate pilot contains controlled fixtures for Control Plan CP-BB01 Rev.A, PFMEA PF-BB01 Rev.B, SOP OP30 Rev.3, and a QMS mock record. These are demo documents, not enterprise files.

## Governance Boundary

The registry, not document text, owns:

- canonical document and logical IDs;
- document type and version;
- approval and lifecycle status;
- effective dates and owner;
- source system and source ID;
- content checksum and parser version;
- linked canonical entities and supported claim IDs;
- access classification, roles, and domains.

Only approved, effective, checksum-valid, non-superseded content can be indexed. Retrieval rechecks effective dates and access scope. The current access context is an explicit service-level demo filter, not a production identity system.

## Content Safety

Document content is untrusted data. The structured parser accepts only `schemaVersion` and `sections`; content cannot add entity links, claims, permissions, or governance fields. Instruction-like content such as prompt overrides or data-exfiltration requests is marked `quarantined` and excluded from retrieval. Raw files are never treated as executable instructions.

## Stable Citations

Document entities retain canonical IDs such as `document.sop.op30-leak-test`. Retrieved evidence uses a stable chunk ID derived from the governed document ID and locator, for example:

```text
evidence-chunk.document.sop.op30-leak-test.page-4-section-3-2-setup-and-golden-part-verification
```

Each chunk preserves document ID, version, page/section/sheet locator, document checksum, chunk checksum, parser version, ingestion time, owner, and access decision. The Citation Validator rejects document evidence with missing or invalid governance metadata.

## Configuration

Governed retrieval is the Agent API default:

```bash
MKG_AGENT_DOCUMENT_MODE=governed
MKG_DOCUMENT_REGISTRY_PATH=packages/demo-data/documents/leak-rate/document-registry.json
MKG_DOCUMENT_PRINCIPAL_ID=demo-agent-service
MKG_DOCUMENT_ROLE_IDS=agent-evidence-reader
MKG_DOCUMENT_DOMAIN_IDS=quality,manufacturing,engineering
```

`MKG_AGENT_DOCUMENT_MODE=canonical` preserves the pre-Phase-4C in-memory fixture retriever as an explicit rollback mode.

## Acceptance

```bash
npm run documents:verify
npm run typecheck
npm run lint
npm test
npm run build
```

No real OpenAI request is required for Phase 4C. Provider acceptance remains:

- Semantic Parser live provider acceptance: pending.
- Answer Composer live provider acceptance: pending.

## Deferred

- PDF/DOCX/XLSX parsing and OCR;
- user uploads and cloud parsing;
- embeddings, vector databases, reranking, and GraphRAG;
- production identity/authorization;
- enterprise source connectors and real controlled documents.
