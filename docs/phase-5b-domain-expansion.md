# Phase 5B - Engineering Change And Bottleneck Domain Expansion

## Status

Implementation baseline frozen as commit `dadc484` on 2026-07-22. Formal acceptance closure is implemented as an uncommitted review layer on top of that baseline.

- Quality evaluation: `evaluation.leak-rate-quality-trace@1.0.0`, 6/6 passed
- Engineering Change evaluation: `evaluation.engineering-change-impact@1.2.0`, 12/12 passed
- Bottleneck evaluation: `evaluation.bottleneck-analysis@1.2.0`, 13/13 passed
- Cross-domain evaluation: `evaluation.phase5b-cross-domain@1.1.0`, 7/7 passed
- Citation coverage: 100% across all 38 deterministic cases
- Formal release gate: passed with both Mock and Neo4j repositories
- Ontology modules: Engineering and Value Stream
- Competency queries: CQ-001 through CQ-011 passed
- DeepSeek Quality, Engineering Change, Bottleneck, and cross-domain live acceptance: passed
- DeepSeek provider: `deepseek-chat-completions`, transport `chat-completions`, model `deepseek-v4-flash`, fallback used: false
- DeepSeek citation coverage: 100% in every live scenario
- OpenAI Semantic Parser and Answer Composer live acceptance: pending

OpenAI and DeepSeek acceptance remain independent. No DeepSeek result is used to mark OpenAI as passed.

## Formal Acceptance Closure

The provider-aware policy `release-gate.phase5b-formal-acceptance@1.0.0` requires:

- 100% deterministic case pass rate and citation coverage;
- zero blocker or critical failures;
- all runtime probes passing;
- Semantic Parser, Answer Composer, and Full Pipeline live acceptance;
- explicit Engineering Change, Bottleneck, and cross-domain scenario entries;
- `fallbackUsed: false` and 100% citation coverage for every required live scenario.
- minimum case counts of Quality 6, Engineering Change 12, Bottleneck 12, cross-domain 6, and total 36;
- rejection of duplicate, skipped, empty-assertion, and missing-domain coverage.

The formal runner passed with both Mock and Neo4j repositories and writes sanitized reports to `.data/evaluations/`. The real provider artifact and reports remain untracked.

The first expanded live run exposed a Quality answer containing Chinese text for an English request. The existing language validator blocked publication. The shared Answer Composer prompt now makes the requested language authoritative for every user-facing field and requires an English-output character check. No schema, ontology, query, evidence, claim, or citation validation was relaxed. The credentialed rerun passed all four scenarios.

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
npm run deepseek:acceptance
npm run phase5b:acceptance
npm run typecheck
npm run lint
npm test
npm run build
make validate
```

Live Neo4j acceptance requires the local Docker service and explicit server-side credentials. Live LLM acceptance must use server-side credentials and run with fallback disabled.
