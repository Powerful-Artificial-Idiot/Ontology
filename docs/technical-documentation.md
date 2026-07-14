# Manufacturing Graph Explorer v0.1 技术文档

## 1. Project Overview

项目名称：**Manufacturing Graph Explorer v0.1**

Manufacturing Graph Explorer v0.1 是一个制造知识图谱 / 制造数字主线浏览器的前端原型，用于以多视图方式展示产品从原材料、零件、工序、设备、质量控制、工程文件、价值流分析到成品的结构化关系。

当前阶段：

- 前端 Demo
- 本地 TypeScript Mock Data 驱动
- 无真实后端
- 无数据库
- 无真实 MES / PLM / ERP / QMS 接口

目标用户：

- 制造工程师
- 工艺工程师
- 质量工程师
- 精益改善工程师
- 数字化项目经理
- 管理层演示用户
- 后端 / 系统集成开发者

## 2. Core Concept

### Stack Node

Stack Node 代表制造路线中的一个结构位置。它不是单一实体，而是一个业务对象容器，可以包含多个 Stack Objects，例如：

- Operation
- Product
- Material
- Component
- Machine
- Fixture
- Quality Characteristic
- Document
- Engineering Spec
- Program
- Process Box
- WIP Buffer

当前代码类型为 `StackNode`，定义在 `src/types.ts`，Mock 数据在 `src/data/mockGraph.ts`。

### Stack Object

Stack Object 是 Stack Node 内部的具体业务对象。它可以来自不同源系统，例如：

- MES
- PLM
- ERP
- QMS
- DMS / Document Library
- Lean VSM Mock Data
- Tooling DB
- Equipment Controller

当前代码类型为 `StackObject`。对象通过 `sourceSystem`、`sourceId`、`version`、`owner`、`lastUpdated` 保留未来系统集成所需的溯源字段。

### View Mode

当前支持四种视图：

- Production View
- Quality View
- Engineering View
- Value Stream View

不同 View Mode 下：

- 同一个 Stack Node 的顶层对象不同，由 `topObjectByView` 控制
- Edge metadata 显示不同，由 `metadataByView` 和 `getCompactEdgeLabels` 控制
- 节点图标 / 缩略图不同，由 `NodeVisual` 和 `getVisualConfig` 控制
- Detail Panel 展示重点不同
- Value Stream View 可以显示专属节点和边，由 `visibleInViews` 控制

### Edge Metadata

边不是普通箭头，而是表达节点之间的业务关系。每条边在画布上最多显示两项 metadata。详细信息通过：

- edge label hover tooltip
- Right Detail Panel 的 View-Specific Metadata

来查看。

### Focus Mode

当某个 Stack Node 展开时，系统进入 Focus Mode：

- 只显示该节点
- 显示与该节点直接相连的一跳邻接节点
- 显示直接连接边和对应 edge label / tooltip
- 隐藏其他节点和边

Focus Mode 不改变当前画布缩放和位置。当前实现提供手动 `Fit Visible` 按钮，只有用户点击时才调用 `reactFlow.fitView(...)`。

## 3. Feature Summary

当前已实现功能：

- Left-to-right manufacturing route graph
- Stack Node
- Node expand / collapse
- Production / Quality / Engineering / Value Stream view switching
- View-specific top object
- View-specific edge metadata
- Edge metadata compact two-line display
- Edge metadata semantic color coding
- Hover tooltip for edge metadata
- Node icons and thumbnails
- Left sidebar object categories
- View-grouped collapsible categories
- Search and locate node/object
- Right detail panel
- Stacked Object List collapsible display
- Value Stream View
- Value Stream-specific nodes and edges
- Value Stream summary timeline bar
- Bottleneck badge for OP20 in Value Stream View
- Focus Mode for expanded Stack Node
- One-hop neighborhood highlighting

## 4. How to Run

实际命令来自 `package.json`。

推荐 Node.js 版本：

- 推荐 Node.js 20 LTS
- Vite 6 当前要求 `^18.0.0 || ^20.0.0 || >=22.0.0`
- 当前环境曾使用 Node `v21.5.0`，会出现 Vite engine warning，但构建可通过；交付环境建议使用 Node 20 LTS 或 Node 22+

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

构建：

