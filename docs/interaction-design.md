# Interaction Design

## 1. Layout

页面采用四区布局：

- Header：标题、搜索框、版本号、View Mode 切换按钮。
- Left Sidebar：Object Categories 和当前分类对象列表。
- Graph Canvas：React Flow 主画布。
- Right Detail Panel：选中节点 / 对象的详细信息。

布局目标：

- Canvas 只显示关键结构和当前语义上下文。
- Sidebar 提供对象索引。
- Detail Panel 承载详细属性。

## 2. View Switching

### Production View

顶层对象：

- Operation
- Product
- Material
- Component

Edge metadata：

- top: requiredQty / outputQty / batchSize
- bottom: cycleTime / cycleContribution

典型用户问题：

- 这个产品如何被生产出来？
- 每个工序之间传递什么 WIP？
- 节拍和批量是多少？

### Quality View

顶层对象：

- Quality
- Inspection
- Control Method

Edge metadata：

- top: CTQ / inspectionItem / incomingInspection
- bottom: frequency / risk

典型用户问题：

- 每一步控制什么质量风险？
- 哪些 CTQ 被 100% 检查？
- 哪些边存在 high risk？

### Engineering View

顶层对象：

- Engineering Spec
- Machine
- Fixture
- Program
- Document

Edge metadata：

- top: fixtureDependency / materialSpec / programVersion
- bottom: parameter / programVersion / spec / drawing

典型用户问题：

- 这条路线依赖哪些设备、工装和程序？
- 哪些工程参数影响工序？
- SOP 和工程规范在哪里？

### Value Stream View

顶层对象：

- Process Box
- Inventory Buffer
- WIP Buffer
- Supplier
- Customer
- Finished Goods Inventory

专属节点：

- `VS-SUPPLIER`
- `VS-RM-INV`
- `VS-WIP-OP20`
- `VS-WIP-OP30`
- `VS-WIP-OP40`
- `VS-FG-INV`
- `VS-CUSTOMER`

Edge metadata：

- top: wipQty / inventoryQty / transferBatch / outputBatch / deliveryFrequency
- bottom: waitingTime / inventoryDays / customerDemand / leadTime

Timeline / bottleneck：

- 画布底部显示 Value Stream summary timeline。
- OP20 在 Value Stream View 下显示 Bottleneck badge。

典型用户问题：

- 价值如何流动？
- 哪里有等待和库存？
- 哪个工序是瓶颈？
- WIP 在哪一步堆积？

## 3. Stack Node Interaction

默认展示：

- 当前视图 top object label
- 对象类型 badge
- source system badge
- visual slot
- stack object count
- node category

展开：

- 点击 StackNode 右上角 `+`。
- 进入 Focus Mode。
- 展开当前节点的 Stack Object List。
- 只显示当前节点、一跳邻居和直接连接边。

收起：

- 点击当前展开节点右上角 `-`。
- 退出 Focus Mode。
- 恢复完整图谱。

右侧联动：

- 点击节点会更新 Detail Panel。
- 点击展开列表中的 Stack Object，会更新 Detail Panel 的 active object。

## 4. Edge Metadata Interaction

画布上每条边最多显示两项 metadata：

- 第一项在 source 出发水平线段上方。
- 第二项在 source 出发水平线段下方。

当前设计不使用大 label box，原因：

- 降低画布噪音。
- 避免遮挡节点和连接线。
- 让边信息像“标注”而不是“卡片”。

参数颜色：

- 使用 `EdgeLabelCategory` 表达语义颜色。
- 同一类参数全图一致。

Hover tooltip：

- 鼠标悬停具体参数文本时显示。
- 胶囊形 tooltip。
- 内容格式：

```text
Parts Qty: 1 pc
Quantity of parts required from the upstream node.
```

## 5. Sidebar Interaction

Object Categories：

- 默认折叠。
- 展开后显示 Current View 和 Other Views。
- Current View 默认展开。
- Other Views 默认折叠。

Selected Category Object List：

- 位于左侧下半区域。
- `flex-1 min-h-0 overflow-auto`，独立滚动。
- 点击对象后定位对应 Stack Node / Stack Object。
- 如果处于 Focus Mode，点击左侧对象会退出 Focus Mode。

## 6. Detail Panel Interaction

默认显示顺序：

1. Selected Object Header
2. View-Specific Metadata
3. Source System Mapping
4. Related Objects
5. Stacked Object List

Selected Object Header：

- 图标 / 缩略图
- label
- type
- source system
- description
- attributes

Stacked Object List：

- 默认折叠。
- Focus Mode 下自动展开。
- 展开后按分组显示：
  - Current Top Object
  - Production Objects
  - Quality Objects
  - Engineering Objects
  - Value Stream Objects
  - Documents

## 7. Search Interaction

搜索范围：

- 当前 View Mode 可见节点。
- 节点 ID、nodeCategory。
- StackObject 的 id、label、type、description、sourceSystem、sourceId、version、owner、attributes。

搜索结果：

- Header 搜索框右侧显示 node / object 数量。
- 当前实现不展示下拉结果列表，而是自动定位第一个命中对象或节点。

Focus Mode 下搜索行为：

- 搜索命中后自动退出 Focus Mode。
- 选中并定位目标节点 / 对象。
- 不自动 fitView。

## 8. Design Principles

- Canvas shows only essential context。
- Detail panel carries rich information。
- View mode controls semantic emphasis。
- Colors encode metadata category。
- Focus mode prevents overlap。
- Value Stream is separated from Production。
- Graph is structured left-to-right, not a free-form relationship hairball。

