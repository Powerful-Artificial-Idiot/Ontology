# Target Architecture

## 1. Architecture Goal

目标平台是一个 **Ontology-grounded, evidence-backed manufacturing agent platform**。它在现有 MES、PLM、ERP、QMS、DMS、WMS 和 IoT 系统之上提供统一语义、关系查询、证据检索和受控 Agent 推理，不替代源系统。

## 2. Current And Target Boundary

### Current

```text
React/Vite Explorers
  -> KnowledgeRepository
  -> MockKnowledgeRepository | HttpKnowledgeRepository
  -> TypeScript fixtures / contract-aligned JSON

Agent Workspace
  -> AgentClient
  -> ScriptedAgentClient
  -> scripted Turn Bundle + Trace
```

### Target

```text
Frontend
  Route Explorer | Ontology Explorer | Semantic Explorer | Agent Workspace
      |
      +-- Knowledge API Client -> Knowledge API
      +-- Agent Client --------> Agent API / SSE

Agent API
  -> Authentication Context
  -> Agent Orchestrator
       -> Semantic Parser
       -> Query Plan Validator
       -> Ontology Validator
       -> Query Router
       -> Safe Query Compiler
       -> Graph Retriever
       -> Document Evidence Retriever
       -> Evidence Pack Builder
       -> Answer Composer
       -> Citation Validator
       -> Trace Builder

Knowledge Services
  Semantic Catalog | Ontology Registry | Knowledge Graph
  Document Evidence Store | Source/Version/Governance Metadata

Infrastructure
  Neo4j Pilot | LLM Provider | Session Store
  OpenTelemetry | Optional Langfuse | Docker Compose
```

## 3. Component Responsibilities

### Frontend

- 只依赖 `KnowledgeRepository` 和 `AgentClient` abstractions。
- 不持有数据库凭据、LLM key 或授权规则。
- Scripted 与 Live 共用 Turn Bundle、Evidence、Citation 和 Trace UI。
- Canvas layout、focus、hover、expanded state 和颜色始终是 View Model，不进入 ontology。

### Agent API

- 建立 request、actor、tenant/plant、session 和 trace context。
- 暴露 session/turn/trace endpoints 与 SSE event stream。
- 校验 payload、权限、速率和 request size。
- 不实现业务推理；业务流程委托给 Agent Orchestrator。

### Agent Orchestrator

- 只编排 typed stages，不在 controller 中堆叠业务逻辑。
- 所有阶段接收 immutable execution context。
- 支持 cancellation、timeout、stage error 和 deterministic replay。
- 产出 structured trace，不产出或保存 raw chain-of-thought。

### Knowledge Services

- Semantic Catalog：术语、同义词、mapping、ambiguity 和 owner。
- Ontology Registry：released classes、properties、constraints、version 和 migration。
- Knowledge Graph：实例、关系、provenance、assertion type 和有效时间。
- Evidence Store：文档 metadata、chunk locator、checksum、version 和 ACL。
- Governance Metadata：owner、approval、source precedence、retention 和 audit policy。

## 4. Proposed Repository Evolution

以下目录是目标，不代表当前已经存在：

```text
packages/
  knowledge-contracts/     # Shared transport contracts and JSON Schemas
  agent-core/              # Provider-neutral deterministic pipeline
  demo-data/               # Canonical governed demo facts and generated fixtures
  ontology-client/         # Existing Knowledge API client

services/
  mock-knowledge-api/      # Existing local contract service
  agent-api/               # Session, turn, trace, SSE
  knowledge-api/           # Pilot knowledge service when mock API is outgrown

infrastructure/
  compose/                 # Local profiles, added only when runtime services exist
  neo4j/                   # Constraints, indexes, seed/import
  observability/           # OTel collector configuration
```

前端根目录暂不迁移。只有在 contracts、service boundaries 和 root aliases 稳定后，才评估移动到 `apps/knowledge-explorer`。

## 5. Source-Of-Truth Model

“单一事实源”不等于把所有内容放进一个文件，而是每类事实只有一个 authority：

