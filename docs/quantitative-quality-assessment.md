# Quantitative Quality Assessment

## Responsibility Boundary

`DeterministicQuantitativeQualityAssessor` owns arithmetic and boundary classification. The LLM does not choose the reference, calculate percentages, invent limits, or decide conformity.

Before calculation, the service requires exactly one approved/current applicable specification, approved/current control limits, valid current M220 calibration evidence, an effective Control Plan, canonical `sccm` units, and a valid current metric when a governed observation is selected.

## Reference Policy

Supported policies are:

- `explicit`
- `latest-governed-observation`
- `control-center-line`
- `compare-all-governed-baselines`

An ambiguous “increase 50%” request uses `compare-all-governed-baselines`; it never silently selects one baseline.

## Deterministic Results

| Reference | Formula | Result | Product status | Measurement status |
| --- | --- | ---: | --- | --- |
| Latest governed mean | `0.22 x 1.50` | 0.33 sccm | USL exceeded by 0.03 sccm (10%); nonconforming | Measurable |
| Control center line | `0.20 x 1.50` | 0.30 sccm | At USL, not exceeded | Measurable |
| Explicit example | `0.25 x 1.20` | 0.30 sccm | At USL, not exceeded | Measurable |

Both 50% projections exceed the internal action limit and require `reaction-plan.op30-leak-rate.rev-a`.

Arithmetic uses integer scaling and half-up rounding to 0.001 sccm. The response records the formula, input evidence IDs, reference source, rounding policy, compared boundaries, classification, and reaction-plan IDs as derived evidence. It does not record chain-of-thought.

## Fail-closed Conditions

Publication is blocked for a draft/conflicting specification, stale latest metric, non-canonical unit, obsolete Control Plan, missing/expired calibration evidence, unknown canonical IDs, or absent supporting evidence.
