# Deterministic Source Mapping

The mapping path is deterministic:

```text
Envelope schema -> Source schema -> Versioned mapping -> Unit normalization
-> Exact canonical ID map -> Ontology/SHACL validation -> Authorization
-> Publication policy
```

Mappings use exact allowlists for source types, fields, IDs, relation targets, transforms and predicates. Ambiguous or unknown IDs, missing required values, invalid units/status, stale versions and same-version hash conflicts are quarantined.

No LLM, fuzzy auto-accept, generated canonical ID, generated ontology term, status promotion or relationship creation is allowed. OP30, M220, Leak Rate and Brake Booster retain the existing canonical IDs and QMS relation direction.
