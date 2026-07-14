# Repository Audit Baseline

Audit date: 2026-07-14. Baseline commit: `4596a09`.

## Before This Change

1. Structure: frontend application lived at repository root with `src/`, `docs/`, Vite and TypeScript configuration.
2. Framework: React 18.3.1 and TypeScript 5.7.2.
3. Package manager: npm with `package-lock.json`.
4. Build tool: Vite 6 and `tsc -b`.
5. Commands: `npm run dev`, `npm run build`, `npm run preview`.
6. Routing: no URL router; `AppPage` state switches Route, Ontology, and Semantic Explorer.
7. Pages: Manufacturing Route Explorer, Ontology Explorer, Semantic Explorer.
8. Mock data: `src/data/mockGraph.ts`, `src/data/ontologyData.ts`, and `src/features/semantic/semanticData.ts`.
9. Graph model: `StackNode`, `StackObject`, and `GraphEdge` in `src/types.ts`, including separate view metadata and canvas positions.
10. Sharing: Ontology and Semantic Explorer did not share a formal domain contract; both used frontend-specific TypeScript models.
11. Backend: none.
12. CI: none.
13. Tests: none.
14. Documentation: root README plus architecture, interaction, data model, API draft, roadmap, and technical notes.
15. Git state: clean `main` tracking `origin/main` before implementation.

## Baseline Verification

- `npm run build`: passed.
- Route graph: 9 nodes and 8 edges in the default route view during the previous browser regression.
- Ontology graph: 26 nodes and 31 edges.
- Semantic canvas: 5 lanes and 8 concepts.
- Known warning: production JavaScript chunk is larger than 500 kB.
- Local runtime uses Node 21.5.0, while Vite recommends Node 20 LTS or 22+.

## Decision

The frontend remains at the repository root. Moving it into `apps/knowledge-explorer-demo` would change paths, deployment assumptions, and developer commands without adding immediate semantic value. A future move is allowed only after URL routing, contract adoption, and regression coverage are mature.