| Concern | Authoritative source | Generated/consumer outputs |
| --- | --- | --- |
| Ontology schema | `ontology/**/*.ttl` | generated ontology JSON, Explorer adapter |
| Instance/demo facts | canonical records in `packages/demo-data` | graph views, Agent fixtures, Neo4j seed |
| Semantic mappings | governed semantic catalog and `mappings/` | search index, AI context |
| Evidence documents | evidence manifest + immutable content/checksum | chunks, Evidence Pack |
| View layout | frontend view config | React Flow nodes/edges |
| Rules | `rules/rule-catalog.yaml` + rule files | derived assertions with rule provenance |
| API shape | `packages/knowledge-contracts` | clients, services, fixtures |

`src/repositories/legacyDemoData.ts` 保持为迁移兼容层，但不得继续新增新的业务事实。

## 6. Security Architecture

### Required controls

- 身份由 API/gateway 验证，客户端传入的角色或 plant scope 不可信。
- 后端生成 `AuthorizationScope`，并在 Query Plan validation 后注入查询。
- Graph 与 document retriever 都执行相同的 scope filtering。
- Neo4j 使用只读 service account；Agent runtime 不拥有 schema/write 权限。
- LLM provider 只接收最小必要上下文，并遵守数据域和 redaction policy。
- 每个调用记录 request ID、session ID、turn ID、trace ID、actor、scope、版本、模板和 evidence IDs。

### Explicit prohibitions

- 不执行 LLM 生成的任意 Cypher、SPARQL、SQL 或 shell command。
- 不把 API key、Neo4j credentials 或 source-system credentials 放入 Vite bundle。
- 不把前端隐藏按钮当作权限控制。
- 不把 Langfuse、日志或向量索引作为企业事实源。
- 不保存 raw chain-of-thought。

## 7. Runtime Modes

| Mode | Required dependencies | Purpose |
| --- | --- | --- |
| Scripted | Frontend only | Stable management Demo and offline fallback |
| Local deterministic | Agent API + local canonical data | Pipeline and contract development |
| Pilot graph | Agent API + Neo4j + evidence store | Safe query and evidence benchmark |
| LLM-assisted | Pilot graph + configured LLM | Schema-constrained parsing and evidence-bound answer |

模式必须显式选择。Live 失败不能静默返回 scripted answer 并伪装成实时结果。

## 8. Deployment Topology

### Current production

- Nginx 静态托管 report homepage 和 Vite bundle。
- `VITE_KNOWLEDGE_MODE=local`，没有后端进程。

### Pilot target

```text
Browser -> Nginx / TLS
          |-> static frontend
          |-> /api/knowledge -> Knowledge API
          |-> /api/agent ----> Agent API

Agent API -> Agent Core -> Neo4j (read-only)
                        -> Evidence Store
                        -> LLM Provider
                        -> Session Store
                        -> OTel Collector
```

Docker Compose 只用于本地开发和 Pilot packaging；生产拓扑、secret management、backup 和 HA 需单独评审。

## 9. Architecture Decisions Still Required

1. Agent/Knowledge API 使用单服务还是两个独立 deployment unit。
2. Session Store 采用 PostgreSQL、Redis+durable store 或其他实现。
3. Document content 与 metadata 的存储和访问控制模型。
4. LLM provider、data residency、retention 和 redaction policy。
5. Neo4j 是否通过 competency benchmark，或是否选择其他 graph runtime。
6. Plant/tenant authorization model 与企业 IAM 接入方式。

这些决定必须通过 ADR 记录，不能只通过实现代码隐式确定。

## 10. Migration Risks And Controls

| Risk | Control |
| --- | --- |
| Explorer 与 Agent 数据漂移 | canonical IDs、generated fixtures、cross-view validation |
| LLM 伪造事实 | Evidence Pack allowlist、citation validation、unsupported claim removal |
| 任意查询或资源耗尽 | intent allowlist、template compiler、limit、timeout、cost guard |
| 版本语义错误 | ontology/data/contract version pinning、business validity |
| 权限泄露 | server-derived scope、retriever filtering、audit |
| Scripted Demo 被 Live 改造破坏 | client factory、contract parity tests、default scripted mode |
| 过早绑定 Neo4j/LLM | provider interfaces、in-memory reference implementation |

相关文档：[Agent Pipeline](agent-pipeline.md)、[Data Contracts](data-contracts.md)、[Implementation Roadmap](implementation-roadmap.md)。
