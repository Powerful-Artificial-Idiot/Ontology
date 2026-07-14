# Development Tasks

## P0-01 Establish a trusted repository baseline

- Status: DONE
- Priority: P0
- Dependencies: None
- Scope: Review and commit the completed Monorepo foundation, then rebuild a clean release.
- Files likely affected: Existing Monorepo changes, release manifest, this task file.
- Acceptance criteria: Clean baseline commit; validate/test/build pass; release versions correct; clean release has `gitDirty: false`; UI baseline unchanged.
- Validation commands: `git diff --check`; `make validate`; `make test`; `make build`.
- Regression checks: Route 9 nodes; Ontology 26 classes/31 relations; Semantic 5 lanes/8 concepts; no console error/warn.
- Rollback approach: Revert the single baseline commit without rewriting history.
- Implementation notes: Existing uncommitted files were created by the completed enterprise knowledge engineering foundation work.

## P0-02 Automate the frontend regression baseline

- Status: DONE
- Priority: P0
- Dependencies: P0-01
- Scope: Add exact page counts, entry-point smoke checks, repository initialization, schema validation linkage, and console-check limitations.
- Files likely affected: `tests/frontend/`, `docs/repository-audit.md`, CI.
- Acceptance criteria: Exact 9/26/31/5/8 baselines are tested; lint/typecheck/test/build pass.
- Validation commands: `npm run lint`; `npm run typecheck`; `npm run test`; `npm run build`.
- Regression checks: Manual browser console check remains clean until a lightweight browser runner is adopted.
- Rollback approach: Revert the isolated test commit.
- Implementation notes: Do not add a second browser automation stack.

## P0-03 Audit Explorer Alignment semantics

- Status: DONE
- Priority: P0
- Dependencies: P0-01
- Scope: Classify every alignment term and visual/contract field; define migration and deprecation actions without removing compatibility terms.
- Files likely affected: `docs/explorer-alignment-audit.md`, `mappings/`, `ontology/applications/explorer-alignment.ttl`, validation scripts.
- Acceptance criteria: Every term is classified; target layer and action are explicit; migration list exists; ontology validation passes.
- Validation commands: `make ontology-validate`; `make contracts-validate`; `make validate`.
- Regression checks: All three Explorer baselines remain unchanged.
- Rollback approach: Revert audit and metadata changes; no runtime deletion is allowed.
- Implementation notes: Known View Model fields must not be promoted to domain ontology.

## P1-01 Migrate Semantic Explorer data access

- Status: DONE
- Priority: P1
- Dependencies: P0-02, P0-03
- Scope: Load catalog and search data through `KnowledgeRepository`, with loading, empty, error, payload, and version handling.
- Files likely affected: Semantic feature, contracts, repositories, Demo Data, tests.
- Acceptance criteria: No page import of Legacy semantic fixtures; 5 lanes/8 concepts and interactions preserved.
- Validation commands: `npm run test`; `make contracts-validate`; `npm run build`.
- Regression checks: Search `CT`, `leak`, concept selection, sidebars, and Control Plan versions.
- Rollback approach: Restore the compatibility import while retaining additive contracts.
- Implementation notes: Legacy conversion is allowed only inside the adapter.

## P1-02 Generate Ontology build artifacts

- Status: DONE
- Priority: P1
- Dependencies: P0-03
- Scope: Deterministically generate classes, properties, relations, modules, version, manifest, and checksums from TTL.
- Files likely affected: `scripts/build_ontology_artifacts.py`, generated Demo Data, Makefile, tests.
- Acceptance criteria: Artifact is TTL-derived, deterministic, versioned, hashed, and count-tested.
- Validation commands: `make ontology-artifacts`; `make ontology-validate`; artifact tests.
- Regression checks: Generated semantic counts are stable.
- Rollback approach: Remove generated artifact command and outputs; TTL remains authoritative.
- Implementation notes: Layout fields are forbidden in semantic artifacts.

## P1-03 Drive Ontology Explorer semantic data from artifacts

- Status: DONE
- Priority: P1
- Dependencies: P1-02
- Scope: Combine generated semantic artifact with separate Ontology View Configuration.
- Files likely affected: Ontology data/view-model adapters, view configuration, tests.
- Acceptance criteria: Semantic definitions come from artifact; 26 classes/31 relations remain visible; missing terms fail clearly.
- Validation commands: `npm run test`; `make contracts-validate`; `npm run build`.
- Regression checks: Existing click, hover, focus, sidebar, dock, and viewport behavior.
- Rollback approach: Switch repository adapter to legacy semantic source.
- Implementation notes: Hidden ontology classes remain in artifact and are controlled only by view configuration.

## P1-04 Implement Mock Knowledge API

- Status: DONE
- Priority: P1
- Dependencies: P1-01, P1-02
- Scope: Add a dependency-light Node HTTP service implementing required knowledge endpoints and errors.
- Files likely affected: `services/mock-knowledge-api/`, package scripts, contracts, integration tests.
- Acceptance criteria: Service starts independently; endpoints and 404/500/empty cases are tested; payloads validate.
- Validation commands: Mock API integration tests; `make contracts-validate`.
- Regression checks: No frontend behavior changes in local mode.
- Rollback approach: Remove service command; in-process repository remains available.
- Implementation notes: Never expose local filesystem paths.

