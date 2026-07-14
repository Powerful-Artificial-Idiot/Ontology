# Ontology Migrations

Ontology changes are append-only migration records. Each migration states source and target versions, affected terms, compatibility impact, and any SPARQL update required for stored instances. Never infer business effective time from the Git commit time.

File naming: `YYYYMMDD-short-description.md`.
