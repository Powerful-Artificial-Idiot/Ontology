# Demo Data

Contract-aligned API fixtures and scenarios. Compatibility adapters may still read legacy TypeScript fixtures, but Explorer pages consume repository contracts; migration is incremental and protected by contract-to-ontology validation.

`ontology/generated/` is deterministically generated from the Turtle modules by `make ontology-artifacts`. The generated semantic artifact deliberately excludes canvas layout fields.

`semantic/generated/cq-004-machine-quality-impact.json` is built from the CQ-004 SPARQL result by `make semantic-scenarios`. It preserves source triples, inferred impact, evidence references, and a human-readable explanation.

`canonical/leak-rate-quality-issue-trace.json` is the first governed vertical baseline. It owns the stable IDs and core facts for OP30, M220, Leak Rate, the released leak-test program, quality risk, and governed documents. Route, Semantic, Repository, and Scripted Agent adapters consume this baseline while legacy IDs remain available through an explicit alias resolver.

- Dataset version: `0.5.0`
- Ontology version: `1.1.0`
- Contract version: `1.1.0`
- Agent contract version: `1.0.0`
- Leak Rate canonical baseline version: `1.0.0`
