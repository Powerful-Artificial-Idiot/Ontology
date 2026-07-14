# Frontend Bundle Report

Measured with `npm run build` on 2026-07-14. Sizes below are minified output before gzip.

## Before Page Routing Split

| Artifact | Size | Gzip |
| --- | ---: | ---: |
| Single application JavaScript bundle | 612.41 kB | 161.58 kB |

The build emitted Vite's 500 kB chunk warning. Route, Ontology, Semantic, React Flow, and demo repository data shared one eager module graph.

## After Page Routing Split

| Artifact | Size | Gzip |
| --- | ---: | ---: |
| Initial router/runtime chunk | 148.87 kB | 48.22 kB |
| Route Explorer page | 62.92 kB | 16.86 kB |
| Ontology Explorer page | 52.66 kB | 14.00 kB |
| Semantic Explorer page | 31.37 kB | 8.38 kB |
| Shared knowledge repository/data chunk | 164.27 kB | 29.42 kB |
| Shared React Flow/icon chunk | 149.89 kB | 49.09 kB |

The 500 kB chunk warning is eliminated. `App.tsx` eagerly loads only routing and the current visual fallback; each Explorer page is loaded through `React.lazy`. Shared repository and React Flow modules remain coarse-grained intentionally to avoid premature component-level fragmentation.

## Regression Evidence

- Production and Quality Route views load with 9 nodes.
- Ontology Explorer loads 26 classes and 31 relations.
- Semantic scenario `machine-impact-analysis` restores CQ-004 and Leak Rate.
- Direct links and Back/Forward restore page state.
- Browser console: 0 errors, 0 warnings.
