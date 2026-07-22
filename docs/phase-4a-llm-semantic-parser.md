# Phase 4A - LLM Semantic Parser

## Scope

Phase 4A allows an LLM to classify intent and produce a constrained semantic draft. It does not allow the model to answer the business question, create IDs or ontology terms, generate Cypher, query Neo4j, select citations, or assert enterprise facts.

```text
User Message
  -> deterministic candidate resolution
  -> constrained LLM draft
  -> strict runtime validation
  -> backend canonical entity reconstruction
  -> existing query-plan and ontology validation
  -> existing safe compiler, retrieval, evidence, template answer, citation gate
```

## Modes

| Mode | Behavior |
| --- | --- |
| `deterministic` | Existing parser only; default and requires no LLM configuration. |
| `llm` | Always uses candidate resolution plus the configured provider. Provider errors fail visibly. |
| `hybrid` | Uses deterministic parsing first and invokes LLM only for `CLARIFICATION_REQUIRED`. Provider errors are not hidden by fallback. |

## Trust Boundary

The provider receives the user message, bounded session references, ontology version, deterministic entity candidates, and explicit allowlists. Structured output can contain only:

- allowlisted intent;
- candidate IDs and semantic roles;
- allowlisted relationship requirements;
- allowlisted facets;
- compiler-supported constraints;
- transient ambiguity notes.

Unknown fields are rejected. Canonical labels and types are loaded again from the baseline, not copied from model output. Assumptions remain backend-owned. Raw provider output, prompt text, and chain-of-thought are not written to Session, Turn, Trace, Evidence, Audit, or SSE events.

## OpenAI Responses Adapter

The Agent API contains a server-only Responses API adapter using strict JSON Schema output. It sends `store: false`, requires an explicit model ID and API key, supports cancellation and timeout, and does not include provider response bodies in public errors.

```bash
MKG_AGENT_SEMANTIC_PARSER_MODE=llm
MKG_LLM_PROVIDER=openai
MKG_LLM_MODEL=<explicit-model-id>
MKG_OPENAI_API_KEY=<server-secret>
MKG_OPENAI_BASE_URL=https://api.openai.com/v1
MKG_LLM_TIMEOUT_MS=20000
```

No provider secret uses a `VITE_` prefix. Live-provider tests are intentionally excluded from the deterministic CI suite; fake-provider tests verify request schema, canonical reconstruction, failure mapping, cancellation boundary, and downstream pipeline compatibility.
