# Mapping Guidelines

1. Map source fields to stable ontology terms, not frontend labels.
2. Preserve source system, source ID, mapping version, effective date, and transformation.
3. Use deterministic transforms where possible and document unit conversion.
4. Do not silently merge records solely because labels are similar.
5. Keep source-system identifiers as provenance; do not use them as universal identity without an identity rule.
6. Validate mapping targets against the released ontology.
7. Treat schema drift as a failed mapping release, not an automatic ontology change.

Mappings under `mappings/mes`, `mappings/qms`, and `mappings/plm` conform to `mapping-schema.json`. `demo-type-mappings.yaml` is a compatibility bridge from current frontend labels to formal ontology terms and is not a source-system integration specification.
