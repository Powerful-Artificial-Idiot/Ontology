# Snapshot Knowledge Repository

Experimental, database-free bridge for the personal knowledge feasibility study.
It reads a governed JSON snapshot, maps it to the existing generic knowledge
contracts, and proves deterministic retrieval through the existing Evidence Pack
and citation-validation boundary.

This package deliberately does not implement the manufacturing
`KnowledgeRepository` interface. That interface also owns graph views, ontology
graphs, and the manufacturing semantic catalog. A formal implementation should
extract a smaller read-model repository contract before both domains share it.

The package does not call an LLM, write to Neo4j, or mutate source content.

## Contract governance

The reader uses JSON Schema 2020-12 and pins the byte-identical `0.1.0` schema
fixture to SHA-256
`d6750ab1b22080055542faefc6a02da513bba681b5cf5d0d633965bfa87f246f`.
It accepts compatible versions with major `0`, ignores unknown optional fields,
and fails closed for unsupported majors, missing required fields, schema drift,
invalid content hashes, governance errors, missing provenance, duplicate IDs,
and dangling relations.

## Non-production experiment

The three deterministic English queries and their planner are feasibility-only.
The runner lives under `experimental/personal-knowledge` and no production Agent
API module imports this package. A governed planner must replace those hard-coded
queries before a live personal Agent integration.
