# Phase 4B - Evidence-Grounded LLM Answer Composer

## Runtime Flow

```text
Evidence Pack
  -> bounded Evidence Context Projection
  -> strict LLM structured answer draft
  -> runtime grounding validation
  -> canonical AgentAnswer reconstruction
  -> deterministic Citation Validator
  -> publication or blocked Turn
```

The LLM never searches, receives a database client, generates Cypher, changes the Evidence Pack, invents IDs, or decides publication.

## Modes

| Mode | Behavior |
| --- | --- |
| `template` | Existing deterministic composer; default and no provider required. |
| `llm` | Generates language from the bounded Evidence Context Projection. |
| `hybrid` | Builds deterministic template guidance, then performs the same evidence-grounded LLM generation. |

Hybrid is not a provider-availability fallback. A provider timeout, invalid draft, grounding failure, or citation failure blocks the Turn and remains visible through SSE, persistence, audit, and controlled retry.

## Evidence Projection

The provider receives only the question, response language, ontology/data version, bounded evidence excerpts, provenance locators, linked canonical IDs, governed claim policies, and explicit limitations. It receives no Neo4j connection, repository implementation, source credentials, unrestricted graph, or hidden documents.

Projection limits are enforced before provider invocation. Oversized or policy-free packs fail with `EVIDENCE_INSUFFICIENT`; content is not silently truncated.

## Grounding Gates

- Summary, findings, and risks reference governed claim IDs.
- Recommended actions reference existing Evidence Pack IDs.
- Claims cannot create IDs or change governed classification.
- Citations cannot create evidence IDs or cite evidence that does not support the claim ID.
- Required claims cannot be omitted.
- `approved` confidence cannot be assigned by the model.
- English mode rejects Chinese output.
- Unknown fields, including reasoning fields, are rejected.
- Raw prompt, provider output, and chain-of-thought are not persisted.

The final `StrictCitationValidator` independently checks claim policy, citation existence, evidence status, and claim-to-evidence support before the answer is published.

## Configuration

```bash
MKG_AGENT_ANSWER_COMPOSER_MODE=llm
MKG_LLM_PROVIDER=openai
MKG_LLM_ANSWER_MODEL=<explicit-model-id>
MKG_OPENAI_API_KEY=<server-secret>
MKG_OPENAI_BASE_URL=https://api.openai.com/v1
MKG_LLM_ANSWER_TIMEOUT_MS=30000
MKG_AGENT_RUN_TIMEOUT_MS=60000
```

The OpenAI adapter uses the shared Responses Structured Output client with `store: false`. The provider schema uses the supported strict subset; array-size, uniqueness, text-length, language, and cross-field grounding checks are enforced again by backend runtime validation.

When no run timeout is configured, the runtime uses 10 seconds for the fully deterministic path and 60 seconds when either semantic parsing or answer composition uses an LLM. Explicit deployment configuration can override this boundary.
