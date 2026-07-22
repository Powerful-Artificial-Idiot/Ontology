# Agent Evaluation

Local-first deterministic evaluation and observability for the manufacturing Agent pipeline.

The package owns versioned evaluation contracts, deterministic checks, regression comparison, release policy evaluation, telemetry redaction, and local sinks. It does not retrieve knowledge, call providers, judge prose with an LLM, or own HTTP execution.

Core boundaries:

- `EvaluationDataset` describes versioned business expectations.
- `EvaluationCaseExecutor` supplies pipeline executions without coupling the evaluator to HTTP or a repository.
- `evaluateCase` checks canonical IDs, retrieval, evidence, claims, citations, context, and runtime state.
- `AgentEvaluationRunner` produces a comparable `EvaluationReport`.
- `evaluateReleaseGate` applies an explicit versioned policy.
- telemetry records stage/provider/run metadata only; prompts, raw output, credentials, and chain-of-thought are excluded or redacted.

Run the current baseline:

```bash
npm run agent:evaluate
```

The generated report is written to `.data/evaluations/latest-report.json` and is intentionally not committed.
