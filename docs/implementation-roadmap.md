# Implementation Roadmap

## 1. Objective

将当前 contract-backed frontend Demo 渐进式推进为 **Ontology-grounded, evidence-backed manufacturing agent platform**，同时保持以下能力始终可用：

- Route、Ontology、Semantic Explorer；
- Agent Scripted Demo；
- 本地 Mock 数据和静态部署；
- `KnowledgeRepository` local/HTTP 双模式；
- ontology、SHACL、mapping、competency query 验证链。

本路线图不以一次性替换为目标。每一阶段必须能够独立验证、独立回滚，并且不得要求 LLM、Neo4j 或外部系统可用才能运行 Scripted Demo。

## 2. Audited Baseline

截至本文件建立时，仓库实际具备：

- npm workspaces monorepo，前端位于仓库根目录；
- `packages/knowledge-contracts`、`packages/demo-data`、`packages/ontology-client`；
- `MockKnowledgeRepository`、`HttpKnowledgeRepository` 和 Mock Knowledge API；
- `AgentClient`、`ScriptedAgentClient`、未实现的 `ApiAgentClient`；
- 6 个 ontology module、SHACL、source mappings、rules、5 个 competency queries；
- Vitest、Python semantic validation、GitHub Actions 和静态 Nginx release；
- 尚无真实 Agent API、Neo4j、LLM provider、document retriever、session store、observability 或 Docker Compose。

## 3. Delivery Principles

1. **Contracts first**：跨进程数据先定义 TypeScript 与 JSON Schema，再实现服务。
2. **Evidence first**：事实 claim 必须引用 Evidence Pack 中的 evidence ID。
3. **Safe compilation**：Query Plan 只能编译为批准的参数化模板，不接受任意 LLM Cypher。
4. **Dual mode**：Scripted 和 Live 模式并存，Live 不可用时不影响 Scripted。
5. **One authority per concern**：ontology、instance facts、semantic mappings、evidence 和 view config 分别有明确事实源。
6. **No raw chain-of-thought**：trace 只记录阶段、结构化输入输出、工具、证据、耗时和决策状态。
7. **Pilot before platform**：先用一个产品族和已知 competency questions 验证，再扩展数据域。

## 4. Main Task Checklist

### P0 - Architecture Baseline

- [x] 审计 workspace、页面、repositories、contracts、Agent client、knowledge assets、测试和部署。
- [x] 记录目标架构、Agent pipeline、数据契约和开发规范。
- [ ] 建立 ADR：Agent contracts 归属、API transport、session persistence、graph runtime selection。
- [ ] 修正文档中历史 API 草案与 contract `1.1.0` 的差异。
- [ ] 由领域负责人复核并重新生成已过期的 `docs/explorer-alignment-audit.md` 与 `CQ-004` semantic scenario，避免在未确认本体、映射和场景变更语义前覆盖审计基线。

Exit gate：文档不宣称未实现能力；当前 `npm run build`、`npm test`、`make validate` 保持通过。

### P1 - Shared Agent Contracts

- [x] 在 `packages/knowledge-contracts` 增加 Agent request/response schemas。
- [x] 定义 `SemanticQueryPlan`、`ValidatedQueryPlan`、`EvidencePack`、`CitationValidationResult`、`AgentTrace`、`AgentSession` 和 `AuditEvent`。
- [x] 将 transport-neutral Agent 类型提升到共享 contracts，并由 Agent Demo 复用基础类型。
- [x] 保留 UI-only 类型在 feature 目录，不把展开状态或组件状态写入服务 DTO。
- [x] 建立 Leak Rate canonical fixture、Schema validation 和跨模块 referential-integrity tests。
- [ ] 增加 invalid fixtures 和 Agent contract major/minor compatibility tests。

Exit gate：Scripted Client 通过 adapter 使用共享类型；前端行为和 scripted scenarios 不变。

### P2 - Deterministic Agent Core

- [x] 新增 provider-neutral `packages/agent-core`。
- [x] 实现 pipeline interfaces、九阶段 orchestrator、typed error、cancellation 和 trace builder。
- [x] 用 deterministic parser 跑通 Leak Rate Quality Issue Trace，不调用 LLM。
- [ ] 将 deterministic parser 扩展到 Engineering Change 与 Bottleneck 两组 scripted scenarios。
- [x] 实现 Query Plan schema validation 和 canonical ontology validation。
- [x] 实现 allowlisted Graph Query Plan compiler，不生成任意查询文本。
- [x] 实现 in-memory graph/document retriever，读取 canonical baseline。
- [x] 构建 Evidence Pack、claim-to-evidence validation 和 structured trace。
- [x] 实现 in-memory session、multi-turn bounded context 和 audit sink。

Exit gate：Leak Rate 问题已通过 deterministic live pipeline 返回与 scripted scenario 语义一致、引用闭环的结果；其余两个场景进入后续扩展。

### P3 - Agent API And Frontend Live Mode

- [x] 新增 `services/agent-api`，提供 health、scenario、session、turn、trace、evidence 和 audit HTTP endpoints。
- [x] 完成 `ApiAgentClient` 的 timeout、abort、typed error 和 Turn Bundle adapter。
- [x] 新增 `scripted | api` runtime selection；默认保持 scripted。
- [x] Agent Workspace 显示当前 Scripted / Deterministic API 模式。
- [x] 增加真实 HTTP Agent API 和 Live Turn Bundle/Trace adapter tests。
- [x] 增加异步 Turn Run、SSE stage events、cursor replay/reconnect，以及失败 Turn 显式 retry UI。
- [x] 增加 Session、Turn、Trace、Evidence、Audit、Run 和 Event 的单进程文件持久化与重启恢复。

