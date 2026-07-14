# Demo Data

Contract-aligned API fixtures and scenarios. Compatibility adapters may still read legacy TypeScript fixtures, but Explorer pages consume repository contracts; migration is incremental and protected by contract-to-ontology validation.

`ontology/generated/` is deterministically generated from the Turtle modules by `make ontology-artifacts`. The generated semantic artifact deliberately excludes canvas layout fields.

`semantic/generated/cq-004-machine-quality-impact.json` is built from the CQ-004 SPARQL result by `make semantic-scenarios`. It preserves source triples, inferred impact, evidence references, and a human-readable explanation.

- Dataset version: `0.5.0`
- Ontology version: `1.1.0`
- Contract version: `1.1.0`
