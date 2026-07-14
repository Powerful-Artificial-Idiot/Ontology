# Frontend Demo Positioning

## Role

The current application is the **Management & Validation Experience Layer** and the **Product Interaction Reference** for the enterprise knowledge program.

It supports management blueprint demonstrations, domain-expert semantic review, manufacturing route exploration, ontology review, semantic mapping review, and validation of graph interactions.

## What It Is Not

The Demo is not:

- the authoritative store for enterprise knowledge;
- the only ontology editor;
- a replacement for MES, QMS, PLM, or document management;
- a production identity, authorization, audit, or data-governance service;
- a production graph database or RAG runtime.

## Validated Interaction Baseline

- Left-to-right manufacturing route navigation.
- Production, Quality, Engineering, and Value Stream views.
- Stack nodes, node expansion, Focus Mode, and one-hop highlighting.
- Edge metadata labels, semantic colors, and hover explanation.
- Ontology domain navigation, search, focus, hover, and detail inspection.
- Semantic term, ontology, system field, evidence, and AI-context mapping.
- Collapsible sidebars, detail panels, pan, zoom, and responsive layout.

These behaviors should be changed only through explicit product decisions and regression tests.

## Simulated Capabilities

Data, provenance, semantic search scores, AI context, source-system freshness, and graph responses are currently fixtures or deterministic local adapters. Authentication, authorization, audit, streaming updates, graph persistence, document retrieval, and production inference are not implemented.

## Relationship to Ontology and APIs

Ontology describes the enterprise domain. Knowledge instances describe actual objects and facts. View Models describe how the frontend lays them out and highlights them. The Demo consumes contract-aligned responses through a `KnowledgeRepository`; the default implementation is local, and the HTTP implementation is the future replacement boundary.
