# Agent Pipeline

## 1. Purpose

本管线把用户自然语言转换为经过 ontology 校验、权限约束和 evidence 支持的回答。LLM 只承担两个受限角色：

1. 将自然语言解析为 schema-constrained Query Plan；
2. 基于已构建的 Evidence Pack 组织回答。

企业事实、查询执行、权限判断、citation 校验和 trace 由后端负责。

Phase 2 已在 `packages/agent-core` 实现 Leak Rate Quality Issue Trace 的 deterministic 版本。当前 parser、retrievers 和 composer 只读取 local canonical baseline；本实现不包含 LLM、Neo4j、向量数据库、LangGraph、Langfuse、外部服务或 Text-to-Cypher。

## 2. End-To-End Flow

```text
User Message
  -> Request Context
  -> Semantic Parsing
  -> Query Plan Schema Validation
  -> Ontology Validation
  -> Authorization Scope Injection
  -> Intent Classification And Routing
  -> Safe Query Compilation
  -> Graph Retrieval
  -> Document Evidence Retrieval
  -> Evidence Pack Builder
  -> Answer Composer
  -> Citation Validator
  -> Structured Trace Builder
  -> Session And Audit Persistence
```

任何 validation gate 失败都必须停止后续执行，不能让 LLM 自行“修复后继续查询”。允许的修复只能是后端明确控制的重新解析，并保留失败 trace。

## 3. Pipeline Stage Contract

每个 stage 应遵循同一接口概念：

```ts
type PipelineStage<I, O> = {
  name: string;
  execute(input: I, context: AgentExecutionContext): Promise<StageResult<O>>;
};

type StageResult<T> =
  | { status: "completed"; output: T; summary: StageSummary }
  | { status: "blocked"; reason: AgentError; summary: StageSummary };
```

`StageSummary` 只能包含结构化输入摘要、输出摘要、tool/template/version、evidence IDs、耗时和错误，不包含模型的隐藏推理过程。

## 4. Stage Responsibilities

### 4.1 Request Context

输入：user message、language、session ID、previous turn references。

后端补充：

- request/turn/trace ID；
- actor identity；
- tenant/plant/domain scope；
- active contract、ontology 和 data version；
- deadline、locale 和 redaction policy。

客户端不得自行声明可访问的数据域。

### 4.2 Semantic Parser

输出 `SemanticQueryPlanDraft`，只允许 schema 中的字段和 intent。不得输出 Cypher。

解析内容包括：

- normalized intent；
- detected business terms；
- candidate entity references；
- relation/predicate requirements；
- filters、time constraint、aggregation；
- expected evidence types；
- ambiguity 和 clarification requirement。

第一版可使用 deterministic parser。LLM parser 后续通过 provider interface 接入。

### 4.3 Query Plan Schema Validator

- JSON Schema validation；
- unknown field rejection；
- enum、limit、depth、date 和 unit validation；
- plan version compatibility；
- required clarification detection。

失败输出 `QUERY_PLAN_INVALID`，不得进入 ontology validation。

### 4.4 Ontology Validator

- entity type、predicate、property 是否存在于指定 ontology version；
- source/range 与 relation domain/range 是否兼容；
- semantic term 是否 deprecated；
- mapping 是否有歧义；
- requested action 是否被 ontology/application policy 允许。

输出 resolved IRI、canonical ID、mapping confidence 和 warnings。

### 4.5 Authorization Scope Injection

将服务端生成的 scope 合并到 validated plan：

- allowed plants/domains/source systems；
- object/document classification；
- allowed actions；
- maximum depth/result size；
- redaction requirements。

scope 只能收窄 Query Plan，不能被 Query Plan 扩大。

### 4.6 Query Router

建议的初始 intent allowlist：

- `entity_lookup`；
- `direct_neighborhood`；
- `route_trace`；
- `impact_analysis`；
- `version_at_time`；
- `evidence_lookup`；
- `bounded_aggregate`。

未知 intent 返回 clarification 或 unsupported，不退化为 unrestricted query。

### 4.7 Safe Query Compiler

输入只能是 `ValidatedQueryPlan`。输出内部 `GraphQueryPlan`：

```ts
type GraphQueryPlan = {
  graphPlanId: string;
  semanticPlanId: string;
  templateId: string;
  seedEntityIds: string[];
  allowedRelationTypes: string[];
  parameters: Record<string, string | number | boolean | string[]>;
  readOnly: true;
  resultLimit: number;
  maxDepth: number;
};
```

安全规则：

