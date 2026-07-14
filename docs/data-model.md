# Data Model

## 1. Data Model Overview

当前数据模型由以下几类组成：

- `ViewMode`
- `StackNode`
- `StackObject`
- `GraphEdge`
- Edge metadata
- `EdgeLabelCategory`
- `StackObjectVisual`
- `VisualConfig`
- View-specific visibility

类型定义集中在 `src/types.ts`，业务工具函数在 `src/lib/graphUtils.ts`，Mock 数据在 `src/data/mockGraph.ts`。

## 2. Type Definitions

以下摘录自当前代码实际类型。

```ts
export type ViewMode = "production" | "quality" | "engineering" | "valueStream";

export type StackObjectType =
  | "Product"
  | "Material"
  | "Component"
  | "Process"
  | "Operation"
  | "Machine"
  | "Fixture"
  | "Quality"
  | "Quality Characteristic"
  | "Document"
  | "Engineering Spec"
  | "Program"
  | "Inspection"
  | "Control Method"
  | "PFMEA"
  | "Supplier"
  | "Customer"
  | "Inventory Buffer"
  | "WIP Buffer"
  | "FIFO Lane"
  | "Supermarket"
  | "Process Box"
  | "Bottleneck Marker"
  | "Value Stream Metric"
  | "Finished Goods Inventory";

export type GraphMetadata = Record<string, string>;

export type EdgeLabelCategory =
  | "partsQty"
  | "cycleTime"
  | "batchSize"
  | "wip"
  | "ctq"
  | "inspectionFrequency"
  | "qualityRisk"
  | "fixture"
  | "program"
  | "processParameter"
  | "materialSpec"
  | "drawing"
  | "spec"
  | "inventoryQty"
  | "waitingTime"
  | "inventoryDays"
  | "customerDemand"
  | "transferBatch"
  | "leadTime"
  | "valueAddedTime"
  | "nonValueAddedTime"
  | "other";

export interface CompactEdgeLabel {
  value: string;
  category: EdgeLabelCategory;
  fullLabel: string;
  description?: string;
}

export interface CompactEdgeLabels {
  top?: CompactEdgeLabel;
  bottom?: CompactEdgeLabel;
}

export interface StackObjectVisual {
  kind: "thumbnail" | "icon";
  src?: string;
  icon?: string;
  alt?: string;
}

export interface VisualConfig {
  kind: "thumbnail" | "icon";
  icon?: ComponentType<{ className?: string; strokeWidth?: string | number }>;
  src?: string;
  label: string;
  className: string;
  backgroundClassName: string;
}

export interface MetadataByView {
  production?: GraphMetadata;
  quality?: GraphMetadata;
  engineering?: GraphMetadata;
  valueStream?: GraphMetadata;
}

export interface TopObjectByView {
  production?: string;
  quality?: string;
  engineering?: string;
  valueStream?: string;
}

export interface StackObject {
  id: string;
  label: string;
  type: StackObjectType;
  description: string;
  sourceSystem: string;
  sourceId: string;
  version: string;
  owner: string;
  lastUpdated: string;
  attributes: Record<string, string>;
  visual?: StackObjectVisual;
  relatedObjectIds?: string[];
}

export interface StackNode {
  id: string;
  position: { x: number; y: number };
  positionByView?: Partial<Record<ViewMode, { x: number; y: number }>>;
  stackObjects: StackObject[];
  topObjectByView: TopObjectByView;
  nodeCategory: NodeCategory;
  visibleInViews?: ViewMode[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  visibleInViews?: ViewMode[];
  metadataByView: MetadataByView;
}
```

## 3. StackNode Model

字段说明：

- `id`：节点唯一 ID，例如 `OP30`、`VS-WIP-OP30`。
- `position`：默认 React Flow 坐标。
- `positionByView`：按视图覆盖坐标。当前用于 Value Stream View 中 OP 节点的横向布局。
- `nodeCategory`：节点类别，例如 `operation`、`component`、`inventory`。
- `stackObjects`：节点内部的业务对象集合。
- `topObjectByView`：不同视图下节点顶层对象的 `StackObject.id`。
- `visibleInViews`：节点可见视图。不设置则默认所有视图可见。

`StackNode` 支持：

- 多视图顶层对象切换：`getTopObject(node, viewMode)` 根据 `topObjectByView` 返回当前显示对象。
- 堆叠对象列表：`stackObjects` 驱动展开列表和 Detail Panel。
- 视图可见性：`isVisibleInView(item, viewMode)` 处理。
- Value Stream 专属节点：通过 `visibleInViews: ["valueStream"]` 控制。

展开状态不在数据模型中保存。当前展开状态属于 UI state：

- `expandedNodeId`
- `focusMode`

位置：`src/App.tsx`。

## 4. StackObject Model

字段说明：

- `id`：对象唯一 ID。
- `label`：显示名称。
- `type`：对象类型，使用 `StackObjectType`。
- `description`：业务说明。
- `sourceSystem`：来源系统，例如 MES、PLM、ERP、QMS、Lean VSM。
- `sourceId`：来源系统 ID。
- `version`：对象版本。
- `owner`：业务负责人。
- `lastUpdated`：最后更新时间。
- `attributes`：业务属性键值对。当前所有 value 均为 string。
- `visual`：可选视觉配置，支持 thumbnail 或 icon。
- `relatedObjectIds`：相关对象 ID 列表。

