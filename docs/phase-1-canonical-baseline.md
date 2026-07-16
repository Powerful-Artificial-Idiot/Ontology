# Phase 1 Canonical Baseline

## Scope

首个垂直场景为 **Leak Rate Quality Issue Trace**：

> OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险和文件？

本阶段只建立共享 contract、canonical fixture、兼容适配和验证，不接入 LLM、Neo4j、向量数据库或外部系统。

## Audit Findings

| Concern | Previous locations | Previous inconsistency | Phase 1 authority |
| --- | --- | --- | --- |
| OP30 | `mockGraph.ts`, Mock registry, Agent scripted data, ontology examples | `OP30` canvas ID and `operation.op30-leak-test` object ID mixed | `operation.op30` |
| M220 | `mockGraph.ts`, Mock registry, Agent references, ontology examples | descriptive ID coupled to label | `machine.m220` |
| Leak Rate | Route data, Semantic data, search JSON, Agent data | `quality.leak-rate`, `quality:leak-rate`, `leak-rate` mixed | `quality-characteristic.leak-rate` |
| Program | Route data, Agent data, evidence | version embedded with inconsistent separators | `program.leak-test.v3-4` |
| Failure mode | Route PFMEA object and Agent evidence | label alternated between Sealing Leak and leakage risk | `failure-mode.internal-leakage` |
| Control Plan | Route stack, evidence registry, scripted references | `doc.*` prefix and document revision formatting varied | `document.control-plan.cp-bb01.rev-a` |
| PFMEA | Route stack, evidence registry, scripted references | `doc.*` prefix and risk-object meaning mixed | `document.pfmea.pf-bb01.rev-b` |
| SOP | Route stack, evidence registry, scripted references | `doc.*` prefix and source label varied | `document.sop.op30-leak-test` |

Canvas node IDs such as `OP30` remain unchanged because they identify layout positions, not enterprise knowledge objects. Legacy knowledge IDs are accepted only through `resolveCanonicalKnowledgeId`.

## Reused Contracts

- `KnowledgeEntity` and `KnowledgeRelation` for canonical facts and provenance;
- `ProvenanceReference` for system/document source mapping;
- `KnowledgeRepository` for local and future HTTP access;
- existing Semantic and Ontology contracts for Explorer compatibility.

## Added Contracts

- `AgentTurnRequest` and `AgentTurnResponse`;
- `SemanticQueryPlan` and `ValidatedQueryPlan`;
- `EvidenceItem` and `EvidencePack`;
- `AgentClaim`, `AgentCitation`, and `CitationValidationResult`;
- `StructuredAgentTrace`, `AgentSession`, and `AgentAuditEvent`;
- `CanonicalKnowledgeBaseline`.

The contracts contain no Cypher, provider prompt, raw chain-of-thought, canvas state, or component state.

## Runtime Integration

- Route Stack objects overlay governed labels, versions, source metadata, and attributes from the canonical fixture.
- Semantic mappings target the same canonical Leak Rate object ID.
- Scripted Agent scenarios expose the canonical request, query plan, and evidence pack without changing their UI conversation model.
- Mock Repository resolves legacy IDs to canonical IDs and returns canonical direct relations.
- Control Plan, PFMEA, SOP, and QMS signal references are adapted from canonical Evidence Pack items.

## Validation Gates

- JSON Schema validation for request, query plan, evidence pack, response, and baseline;
- ontology type and predicate validation;
- entity/relation endpoint integrity;
- Evidence Pack entity and claim integrity;
- factual claim citation coverage;
- Route, Semantic, Repository, and Scripted Agent ID alignment;
- legacy alias compatibility.
