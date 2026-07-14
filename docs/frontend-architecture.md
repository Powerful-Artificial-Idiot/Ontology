# Frontend Architecture

## 1. Technology Stack

实际依赖来自 `package.json`。

核心技术：

- React `^18.3.1`
- React DOM `^18.3.1`
- TypeScript `^5.7.2`
- Vite `^6.0.7`
- React Flow `^11.11.4`
- Tailwind CSS `^3.4.17`
- lucide-react `^1.23.0`

构建相关：

- `@vitejs/plugin-react`
- `postcss`
- `autoprefixer`

当前项目使用 Vite，不是 Next.js。

## 2. Component Architecture

### `App.tsx`

根组件和主状态容器。职责：

- 管理 `viewMode`
- 管理选中节点和对象
- 管理 Focus Mode
- 管理搜索关键字
- 过滤当前视图可见节点和边
- 将 Mock Data 转换为 React Flow nodes / edges
- 渲染 Header、Left Sidebar、Graph Canvas、Right Detail Panel

### Graph Canvas

由 `ReactFlow` 渲染，位于 `App.tsx`。使用：

- `nodeTypes.stackNode = StackNode`
- `edgeTypes.businessEdge = CustomMetadataEdge`

### `StackNode.tsx`

自定义 Stack Node 组件。职责：

- 显示当前视图下的 top object
- 显示 `NodeVisual`
- 显示 source system badge
- 显示展开按钮
- 展开时显示 stack object list
- 在 Value Stream View 下显示 Bottleneck badge

### `BusinessEdge.tsx`

导出 `CustomMetadataEdge`。职责：

- 使用 `getSmoothStepPath` 绘制边
- 调用 `getCompactEdgeLabels`
- 将最多两项 metadata 显示在 source 出发水平段上下
- 使用 `EdgeLabelPill` 实现 hover tooltip
- 按 `EdgeLabelCategory` 上色

### `EdgeLabelPill`

当前在 `BusinessEdge.tsx` 内部实现，不单独导出。职责：

- 默认只显示彩色短文本
- hover 时显示胶囊 tooltip
- tooltip 内容为 `fullLabel: value` 和可选 `description`

### `NodeVisual.tsx`

职责：

- 导出 `NodeVisual`
- 导出 `getVisualConfig`
- 为 Product / Material / Component 渲染 CSS mock thumbnail
- 为 Operation / Machine / Fixture / Quality / Document / Engineering / Value Stream 类型渲染 lucide icon

### `LeftSidebar.tsx`

职责：

- Object Categories 默认折叠
- 按 View Mode 分 Current View / Other Views
- 显示当前选中 category 的对象列表
- 点击对象定位对应 Stack Node / Stack Object

### `DetailPanel.tsx`

职责：

- 显示 Selected Object Header
- 显示 View-Specific Metadata
- 显示 Source System Mapping
- 显示 Related Objects
- 显示默认折叠的 Stacked Object List
- Focus Mode 下自动展开 Stacked Object List

### `CollapsibleSection.tsx`

通用折叠区块组件，支持：

- `defaultOpen`
- `open`
- `onOpenChange`
- `count`
- `tone`

当前用于：

- Left Sidebar Object Categories
- Left Sidebar Current View / Other Views
- Detail Panel Stacked Object List
- Detail Panel Stack Object groups

### `Header.tsx`

职责：

- 显示标题
- 搜索框
- 版本 `v0.1`
- 四种 View Mode 切换按钮

### `ValueStreamTimeline`

当前在 `App.tsx` 内部实现。只在 Value Stream View 下显示 summary timeline：

- VA Time: 150s
- Waiting: 1.77 days
- Lead Time: 1.77 days
- PCE: 0.10%
- Bottleneck: OP20

### `FocusModeBar`

当前在 `App.tsx` 内部实现。Focus Mode 下显示：

- Focus Mode: 当前 top object label
- Showing direct neighbors only
- Fit Visible
- Show All

`Fit Visible` 是手动行为；进入 Focus Mode 不会自动 fitView。

## 3. State Management

当前没有 Redux、Zustand 或外部 store。主要使用：

