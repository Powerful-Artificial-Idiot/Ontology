# Phase 2 Deterministic Agent Pipeline

## Scope

Phase 2 runs **Leak Rate Quality Issue Trace** end to end from local canonical data. It intentionally contains no LLM, Neo4j, vector database, LangGraph, Langfuse, external backend, or generated Cypher.

## Runtime Flow

```text
AgentTurnRequest
  -> Deterministic Semantic Parser
  -> Strict Query Plan Validator
  -> Canonical Ontology Validator
  -> Allowlisted Graph Query Plan Compiler
  -> In-Memory Canonical Graph Retriever
  -> In-Memory Document Evidence Retriever
  -> Evidence Pack Builder
  -> Deterministic Answer Composer
  -> Citation Validator
  -> AgentTurnResponse + Structured Trace
```

All nine stages implement interfaces from `packages/agent-core/src/types.ts`. Future adapters can replace one stage without changing the orchestrator or frontend contract.

## Safety Boundary

- The semantic parser returns structured IDs and intent, never query text.
- The compiler accepts only a validated `quality_issue_trace` intent and an allowlisted template ID.
- `GraphQueryPlan` is read-only and bounded by `maxDepth` and `resultLimit`.
- The plan contains no Cypher, SQL, SPARQL, provider prompt, or executable text.
- Retrieval reads only canonical entities, relations, and Evidence Pack fixtures.
- Citation validation checks evidence existence, active status, and `supportsClaimIds` before response release.
- Structured trace stores summaries, IDs, tools, status, and duration, not chain-of-thought.

## Replaceable Components

| Interface | Phase 2 implementation | Future replacement |
| --- | --- | --- |
| `SemanticParser` | deterministic term matcher | constrained LLM parser |
| `OntologyQueryPlanValidator` | canonical baseline validator | ontology registry service |
| `GraphQueryCompiler` | single allowlisted template | reviewed template registry |
| `GraphRetriever` | in-memory BFS | Neo4j repository adapter |
| `DocumentEvidenceRetriever` | canonical Evidence Pack filter | governed document search |
| `AnswerComposer` | bilingual deterministic template | evidence-only LLM composer |
| `CitationValidator` | claim/evidence support check | richer semantic entailment policy |
| `AgentSessionStore` | in-memory store | durable session database |
| `AgentAuditSink` | in-memory records | OpenTelemetry/audit infrastructure |

## Session And Audit

`DeterministicAgentClient` implements the shared `ContractAgentClient`. Optional sessions inherit only canonical resolved entity IDs, turn IDs, explicit assumptions, language, mode, and active topic. Previous natural-language answers are not promoted to enterprise facts.

Every completed or failed turn emits an `AgentAuditEvent`. The local sink is test-only and can be replaced without modifying pipeline stages.

## Tests

`tests/backend/deterministic-agent-pipeline.test.ts` verifies:

- complete nine-stage execution;
- Chinese and English answers with identical evidence IDs;
- bounded read-only Graph Query Plan;
- clarification instead of unsupported guessing;
- ontology rejection before retrieval;
- citation failure blocking release;
- multi-turn bounded context and audit events;
- cancellation.