Exit gate：关闭 Agent API 后 Scripted 正常；开启 API 后 API mode 能完成 deterministic pipeline，并可按 turn 独立读取 trace/evidence。

### P4 - Safe Graph Query Layer

- [ ] 定义允许的 query intents 和 template registry。
- [ ] 实现 ontology-aware plan validator、scope limiter、cost guard 和 limit policy。
- [ ] 实现 Safe Compiler：validated plan -> template ID + parameters。
- [ ] 增加 Cypher safety validation：禁止写操作、过程调用、动态标签、未绑定参数和无限查询。
- [ ] 用现有 5 个 competency questions 建立 compiler golden tests。

Exit gate：没有任何代码路径可把 LLM 文本作为 Cypher 直接执行。

### P5 - Neo4j Pilot Adapter

- [ ] 以 competency benchmark 评估 Neo4j，而不是先绑定产品特性。
- [x] 增加静态只读模板驱动的 `Neo4jKnowledgeRepository`、`RepositoryGraphRetriever` 和启动连接检查。
- [x] 构建可重复 seed/import，将 Leak Rate canonical facts 导入 Neo4j。
- [x] 增加 Docker Compose 的 Neo4j Pilot profile；运行时凭据只来自服务端环境变量。
- [x] 增加 Mock parity、Neo4j adapter/Pipeline 和可选 live container acceptance tests。
- [ ] 在可运行 Docker 的验收环境执行 live test，并建立更广的 competency benchmark。
- [ ] 为非开发环境配置数据库级只读身份与 secret store。

Exit gate：Neo4j 不可用时 deterministic local 与 Scripted 仍可运行；Neo4j 账号无写权限。

### P6 - Document Evidence Retrieval

- [x] 定义 governed document registry、chunk、locator、checksum、version、validity 和 access metadata。
- [x] 实现 metadata-first document store、deterministic full-text index 和 graph-linked retriever。
- [ ] 后续再增加 embedding/vector adapter，不把向量库作为唯一证据源。
- [x] Evidence Pack 保留原始 document ID、版本、页码/段落、checksum、parser 和 access decision。
- [x] 建立 approval/effective/checksum、stable chunk、access filtering、content quarantine 和 publication-gate tests。

Exit gate：每个返回给 Answer Composer 的事实都能追溯到 graph fact 或 document evidence。

### P7 - Two-Stage LLM Integration

- [x] 定义 provider-neutral `LlmSemanticParserProvider` 与 `LlmAnswerComposerProvider`。
- [x] 第一阶段 LLM 只输出 schema-constrained Semantic Plan Draft。
- [x] 后端完成 draft validation、canonical entity resolution、ontology、intent 和 compiler validation。
- [x] 支持 deterministic、llm、hybrid 三种 Semantic Parser 模式，默认 deterministic。
- [x] 第二阶段 LLM 只能接收 bounded Evidence Context Projection，并支持 template、llm、hybrid composer。
- [x] Citation Validator 阻止 unknown、duplicate、missing、classification mismatch 和 unsupported claim 发布。
- [ ] 记录模型、prompt template version、token usage 和 latency，不记录 raw chain-of-thought。

Exit gate：禁用 LLM 时 deterministic pipeline 可运行；LLM 输出无法绕过 validation 和 evidence gate。

### P8 - Sessions, Audit And Observability

- [x] 定义 session/run/event repository，并支持 in-memory 与单进程文件持久 store。
- [x] 持久化 user turn、validated plan、tool invocation summary、evidence IDs、answer、citation result 和 audit event。
- [ ] 接入 OpenTelemetry；Langfuse 作为可选 trace sink，不作为业务事实源。
- [ ] 建立 retention、redaction、correlation ID、tenant/plant scope 和 audit export。
- [ ] 增加 replay：使用保存的 plan/evidence/version 重建一次回答，不重放 raw CoT。

Exit gate：每个 answer 可按 request/session/turn/trace ID 审计，敏感内容按策略脱敏。

### P9 - Governed Source Integration Pilot

- [ ] 选择一个产品族、一个路线、5-10 台设备、3-5 个 CTQ。
- [ ] 接入受控 MES/QMS/PLM/DMS extracts，不直接连接生产写接口。
- [ ] 定义 source precedence、identifier mapping、business validity 和 recording time。
- [ ] SHACL、mapping、provenance、version 和 competency queries 作为发布门禁。
- [ ] 经 domain owner 审核后再扩大范围。

Exit gate：Pilot acceptance criteria 见 [pilot-runtime-readiness.md](pilot-runtime-readiness.md)。

## 5. Dependency Order

```text
P0 Documentation
  -> P1 Shared Contracts
  -> P2 Deterministic Core
  -> P3 Agent API + Live UI
  -> P4 Safe Query Layer
  -> P5 Neo4j Adapter
  -> P6 Evidence Retrieval
  -> P7 LLM Providers
  -> P8 Session/Audit/Observability
  -> P9 Source Integration Pilot
```

P5 与 P6 可以在 P4 后并行，但 P7 不应早于 Evidence Pack 与 Citation Validator。

## 6. First Implementation Increment

下一次代码迭代建议严格限制为 P1：

1. 新增 Agent JSON Schemas 和 TypeScript transport types；
2. 为三组 scripted scenarios 生成合法 contract fixtures；
3. 增加 invalid query plan、missing evidence、invalid citation tests；
4. 通过 adapter 保持现有 Agent UI 和 Scripted Client 不变；
5. 不引入 Neo4j、LLM、Docker 或新的前端页面。

这一步建立后续所有后端工作的稳定边界，且回滚成本最低。
