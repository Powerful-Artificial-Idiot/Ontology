# Graph Runtime Evaluation

## Evaluation Principle

Evaluate runtime candidates against the current ontology, SHACL shapes, mappings, provenance model, and five competency questions. Do not select a product first and redesign the questions around its strengths.

## Mandatory Capabilities

| Dimension | Evidence required |
| --- | --- |
| RDF and SPARQL | Import the released Turtle modules and execute the repository SPARQL queries without semantic rewrites. |
| OWL reasoning | Document supported profiles, materialization/query-time behavior, explainability, and operational cost. |
| SHACL | Run the released shapes in CI and at ingestion; report violations with entity and source context. |
| Named Graphs | Separate ontology, source-system extracts, inferred facts, and release snapshots. |
| RDF-star | Demonstrate statement-level provenance or document the equivalent standard representation and tradeoff. |
| Effective time | Resolve valid versions at an `asOf` time without overwriting history. |
| Provenance | Trace answers to source record, document locator, ingestion run, and inference rule. |
| Vector search | Support governed semantic retrieval or integrate it without bypassing graph authorization and provenance. |
| Full-text search | Search labels, aliases, identifiers, and evidence references with predictable ranking. |
| Authorization | Enforce least privilege at API and relevant graph scope; document limits for predicate/graph-level control. |
| Query performance | Capture cold/warm latency, throughput, timeout behavior, and result correctness for all five CQs. |
| Operations | Demonstrate deployment, monitoring, backup, restore, upgrade, re-index, and rollback. |
| Licensing | Record edition limits, production rights, support model, lock-in, and forecast cost. |
| Stack integration | Provide maintainable Python ingestion and TypeScript/HTTP access behind `KnowledgeRepository`. |

Failure on RDF/SPARQL compatibility, provenance, effective time, authorization, backup/restore, or any required competency-query result is disqualifying unless an approved architecture component closes the gap without changing frontend contracts.

## Competency-Question Benchmark

| ID | Question | Required evidence |
| --- | --- | --- |
| CQ-001 | Which operations are required for a product? | Ordered product-to-operation path, asserted route relations, stable identifiers, and source provenance. |
| CQ-002 | Which machines execute an operation? | Operation-machine assignments with validity/status and source-system mapping. |
| CQ-003 | Which Control Plan Version is currently effective for a Critical Characteristic? | Version resolution at a given time, characteristic link, document evidence, and deterministic current-version selection. |
| CQ-004 | Which failure modes of a machine may affect a quality characteristic? | Asserted machine-to-failure and failure-to-characteristic links, identified inference, evidence, and explanation. |
| CQ-005 | Which Machine Configuration Version is valid at a point in time? | Historical configuration selection using explicit validity intervals and provenance. |

Each run records candidate/version, dataset/ontology/contract versions, load method, hardware profile, query text checksum, cold and warm latency, result count, expected-result comparison, query plan, and failures. Correctness is evaluated before speed.

## Test Dataset and Scale Steps

1. **Conformance:** Current governed example graph and expected CQ outputs.
2. **Pilot:** One product family, one route, 5–10 machines, measurements, Control Plan, PFMEA, and incidents.
3. **Scale probe:** Synthetic multiplication of the Pilot graph while preserving topology and time distribution.

Scale probes must not replace Pilot correctness testing. Synthetic results are excluded from business conclusions.

## Scoring

Score each dimension from 0 to 5 using attached evidence:

- `0`: unsupported or no evidence.
- `1`: conceptual claim only.
- `2`: prototype with major semantic or operational gaps.
- `3`: Pilot requirement met with documented limitations.
- `4`: requirement met with automation and operational evidence.
- `5`: requirement exceeded with standards-based portability and tested recovery.

Recommended weighting: semantic conformance 25%, CQ correctness 25%, provenance/temporal governance 15%, security 10%, operations/recovery 10%, performance 10%, integration/licensing 5%. A weighted score cannot override a disqualifying failure.

## Evaluation Procedure

1. Freeze ontology, shape, mapping, query, expected-result, and dataset versions.
2. Load the same release into each candidate using documented scripts.
3. Run parse, SHACL, mapping, and referential checks.
4. Execute all five CQs and compare normalized results.
5. Review asserted, inferred, evidence, and explanation fields with domain owners.
6. Run effective-time, authorization, failure, backup, and restore tests.
7. Run cold/warm performance tests with identical resource envelopes.
8. Publish raw evidence, scores, exceptions, and total-cost assumptions.
9. Make a selection only after architecture and domain-owner review.

## Decision Record

The final record must include rejected candidates and reasons, unresolved risks, required companion services, contract impact, migration/exit strategy, licensing assumptions, and a dated re-evaluation trigger. No candidate is approved solely from a vendor demonstration.