- template registry 中的 Cypher 由工程师评审并版本化；
- label、relationship type 和 property name 来自 allowlist，不能由字符串拼接；
- 所有业务值参数化；
- 禁止 `CREATE`、`MERGE`、`DELETE`、`SET`、`REMOVE`、`DROP`、动态过程调用和多语句；
- 强制 limit、timeout、depth 和 read-only transaction；
- compiler 输出进入二次 static safety validation。

### 4.8 Graph Retriever

返回 normalized facts，而不是数据库 driver records：

- canonical entity/relation IDs；
- source、version、valid time、recorded time；
- asserted/inferred classification；
- rule provenance（如适用）；
- query template ID 和 retrieval trace。

### 4.9 Document Evidence Retriever

按 graph facts、requested evidence types 和 authorization scope 检索：

- document ID/title/type/version；
- source system；
- page/section/chunk locator；
- immutable checksum；
- effective status；
- ACL decision；
- retrieval score 和 method。

embedding match 只是召回信号，不是事实证明。

### 4.10 Evidence Pack Builder

Evidence Pack 必须区分：

- asserted graph facts；
- governed inferred facts；
- document evidence；
- assumptions；
- limitations/unknowns。

每个 fact 都携带 `evidenceIds`。无 evidence 的候选内容不能进入 `supportedFacts`。

### 4.11 Answer Composer

LLM 或 deterministic composer 只能看到：

- normalized user question；
- approved response language；
- supported facts；
- assumptions/limitations；
- citation identifiers；
- output schema 和 style constraints。

不得向 composer 提供数据库凭据、不可见文档、完整企业数据或未校验 Query Plan。

### 4.12 Citation Validator

逐 claim 验证：

1. citation ID 存在于本轮 Evidence Pack；
2. evidence 支持该 claim 的对象、关系、数值、版本和时间；
3. actor 有权访问该 evidence；
4. 引用版本仍是本轮检索时指定版本；
5. unsupported claim 被删除、降级为 assumption/unknown 或阻止完成。

`citationCoverage` 不应仅计算“有引用的句子比例”，还要验证引用语义是否支持 claim。

### 4.13 Trace Builder

Trace 包含：

- stage status、duration、provider/tool/template version；
- plan validation result；
- resolved ontology terms；
- compiled template ID 和参数摘要；
- graph/document result counts；
- evidence IDs；
- citation validation result；
- warning、limitation、error code；
- request/session/turn correlation IDs。

Trace 不包含 raw prompt hidden state、token-by-token reasoning 或 chain-of-thought。

## 5. Multi-Turn Context Rules

- 后续 turn 只继承 canonical IDs、validated facts、evidence IDs、explicit assumptions 和 authorization scope reference。
- 不直接把上一轮整段自然语言回答当作企业事实。
- scope、ontology version 或 data version 改变时，旧 evidence 必须重新验证。
- pronoun/entity resolution 必须返回 ambiguity；不得静默猜测多个同名设备。
- session context 有最大大小、retention 和 redaction policy。

## 6. Error Model

建议稳定错误代码：

| Code | Meaning | User behavior |
| --- | --- | --- |
| `CLARIFICATION_REQUIRED` | entity/intent ambiguous | 请求补充信息 |
| `QUERY_PLAN_INVALID` | schema validation failed | 不执行查询 |
| `ONTOLOGY_TERM_INVALID` | unknown/incompatible term | 显示受控限制 |
| `QUERY_INTENT_UNSUPPORTED` | no safe template | 不退化为 raw query |
| `ACCESS_DENIED` | scope violation | 不暴露对象存在性细节 |
| `GRAPH_UNAVAILABLE` | graph dependency unavailable | 可切换 Scripted，不伪装 Live |
| `EVIDENCE_INSUFFICIENT` | claims lack support | 返回 unknown/limitation |
| `CITATION_INVALID` | answer citation mismatch | 阻止或降级回答 |
| `PIPELINE_TIMEOUT` | deadline exceeded | 保存 partial trace |

## 7. Acceptance Tests

每个阶段至少覆盖：

- valid fixture；
- malformed/unknown field；
- invalid ontology term；
- unauthorized object/document；
- excessive depth/limit；
- attempted write Cypher；
- graph empty result；
- conflicting document versions；
- unsupported claim；
- cancellation and timeout；
- multi-turn version/scope change；
- bilingual answer with identical evidence IDs。

现有 CQ-001 至 CQ-005 应成为 Safe Compiler 和 retrieval 的首批 golden tests。
