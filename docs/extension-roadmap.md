# Extension Roadmap

## 1. Current v0.1 Scope

当前 v0.1 范围：

- 前端交互原型
- Mock Data
- 多视图
- Value Stream View
- Stack Node / Stack Object
- Edge metadata compact display
- Focus Mode
- 无后端
- 无数据库
- 无真实源系统集成

## 2. v0.2 Frontend Hardening

建议目标：

- 自动布局，例如 dagre / elk。
- 更好的节点避让，减少展开和长 label 造成的遮挡。
- 更好的搜索，包括结果列表、排序、分类和高亮。
- 收藏 / pinned nodes。
- mini map 交互增强。
- export screenshot / export current view。
- route version switcher。
- compare mode，支持 route version diff。
- 更清晰的 loading / empty / error states。
- 大图谱性能测试和虚拟化策略。

## 3. v0.3 Backend Mock Service

建议目标：

- 用本地 Node.js / Express / FastAPI 提供 graph JSON。
- 将 Mock Data 从前端迁移到后端。
- 定义 API 契约。
- 前后端分离。
- 提供 `/api/graph`、`/api/nodes/:id`、`/api/objects/:id`、`/api/search`。
- 增加接口 mock tests。

## 4. v0.4 Source System Integration

建议接入：

- PLM：产品、BOM、工程规范、图纸、版本。
- MES：工艺路线、工序、设备、生产状态。
- ERP：物料、供应商、客户、库存。
- QMS：质量特性、控制计划、PFMEA。
- Document Library：SOP、作业指导书、批准状态。

建议先接静态主数据，再接动态数据。

## 5. v0.5 Knowledge Graph Layer

建议目标：

- 图数据库或关系型数据库 + graph service。
- ontology model。
- source ID mapping。
- versioning。
- lineage。
- impact analysis。
- cross-system relation resolution。
- 数据质量检测和冲突处理。

候选模型：

- Product - Route - Operation - Resource - Quality - Document
- Operation - Machine - Fixture - Program
- Operation - CTQ - Control Method - PFMEA
- Inventory Buffer - Process Box - WIP Buffer - Customer

## 6. v0.6 AI-ready Semantic Layer

建议目标：

- natural language query。
- AI Agent context API。
- route explanation。
- bottleneck explanation。
- quality risk reasoning。
- engineering change impact analysis。
- 自动生成 graph context。
- 面向 LLM 的对象摘要和关系摘要。

示例问题：

- 为什么 OP20 是瓶颈？
- OP30 Leak Test 依赖哪些工程资源？
- 如果 FX-002 夹具变更，会影响哪些工序和质量控制？
- 当前路线中哪些等待时间最高？

## 7. Risks and Open Questions

主要风险：

- 数据主责不清。
- 系统 ID 映射困难。
- 工艺版本管理复杂。
- 权限边界不清。
- 数据质量不稳定。
- 实时数据和静态数据混合。
- Value Stream 数据获取难度高。
- 现场手工分析数据与系统数据可能冲突。
- 不同工厂路线、工位命名和设备编码不一致。

待确认问题：

- 是否需要统一 ontology ID？
- StackObject 是否应拆成强类型对象？
- Edge metadata 是否由后端按 viewMode 计算？
- Value Stream 指标由 MES/WMS 自动计算，还是 Lean 团队维护？
- 文档和程序文件是否需要权限隔离？
- 是否需要支持多产品、多路线、多版本对比？
