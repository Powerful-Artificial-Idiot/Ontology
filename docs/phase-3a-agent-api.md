# Phase 3A — Agent API And Session Store

## Scope

Phase 3A exposes the deterministic `packages/agent-core` pipeline as a real HTTP service. It does not introduce an LLM, Neo4j, vector database, LangGraph, Langfuse, external identity, enterprise data, or Text-to-Cypher.

## Runtime Flow

```text
Agent Workspace
  -> ApiAgentClient
  -> POST /api/agent/sessions
  -> POST /api/agent/sessions/:sessionId/turns
  -> DeterministicAgentClient
  -> DeterministicAgentPipeline
  -> InMemoryAgentSessionStore
  -> InMemoryAgentTurnStore
  -> InMemoryAgentAuditSink
  -> AgentTurnResource
  -> existing frontend Turn Bundle adapter
```

Clicking a completed frontend turn calls both `/turns/:turnId/trace` and `/turns/:turnId/evidence`. The UI therefore does not rely only on transient data returned by turn execution.

## API Resources

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/agent/health` | service metadata |
| GET | `/api/agent/scenarios` | `AgentScenarioListResource` |
| POST | `/api/agent/sessions` | `CreateAgentSessionRequest` -> `AgentSessionResource` |
| GET | `/api/agent/sessions/:id` | `AgentSessionResource` |
| GET | `/api/agent/sessions/:id/turns` | `AgentTurnListResource` |
| POST | `/api/agent/sessions/:id/turns` | `AgentTurnRequest` -> `AgentTurnResource` |
| GET | `/api/agent/turns/:id/trace` | `AgentTraceResource` |
| GET | `/api/agent/turns/:id/evidence` | `AgentEvidenceResource` |
| GET | `/api/agent/sessions/:id/audit` | `AgentAuditResource` |

All failures use `AgentApiErrorResponse`. The API maps contract mismatch, invalid request, clarification, ontology/query rejection, citation failure, missing resources, timeout, cancellation, and internal failure without exposing stack traces or local paths.

## Persistence Boundary

The Phase 3A stores preserve:

- bounded Session context and turn IDs;
- complete request and evidence-backed response per Turn;
- Semantic and Graph Query Plans;
- Evidence Pack and citation result;
- Structured Trace;
- Audit Event references and timestamps.

Stores are in-memory development adapters. Process restart clears their contents. A durable repository can replace `AgentSessionStore`, `AgentTurnStore`, and `AgentAuditStore` without changing transport contracts or frontend components.

The API derives multi-turn context from the server-side Session Store. A client-supplied context object is not used to expand or replace that state. Reusing a request ID within the same runtime is rejected before pipeline execution so that a deterministic turn cannot be persisted twice.

## Mode Selection

Scripted mode remains the default and requires no backend. API mode is explicit:

```bash
npm run agent-api:dev
npm run dev:agent
```

The Header identifies the active mode. API failure never causes an implicit switch to Scripted mode, because silent fallback would make an audit trail ambiguous.

## Deferred Work

- streaming stage events and SSE reconnect;
- durable Session/Turn persistence;
- external identity and authorization scopes;
- Engineering Change and Bottleneck deterministic parsers;
- Neo4j, document index, LLM providers, and observability adapters.
