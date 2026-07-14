# Legacy Data Migration

Lifecycle: `legacy -> adapted -> contract-native -> deprecated -> removed`.

| Legacy file | Current consumers | Replacement contract | Status | Planned removal |
| --- | --- | --- | --- | --- |
| `src/data/mockGraph.ts` | Route compatibility adapter and tests | `GraphViewResponse` | adapted | After P1-08 plus one stable release |
| `src/data/ontologyData.ts` | Ontology compatibility adapter and View Configuration | `OntologyGraphResponse` plus Ontology View Configuration | adapted | Semantic definitions after P1-03; visual configuration retained |
| `src/features/semantic/semanticData.ts` | Semantic compatibility adapter and current search utility | Semantic catalog/search contracts | adapted | After P1-01 plus one stable release |
| `src/repositories/legacyDemoData.ts` | Local compatibility imports | Repository implementations | adapted | After P1-08 plus one stable release |

Removal requires zero page, repository, and test imports; replacement Demo Dataset coverage; a migration note; and one stable stage after deprecation.