未来后端映射建议：

- `StackObject` 可映射为统一的 `KnowledgeObject` 或 `GraphObject`。
- `type` 可对应 ontology / domain type。
- `sourceSystem + sourceId + version` 应作为系统集成的关键溯源字段。
- `attributes` 可先保持 flexible schema，后续再按对象类型拆成强类型 DTO。

## 5. GraphEdge Model

字段说明：

- `id`：边唯一 ID。
- `source`：源节点 ID。
- `target`：目标节点 ID。
- `relationType`：关系类型，例如 `wip-transfer`、`component-input`、`wip-to-process`。
- `visibleInViews`：边可见视图。
- `metadataByView`：不同视图下的业务 metadata。

同一条边可以在不同视图下显示不同 metadata。例如 `OP30 -> OP40`：

- Production：`cycleTime`、`WIP`、`batchSize`
- Quality：`CTQ`、`controlMethod`、`frequency`、`risk`
- Engineering：`fixtureDependency`、`programVersion`、`parameter`、`spec`

Value Stream View 使用专属边，不直接复用 Production 主流程边。

## 6. Edge Metadata Rules

画布上每条边最多显示两项 metadata，由 `getCompactEdgeLabels(edge, viewMode)` 控制。

Production:

- top: `requiredQty` / `outputQty` / `batchSize`
- bottom: `cycleTime` / `cycleContribution`

Quality:

- top: `CTQ` / `inspectionItem` / `incomingInspection`
- bottom: `frequency` / `risk`

Engineering:

- top: `fixtureDependency` / `materialSpec` / `programVersion`
- bottom: `parameter` / `programVersion` / `spec` / `drawing`

注意：当前 Engineering bottom 实际包含 `programVersion` 作为第二优先级，这是代码中的真实规则。

Value Stream:

- top: `wipQty` / `inventoryQty` / `transferBatch` / `outputBatch` / `deliveryFrequency`
- bottom: `waitingTime` / `inventoryDays` / `customerDemand` / `leadTime`

每项 compact label 返回：

- `value`
- `category`
- `fullLabel`
- `description`

## 7. Mock Data Inventory

主要 Production route nodes：

- `RM-001` Aluminum Housing Blank
- `CP-001` Rubber Diaphragm
- `CP-002` Push Rod
- `CP-003` Seal Ring
- `OP10` Housing Press Fit
- `OP20` Diaphragm Assembly
- `OP30` Leak Test
- `OP40` Final Inspection
- `FP-001` Brake Booster Assembly

OP30 关键 stack objects：

- `obj-op30-operation`: OP30 Leak Test
- `obj-op30-machine`: M220 Leak Test Bench
- `obj-op30-fixture`: FX-002 Leak Test Fixture
- `obj-op30-quality`: Leak Rate
- `obj-op30-doc`: SOP-OP30 Leak Test
- `obj-op30-spec`: PS-030 Leak Test Parameter
- `obj-op30-program`: LeakTestProgram V3.4
- `obj-op30-process-box`: Value Stream Process Box

Value Stream nodes：

- `VS-SUPPLIER`
- `VS-RM-INV`
- `VS-WIP-OP20`
- `VS-WIP-OP30`
- `VS-WIP-OP40`
- `VS-FG-INV`
- `VS-CUSTOMER`

Value Stream edges：

- `VS-SUPPLIER -> VS-RM-INV`
- `VS-RM-INV -> OP10`
- `OP10 -> VS-WIP-OP20`
- `VS-WIP-OP20 -> OP20`
- `OP20 -> VS-WIP-OP30`
- `VS-WIP-OP30 -> OP30`
- `OP30 -> VS-WIP-OP40`
- `VS-WIP-OP40 -> OP40`
- `OP40 -> VS-FG-INV`
- `VS-FG-INV -> VS-CUSTOMER`

关键 Value Stream 示例：

- `VS-WIP-OP30 -> OP30`: top `80 pcs`, bottom `4.2 h`
- `VS-RM-INV -> OP10`: top `300 pcs`, bottom `1.5 days`
- `VS-FG-INV -> VS-CUSTOMER`: top `500 pcs`, bottom `240 pcs/day`

## 8. Backend Data Mapping Considerations

未来后端可拆分为：

- master data：Product、Material、Component、Machine、Fixture。
- route data：路线节点、工序顺序、输入输出关系。
- operation data：OP10/OP20/OP30/OP40、cycle time、takt time、WIP。
- resource data：Machine、Fixture、Program。
- quality data：CTQ、Inspection、Control Method、PFMEA。
- document metadata：SOP、Drawing、Engineering Spec。
- value stream analysis data：WIP、Inventory、Waiting Time、Lead Time、PCE、Bottleneck。
- view configuration data：`topObjectByView`、`visibleInViews`、edge metadata priority、visual mapping。
