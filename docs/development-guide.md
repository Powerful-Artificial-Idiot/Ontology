# Development Guide

## 1. Current Repository Model

本仓库当前是 npm workspaces monorepo，React/Vite 前端保留在根目录。不要在没有迁移 ADR 和 root command compatibility 的情况下移动 `src/`。

当前 workspace：

- `packages/knowledge-contracts`：共享 TypeScript contracts 与 JSON Schemas；
- `packages/demo-data`：contract-aligned fixtures、generated ontology artifacts 和 scenarios；
- `packages/document-evidence`：受治理文档注册、确定性解析、chunk、索引和检索；
- `packages/ontology-client`：HTTP `KnowledgeRepository` client。

当前服务包括 `services/mock-knowledge-api` 和 `services/agent-api`。Agent API 已支持 Mock/Neo4j repository、异步 Turn Run、SSE 事件续传及单进程文件持久化；LLM 和外部向量数据库仍未接入。

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

### Agent modes

默认的 Agent Workspace 保持 Scripted Demo：

```bash
npm run dev
```

运行 deterministic API 需要两个终端：

```bash
# terminal 1
npm run agent-api:dev

# terminal 2
npm run dev:agent
```

`VITE_AGENT_MODE=scripted|api` 只决定 frontend client adapter。API 模式当前只开放 `quality-issue-trace`。默认文件存储位于 `.data/agent-store.json`，服务重启后会恢复 Session、Turn、Trace、Evidence、Audit、Run 和可续传事件；设置 `MKG_AGENT_STORE_MODE=memory` 可使用临时内存模式。

创建 Turn 后 API 立即返回 run ID，浏览器再通过 SSE 接收阶段状态。事件流使用序列号和 `Last-Event-ID` 续传；失败或中断的 run 必须由用户显式 Retry。

Phase 4A 默认继续使用 deterministic semantic parser。启用受约束 LLM parser：

```bash
export MKG_AGENT_SEMANTIC_PARSER_MODE=llm # or hybrid
export MKG_LLM_PROVIDER=openai
export MKG_LLM_MODEL=<explicit-model-id>
export MKG_OPENAI_API_KEY=<server-secret>
npm run agent-api:dev
```

`llm` 始终调用 provider；`hybrid` 先运行 deterministic parser，仅在其返回 `CLARIFICATION_REQUIRED` 时调用 provider。Provider 不可用、超时或输出非法时会失败，不做静默降级。

启用 Evidence-grounded LLM Answer Composer：

```bash
export MKG_AGENT_ANSWER_COMPOSER_MODE=llm # or hybrid
export MKG_LLM_ANSWER_MODEL=<explicit-model-id>
export MKG_OPENAI_API_KEY=<server-secret>
npm run agent-api:dev
```

`template` 是默认模式。`llm` 只接收 bounded Evidence Context Projection；`hybrid` 额外接收 deterministic template 作为 guidance。两种 LLM 模式都必须通过 runtime schema、governed claim policy 和最终 deterministic Citation Validator。

### Governed document evidence

Agent API 默认使用 Phase 4C governed document retriever。受控 demo 文档通过 registry 固定版本、审批、生效日期、checksum、parser、owner、实体链接、claim 支持和访问范围：

```bash
npm run documents:verify
```

可通过 `MKG_AGENT_DOCUMENT_MODE=canonical` 显式回退到旧的 canonical fixture retriever。详细边界见 [Phase 4C Governed Document Evidence](phase-4c-governed-document-evidence.md)。当前访问过滤是服务级 demo context，不代表生产身份认证。

### Agent API with Neo4j

Phase 3B 可以将 Agent graph retrieval 显式切换到 Neo4j。完整步骤见 [Phase 3B Neo4j Repository](phase-3b-neo4j-repository.md)。服务端配置使用 `MKG_*`，不得写入前端 bundle：

```bash
export MKG_NEO4J_PASSWORD=development-password
npm run neo4j:up
npm run neo4j:seed
npm run neo4j:verify
npm run agent-api:neo4j
```

如果 Neo4j 不可用，Agent API 启动失败，不会回退为 Mock。

## 4. Validation Commands

前端：

```bash
npm run lint
npm run typecheck
npm run test
npm run test:agent-core
npm run agent-api:test
npm run documents:verify
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
- `VITE_AGENT_MODE`；
- `VITE_AGENT_API_BASE_URL`；
- `VITE_AGENT_TIMEOUT_MS`。

服务端 Agent repository 配置：

- `MKG_AGENT_KNOWLEDGE_MODE=mock|neo4j`；
- `MKG_NEO4J_URI`；
- `MKG_NEO4J_USERNAME`；
- `MKG_NEO4J_PASSWORD`；
- `MKG_NEO4J_DATABASE`。

服务端 Semantic Parser 配置：

- `MKG_AGENT_SEMANTIC_PARSER_MODE=deterministic|llm|hybrid`；
- `MKG_LLM_PROVIDER=openai`；
- `MKG_LLM_MODEL`；
- `MKG_OPENAI_API_KEY`；
- `MKG_OPENAI_BASE_URL`；
- `MKG_LLM_TIMEOUT_MS`。

服务端 Answer Composer 配置：

- `MKG_AGENT_ANSWER_COMPOSER_MODE=template|llm|hybrid`；
- `MKG_LLM_ANSWER_MODEL`（未设置时使用 `MKG_LLM_MODEL`）；
- `MKG_LLM_ANSWER_TIMEOUT_MS`。

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
| Integration | Agent API HTTP resources、repository mode parity、session/turn stores；SSE 与 Neo4j adapter 为后续阶段 |
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
