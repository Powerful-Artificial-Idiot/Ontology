# Agent Core

Provider-neutral Agent pipeline. Deterministic parsing remains the default. Phase 4A adds provider-neutral `LlmSemanticParser` and `HybridSemanticParser` implementations while keeping graph compilation, retrieval, evidence, answer composition, and citation validation deterministic.

The package exposes replaceable interfaces for semantic parsing, validation, safe graph-plan compilation, graph retrieval, document retrieval, evidence building, answer composition, citation validation, sessions, persisted turns, and queryable audit events.

Phase 3A exposes this package through `services/agent-api`. The in-memory stores are deterministic development adapters and are cleared whenever the service restarts.

Phase 3B adds `RepositoryGraphRetriever`, which translates the validated `GraphQueryPlan` into the shared bounded `KnowledgeRepository.traverseGraph` request and validates repository output before it enters evidence assembly. The Pipeline does not import Neo4j or a database driver.

The LLM parser receives only a bounded candidate catalog and allowlists. Its draft is rejected on unknown fields, IDs, intents, relations, facets, constraint keys, operators, or value types. The backend reconstructs the canonical `SemanticQueryPlan`; provider output is never treated as enterprise fact and is not retained as raw chain-of-thought.

Phase 4B adds a bounded `EvidenceContextProjector`, strict LLM answer draft validation, and template/LLM/hybrid composer modes. Visible summary, finding, and risk text must reference governed claim IDs; actions must reference Evidence Pack IDs. The final deterministic citation gate checks required claims, classification, evidence support, status, and duplicate/unknown IDs before publication.

Run the deterministic acceptance suite from the repository root:

```bash
npm run test:agent-core
```
