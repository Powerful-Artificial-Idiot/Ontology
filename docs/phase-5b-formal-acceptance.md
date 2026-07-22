# Phase 5B Formal Acceptance

## Frozen Baseline

- Branch: `main`
- Implementation baseline: `dadc484 Implement Phase 5B domain expansion baseline`
- Implementation baseline tag: `phase-5b-implementation-baseline`
- Parent baseline: `9b6316c Add agent evaluation and validated DeepSeek provider`
- No completion commit or completion tag has been created.

The final acceptance delta remains uncommitted for review.

## Deterministic Evaluation

| Domain | Dataset | Result | Citation coverage |
| --- | --- | ---: | ---: |
| Quality | `evaluation.leak-rate-quality-trace@1.0.0` | 6/6 | 100% |
| Engineering Change | `evaluation.engineering-change-impact@1.2.0` | 12/12 | 100% |
| Bottleneck | `evaluation.bottleneck-analysis@1.2.0` | 13/13 | 100% |
| Cross-domain | `evaluation.phase5b-cross-domain@1.1.0` | 7/7 | 100% |
| Total | Four governed datasets | 38/38 | 100% |

The coverage gate requires at least 6 Quality, 12 Engineering Change, 12 Bottleneck, 6 cross-domain, and 36 total valid cases. Duplicate IDs, skipped cases, and cases without effective assertions do not count. A missing domain is a blocking failure.

Mock and live seeded Neo4j formal release gates both passed. All critical and blocker failures are zero. The governance metrics for proposed-as-effective, unapproved-as-released, current/proposed mismatch, potential-as-confirmed, unsupported bottleneck confirmation, unitless metric publication, wrong metric version, unsupported benefit/root cause, stale context leakage, unknown references/objects, draft leakage, and obsolete leakage are zero. Publication gate accuracy, ontology relation validity, SSE sequence integrity, and citation coverage are 100%.

## Competency Queries

CQ-001 through CQ-011 pass. Phase 5B adds CQ-008 engineering release decision, CQ-009 quality-control impact, CQ-010 bottleneck risk and metrics, and CQ-011 quality retest constraint-shift risk.

## DeepSeek Live Acceptance

- Provider: `deepseek-chat-completions`
- Transport: `chat-completions`
- Model: `deepseek-v4-flash`
- Fallback used: false

| Scenario | Semantic | Answer | Full pipeline | Citation coverage |
| --- | --- | --- | --- | ---: |
| Quality Issue Trace | passed | passed | passed | 100% |
| Engineering Change Impact | passed | passed | passed | 100% |
| Bottleneck Analysis | passed | passed | passed | 100% |
| Cross-domain Engineering / Quality / Bottleneck | passed | passed | passed | 100% |

The final case expansion did not modify a provider adapter, shared Semantic prompt, shared Answer prompt, canonical reconstruction, Answer policy, language validator, or live acceptance runner. The existing real DeepSeek artifact therefore remains applicable; injected provider and HTTP regressions are rerun locally. OpenAI Semantic Parser and Answer Composer live acceptance remain pending.

## Runtime Findings

The earlier live run returned Chinese text in an English Quality answer. Existing language validation rejected it before publication. The shared Answer instruction was strengthened and the credentialed rerun passed. No schema, ontology, SHACL, safe query, evidence, claim, citation, or publication gate was relaxed.

The final cross-domain expansion added explicit scenario switching. Session context now retains audit turn lineage while replacing stale entity IDs, assumptions, scenario ID, and active topic with the explicitly selected domain.

Prompt text, raw provider output, `reasoning_content`, authorization data, API keys, chain-of-thought, and `.data` reports are not tracked.

## Remaining Limitations

- Canonical fixtures are controlled demo data, not enterprise production facts.
- No vector retrieval, multi-agent orchestration, or production identity system is included.
- Bottleneck conclusions remain bounded deterministic assessments, not live plant confirmation.
- OpenAI live provider acceptance is pending.

## Commands

```bash
npm run phase5b:acceptance
MKG_EVALUATION_REPOSITORY_MODE=neo4j npm run phase5b:acceptance
npm test
npm run neo4j:test
make validate
```

Sanitized acceptance artifacts are written under `.data/evaluations/` and remain untracked.

Final regular Vitest result: 163 passed with one conditional Neo4j test skipped. The explicit Neo4j live suite passed separately. TypeScript, ESLint, production build, Ontology, SHACL, mappings, contracts, governed documents, CQ-001 through CQ-011, production dependency audit, secret scan, and credential-pattern scan passed.
