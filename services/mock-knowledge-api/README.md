# Mock Knowledge API Boundary

No separate server is started in this phase. A static in-process adapter is safer for the existing Demo:

- `src/repositories/MockKnowledgeRepository.ts` provides deterministic local responses.
- `packages/ontology-client` provides the HTTP implementation for future backend integration.
- `packages/demo-data` contains contract-aligned response fixtures.
- `docs/api-contracts.md` defines the endpoint behavior.

This avoids a second local process and preserves offline management demonstrations. A pilot service should implement the same repository contract and pass the same JSON Schema tests.
