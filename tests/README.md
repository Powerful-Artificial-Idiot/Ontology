# Tests

- `frontend/ontology-render.test.ts`: Ontology Explorer render-model regression.
- `frontend/explorer-baseline.test.ts`: exact Route, Ontology, and Semantic Explorer counts plus repository initialization.
- `frontend/semantic-search.test.ts`: Semantic search and CT ambiguity regression.
- `frontend/repository.test.ts`: repository contract adaptation.
- `frontend/smoke.test.ts`: explorer entry-point smoke test.
- `integration/mock-knowledge-api.test.ts`: independent HTTP service endpoints and error envelopes.
- `integration/repository-modes.test.ts`: local/HTTP equivalence, timeout, version, and invalid-payload behavior.
- `scripts/validate_shapes.py`: ontology instance tests using valid and invalid fixtures.
- `scripts/run_competency_queries.py`: semantic integration tests.

Run frontend tests with `npm run test` and all validation with `make validate`.

The browser console is checked manually with the in-app browser during each stage gate. The project intentionally does not add a second browser automation stack only for this baseline.
