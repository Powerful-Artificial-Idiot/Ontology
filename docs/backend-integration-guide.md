# Backend Integration Guide

## 1. Integration Goal

未来后端目标：

- 将当前 `src/data/mockGraph.ts` 替换为真实数据服务。
- 支持 MES / PLM / ERP / QMS / WMS / Document Library / IoT / Value Stream analysis data。
- 尽量保持前端视图逻辑和数据模型稳定。

第一阶段建议后端返回接近当前 Mock Data 的 JSON，使前端迁移成本最低。

## 2. Recommended Backend Architecture

建议架构：

```text
Source Systems
MES / PLM / ERP / QMS / WMS / Document Library / IoT
        ↓
Integration Layer / Connectors
        ↓
Manufacturing Knowledge Service
        ↓
Graph API / Route API / Object API
        ↓
Frontend
```

关键原则：

- Source Systems 负责事实数据。
- Integration Layer 做抽取、清洗、ID 映射。
- Manufacturing Knowledge Service 负责统一对象模型、关系模型、视图模型。
- Frontend 不负责决定主数据来源，只负责渲染。

## 3. Source System Mapping

建议对象来源：

- Product: PLM / ERP
- Material: ERP / PLM
- Component: PLM / ERP
- Operation: MES / PLM process planning
- Machine: MES / Asset system / CMMS
- Fixture: Tooling database / PLM / MES
- Quality Characteristic: QMS / Control Plan / PLM
- Document: Document Library / PLM
- Engineering Spec: PLM / Document Library
- Program: MES / machine program repository / Equipment Controller
- Supplier: ERP / Supplier Portal
- Customer: ERP / CRM / Customer Portal
- Inventory Buffer: WMS / ERP / Lean study
- WIP Buffer: MES / WMS / Lean study
- Value Stream Metric: Lean study / MES / inventory analysis / manual analysis

## 4. Data Ownership

建议主责：

- PLM：产品、BOM、工程规范、图纸、版本。
- ERP：物料、供应商、客户、库存基础数据。
- MES：工艺路线、工序、设备、生产状态、WIP。
- QMS：质量特性、检验方法、控制计划、PFMEA。
- DMS / PLM：SOP、文件、批准状态。
- Tooling DB：工装、夹具、校准状态。
- Lean / Continuous Improvement：价值流分析和手工维护的等待、库存、PCE。

`sourceSystem`、`sourceId`、`version`、`owner`、`lastUpdated` 很重要：

- 用于定位数据来源。
- 用于版本追溯。
- 用于责任归属。
- 用于后续审计和问题排查。

## 5. Integration Strategy

### Phase 1

- 后端返回与当前 Mock Data 相同结构的 JSON。
- 不接真实系统。
- 验证 API 契约和前后端分离。

### Phase 2

- 接 PLM / ERP 静态主数据。
- 覆盖 Product、Material、Component、Document。

### Phase 3

- 接 MES 工艺路线和设备信息。
- 覆盖 Operation、Machine、WIP、route sequence。

### Phase 4

- 接 QMS / Control Plan / PFMEA。
- 覆盖 Quality Characteristic、Inspection、Control Method、risk。

### Phase 5

- 接 Value Stream 数据、WIP、库存、节拍、等待时间。
- 支持 bottleneck 和 PCE 计算。

### Phase 6

- 支持实时状态和 AI Agent 查询。
- 提供 AI-ready context API。

## 6. Data Freshness

数据新鲜度分类：

- master data：产品、物料、零件、设备、工装，低频变更。
- versioned engineering data：工程规范、图纸、路线版本、程序版本，需要版本和生效日期。
- transactional production data：WIP、批次、生产状态，中高频变更。
- real-time / near real-time data：设备状态、IoT 参数、异常报警。
- manually maintained lean analysis data：Value Stream waiting time、inventory days、PCE，可能来自手工研究或周期性更新。

## 7. Versioning Considerations

未来建议支持：

- route version
- product version
- process version
- document version
- program version
- effective date
- engineering change number
- validFrom / validTo
- released / draft / obsolete 状态

Graph API 应允许按 `version` 或 `effectiveDate` 查询，以复现历史路线。

## 8. Security and Permission Considerations

未来需要考虑：

- system-level authentication
- user permission
- object-level visibility
- source-system authorization
- role-based access control
- audit logging
- sensitive document protection
- supplier / customer data boundary

前端当前无权限系统，不应作为权限控制点。权限应由后端 API 和源系统授权共同保证。

