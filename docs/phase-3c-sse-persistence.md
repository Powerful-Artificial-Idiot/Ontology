# Phase 3C - SSE Streaming And Persistent Sessions

## Runtime Flow

```text
POST session run -> queued AgentTurnRun -> async deterministic pipeline
                 -> append-only AgentRunEvent sequence -> SSE replay/live stream
                 -> persisted Turn/Trace/Evidence/Audit -> terminal run event
```

The deterministic pipeline knows only the optional `AgentPipelineEventHandler`. HTTP, SSE, file persistence, and browser reconnection remain outside `packages/agent-core`.

## Persistence

The Agent API defaults to `.data/agent-store.json` and serializes writes through an atomic temporary-file rename. Configure with:

```bash
MKG_AGENT_STORE_MODE=file
MKG_AGENT_STORE_PATH=.data/agent-store.json
MKG_AGENT_RUN_TIMEOUT_MS=60000
```

The prototype file store is appropriate for a single Agent API process. It is not a multi-process database and does not provide production identity, tenancy, encryption, or retention policy.

## Streaming And Replay

The browser creates a run, subscribes to `/runs/:runId/events`, and applies stage events incrementally. Each event has a monotonically increasing `sequence`. Reconnect sends both `Last-Event-ID` and `after`, so already applied events are ignored and missing events are replayed before live delivery resumes.

Terminal event types are `run-completed`, `run-failed`, and `run-cancelled`. Completed runs load the canonical persisted Turn resource. Failed runs retain their run ID and can be retried explicitly through `/runs/:runId/retry`; retry creates a new request, run, turn, and attempt lineage.

## Recovery Boundary

Completed sessions and turns are restored after restart. A run found in `queued` or `running` state cannot safely resume inside an interrupted in-process pipeline, so startup marks it failed with `RUN_INTERRUPTED` and appends a terminal event. The user can then perform a controlled retry.
