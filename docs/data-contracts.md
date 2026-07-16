# Data Contracts

## 1. Current Contract Baseline

当前共享契约位于 `packages/knowledge-contracts`。Knowledge contract 版本为 `1.1.0`，Agent transport contract 版本为 `1.0.0`，已覆盖：

- `KnowledgeEntity`、`KnowledgeRelation`、provenance；
- `GraphViewRequest/Response`；
- `OntologyGraphRequest/Response`；
- `SemanticSearchRequest/Response`；
- `SemanticCatalogResponse`；
- `KnowledgeRepository`。
- `AgentTurnRequest/Response`、`SemanticQueryPlan`、`ValidatedQueryPlan`、`GraphQueryPlan`；
- `EvidencePack`、claim/citation、`CitationValidationResult`；
- `StructuredAgentTrace`、`AgentSession`、`AgentAuditEvent`。

对应 JSON Schemas 已被 Python validation 和 canonical fixture 使用。`src/features/agent-demo/agentDemoTypes.ts` 仅保留 UI conversation、view index 和组件展示所需类型，并复用共享 language、domain 和 confidence 类型。

## 2. Contract Ownership Rules

- 跨 package、跨进程或持久化的数据进入 `packages/knowledge-contracts`。
- React component props、canvas state、展开状态和 UI class 不进入共享 contract。
- TypeScript type 与 JSON Schema 必须同步，不能只改一侧。
- API responses 带 `contractVersion`、`ontologyVersion`、`dataVersion`、`traceId` 和 `generatedAt`。
- major contract 不兼容时客户端拒绝；minor 新字段必须遵循明确兼容策略。
- 服务端始终拒绝 unknown security-sensitive fields。

## 3. Agent Contracts

Phase 1 已在 `packages/knowledge-contracts/src/agent.ts` 实现传输中立类型，并在 `packages/knowledge-contracts/schemas/` 提供 request、query plan、evidence pack、response 和 canonical baseline schemas。以下片段保留设计意图说明；精确字段以 TypeScript 与 JSON Schema 为准。

### AgentTurnRequest

```ts
type AgentTurnRequest = {
  contractVersion: string;
  sessionId: string;
  message: string;
  language: "zh" | "en";
  clientContext?: {
    activePage?: "route" | "ontology" | "semantic" | "agent";
    selectedEntityIds?: string[];
    viewMode?: "production" | "quality" | "engineering" | "valueStream";
  };
};
```

客户端上下文仅用于相关性，不用于授权。actor identity 和 authorization scope 由服务端建立。

### SemanticQueryPlan

```ts
type SemanticQueryPlan = {
  planVersion: "1.0";
  queryId: string;
  intent:
    | "entity_lookup"
    | "direct_neighborhood"
    | "route_trace"
    | "impact_analysis"
    | "version_at_time"
    | "evidence_lookup"
    | "bounded_aggregate";
  entities: Array<{
    mention: string;
    candidateIds?: string[];
    expectedTypes?: string[];
  }>;
  predicates?: string[];
  filters?: Array<{ property: string; operator: "eq" | "in" | "lt" | "lte" | "gt" | "gte"; value: unknown }>;
  temporal?: { asOf?: string; validDuring?: { from: string; to: string } };
  traversal?: { direction: "in" | "out" | "both"; maxDepth: number };
  evidenceTypes?: string[];
  aggregation?: { operation: "count" | "min" | "max" | "avg"; property?: string };
  ambiguity?: { requiresClarification: boolean; questions: string[] };
};
```

该 contract 中明确禁止 `cypher`、`sparql`、`sql`、shell command 和 provider-specific prompt 字段。

### ValidatedQueryPlan

在 `SemanticQueryPlan` 基础上增加：

- resolved canonical entity IDs 和 ontology IRIs；
- ontology/data version；
- server-derived authorization scope reference；
- selected safe template family；
- enforced depth、limit、timeout；
- validation warnings 和 deprecated-term replacements。

这是内部 contract，不接受客户端直接提交。

### EvidencePack

```ts
type EvidencePack = {
  id: string;
  queryId: string;
  ontologyVersion: string;
  dataVersion: string;
  generatedAt: string;
  supportedFacts: Array<{
    id: string;
    subjectId: string;
    predicate: string;
    object: unknown;
    assertionType: "asserted" | "inferred";
    evidenceIds: string[];
    validFrom?: string;
    validTo?: string;
  }>;
  evidence: EvidenceItem[];
  assumptions: string[];
  limitations: string[];
};
```

