# Architecture

## Layered Model

```text
Experience Layer
  Route Explorer | Ontology Explorer | Semantic Explorer
Application Service Layer
  View models | search | focus | repository interface
Semantic Contract Layer
  KnowledgeEntity | KnowledgeRelation | graph and search contracts
Ontology & Rule Layer
  OWL/Turtle | SHACL | mappings | SPARQL | competency questions
Knowledge Runtime Layer
  Mock adapter today | Graph API, search, inference, provenance later
Source System Layer
  MES | QMS | PLM | DMS | ERP
```

The current implementation concentrates on the Experience, Application Service, Semantic Contract, and Ontology-as-Code layers.

Released Turtle modules generate a deterministic, layout-free ontology artifact under `packages/demo-data/ontology/generated`. The release pipeline also exposes it at `dist/generated/ontology`; Explorer-specific positions, lanes, colors, and interaction state remain in separate view configuration.

## Runtime Data Path

```text
UI Component
  -> page view model and interaction state
  -> KnowledgeRepository
  -> MockKnowledgeRepository or HttpKnowledgeRepository
  -> legacy TypeScript fixtures or future Graph API
```

`src/repositories/legacyDemoData.ts` is the single compatibility entry point for current fixtures. It allows gradual migration without rewriting stable pages.

## Separation Rules

- Ontology classes and properties never contain canvas coordinates, opacity, expansion, focus, or lane position.
- Knowledge instances may contain source provenance and business validity intervals.
- Graph nodes and edges carry visual placement and view-specific metadata.
- API payload shape is validated by JSON Schema.
- Business instance constraints are validated by SHACL.
- Candidate inferences remain distinguishable from authoritative facts.

## Deployment

The frontend is a static Vite bundle. A full knowledge release additionally packages ontology, shapes, contracts, Demo data, checksums, and a manifest. Future runtime services can be deployed independently while retaining the same contracts.