- `useState`
- `useMemo`
- `useCallback`
- `useEffect`
- React Flow `useReactFlow`

主要状态位置：

- `viewMode`: `App.tsx`
- `selectedNodeId`: `App.tsx`
- `selectedObjectId`: `App.tsx`
- `expandedNodeId`: `App.tsx`
- `focusMode`: `App.tsx`
- `activeCategory`: `App.tsx`
- `searchKeyword`: `App.tsx`
- `searchResult`: `App.tsx` 中由 `searchGraph` 派生
- Left Sidebar 折叠状态：`LeftSidebar.tsx`
- Right Detail Panel Stacked Object List 折叠状态：`DetailPanel.tsx`
- Edge label hover：CSS `group-hover`，无 React hover state

## 4. Graph Rendering Pipeline

当前渲染流程：

```text
Mock StackNode / GraphEdge
-> filter by current viewMode
-> apply focus mode filtering
-> map to React Flow Node
-> map to React Flow Edge
-> render StackNode / CustomMetadataEdge
```

对应代码：

- `viewVisibleNodes`
- `viewVisibleEdges`
- `focusedElements`
- `graphVisibleNodes`
- `graphVisibleEdges`
- `buildFlowNode`
- `flowEdges`

## 5. View Mode Rendering Logic

核心函数：

- `getTopObject(node, viewMode)`
- `getCompactEdgeLabels(edge, viewMode)`
- `getVisualConfig(object, viewMode)`
- `isVisibleInView(item, viewMode)`
- `getNodePosition(node, viewMode)`

Value Stream 专属显示：

- 节点通过 `visibleInViews: ["valueStream"]` 控制。
- 边通过 `visibleInViews: ["valueStream"]` 控制。
- OP 节点通过 `positionByView.valueStream` 设置 Value Stream 横向位置。
- OP 节点通过 `topObjectByView.valueStream` 显示 Process Box。

## 6. Focus Mode Logic

触发条件：

- 用户点击 Stack Node 的展开按钮。

核心状态：

- `expandedNodeId`
- `focusMode`

计算函数：

- `getFocusedGraphElements(allNodes, allEdges, expandedNodeId, viewMode)`

显示规则：

- 保留 expanded node
- 保留 upstream / downstream direct neighbors
- 保留直接连接边
- 其他节点和边从 React Flow 输入中移除

为什么不自动 fitView：

- 当前需求要求 Focus Mode 只改变元素可见性，不改变用户当前 pan / zoom。
- 因此进入或退出 Focus Mode 不会自动调用 `fitView`、`setViewport`、`zoomTo` 或 `setCenter`。
- 只有用户点击 `Fit Visible` 时才调用 `reactFlow.fitView(...)`。

退出行为：

- 点击当前展开节点收起按钮
- 点击 `Show All`
- 切换 View Mode
- 搜索或点击左侧对象列表定位其他对象

## 7. Styling Strategy

当前样式使用 Tailwind CSS utility class 和少量 `src/index.css`。

View-specific theme：

- Production: blue
- Quality: orange
- Engineering: violet / slate
- Value Stream: teal

Edge label category colors：

- `partsQty`: blue
- `cycleTime`: purple
- `ctq`: orange
- `inspectionFrequency`: amber
- `qualityRisk`: red
- `fixture`: indigo
- `processParameter`: slate
- `inventoryQty`: teal
- `waitingTime`: amber
- `customerDemand`: blue
- `transferBatch`: indigo

Tooltip style：

- 胶囊形 rounded-full
- 浅色背景
- category 边框色
- pointer-events none
- hover 由 CSS group-hover 控制

## 8. Known Frontend Constraints

- 布局为手动坐标，未实现 dagre / elk 自动布局。
- 未实现节点展开后的自动避让，而是通过 Focus Mode 隐藏无关节点解决遮挡。
- 无数据持久化。
- 无权限系统。
- 无服务端分页或 lazy loading。
- 大型图谱性能未验证。
- `toggleExpandNode` 仍保留在 `graphUtils.ts`，当前 App 不再使用；建议后续清理。
- `formatMetadata` 仍保留在 `graphUtils.ts`，当前 edge label 已使用 compact label；仍可供 Detail Panel 或调试使用。