## P1-05 Support local and HTTP repository modes

- Status: DONE
- Priority: P1
- Dependencies: P1-04
- Scope: Centralize repository creation, source selection, base URL, timeout, version checks, validation, and errors.
- Files likely affected: `src/repositories/`, Vite env types, Makefile, integration tests.
- Acceptance criteria: `local` and `http` modes use the same contract and preserve page baselines.
- Validation commands: Local/HTTP integration tests; frontend test/build.
- Regression checks: Three pages load in both modes.
- Rollback approach: Default factory to local adapter.
- Implementation notes: Pages must not read `import.meta.env` directly.

## P1-06 Generate one Semantic scenario from CQ-004

- Status: DONE
- Priority: P1
- Dependencies: P1-01
- Scope: Convert CQ-004 SPARQL results into a provenance-aware `SemanticSearchResponse` artifact.
- Files likely affected: semantic build script, generated Demo Data, Semantic scenario adapter, tests.
- Acceptance criteria: One scenario is query-generated; asserted/inferred/evidence/explanation are distinct; empty query result stays empty.
- Validation commands: `make competency-test`; scenario contract tests; frontend tests.
- Regression checks: Machine impact scenario retains current Semantic layout.
- Rollback approach: Keep generated artifact but remove scenario registration.
- Implementation notes: View configuration remains hand maintained.

## P1-07 Migrate Ontology Explorer to Repository

- Status: DONE
- Priority: P1
- Dependencies: P1-03, P1-05
- Scope: Retrieve Ontology graph through the repository in both local and HTTP modes.
- Files likely affected: Ontology page/store, repositories, tests.
- Acceptance criteria: Component has no direct artifact or Legacy semantic data import; modes are equivalent.
- Validation commands: Repository tests; Ontology render tests; build.
- Regression checks: 26 classes/31 relations and all interactions.
- Rollback approach: Repository local adapter can return the prior compatibility model.
- Implementation notes: Loading must not remount React Flow unnecessarily.

## P1-08 Migrate Route Explorer to Repository

- Status: DONE
- Priority: P1
- Dependencies: P1-05, P1-07
- Scope: Move only the Route data boundary to `getGraphView`; retain all React Flow layout and interaction logic.
- Files likely affected: Route page/view-model adapter, repositories, tests.
- Acceptance criteria: No direct Legacy fixture import; 9 nodes/four views/stack/focus/metrics remain stable.
- Validation commands: Route tests; local/HTTP integration; build.
- Regression checks: Repeated hover, selection, Focus switching, labels, and viewport preservation.
- Rollback approach: Repository adapter returns legacy graph response.
- Implementation notes: This is the final Legacy page migration.

## P2-01 Add page-level URL routing

- Status: TODO
- Priority: P2
- Dependencies: P1 completion gate
- Scope: Add restorable page, view, scenario, selection, query, and focus URLs without visual changes.
- Files likely affected: App entry, router module, page adapters, tests.
- Acceptance criteria: Refresh and Back/Forward recover supported state; old entry remains compatible.
- Validation commands: Deep-link tests; frontend regression/build.
- Regression checks: No hover or drag state enters the URL.
- Rollback approach: Preserve state-based navigation behind a compatibility entry.
- Implementation notes: Select the smallest router suitable for the current app.

## P2-02 Add deep-link tests

- Status: TODO
- Priority: P2
- Dependencies: P2-01
- Scope: Test Ontology class, Semantic scenario, and Quality Route deep links plus invalid IDs.
- Files likely affected: Router tests and test fixtures.
- Acceptance criteria: Direct load, loading, valid selection, and understandable invalid-ID behavior pass.
- Validation commands: Deep-link test command and full frontend test.
- Regression checks: Default entry still opens Route Explorer.
- Rollback approach: Revert test and route-specific error states.
- Implementation notes: Avoid coupling tests to transient React Flow transforms.

## P3-01 Split explorer page bundles

- Status: TODO
- Priority: P3
- Dependencies: P2-01
- Scope: Lazy-load only page-level modules and record bundle metrics.
- Files likely affected: App/router entry, loading fallback, build documentation.
- Acceptance criteria: Initial chunk warning is removed or materially reduced without flicker.
- Validation commands: Build and browser regression.
- Regression checks: All deep links and navigation transitions.
- Rollback approach: Restore static imports.
- Implementation notes: Do not split small components prematurely.

## P3-02 Define Pilot Runtime readiness

- Status: TODO
- Priority: P3
- Dependencies: P1 completion gate
- Scope: Define Pilot dataset, graph-runtime evaluation, and five-CQ benchmark criteria.
- Files likely affected: `docs/pilot-runtime-readiness.md`, `docs/graph-runtime-evaluation.md`.
- Acceptance criteria: Evaluation is vendor-neutral and driven by existing CQs.
- Validation commands: Documentation link and terminology checks.
- Regression checks: None; documentation only.
- Rollback approach: Revert documentation commit.
- Implementation notes: No graph database selection or deployment in this phase.
