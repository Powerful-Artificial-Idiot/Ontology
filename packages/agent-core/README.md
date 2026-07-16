# Agent Core

Provider-neutral deterministic Agent pipeline. Phase 2 runs entirely from canonical local fixtures and contains no LLM, database driver, vector search, orchestration framework, or query text generation.

The package exposes replaceable interfaces for semantic parsing, validation, safe graph-plan compilation, graph retrieval, document retrieval, evidence building, answer composition, citation validation, sessions, and audit events.

Run the deterministic acceptance suite from the repository root:

```bash
npm run test:agent-core
```