```bash
npm run build
```

预览构建结果：

```bash
npm run preview
```

当前 `package.json` scripts：

```json
{
  "dev": "vite --host 0.0.0.0",
  "build": "tsc -b && vite build",
  "preview": "vite preview --host 0.0.0.0"
}
```

## 5. Project Structure

当前主要目录结构：

```text
manufacturing-graph-explorer/
  docs/
    technical-documentation.md
    data-model.md
    frontend-architecture.md
    interaction-design.md
    backend-integration-guide.md
    api-design-draft.md
    extension-roadmap.md
  src/
    components/
      BusinessEdge.tsx
      CollapsibleSection.tsx
      DetailPanel.tsx
      Header.tsx
      LeftSidebar.tsx
      NodeVisual.tsx
      StackNode.tsx
    data/
      mockGraph.ts
    lib/
      graphUtils.ts
    App.tsx
    index.css
    main.tsx
    types.ts
  index.html
  package.json
  tailwind.config.js
  postcss.config.js
  tsconfig.json
  vite.config.ts
```

核心文件说明：

- `src/App.tsx`：应用主状态、React Flow 渲染、视图过滤、Focus Mode、搜索、View Mode 切换。
- `src/types.ts`：核心 TypeScript 数据模型。
- `src/data/mockGraph.ts`：当前全部 Mock 节点和边数据。
- `src/lib/graphUtils.ts`：视图顶层对象、edge label、搜索、邻域高亮、Focus Mode 过滤等业务函数。
- `src/components/StackNode.tsx`：自定义 React Flow Stack Node。
- `src/components/BusinessEdge.tsx`：自定义 edge、两行 metadata、tooltip。
- `src/components/NodeVisual.tsx`：节点图标 / 缩略图和 `getVisualConfig`。
- `src/components/LeftSidebar.tsx`：左侧对象分类和对象列表。
- `src/components/DetailPanel.tsx`：右侧详情面板。
- `src/components/CollapsibleSection.tsx`：通用折叠区块。
- `src/components/Header.tsx`：标题、搜索框、四视图切换按钮。

## 6. Main User Flow

1. 打开页面，默认进入 Production View。
2. 查看从左到右的制造路线图。
3. 切换 Production / Quality / Engineering / Value Stream 视图。
4. 点击节点，右侧 Detail Panel 显示该节点和当前顶层对象详情。
5. 点击节点上的展开按钮，进入 Focus Mode，仅显示该节点和一跳邻接节点。
6. 悬停 edge label，查看参数完整含义和说明。
7. 使用搜索框搜索对象，例如 `M220`，定位到 OP30 中的 M220 Leak Test Bench。
8. 在左侧 Object Categories 中切换对象类型，点击对象定位相关节点。
9. 进入 Value Stream View 分析库存、等待、WIP、瓶颈和 PCE mock 指标。

## 7. Current Limitations / 待确认问题

当前实现限制：

- 当前数据为 Mock Data，位于 `src/data/mockGraph.ts`。
- 无真实权限系统。
- 无真实后端接口。
- 无数据库。
- 无实时 MES / PLM / ERP / QMS 数据。
- Value Stream 数据为样例数据，非实时计算结果。
- 节点布局主要为手写 `position` / `positionByView`，未接入自动布局算法。
- Edge routing 使用 React Flow `getSmoothStepPath`，未实现复杂避让。
- Focus Mode 通过过滤 nodes / edges 防止遮挡，但未实现动画过渡。
- 搜索当前为前端本地字符串匹配，无分页、排序、模糊权重或服务端索引。
- 左侧 Object Categories 接收当前 view 可见节点集合，因此非当前视图专属对象不会在当前视图中作为完整对象列表展开。
- 当前 `ReactFlow` 使用 `key={viewMode}`，View Mode 切换会重新挂载图谱；Focus Mode 不会重新挂载。
- 当前无 TODO / FIXME 标记。

更多细节见：

- [data-model.md](./data-model.md)
- [frontend-architecture.md](./frontend-architecture.md)
- [interaction-design.md](./interaction-design.md)
- [backend-integration-guide.md](./backend-integration-guide.md)
- [api-design-draft.md](./api-design-draft.md)
- [extension-roadmap.md](./extension-roadmap.md)
