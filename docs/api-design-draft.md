# API Design Draft

> 本文档是后端 API 草案，不代表当前已有后端实现。当前项目仍使用本地 Mock Data。

## 1. API Design Principle

- API 应返回前端可直接渲染的 graph model。
- 第一阶段可以保持接近当前 `StackNode[]` / `GraphEdge[]` 结构。
- 后续再拆分领域服务和按需加载详情。
- 所有对象必须带 `sourceSystem` / `sourceId`。
- 支持 `viewMode` 过滤。
- 支持版本、有效日期和路线维度查询。

## 2. Core Endpoints

### GET `/api/graph`

用途：返回完整图谱数据。

Query params:

- `productId`
- `routeId`
- `viewMode`
- `version`
- `effectiveDate`

Response:

```ts
{
  nodes: StackNodeResponse[];
  edges: GraphEdgeResponse[];
  metadata: {
    productId: string;
    routeId: string;
    version: string;
    generatedAt: string;
  };
}
```

### GET `/api/objects/:objectId`

用途：返回单个 StackObject 详细信息。

### GET `/api/nodes/:nodeId`

用途：返回单个 StackNode 详细信息。

### GET `/api/search`

用途：搜索节点和对象。

Query params:

- `q`
- `viewMode`
- `objectType`
- `sourceSystem`

### GET `/api/routes/:routeId/value-stream`

用途：返回 Value Stream View 专用数据。

### GET `/api/routes/:routeId/versions`

用途：返回路线版本列表。

## 3. Response Schema

```ts
type ViewMode = "production" | "quality" | "engineering" | "valueStream";

type GraphMetadata = Record<string, string>;

type StackObjectResponse = {
  id: string;
  label: string;
  type: string;
  description: string;
  sourceSystem: string;
  sourceId: string;
  version: string;
  owner: string;
  lastUpdated: string;
  attributes: Record<string, string>;
  visual?: {
    kind: "thumbnail" | "icon";
    src?: string;
    icon?: string;
    alt?: string;
  };
  relatedObjectIds?: string[];
};

type StackNodeResponse = {
  id: string;
  position: { x: number; y: number };
  positionByView?: Partial<Record<ViewMode, { x: number; y: number }>>;
  stackObjects: StackObjectResponse[];
  topObjectByView: Partial<Record<ViewMode, string>>;
  nodeCategory: string;
  visibleInViews?: ViewMode[];
};

type EdgeMetadataResponse = Partial<Record<ViewMode, GraphMetadata>>;

type GraphEdgeResponse = {
  id: string;
  source: string;
  target: string;
  relationType: string;
  visibleInViews?: ViewMode[];
  metadataByView: EdgeMetadataResponse;
};

type SearchResultResponse = {
  nodeIds: string[];
  objectIds: string[];
  results: Array<{
    kind: "node" | "object";
    id: string;
    nodeId?: string;
    label: string;
    type?: string;
    sourceSystem?: string;
  }>;
};

type ValueStreamSummaryResponse = {
  routeId: string;
  totalVaTime: string;
  totalWaitingTime: string;
  totalLeadTime: string;
  processCycleEfficiency: string;
  bottleneckProcessId: string;
  generatedAt: string;
};
```

## 4. Example Responses

### 4.1 GET `/api/graph?productId=FP-001&viewMode=production`

