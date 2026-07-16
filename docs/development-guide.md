# Development Guide

## 1. Current Repository Model

本仓库当前是 npm workspaces monorepo，React/Vite 前端保留在根目录。不要在没有迁移 ADR 和 root command compatibility 的情况下移动 `src/`。

当前 workspace：

- `packages/knowledge-contracts`：共享 TypeScript contracts 与 JSON Schemas；
- `packages/demo-data`：contract-aligned fixtures、generated ontology artifacts 和 scenarios；
- `packages/ontology-client`：HTTP `KnowledgeRepository` client。

当前服务只有 `services/mock-knowledge-api`。`services/agent-api`、Neo4j、LLM 和 Docker Compose 是规划项，不是已实现命令。

## 2. Prerequisites

- Node.js 20 LTS 或 22+；
- npm 10+；
- Python 3.11+；
- GNU Make 或兼容的 macOS Make。

安装：

```bash
make install
```

## 3. Current Run Modes

### Frontend with local repository

```bash
npm run dev:local
```

默认也可使用：

```bash
npm run dev
```

### Frontend with HTTP repository

终端一：

```bash
npm run api:dev
```

终端二：

```bash
npm run dev:http
```

当前 HTTP API 仍由同一 Mock repository 驱动，用于验证 transport boundary，不是 production backend。

### Agent mode

Agent Workspace 当前固定使用 `ScriptedAgentClient`。Live Agent mode 和 `ApiAgentClient` 尚未实现，开发文档不得假设存在 `VITE_AGENT_MODE`，直到对应 factory、tests 和 fallback UI 合并。

## 4. Validation Commands

前端：

```bash
npm run lint
npm run typecheck
npm run test
npm run test:agent-core
npm run build
```

知识工程：

```bash
make ontology-validate
make shapes-validate
make mappings-validate
make contracts-validate
make competency-test
make validate
```

完整 release gate：

```bash
make build
```

`make build` 会验证 ontology、SHACL、mapping、contracts、competency queries、前端 tests/build，并打包 manifest/checksums。

## 5. Change Workflow

### Contract change

1. 更新 `packages/knowledge-contracts/src/index.ts`；
2. 更新或新增对应 JSON Schema；
3. 增加 valid/invalid fixtures；
4. 更新 mock repository/client/service adapter；
5. 增加版本兼容 tests；
6. 评估 contract version bump；
7. 运行 `make contracts-validate` 和完整 tests。

### Ontology change

1. 提交 business question、definition、owner 和 source evidence；
2. 修改正确的 TTL module，不修改 generated JSON；
3. 更新 SHACL、mapping、competency query 和 migration note；
4. 运行 ontology artifact generator/check；
5. 通过 ontology change PR template 和 CI。

### Agent pipeline change

1. 先修改 shared contract 和 stage interface；
2. 为 stage 增加 deterministic unit test；
3. 增加 failure/cancellation/timeout test；
4. trace 只记录结构化摘要；
5. 确保 Scripted Client contract tests 不退化；
6. provider-specific code 只能存在于 adapter，不进入 core orchestrator。

### Demo data change

1. 使用 canonical ID；
2. 同步 source/version/provenance；
3. 不在多个 fixture 中手工复制新事实；
4. 优先增加 generator/adapter；
5. 运行 mock registry、cross-view 和 contract validation tests。

## 6. Repository Boundaries

### Allowed dependencies

```text
Frontend pages -> Repository/Client interfaces
HTTP clients -> Shared contracts
Services -> Shared contracts + core packages
Adapters -> external provider/driver
Generated fixtures -> canonical data/ontology sources
```

### Disallowed dependencies

- 页面组件直接调用 Neo4j、LLM 或 source systems；
- `agent-core` 导入 React components；
- ontology TTL 包含 React Flow position、opacity、lane 或 expansion；
- shared contracts 引用 Tailwind class、Lucide icon 或 DOM type；
- provider adapter 把 raw driver records 暴露给 frontend；
- LLM text 直接进入数据库执行器。

## 7. Environment And Secrets

当前可公开配置见 `.env.example`：

- `VITE_KNOWLEDGE_MODE`；
- `VITE_KNOWLEDGE_API_BASE_URL`；
- `VITE_KNOWLEDGE_TIMEOUT_MS`。

未来 server-only 配置不得使用 `VITE_` 前缀。Neo4j password、LLM API key、session credentials 和 telemetry tokens 只进入服务端 secret store/environment，并保持 `.gitignore` 覆盖。

前端环境变量在 build 时会进入 bundle，不能存放秘密。

## 8. Safe Query Development

- 新增 query intent 时同时新增 Query Plan schema enum、validator、template 和 golden test。
- Cypher template 必须静态存储、人工评审、参数化并标记版本。
- compiler tests 必须覆盖 malicious strings、write clauses、unbounded traversal 和 excessive limits。
- Neo4j integration tests 使用只读账号和临时数据库/fixture。
- competency queries 定义业务正确性；数据库 driver tests 只验证实现。

## 9. Evidence And Citation Development

- Evidence fixture 必须有 stable ID、source ID、version 和 locator。
- 不把 embedding score 当作 citation validity。
- claim tests 必须验证 evidence 真正支持对象、关系、数值、版本和时间。
- 无证据内容只能是 assumption、limitation 或 unknown。
- bilingual answers 应引用相同 evidence IDs。

## 10. Testing Strategy

| Level | Scope |
| --- | --- |
| Unit | parser、validator、compiler、retriever normalization、citation rules |
| Contract | JSON Schema、client/service parity、version mismatch |
| Integration | Agent API SSE、repository mode parity、Neo4j adapter、session store |
| Competency | CQ-001 至 CQ-005 business results |
| Frontend | Scripted/Live Turn Bundle parity、loading/error/cancel/retry |
| Release | manifest、checksums、no secrets、deep links、health checks |

测试不得依赖生产凭据或生产数据。

## 11. Observability Rules

统一 correlation fields：`requestId`、`sessionId`、`turnId`、`traceId`。

允许记录：stage、duration、result count、template/provider/version、evidence IDs、error code、token usage。

默认不记录：完整敏感文档、未脱敏用户输入、数据库凭据、raw model prompt、raw chain-of-thought。

## 12. Definition Of Done

每个 backend/Agent increment 至少满足：

- shared contracts and schemas updated；
- tests cover success and failure；
- Scripted Demo remains runnable；
- no arbitrary query execution path；
- evidence/citation references validate；
- versions and trace IDs present；
- docs reflect implemented rather than planned behavior；
- lint、typecheck、tests、knowledge validation 和 build 通过。

实施顺序见 [Implementation Roadmap](implementation-roadmap.md)，总体边界见 [Target Architecture](target-architecture.md)。
