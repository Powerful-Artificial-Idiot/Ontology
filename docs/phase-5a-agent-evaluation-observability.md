# Phase 5A - Agent Evaluation, Observability and Release Gates

## Status

Implemented for the deterministic **Leak Rate Quality Issue Trace** baseline.

- Dataset: `evaluation.leak-rate-quality-trace@1.0.0`
- Release policy: `release-gate.deterministic-agent@1.0.0`
- Repository mode: Mock for the default gate
- Document index: deterministic governed full-text retrieval
- Semantic parser: deterministic
- Answer composer: template
- Semantic Parser live provider acceptance: **pending**
- Answer Composer live provider acceptance: **pending**

The live statuses remain pending because no real OpenAI key and model configuration were available during Phase 5A implementation. Provider mocks do not satisfy live acceptance.

## Architecture

```text
Versioned Evaluation Dataset
  -> EvaluationCaseExecutor
  -> Deterministic Agent Pipeline
  -> Semantic / Graph / Document / Evidence checks
  -> Claim and Citation checks
  -> Context and Runtime probes
  -> EvaluationReport
  -> Regression Comparison
  -> Versioned Release Gate
```

The evaluator does not compare complete answer strings. It evaluates governed intent and canonical IDs, required graph objects and relations, exact document version/chunk IDs, required and forbidden claims, unsupported terms, explicit limitations, citation coverage, and the deterministic citation publication gate.

## Dataset And Policies

- Dataset: `packages/demo-data/evaluations/leak-rate-quality-trace.v1.json`
- Dataset schema: `packages/agent-evaluation/schemas/evaluation-dataset.schema.json`
- Release policy: `packages/demo-data/evaluations/release-policy.v1.json`

The v1 dataset covers:

1. English direct issue tracing;
2. Chinese aliases for OP30 and Leak Rate;
3. clarification for an ambiguous request;
4. rejection of an unsupported target;
5. restricted two-turn context;
6. access denial causing citation publication to fail.

## Deterministic Metrics

Business metrics are separate from technical metrics.

Business checks include intent, canonical entity precision/recall, graph object/relation recall, governed document/chunk versions, evidence recall, claim recall, unsupported targets, limitations, and citation coverage.

Technical checks include end-to-end latency, trace stage count, ordered pipeline lifecycle, SSE sequence/replay, persistent reload, controlled retry, timeout, and cancellation. Provider telemetry can record model ID, latency, status, and input/output/total token counts when a real provider returns usage data.

## Observability Boundary

`AgentTelemetrySink` is provider-neutral. The default configured Agent API writes redacted JSONL events to `.data/agent-telemetry.jsonl`; `MKG_AGENT_TELEMETRY_MODE=off` disables it. Set `MKG_AGENT_TELEMETRY_PATH` to change the local path.

Telemetry includes run, pipeline stage, evaluation, and provider metadata. It must not include:

- API keys or authorization values;
- prompts or provider input payloads;
- raw provider output;
- chain-of-thought.

Provider telemetry is best-effort and cannot turn a successful provider call into a failed Agent turn.

## Commands

Run the deterministic evaluation and release gate:

```bash
npm run agent:evaluate
```

Run the same canonical assertions against a seeded Neo4j repository:

```bash
MKG_EVALUATION_REPOSITORY_MODE=neo4j \
MKG_NEO4J_PASSWORD=<server-secret> \
npm run agent:evaluate
```

Neo4j connection failure is explicit and never falls back to Mock. The selected repository mode is recorded in the report.

Compare with an earlier report:

```bash
MKG_EVALUATION_BASELINE_PATH=/path/to/baseline.json npm run agent:evaluate
```

Run real provider smoke acceptance only when server-side credentials and explicit models are available:

```bash
export MKG_OPENAI_API_KEY=<server-secret>
export MKG_LLM_MODEL=<semantic-model-id>
export MKG_LLM_ANSWER_MODEL=<answer-model-id>
npm run openai:acceptance
```

The smoke command writes `.data/evaluations/openai-provider-acceptance.json`. The evaluation report consumes this artifact but never infers `passed` merely from environment configuration.

## Release Semantics

The deterministic release gate currently requires:

- 100% case pass rate;
- 100% citation coverage;
- zero blocker and critical failures;
- P95 latency at or below 5 seconds;
- every runtime probe to pass.

Live provider acceptance is reported independently and is not required by the deterministic local policy. A future provider-enabled release policy may set both provider requirements to `true`; until a real smoke succeeds, that gate must fail with `pending`.

CI runs `npm run agent:evaluate` and uploads the JSON report as an artifact. `.data` remains ignored so runtime reports and telemetry are not treated as source-controlled facts.
