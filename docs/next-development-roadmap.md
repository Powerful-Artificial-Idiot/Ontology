# Next Development Roadmap

## Current State

The repository provides a validated management Demo plus Knowledge Contract `1.1.0`, Ontology `1.1.0`, Demo Dataset `0.5.0`, SHACL, mappings, five competency queries, CI, and release packaging. The frontend baseline is Route 9 nodes, Ontology 26 classes and 31 relations, and Semantic 5 lanes and 8 concepts.

## Next-Stage Goal

Build an **Ontology-Connected Executable Demo** where TTL generates semantic artifacts, repositories enforce contracts, local and HTTP modes share behavior, and competency-query output can drive a frontend scenario.

## Priorities and Business Value

### P0: Trusted Baseline and Semantic Governance

Create a clean rollback point, exact regression tests, and an Explorer Alignment audit. Business value: management demonstrations remain reliable while domain owners gain an explicit boundary between enterprise semantics and presentation behavior.

Definition of done: clean release, exact frontend baselines, complete alignment classification, and full validate/test/build gate.

### P1: Executable Ontology and Service Boundary

Migrate Semantic first, generate ontology artifacts, combine semantic data with separate view configuration, add a mock HTTP boundary and dual repository modes, generate CQ-004 output, then migrate Ontology and Route.

Business value: the Demo proves the production integration shape without connecting production systems or replacing the validated UI.

Definition of done: all pages use repositories, Ontology Explorer is TTL-artifact driven, local/HTTP modes match, and one Semantic scenario comes from a competency query.

### P2: Recoverable Navigation

Introduce URL routing and deep links only after repositories stabilize page initialization.

Business value: review links can open a specific view, scenario, class, or entity and survive refresh.

Definition of done: direct navigation, refresh, Back/Forward, loading, and invalid-ID behavior are tested.

### P3: Delivery Optimization and Pilot Preparation

Split bundles at page boundaries and define vendor-neutral Pilot Runtime evaluation criteria.

Business value: faster delivery and an evidence-based graph-runtime selection process driven by the existing five competency questions.

Definition of done: improved initial bundle, no visual regression, documented Pilot dataset and benchmark.

## Main Risks

- Treating frontend alignment labels as approved domain ontology.
- Async repository loading remounting React Flow or resetting viewport state.
- Local and HTTP adapters drifting semantically.
- Generated artifacts being manually edited or becoming nondeterministic.
- Removing Legacy fixtures before all consumers and tests migrate.
- Adding routing or code splitting before data initialization is stable.

## Explicitly Deferred

Real MES/QMS/PLM integration, production graph databases, ontology editing, production authorization, complete ontology-grounded RAG, Route layout redesign, and component-level micro-chunking are not part of this stage.

## Demo to Pilot Runtime

After P1, replace the mock HTTP implementation with a Pilot Graph API behind the same contract. Use one product family, one route, 5-10 machines, 3-5 critical characteristics, one Control Plan, one PFMEA, measurement results, and 1-2 quality cases. Evaluate runtime candidates with the existing five competency questions before selecting technology.