```json
{
  "nodes": [
    {
      "id": "OP30",
      "position": { "x": 1660, "y": 335 },
      "nodeCategory": "operation",
      "topObjectByView": {
        "production": "obj-op30-operation",
        "quality": "obj-op30-quality",
        "engineering": "obj-op30-program",
        "valueStream": "obj-op30-process-box"
      },
      "stackObjects": [
        {
          "id": "obj-op30-operation",
          "label": "OP30 Leak Test",
          "type": "Operation",
          "description": "Automatic leak test validating booster sealing performance.",
          "sourceSystem": "MES",
          "sourceId": "OP-030",
          "version": "v3.0",
          "owner": "Production Engineering",
          "lastUpdated": "2026-06-20",
          "attributes": {
            "taktTime": "45s",
            "workCenter": "Leak Test Cell",
            "outputWip": "Tested Booster"
          }
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "edge-op30-op40",
      "source": "OP30",
      "target": "OP40",
      "relationType": "wip-transfer",
      "visibleInViews": ["production", "quality", "engineering"],
      "metadataByView": {
        "production": {
          "cycleTime": "42s",
          "WIP": "Tested Booster",
          "batchSize": "20"
        }
      }
    }
  ],
  "metadata": {
    "productId": "FP-001",
    "routeId": "BB-ROUTE-001",
    "version": "v0.1",
    "generatedAt": "2026-07-08T00:00:00Z"
  }
}
```

### 4.2 GET `/api/graph?productId=FP-001&viewMode=valueStream`

```json
{
  "nodes": [
    {
      "id": "VS-WIP-OP30",
      "position": { "x": 1520, "y": 250 },
      "nodeCategory": "wip-buffer",
      "visibleInViews": ["valueStream"],
      "topObjectByView": {
        "valueStream": "obj-vs-wip-op30"
      },
      "stackObjects": [
        {
          "id": "obj-vs-wip-op30",
          "label": "WIP Before OP30",
          "type": "WIP Buffer",
          "description": "Work-in-process buffer before leak test.",
          "sourceSystem": "Lean VSM",
          "sourceId": "VSM-WIP-OP30",
          "version": "v0.1",
          "owner": "Lean Engineering",
          "lastUpdated": "2026-06-24",
          "attributes": {
            "wipQty": "80 pcs",
            "waitingTime": "4.2 h",
            "bufferType": "WIP Buffer"
          }
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "edge-vs-wip-op30-op30",
      "source": "VS-WIP-OP30",
      "target": "OP30",
      "relationType": "wip-to-process",
      "visibleInViews": ["valueStream"],
      "metadataByView": {
        "valueStream": {
          "wipQty": "80 pcs",
          "waitingTime": "4.2 h"
        }
      }
    }
  ],
  "metadata": {
    "productId": "FP-001",
    "routeId": "BB-ROUTE-001",
    "version": "v0.1",
    "generatedAt": "2026-07-08T00:00:00Z"
  }
}
```

### 4.3 GET `/api/search?q=M220`

```json
{
  "nodeIds": ["OP30"],
  "objectIds": ["obj-op30-machine"],
  "results": [
    {
      "kind": "object",
      "id": "obj-op30-machine",
      "nodeId": "OP30",
      "label": "M220 Leak Test Bench",
      "type": "Machine",
      "sourceSystem": "MES / EAM"
    }
  ]
}
```

## 5. Error Handling

建议错误格式：

```ts
type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
```

状态码：

- `400 invalid query`: 查询参数缺失或非法。
- `404 product / route / object not found`: 找不到目标资源。
- `409 version conflict`: 请求版本与当前有效版本冲突。
- `500 internal error`: 服务端异常。

## 6. Pagination / Performance

建议：

- 大型图谱不应一次返回全部对象详情。
- 可先返回节点摘要，再按需加载 StackObject 详情。
- 支持 `depth` 参数控制邻域深度。
- 支持 `viewMode` 服务端过滤。
- 支持 lazy loading stack objects。
- 支持基于 viewport 或 focus node 的 visible node filtering。

示例参数：

```text
GET /api/graph?productId=FP-001&viewMode=engineering&depth=1&includeStackObjects=summary
```

## 7. Future API Extensions

建议扩展：

- `POST /api/impact-analysis`
- `GET /api/objects/:id/lineage`
- `GET /api/routes/:routeId/diff`
- `GET /api/value-stream/bottlenecks`
- `GET /api/ai/context`

