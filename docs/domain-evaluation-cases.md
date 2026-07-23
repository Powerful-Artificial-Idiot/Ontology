# Domain Evaluation Cases

## Rich OP30 Leak Rate Expansion - 30 Cases

`packages/demo-data/evaluations/op30-leak-rate-rich-demo.v1.json` adds 30 deterministic cases:

| Category | Count | Coverage |
| --- | ---: | --- |
| Quality quantitative | 18 | specification, limits, latest metric, percentage math, units, revisions, stale-data blockers |
| Control Method / MSA | 4 | measurable-vs-conforming, range, calibration, GRR evidence |
| Engineering Change | 5 | V3.4 current, V3.5 proposed, missing validation, potential-vs-confirmed impact |
| Cross-domain | 4 | causal boundary, domain switch, governed documents, stale context |

Release metrics require 100% numeric accuracy, unit consistency, citation coverage, specification lookup, latest-metric selection, baseline disclosure, reaction-plan accuracy, version-state accuracy, and measurement/specification distinction. Blocking counts for invented/uncited/unitless/stale/wrong-revision/proposed-as-effective/unsupported-causal/hidden-baseline/LLM-arithmetic/unknown-ID output must remain zero.

Phase 5B contains 38 unique, active cases with effective assertions. No duplicate, skipped, or empty-assertion case contributes to release coverage.

The assertion column names the principal contract surfaces; each successful answer assertion also requires valid factual citations unless the case expects a governed rejection.

## Quality - 6 Cases

| Case ID | Severity | Locale | Intent | Principal assertions |
| --- | --- | --- | --- | --- |
| `leak-rate.en.direct` | blocker | en | `quality_issue_trace` | semantic, graph, evidence, answer, runtime |
| `leak-rate.zh.alias` | critical | zh | `quality_issue_trace` | aliases, evidence, answer, runtime |
| `leak-rate.unsupported-question` | critical | en | rejection | clarification required |
| `leak-rate.unsupported-target` | major | en | `quality_issue_trace` | no unknown entity/evidence/answer target |
| `leak-rate.multi-turn` | major | en | `quality_issue_trace` | bounded context and citations |
| `leak-rate.document-access-denied` | critical | en | rejection | citation gate blocks publication |

## Engineering Change - 12 Cases

| Case ID | Severity | Locale | Intent / boundary |
| --- | --- | --- | --- |
| `engineering-change.en.direct` | blocker | en | full `engineering_change_impact` path |
| `engineering-change.zh.alias` | critical | zh | governed aliases |
| `engineering-change.release-gate` | blocker | en | validation and release gate |
| `engineering-change.quality-control` | critical | en | quality-control and document impact |
| `engineering-change.proposed-not-effective` | blocker | en | proposed cannot become effective |
| `engineering-change.pending-not-released` | blocker | en | pending cannot become released |
| `engineering-change.unsupported-customer-impact` | critical | en | unsupported impact is not factual |
| `engineering-change.version-direction-mismatch` | critical | en | current/proposed mismatch rejected |
| `engineering-change.multi-turn` | major | en | bounded release context |
| `engineering-change.unknown-version` | critical | en | unknown version rejected |
| `engineering-change.ambiguous` | critical | en | unresolved change rejected |
| `engineering-change.document-access-denied` | critical | en | evidence denial blocks publication |

## Bottleneck - 13 Cases

| Case ID | Severity | Locale | Intent / boundary |
| --- | --- | --- | --- |
| `bottleneck.en.direct` | blocker | en | full `bottleneck_analysis` path |
| `bottleneck.zh.alias` | critical | zh | governed aliases |
| `bottleneck.metric-evidence` | blocker | en | cycle, WIP, waiting corroboration |
| `bottleneck.bounded-limitation` | blocker | en | no unsupported live confirmation |
| `bottleneck.largest-cycle-not-confirmation` | blocker | en | cycle time alone is insufficient |
| `bottleneck.unsupported-benefit-root-cause` | critical | en | no invented benefit or root cause |
| `bottleneck.explicit-unknown-override` | critical | en | unknown route/entity cannot override OP20 |
| `bottleneck.stale-metric-limitation` | blocker | en | dated sample is not fresh live evidence |
| `bottleneck.metric-unit-governance` | critical | en | unitless metric is not publishable |
| `bottleneck.cross-domain-multi-turn` | major | en | quality retest remains bounded shift risk |
| `bottleneck.unknown-operation` | critical | en | unknown operation rejected |
| `bottleneck.ambiguous` | critical | en | unresolved line question rejected |
| `bottleneck.document-access-denied` | critical | en | evidence denial blocks publication |

## Cross-domain - 7 Cases

| Case ID | Severity | Locale | Intent / boundary |
| --- | --- | --- | --- |
| `cross-domain.engineering-quality` | blocker | en | Engineering Change to Quality validation |
| `cross-domain.quality-value-stream` | blocker | en | Quality retest to Bottleneck shift risk |
| `cross-domain.quality-equipment-evidence` | critical | en | Quality, equipment, and evidence alignment |
| `cross-domain.quality-to-engineering-switch` | blocker | en | explicit Quality to Engineering switch |
| `cross-domain.engineering-to-bottleneck-switch` | blocker | en | explicit Engineering to Bottleneck switch |
| `cross-domain.bottleneck-to-quality-switch` | blocker | en | explicit Bottleneck to Quality switch |
| `cross-domain.ct-ambiguity` | critical | en | context-free CT requires clarification |

## Coverage Audit

No case IDs are duplicated. The former direct/alias cases remain complementary because they exercise different locales and semantic mappings. The direct and metric-focused Bottleneck cases overlap on canonical entities but assert different evidence surfaces. Access-denied cases intentionally repeat business questions under a different execution profile to validate the publication gate rather than language semantics.

The final expansion closes proposed/effective status, pending approval, unsupported impact, version direction, metric unit, stale metric, unsupported benefit/root cause, explicit entity override, explicit domain switch, stale context, and CT ambiguity boundaries without adding new canonical facts.
