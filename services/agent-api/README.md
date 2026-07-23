# Agent API

HTTP boundary over `@mkg/agent-core`. Phase 3C uses an atomic JSON file store by default, so sessions, completed turns, traces, evidence, audit events, runs, and ordered SSE events survive a process restart. Set `MKG_AGENT_STORE_MODE=memory` only for isolated development or tests.

```bash
npm run agent-api:dev
```

The service listens on `http://127.0.0.1:4175/api/agent` by default. Mock repository and deterministic semantic parsing remain the defaults. Phase 3B can explicitly select the Neo4j pilot with `MKG_AGENT_KNOWLEDGE_MODE=neo4j`; failed connectivity stops service startup and never falls back to Mock.

Phase 5C protects every Session, Turn, Run, SSE, Trace, Evidence, and Audit resource with a server-derived authorization context. `GET /health` and `GET /scenarios` remain public discovery endpoints. Local development defaults to explicit disabled authentication; `MKG_AGENT_SECURITY_PROFILE=production` fails startup unless an authenticator is configured. The built-in `static-bearer` adapter is for controlled acceptance only; enterprise OIDC remains pending. See [Phase 5C Security](../../docs/phase-5c-production-security-authorization.md).

Phase 4C governed document retrieval is enabled by default. It validates a local controlled-document registry, checks content checksums and effective status, creates stable chunks, applies graph/full-text/access filters, and returns chunk-level EvidenceItems. Use `MKG_AGENT_DOCUMENT_MODE=canonical` only for explicit rollback testing.

Primary endpoints:

- `GET /health` (backward-compatible detailed health)
- `GET /health/live` (process liveness; never calls an LLM)
- `GET /health/ready` (sanitized runtime readiness; reports only whether DeepSeek is configured)
- `GET /scenarios`
- `POST /sessions`
- `GET /sessions/:sessionId`
- `GET|POST /sessions/:sessionId/turns`
- `GET|POST /sessions/:sessionId/runs`
- `GET /runs/:runId`
- `GET /runs/:runId/events` (SSE, supports `Last-Event-ID` and `?after=`)
- `POST /runs/:runId/retry`
- `POST /runs/:runId/cancel`
- `GET /turns/:turnId`
- `GET /turns/:turnId/trace`
- `GET /turns/:turnId/evidence`
- `GET /turns/:turnId/audit`

`POST /sessions/:sessionId/runs` returns immediately. The deterministic pipeline runs asynchronously and reports auditable stage state through the event stream. A failed or cancelled run can be explicitly retried; a successful run cannot. Runs left queued/running by an unclean shutdown are marked `RUN_INTERRUPTED` during store recovery.

Phase 4A semantic parser modes:

```bash
MKG_AGENT_SEMANTIC_PARSER_MODE=deterministic # default, no provider
MKG_AGENT_SEMANTIC_PARSER_MODE=llm           # always constrained LLM parsing
MKG_AGENT_SEMANTIC_PARSER_MODE=hybrid        # deterministic first, LLM only on clarification
MKG_LLM_PROVIDER=openai
MKG_LLM_MODEL=<explicit-model-id>
MKG_OPENAI_API_KEY=<server-secret>
```

DeepSeek is an independent native Chat Completions adapter, not an OpenAI base URL override:

```bash
MKG_LLM_PROVIDER=deepseek
MKG_DEEPSEEK_API_KEY=<server-secret>
MKG_DEEPSEEK_MODEL=deepseek-v4-flash
MKG_DEEPSEEK_ANSWER_MODEL=deepseek-v4-flash
```

Only `deepseek-v4-flash` and `deepseek-v4-pro` are accepted. DeepSeek JSON Object output is always passed through the same strict local Semantic Plan and Evidence Answer validators.

LLM/hybrid startup requires explicit model and server-only key configuration. Provider failure is surfaced and never reported as a successful deterministic fallback. Neo4j pilot startup is documented in `docs/phase-3b-neo4j-repository.md`.

Phase 4B answer composer modes:

```bash
MKG_AGENT_ANSWER_COMPOSER_MODE=template # default
MKG_AGENT_ANSWER_COMPOSER_MODE=llm      # evidence projection -> LLM
MKG_AGENT_ANSWER_COMPOSER_MODE=hybrid   # template guidance -> evidence-grounded LLM
MKG_LLM_ANSWER_MODEL=<explicit-model-id>
```

Both LLM modes still pass through the deterministic Citation Validator. Hybrid is not a silent availability fallback: provider or grounding failure fails the Turn and preserves the retry/audit behavior. The service still has no vector search, enterprise identity-provider integration, or enterprise data.

Verify the deterministic document subsystem independently:

```bash
npm run documents:verify
```

Phase 5A adds local-first observability and a deterministic release gate:

```bash
npm run agent:evaluate
```

Local development writes redacted run, stage, and provider metadata below `.data`. Production requires an absolute `MKG_DATA_DIR` outside the repository and resolves telemetry and persistent Agent state beneath it unless an explicit server-side path is configured. Prompts, raw provider output, credentials, and chain-of-thought are not recorded.

Real provider acceptance is separate from mocked provider tests:

```bash
npm run openai:acceptance
npm run deepseek:acceptance
```

Without a real server-side key and model configuration, provider acceptance remains `pending`. DeepSeek additionally records a separate full-pipeline status; no provider is allowed to borrow another provider's acceptance result.
