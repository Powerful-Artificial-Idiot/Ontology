# Phase 5E - Governed Knowledge Authoring

Phase 5E adds a controlled authoring path beside the read-only `KnowledgeRepository`. It does not turn React Flow nodes into database records: `OP30` remains a presentation node ID while `operation.op30` remains the canonical entity ID.

The required path is `Draft -> Submitted -> Approved -> Published`. Demo administrators may hold all permissions, but must call submit, approve, and publish separately. There is no direct, force, or skip-validation publication endpoint.

Only `published` changes are projected into repository reads. Draft, submitted, changes-requested, approved, rejected, and withdrawn content remains outside Explorer queries, Agent graph retrieval, Evidence Packs, and citations. Publication does not fabricate document evidence.

Route Explorer renders non-published entity changes as a presentation-only overlay with dashed borders and workflow badges. New draft nodes use a separate `DRAFT-` React Flow identity; existing published node IDs remain stable. Updating this overlay does not call `fitView`, reset Focus Mode, clear selection, or write presentation coordinates into canonical entity properties. Validation details, including version conflicts, are rendered from the server response rather than recomputed in the browser.

The MVP enables Product, Operation, Machine, QualityCharacteristic, FailureMode, and EngineeringChange. `Part` is not enabled because the current ontology has no stable Part contract. Ontology, SHACL, mappings, connector profiles, documents, traces, sessions, audit records, and evidence packs are not authorable.

Deferred: enterprise workflow integration, multi-approver flows, directory mapping, notifications, bulk import, real-time collaboration, automatic merge, source-system writeback, ontology/SHACL authoring, and LLM-assisted authoring.
