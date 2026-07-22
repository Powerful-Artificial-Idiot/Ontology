# Phase 5B - Engineering Change And Bottleneck Domain Expansion

## Status

Implemented for deterministic, governed execution on 2026-07-22.

- Engineering Change evaluation: `evaluation.engineering-change-impact@1.0.0`, 4/4 passed
- Bottleneck evaluation: `evaluation.bottleneck-analysis@1.0.0`, 5/5 passed
- Citation coverage: 100% for both datasets
- Cross-domain bottleneck/quality multi-turn case: passed
- Ontology modules: Engineering and Value Stream
- Competency queries: CQ-006 and CQ-007 passed
- DeepSeek live acceptance for the two new domains: pending
- OpenAI live acceptance for the two new domains: pending

The earlier DeepSeek acceptance remains valid for Leak Rate Quality Issue Trace. It is not treated as evidence that the two new domain prompts and outputs have passed a live provider call.

## Shared Architecture

```text
Scenario ID
  -> RegisteredCanonicalKnowledgeSource
  -> DeterministicScenarioSemanticParser
  -> existing Query Plan and Ontology validation
  -> existing allowlisted GraphQueryPlan compiler
  -> Mock or Neo4j KnowledgeRepository
  -> scenario-selected governed document registry
  -> existing Evidence Pack builder
  -> template, LLM, or hybrid Answer Composer
  -> existing Citation Validator publication gate
  -> existing Trace, SSE, Session, Audit, and Evaluation layers
```

No domain-specific copy of the Pipeline, API, SSE service, Repository interface, Evidence Pack, Answer Composer interface, Citation Validator, or Evaluation Framework was introduced.

## Canonical Scenarios

### Engineering Change Impact Analysis

- Scenario: `engineering-change-impact`
- Intent: `engineering_change_impact`
- Safe template: `engineering-change-impact.dependency-scope.v1`
- Seeds: `machine.m220`, `program.leak-test.v3-4`, `program.leak-test.v3-5`
- Governed scope: M220, OP30, Leak Rate, proposed V3.5, ECR, validation record, Control Plan, and SOP
- Publication rule: V3.5 release cannot be recommended without completed validation and controlled-document alignment

### Bottleneck Analysis

- Scenario: `bottleneck-analysis`
- Intent: `bottleneck_analysis`
- Safe template: `bottleneck-analysis.flow-metrics.v1`
- Seed: `operation.op20`
- Governed scope: route operations, OP20 cycle/WIP/waiting signals, OP30 retest risk, line balance, standard work, MES sample, and QMS sample
- Publication rule: OP20 is a bounded bottleneck candidate; the fixtures cannot prove a sustained live constraint or actual downstream shift

## Evidence Governance

The document type registry now supports engineering-change requests, validation records, line-balance studies, value-stream maps, standard work, and MES records in addition to the Phase 4C quality document types. Every item continues to require checksum, approval/effective state, source/version metadata, stable chunk locator, access decision, and claim linkage.

Default registry selection is by canonical `scenarioId`. Access denial still removes protected chunks and causes the unchanged Citation Validator to block publication when required factual claims lose support.

## Graph Safety

The same parameterized Neo4j traversal supports three allowlisted template IDs. Its static path ceiling is three hops, while `$maxDepth` enforces each validated plan's actual bound. Write clauses, procedure calls, dynamic query text, and arbitrary LLM Cypher remain prohibited.

The canonical seed command now loads the deduplicated union of all three scenario baselines. Legacy Leak Rate seed exports remain as compatibility aliases.

## Validation Commands

```bash
npm run phase5b:fixtures
MKG_EVALUATION_DATASET_PATH=packages/demo-data/evaluations/engineering-change-impact.v1.json npm run agent:evaluate
MKG_EVALUATION_DATASET_PATH=packages/demo-data/evaluations/bottleneck-analysis.v1.json npm run agent:evaluate
npm run typecheck
npm run lint
npm test
npm run build
make validate
```

Live Neo4j acceptance requires the local Docker service and explicit server-side credentials. Live LLM acceptance for the two new domains remains a separate future gate and must run with fallback disabled.