### EvidenceItem

```ts
type EvidenceItem = {
  id: string;
  kind: "graph" | "document" | "source-record" | "rule";
  title: string;
  sourceSystem?: string;
  sourceId: string;
  version?: string;
  locator?: string;
  checksum?: string;
  recordedAt?: string;
  validFrom?: string;
  validTo?: string;
  classification?: string;
  excerpt?: string;
};
```

### AgentAnswer And Citation

```ts
type AgentClaim = {
  id: string;
  text: string;
  classification: "fact" | "assumption" | "limitation" | "unknown";
  evidenceIds: string[];
};

type AgentAnswer = {
  summary: string;
  claims: AgentClaim[];
  recommendedActions: string[];
  confidence: "low" | "medium" | "high";
};

type CitationValidationResult = {
  valid: boolean;
  checkedClaimIds: string[];
  invalidClaims: Array<{ claimId: string; reason: string }>;
  coverage: number;
};
```

### Structured Agent Trace

```ts
type AgentTrace = {
  traceId: string;
  sessionId: string;
  turnId: string;
  status: "running" | "completed" | "blocked" | "failed" | "cancelled";
  stages: Array<{
    id: string;
    name: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    tool?: string;
    templateVersion?: string;
    inputSummary: Record<string, unknown>;
    outputSummary?: Record<string, unknown>;
    evidenceIds?: string[];
    errorCode?: string;
  }>;
};
```

Trace schema 不允许 raw chain-of-thought 字段。

## 4. Session And Audit Contracts

`AgentSession` 至少记录：session ID、actor reference、scope reference、language、created/updated time、active ontology/data version 和 turn IDs。

`AuditEvent` 至少记录：

- event ID/type/time；
- request/session/turn/trace correlation IDs；
- actor、tenant/plant scope reference；
- action、resource IDs、decision；
- query template ID、evidence IDs；
- provider/model/prompt-template version（如适用）；
- redaction status、error code。

Audit records 不复制完整敏感文档或 raw prompt，必要时只保存 hash/reference。

## 5. Canonical Identity And Provenance

- canonical ID 在 Route、Ontology、Semantic、Agent 和 Evidence 中保持一致。
- source identity 使用 `sourceSystem + sourceId`，不能替代 canonical ID。
- document version、business validity 与 recorded time 分开表达。
- inferred relation 必须保留 rule ID、input evidence IDs 和 execution time。
- alias/synonym 只参与 semantic resolution，不创建重复业务对象。

## 6. Data Consistency Migration

当前重复事实主要存在于：

- `src/data/mockGraph.ts`；
- `src/data/ontologyData.ts`；
- `src/features/semantic/semanticData.ts`；
- `src/data/mockKnowledgeRegistry/*`；
- `src/features/agent-demo/agentConversationData.ts`；
- `packages/demo-data/**/*.json`。

迁移策略：

1. 冻结 `legacyDemoData.ts`，禁止新增事实；
2. 为 canonical demo records 定义 schema；
3. 从 canonical records 生成 graph views、Agent references 和 search fixtures；
4. ontology schema 继续只由 TTL 生成；
5. view positions、labels priority 和 thumbnails 保持 frontend config；
6. 增加 golden ID/value checks，逐消费者迁移；
7. 所有消费者迁移后再删除 legacy fixtures。

## 7. Schemas To Add

建议按以下顺序增加：

1. `agent-turn-request.schema.json`
2. `semantic-query-plan.schema.json`
3. `evidence-pack.schema.json`
4. `agent-answer.schema.json`
5. `citation-validation.schema.json`
6. `agent-trace.schema.json`
7. `agent-session.schema.json`
8. `audit-event.schema.json`

每个 schema 必须配 valid、invalid、version mismatch 和 unknown-field fixtures。

## 8. Contract Release Gate

Agent contract 发布前必须满足：

- TypeScript 与 JSON Schema 一致；
- valid/invalid fixtures 通过；
- canonical IDs 可解析；
- evidence 和 citation references 完整；
- ontology/data/contract versions 一致；
- Scripted Client adapter 和 Live Client contract tests 通过；
- release manifest 与 checksums 包含新增 schemas。
