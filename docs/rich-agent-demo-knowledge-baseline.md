# Rich Agent Demo Knowledge Baseline

## Scope

The OP30 Leak Rate expansion is a governed demonstration baseline for deterministic knowledge retrieval, quantitative comparison, evidence packaging, and cross-domain navigation.

> The dataset is synthetic and intended only for demonstrating governed knowledge retrieval and quantitative reasoning. It must not be used as a production manufacturing specification.

Every generated entity carries:

- `dataClassification = synthetic-demo`
- `productionUseAllowed = false`
- `sourceKind = governed-fixture`

The build preserves the canonical IDs `operation.op30`, `machine.m220`, `quality-characteristic.leak-rate`, `product.brake-booster`, `program.leak-test.v3-4`, the existing document IDs, and the React Flow canvas ID `OP30`.

## Governed Scale

| Asset | Rich baseline |
| --- | ---: |
| Canonical entities | 84 |
| Relations | 217 |
| Governed documents | 14 |
| Stable chunks | 42 |
| Metric observations | 20 |
| Validation requirements | 5 |
| Reaction actions | 10 |
| Semantic aliases | 53 |

The network contains three linked clusters: OP30 quality control, M220 engineering change, and OP20/OP30 cross-domain process context. The graph explicitly states that an OP20 bottleneck does not prove the cause of an OP30 Leak Rate increase.

## Build And Seed

```bash
npm run demo-data:rich:build
npm run demo-data:rich:validate
npm run demo-data:rich:verify
npm run demo-data:rich:seed
```

`demo-data:rich:seed` is dry-run by default. Applying the seed requires `-- --apply` and `MKG_DEMO_TENANT_ID=tenant.demo-manufacturing`. It uses tenant-scoped idempotent `MERGE` operations, never clears the graph, and does not print secrets.

After changing parser/composer prompts or provider inputs, deterministic and injected-provider regression must be rerun. DeepSeek live acceptance is then **deployment rerun required**; this local phase does not claim a new real-provider acceptance.

The optional Neo4j live acceptance seeds the canonical baselines and compares sorted entity and relation IDs for all 12 rich Quality query templates against `MockKnowledgeRepository`. It also verifies the result limit, governed relation allowlist, and relation endpoints. The current local container acceptance passes 12/12 template parity checks.
