# Knowledge Contracts

Shared transport and domain-neutral contracts for the frontend Demo, mock adapters, future Graph API, and validation tooling. Canvas-only state remains outside these contracts.

- Knowledge contract version: `1.1.0`.
- Agent transport contract version: `1.0.0`.

Agent contracts include request, semantic query plan, validated plan, evidence pack, governed claim policies, answer claims and limitations, citation validation, structured trace, session, persisted turn, asynchronous turn run, ordered run event, trace/evidence resources, scenario descriptors, audit events, and the shared API error envelope. They deliberately exclude provider prompts, raw chain-of-thought, arbitrary query text, and UI state.

`AgentTurnRun` owns queued/running/terminal lifecycle and retry lineage. `AgentRunEvent` is an append-only, per-run sequence used by SSE replay; pipeline events remain transport-neutral and are emitted through `AgentPipelineEventHandler`.

`KnowledgeRepository` includes a bounded `GraphTraversalRequest/Result` contract. It carries only validated template IDs, canonical seed IDs, relation allowlists, depth, limit, and status; arbitrary query text is intentionally absent.
