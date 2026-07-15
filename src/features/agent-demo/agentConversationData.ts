import { agentReference, agentRelatedObject } from "../../data/mockKnowledgeRegistry/agentAdapters";
import {
  bottleneckDataPlanViewIndexes,
  bottleneckHypothesisViewIndexes,
  bottleneckShiftViewIndexes,
  engineeringEvidenceViewIndexes,
  engineeringFailureViewIndexes,
  engineeringProgramChangeViewIndexes,
  qualityImpactViewIndexes,
  qualityProgramFollowUpViewIndexes,
  qualityValidationViewIndexes,
} from "../../data/mockKnowledgeRegistry/crossViewIndex";
import { knowledgeIds as id } from "../../data/mockKnowledgeRegistry/ids";
import type {
  AgentConversationTurn,
  AgentFinalAnswer,
  AgentReasoningStep,
  AgentReference,
  AgentRelatedObject,
  AgentResponseMessage,
  AgentSharedContext,
  AgentViewIndex,
} from "./agentDemoTypes";
import { getSuggestedQuestionAliases } from "./agentSuggestedQuestions";

export type ScriptedTurnTemplate = {
  id: string;
  question: string;
  matchTerms: string[];
  intent: string;
  detectedTerms: string[];
  trace: AgentReasoningStep[];
  response: Omit<AgentResponseMessage, "id">;
  references: AgentReference[];
  relatedObjects: AgentRelatedObject[];
  viewIndexes: AgentViewIndex[];
  contextUpdate: {
    activeTopic?: string;
    activeOperationId?: string;
    activeMachineId?: string;
    activeQualityCharacteristicId?: string;
    activeProgramId?: string;
    candidateBottleneckId?: string;
    relatedMetricIds?: string[];
    resolvedObjectIds: string[];
    referenceIds: string[];
    assumptions: string[];
  };
};

type TurnDefinition = {
  id: string;
  question: string;
  matchTerms: string[];
  intent: string;
  detectedTerms: string[];
  contextOutput: string[];
  semanticOutput: string[];
  ontologyOutput: string[];
  knowledgeOutput: string[];
  evidenceOutput: string[];
  summary: string;
  findings: string[];
  actions: string[];
  risks?: string[];
  assumptions?: string[];
  confidence?: AgentResponseMessage["confidence"];
  citations: AgentFinalAnswer["citations"];
  objectIds: string[];
  relationIds: string[];
  referenceIds: string[];
  viewIndexes: AgentViewIndex[];
  contextUpdate: ScriptedTurnTemplate["contextUpdate"];
};

const qualityTurn1 = scriptedTurn({
  id: "quality-impact",
  question: "OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险、工程文件和价值流指标？",
  matchTerms: ["op30", "leak rate", "异常", "质量风险", "价值流"],
  intent: "Cross-domain quality impact analysis",
  detectedTerms: ["OP30", "Leak Rate", "abnormal", "product", "equipment", "quality risk", "value stream"],
  contextOutput: ["No previous context. Start from the user prompt and scenario seed."],
  semanticOutput: ["OP30 → Operation.OP30 Leak Test", "Leak Rate → QualityCharacteristic.LeakRate", "abnormal → Quality Issue / Deviation", "value stream metric → Waiting Time / Rework Load / Bottleneck Risk"],
  ontologyOutput: ["Operation controls Quality Characteristic", "Operation performedOn Machine", "Operation usesProgram Program", "Operation describedBy SOP", "Quality Characteristic governedBy Control Plan", "Quality Characteristic riskAnalyzedBy PFMEA", "Quality Issue affects Value Stream Metric"],
  knowledgeOutput: ["Brake Booster Assembly route: OP20 → OP30 → OP40", "OP30 uses M220, FX-002 and LeakTestProgram V3.4", "Leak Rate / CTQ Leak Rate is controlled through 100% Leak Test", "Control Plan, PFMEA and SOP are the governed documents", "Waiting Time before OP40, Rework / Retest Load and Temporary Quality Bottleneck Risk are exposed"],
  evidenceOutput: ["Control Plan confirms 100% Leak Rate inspection", "PFMEA links abnormal results to Sealing Leak Failure Mode", "SOP confirms M220 / FX-002 setup", "Routing Sheet confirms route position", "Value Stream Map supports waiting and retest impact"],
  summary: "该问题被识别为跨域质量异常追溯。OP30 的 Leak Rate 异常关联 Brake Booster Assembly 路线、M220、CTQ 与质量文件，并可能增加 OP40 前等待、返工复测负荷和临时质量瓶颈风险。",
  findings: ["Production: OP30 位于 OP20 与 OP40 之间并影响 Brake Booster Assembly 路线。", "Quality: Leak Rate / CTQ Leak Rate 由 100% Leak Test、Control Plan 与 PFMEA 控制。", "Engineering: M220、FX-002、LeakTestProgram V3.4 与 SOP 构成测试资源。", "Value Stream: 异常可能增加复测负荷和 OP40 前等待。"],
  actions: ["检查 OP30 最近 Leak Rate 分布。", "确认 M220 校准、FX-002 状态与程序版本。", "复核 Control Plan 与 PFMEA 检测控制。", "监控 OP40 waiting time 与 retest queue。"],
  risks: ["异常持续时可能形成 Temporary Quality Bottleneck Risk。"],
  assumptions: ["当前发布的 OP30 控制文件仍然有效。"],
  citations: [
    { claim: "OP30 controls Leak Rate through governed quality controls.", referenceIds: [id.evidence.ontologyQuality, id.document.controlPlan, id.document.pfmea] },
    { claim: "M220, FX-002 and V3.4 are the current OP30 engineering resources.", referenceIds: [id.document.routingSheet, id.document.sopOp30] },
    { claim: "Leak abnormalities can increase waiting and retest load.", referenceIds: [id.evidence.qmsLeakDistribution, id.document.valueStreamMap] },
  ],
  objectIds: [id.product.brakeBooster, id.operation.op20, id.operation.op30, id.operation.op40, id.machine.m220, id.fixture.fx002, id.program.leakTestV34, id.quality.leakRate, id.quality.ctqLeakRate, id.quality.sealingLeak, id.quality.automaticLeakTest, id.document.controlPlan, id.document.pfmea, id.document.sopOp30, id.valueStream.waitingBeforeOp40, id.valueStream.reworkRetestLoad, id.valueStream.qualityBottleneckRisk, id.semantic.leakRate, id.semantic.ctq],
  relationIds: [id.ontology.controls, id.ontology.performedOn, id.ontology.usesProgram, id.ontology.describedBy, id.ontology.governedBy, id.ontology.riskAnalyzedBy, id.ontology.contributesTo, id.ontology.affects],
  referenceIds: [id.evidence.semanticLeakRate, id.evidence.ontologyQuality, id.document.routingSheet, id.document.controlPlan, id.document.pfmea, id.document.sopOp30, id.evidence.qmsLeakDistribution, id.document.valueStreamMap],
  viewIndexes: qualityImpactViewIndexes,
  contextUpdate: contextUpdate("Leak Rate abnormality trace", [id.operation.op30, id.machine.m220, id.quality.leakRate, id.product.brakeBooster], [id.document.routingSheet, id.document.controlPlan, id.document.pfmea, id.document.sopOp30], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate }),
});

const qualityTurn2 = scriptedTurn({
  id: "quality-program-follow-up",
  question: "如果问题来自 M220 的测试程序版本变更，它会通过哪些知识关系影响 Leak Rate 和后续质量判断？",
  matchTerms: ["m220", "程序", "版本", "知识关系", "质量判断"],
  intent: "Program-version quality impact follow-up",
  detectedTerms: ["M220", "program version", "Leak Rate", "quality judgement"],
  contextOutput: ["Previous context used: OP30 Leak Test, M220 Leak Test Bench, Leak Rate abnormality."],
  semanticOutput: ["program version change → Engineering Change", "V3.4 / V3.5 → Program Version", "quality judgement → CTQ release criteria", "validation → controlled evidence requirement"],
  ontologyOutput: ["OP30 usesProgram LeakTestProgram", "Engineering Change affects OP30", "Program requiresValidation Validation Record", "OP30 controls Leak Rate", "Leak Rate governedBy Control Plan", "Leak Rate riskAnalyzedBy PFMEA"],
  knowledgeOutput: ["Current program: LeakTestProgram V3.4", "Proposed program: LeakTestProgram V3.5", "Change record: Engineering Change Request M220 Program", "Release evidence: Validation Record M220 Program V3.5", "Quality decision remains governed by Control Plan and PFMEA"],
  evidenceOutput: ["ECR defines V3.4 → V3.5 scope", "V3.5 validation record is required before release", "Control Plan threshold cannot be changed by program alone", "PFMEA detection assumptions require review", "QMS distribution supports before/after comparison"],
  summary: "M220 程序版本变更会通过 usesProgram、affects、requiresValidation、controls、governedBy 和 riskAnalyzedBy 关系影响测试逻辑、CTQ 判定、质量风险控制及复测负荷。",
  findings: ["Engineering: V3.5 是 proposed version，必须绑定 ECR 和 Validation Record。", "Quality: Leak Rate 判定仍需与 Control Plan 和 PFMEA 一致。", "Production: false reject 增加时 OP30 output 可能下降。", "Value Stream: retest 增加会推高 OP40 前等待。"],
  actions: ["比较 V3.4 与 V3.5 的逻辑、参数和 checksum。", "确认 V3.5 validation result。", "检查 Control Plan threshold 对齐。", "比较变更前后 Leak Rate 分布。"],
  risks: ["未经批准的逻辑变化可能造成 false accept 或 false reject。"],
  assumptions: ["V3.5 尚未获得正式放行。"],
  citations: [
    { claim: "V3.5 affects OP30 and requires controlled validation.", referenceIds: [id.document.engineeringChangeM220, id.document.validationRecordV35, id.evidence.ontologyProgram] },
    { claim: "Leak Rate release criteria remain governed by quality documents.", referenceIds: [id.document.controlPlan, id.document.pfmea] },
    { claim: "Retest growth can increase OP40 waiting.", referenceIds: [id.evidence.qmsLeakDistribution, id.document.valueStreamMap] },
  ],
  objectIds: [id.operation.op30, id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.quality.leakRate, id.quality.ctqLeakRate, id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.controlPlan, id.document.pfmea, id.valueStream.waitingBeforeOp40, id.valueStream.reworkRetestLoad, id.valueStream.qualityBottleneckRisk, id.semantic.engineeringChange, id.semantic.programVersion, id.semantic.validation],
  relationIds: [id.ontology.usesProgram, id.ontology.affects, id.ontology.requiresValidation, id.ontology.controls, id.ontology.governedBy, id.ontology.riskAnalyzedBy],
  referenceIds: [id.evidence.semanticEngineeringChange, id.evidence.ontologyProgram, id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.controlPlan, id.document.pfmea, id.evidence.qmsLeakDistribution, id.document.valueStreamMap],
  viewIndexes: qualityProgramFollowUpViewIndexes,
  contextUpdate: contextUpdate("M220 program change impact on Leak Rate", [id.operation.op30, id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.quality.leakRate], [id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.controlPlan, id.document.pfmea], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, program: id.program.leakTestV35 }),
});

const qualityTurn3 = scriptedTurn({
  id: "quality-validation-plan",
  question: "基于前两轮分析，下一步我应该优先安排哪些验证动作？",
  matchTerms: ["下一步", "优先", "验证动作", "前两轮"],
  intent: "Prioritized validation action plan",
  detectedTerms: ["priority", "validation", "actions", "previous context"],
  contextOutput: ["Previous context used: OP30 / M220 / Leak Rate issue and V3.4 → V3.5 change hypothesis."],
  semanticOutput: ["验证动作 → controlled validation plan", "优先 → risk-based sequence", "放行 → approved evidence gate"],
  ontologyOutput: ["Program requiresValidation Validation Record", "Operation performedOn Machine", "Operation controls Quality Characteristic", "Quality Characteristic governedBy Control Plan and riskAnalyzedBy PFMEA"],
  knowledgeOutput: ["Validation scope: M220, FX-002, V3.4/V3.5, OP30 and Leak Rate", "Data scope: OP30 history and QMS distribution", "Flow scope: OP30 output, retest queue and OP40 waiting"],
  evidenceOutput: ["ECR and Validation Record define change-control gate", "SOP defines setup and golden/reject part checks", "MES/QMS data support distribution comparison", "Control Plan and PFMEA gate quality approval"],
  summary: "建议按风险顺序安排程序身份、设备状态、Leak Rate 数据、质量文件和受控试运行五类验证，并为每项动作保留责任人与证据记录。",
  findings: ["Production: 确认 OP30 output / cycle time 与 OP40 waiting 是否变化。", "Quality: 对比 Leak Rate baseline 并复核 Control Plan / PFMEA。", "Engineering: 验证 M220 calibration、FX-002、V3.4/V3.5。", "Value Stream: 监控 retest queue 与 OP40 前 WIP。"],
  actions: ["冻结当前 M220 program version。", "拉取变更前后 OP30 Leak Rate records。", "验证 M220 calibration 与 fixture condition。", "复核 Control Plan 与 PFMEA。", "执行 controlled trial 并附加 Validation Record M220 Program V3.5。"],
  risks: ["在程序身份与设备状态未确认前试运行会削弱验证可信度。"],
  assumptions: ["前两轮解析出的 OP30 / M220 / Leak Rate 上下文仍有效。"],
  citations: [
    { claim: "Program identity and equipment checks precede trial release.", referenceIds: [id.document.engineeringChangeM220, id.document.sopOp30, id.document.validationRecordV35] },
    { claim: "Distribution comparison requires MES and QMS records.", referenceIds: [id.evidence.mesOp30History, id.evidence.qmsLeakDistribution] },
    { claim: "Quality release requires Control Plan and PFMEA review.", referenceIds: [id.document.controlPlan, id.document.pfmea] },
  ],
  objectIds: [id.operation.op30, id.operation.op40, id.machine.m220, id.fixture.fx002, id.program.leakTestV34, id.program.leakTestV35, id.quality.leakRate, id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30, id.document.controlPlan, id.document.pfmea, id.valueStream.waitingBeforeOp40, id.valueStream.reworkRetestLoad],
  relationIds: [id.ontology.requiresValidation, id.ontology.performedOn, id.ontology.controls, id.ontology.governedBy, id.ontology.riskAnalyzedBy],
  referenceIds: [id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30, id.evidence.mesOp30History, id.evidence.qmsLeakDistribution, id.document.controlPlan, id.document.pfmea],
  viewIndexes: qualityValidationViewIndexes,
  contextUpdate: contextUpdate("Prioritized OP30 validation plan", [id.operation.op30, id.machine.m220, id.program.leakTestV35, id.quality.leakRate], [id.document.validationRecordV35, id.document.sopOp30, id.document.controlPlan, id.document.pfmea], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, program: id.program.leakTestV35 }),
});

const engineeringTurn1 = scriptedTurn({
  id: "engineering-program-impact",
  question: "如果 M220 Leak Test Bench 的测试程序从 V3.4 升级到 V3.5，会影响哪些工序、质量特性、文件和放行条件？",
  matchTerms: ["m220", "v3.4", "v3.5", "升级", "放行条件", "program change"],
  intent: "Engineering program change impact",
  detectedTerms: ["M220", "V3.4", "V3.5", "upgrade", "release criteria"],
  contextOutput: ["No previous context. Start from the user prompt and engineering-change scenario seed."],
  semanticOutput: ["M220 → Machine", "V3.4 / V3.5 → Program Version", "升级 → Engineering Change", "放行条件 → Validation Requirement"],
  ontologyOutput: ["Operation performedOn Machine", "Operation usesProgram Program", "Engineering Change affects Operation", "Program requiresValidation Validation Record", "Operation controls Quality Characteristic", "Operation describedBy SOP"],
  knowledgeOutput: ["Direct operation: OP30 Leak Test", "Current/proposed programs: V3.4 / V3.5", "Controlled characteristic: Leak Rate / CTQ Leak Rate", "Documents: ECR, Validation Record, SOP, Control Plan and PFMEA"],
  evidenceOutput: ["ECR defines affected deployment scope", "Validation Record defines release tests", "SOP confirms setup", "Control Plan and PFMEA confirm unchanged quality obligations", "Routing Sheet confirms OP30 route impact"],
  summary: "M220 从 V3.4 升级到 V3.5 会直接影响 OP30，并通过 controls 关系影响 Leak Rate / CTQ Leak Rate。放行前需要 ECR、V3.5 验证记录、SOP、Control Plan 与 PFMEA 一致。",
  findings: ["Engineering: V3.5 需要 ECR 与 approved validation record。", "Quality: CTQ Leak Rate 判定不能随程序单独改变。", "Production: OP30 是直接受影响工序。", "Value Stream: false reject 或 retest 增加会影响 OP40 前等待。"],
  actions: ["比较 V3.4 / V3.5 logic and parameters。", "执行 validation run 并形成 V3.5 record。", "核对 SOP setup。", "确认 Control Plan 与 PFMEA 仍适用。", "试运行期间监控 OP30 output 与 OP40 waiting。"],
  risks: ["程序不稳定可能降低 OP30 throughput 或造成错误放行。"],
  assumptions: ["V3.5 当前为 proposed version。"],
  citations: [
    { claim: "The V3.5 change directly affects OP30 and requires validation.", referenceIds: [id.document.engineeringChangeM220, id.document.validationRecordV35, id.evidence.ontologyProgram] },
    { claim: "Leak Rate remains governed by released quality evidence.", referenceIds: [id.document.controlPlan, id.document.pfmea] },
    { claim: "OP30 route and setup dependencies remain traceable.", referenceIds: [id.document.routingSheet, id.document.sopOp30] },
  ],
  objectIds: [id.machine.m220, id.operation.op30, id.program.leakTestV34, id.program.leakTestV35, id.quality.leakRate, id.quality.ctqLeakRate, id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30, id.document.controlPlan, id.document.pfmea, id.valueStream.waitingBeforeOp40, id.semantic.engineeringChange, id.semantic.programVersion, id.semantic.validation],
  relationIds: [id.ontology.performedOn, id.ontology.usesProgram, id.ontology.affects, id.ontology.requiresValidation, id.ontology.controls, id.ontology.describedBy, id.ontology.governedBy, id.ontology.riskAnalyzedBy],
  referenceIds: [id.evidence.semanticEngineeringChange, id.evidence.ontologyProgram, id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.routingSheet, id.document.sopOp30, id.document.controlPlan, id.document.pfmea, id.document.valueStreamMap],
  viewIndexes: engineeringProgramChangeViewIndexes,
  contextUpdate: contextUpdate("M220 program version change", [id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.operation.op30, id.quality.leakRate], [id.document.engineeringChangeM220, id.document.validationRecordV35], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, program: id.program.leakTestV35 }),
});

const engineeringTurn2 = scriptedTurn({
  id: "engineering-required-evidence",
  question: "这个工程变更需要哪些质量文件和验证记录支撑？",
  matchTerms: ["工程变更", "质量文件", "验证记录", "evidence"],
  intent: "Engineering change evidence package",
  detectedTerms: ["engineering change", "quality documents", "validation record"],
  contextOutput: ["Previous context used: M220, LeakTestProgram V3.4 → V3.5, OP30 and Leak Rate."],
  semanticOutput: ["质量文件 → Control Plan / PFMEA", "验证记录 → Validation Record", "变更记录 → Engineering Change Request", "程序对比 → Program Version evidence"],
  ontologyOutput: ["Engineering Change affects OP30", "Program requiresValidation Validation Record", "OP30 describedBy SOP", "Leak Rate governedBy Control Plan and riskAnalyzedBy PFMEA"],
  knowledgeOutput: ["Engineering evidence: ECR, V3.4/V3.5 comparison, Validation Record", "Quality evidence: Control Plan, PFMEA, CTQ approval", "Production evidence: OP30 trial output and reject rate", "Document evidence: SOP setup confirmation"],
  evidenceOutput: ["ECR scopes the change", "Validation Record stores acceptance results", "SOP controls deployment setup", "Control Plan and PFMEA confirm detection controls", "MES trial history preserves genealogy"],
  summary: "该工程变更至少需要程序变更记录、V3.5 验证记录、SOP 一致性确认以及 Control Plan / PFMEA 复核；CTQ Leak Rate 的放行标准必须保持受控。",
  findings: ["Engineering evidence: ECR、program comparison、Validation Record。", "Quality evidence: Control Plan、PFMEA、CTQ approval。", "Production evidence: OP30 trial output / reject rate。", "Document evidence: SOP setup confirmation。"],
  actions: ["建立 V3.4 vs V3.5 comparison record。", "完成 golden/reject part 与 repeatability validation。", "记录 OP30 trial genealogy。", "取得 Engineering 与 Quality 联合批准。"],
  risks: ["证据包不完整时不能将 V3.5 标记为 released。"],
  assumptions: ["变更范围仅覆盖 M220 当前 OP30 deployment。"],
  citations: [
    { claim: "ECR and validation evidence are mandatory for release.", referenceIds: [id.document.engineeringChangeM220, id.document.validationRecordV35] },
    { claim: "Quality controls require Control Plan and PFMEA review.", referenceIds: [id.document.controlPlan, id.document.pfmea] },
    { claim: "Trial execution must follow SOP and preserve MES genealogy.", referenceIds: [id.document.sopOp30, id.evidence.mesOp30History] },
  ],
  objectIds: [id.machine.m220, id.operation.op30, id.program.leakTestV34, id.program.leakTestV35, id.quality.leakRate, id.quality.ctqLeakRate, id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30, id.document.controlPlan, id.document.pfmea],
  relationIds: [id.ontology.affects, id.ontology.requiresValidation, id.ontology.describedBy, id.ontology.governedBy, id.ontology.riskAnalyzedBy],
  referenceIds: [id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30, id.document.controlPlan, id.document.pfmea, id.evidence.mesOp30History],
  viewIndexes: engineeringEvidenceViewIndexes,
  contextUpdate: contextUpdate("M220 V3.5 evidence package", [id.machine.m220, id.program.leakTestV35, id.operation.op30, id.quality.leakRate], [id.document.engineeringChangeM220, id.document.validationRecordV35, id.document.sopOp30, id.document.controlPlan, id.document.pfmea], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, program: id.program.leakTestV35 }),
});

const engineeringTurn3 = scriptedTurn({
  id: "engineering-failed-validation",
  question: "如果验证失败，应该如何评估对生产和价值流的影响？",
  matchTerms: ["验证失败", "生产", "价值流", "rollback", "failed validation"],
  intent: "Failed validation production and value-stream impact",
  detectedTerms: ["validation failed", "production impact", "value stream impact"],
  contextOutput: ["Previous context used: V3.5 change scope, required evidence and active OP30 / Leak Rate dependencies."],
  semanticOutput: ["验证失败 → release blocked", "生产影响 → throughput / output", "价值流影响 → WIP / waiting / rework"],
  ontologyOutput: ["Failed Validation affects Program release", "Engineering Change affects OP30", "OP30 contributesTo Waiting Time", "Leak Rate abnormality affects Rework / Retest Load"],
  knowledgeOutput: ["V3.5 release must stop", "Validated fallback is V3.4", "Suspect V3.5-tested product requires containment", "OP30 output and OP40 waiting require monitoring", "Retest load can create temporary quality bottleneck"],
  evidenceOutput: ["V3.5 validation record captures failure", "ECR controls rollback", "MES identifies affected genealogy", "Control Plan defines containment", "VSM supports flow impact"],
  summary: "验证失败时应立即阻止 V3.5 放行，受控回退 V3.4，并从 OP30 产出、Leak Rate 判定、返工复测负荷和 OP40 前等待评估影响。",
  findings: ["Production: OP30 可能不稳定或不可用。", "Quality: V3.5 测试产品需要 containment review。", "Engineering: V3.5 不得 released，rollback 必须受控。", "Value Stream: retest 与 waiting 可能增加并形成临时瓶颈。"],
  actions: ["停止 V3.5 release。", "按受控流程回退 V3.4。", "识别所有 V3.5 测试零件。", "启动 containment / retest。", "记录 validation failure 并复核 PFMEA。"],
  risks: ["未识别的 V3.5 genealogy 可能导致错误质量放行。"],
  assumptions: ["V3.4 仍为已验证可用版本。"],
  citations: [
    { claim: "Failed validation blocks V3.5 and requires controlled rollback.", referenceIds: [id.document.validationRecordV35, id.document.engineeringChangeM220] },
    { claim: "Affected product must be identified through MES genealogy.", referenceIds: [id.evidence.mesOp30History, id.document.routingSheet] },
    { claim: "Retest and waiting impacts require containment and flow monitoring.", referenceIds: [id.document.controlPlan, id.evidence.qmsLeakDistribution, id.document.valueStreamMap] },
  ],
  objectIds: [id.program.leakTestV34, id.program.leakTestV35, id.machine.m220, id.operation.op30, id.operation.op40, id.quality.leakRate, id.document.validationRecordV35, id.document.engineeringChangeM220, id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40, id.valueStream.qualityBottleneckRisk],
  relationIds: [id.ontology.requiresValidation, id.ontology.affects, id.ontology.contributesTo],
  referenceIds: [id.document.validationRecordV35, id.document.engineeringChangeM220, id.evidence.mesOp30History, id.document.routingSheet, id.document.controlPlan, id.evidence.qmsLeakDistribution, id.document.valueStreamMap],
  viewIndexes: engineeringFailureViewIndexes,
  contextUpdate: contextUpdate("V3.5 failed validation impact", [id.program.leakTestV34, id.program.leakTestV35, id.machine.m220, id.operation.op30, id.quality.leakRate], [id.document.validationRecordV35, id.document.engineeringChangeM220], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, program: id.program.leakTestV34 }),
});

const bottleneckTurn1 = scriptedTurn({
  id: "bottleneck-op20-hypothesis",
  question: "为什么 OP20 可能是当前路线的瓶颈？请同时从 Production 和 Value Stream 两个视角解释。",
  matchTerms: ["op20", "瓶颈", "production", "value stream"],
  intent: "OP20 bottleneck hypothesis",
  detectedTerms: ["OP20", "bottleneck", "Production", "Value Stream"],
  contextOutput: ["No previous context. Start from the user prompt and bottleneck scenario seed."],
  semanticOutput: ["OP20 → Operation.OP20 Diaphragm Assembly", "瓶颈 → Bottleneck / Capacity Constraint", "Production → Cycle Time / Output", "Value Stream → WIP / Waiting Time"],
  ontologyOutput: ["Operation nextOperation Operation", "Operation contributesTo Value Stream Metric", "WIP before Operation indicates Flow Constraint", "Bottleneck affects Throughput"],
  knowledgeOutput: ["Route context: OP10 → OP20 → OP30", "OP20 Cycle Time: 48s vs 45s takt", "WIP before OP20: 36 pcs", "Waiting Time before OP20: 18 min", "Standard Work and fixture reset are engineering checks"],
  evidenceOutput: ["Routing Sheet supports sequence and nominal timing", "MES sample supports OP20 timing variation", "Value Stream Map supports WIP and waiting", "Line Balance Study supports work-content losses", "Standard Work defines expected sequence"],
  summary: "OP20 可能是当前路线瓶颈，因为其 48s cycle time 高于 45s takt，同时 WIP before OP20 与 Waiting Time before OP20 增加；该判断仍需结合现场节拍与资源状态验证。",
  findings: ["Production: OP20 比相邻 OP10 / OP30 慢且超过 takt。", "Value Stream: OP20 前 WIP 与 waiting 较高。", "Engineering: manual assembly、fixture reset 与 operator availability 需检查。", "Quality: OP20 装配波动可能传播到 OP30 Leak Rate。"],
  actions: ["比较 OP10 / OP20 / OP30 actual cycle time。", "检查 WIP before OP20 与 waiting。", "复核 Standard Work OP20。", "确认 fixture / operator availability。", "检查 OP20 defect 与 OP30 Leak Rate 的相关性。"],
  risks: ["只看 cycle time 可能把临时波动误判为持续瓶颈。"],
  assumptions: ["当前 takt 为 45s，scripted sample 代表常规产品组合。"],
  citations: [
    { claim: "OP20 exceeds takt and adjacent operation cycle times.", referenceIds: [id.document.routingSheet, id.evidence.mesShift, id.document.lineBalanceStudy] },
    { claim: "WIP and waiting accumulate before OP20.", referenceIds: [id.document.valueStreamMap] },
    { claim: "Standard work and fixture reset are candidate loss drivers.", referenceIds: [id.document.standardWorkOp20, id.document.lineBalanceStudy] },
  ],
  objectIds: [id.operation.op10, id.operation.op20, id.operation.op30, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.lineBottleneckRisk, id.document.standardWorkOp20, id.document.lineBalanceStudy, id.document.valueStreamMap, id.semantic.bottleneck, id.semantic.cycleTime, id.semantic.wip, id.semantic.mesOperationCycleTime, id.semantic.mesWipQuantity, id.semantic.ieLineBalanceResult],
  relationIds: [id.ontology.nextOperation, id.ontology.contributesTo, id.ontology.affects],
  referenceIds: [id.evidence.semanticBottleneck, id.evidence.ontologyValueStream, id.document.routingSheet, id.evidence.mesShift, id.document.valueStreamMap, id.document.lineBalanceStudy, id.document.standardWorkOp20, id.document.pfmea],
  viewIndexes: bottleneckHypothesisViewIndexes,
  contextUpdate: contextUpdate("Bottleneck analysis", [id.operation.op20, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.lineBottleneckRisk], [id.document.valueStreamMap, id.document.lineBalanceStudy, id.document.standardWorkOp20], { operation: id.operation.op20, bottleneck: id.operation.op20, metrics: [id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20] }),
});

const bottleneckTurn2 = scriptedTurn({
  id: "bottleneck-quality-shift",
  question: "如果 OP30 的 Leak Rate 异常导致返工复测增加，瓶颈会不会从 OP20 转移到 OP30？",
  matchTerms: ["op30", "leak rate", "返工", "复测", "转移"],
  intent: "Bottleneck shift due to quality issue",
  detectedTerms: ["OP30", "Leak Rate", "rework", "retest", "bottleneck shift"],
  contextOutput: ["Previous context used: OP20 bottleneck hypothesis, OP20 → OP30 → OP40 route and WIP/waiting metrics."],
  semanticOutput: ["返工复测 → Rework / Retest Load", "瓶颈转移 → Dynamic Capacity Constraint", "质量异常 → Leak Rate deviation"],
  ontologyOutput: ["Leak Rate abnormality affects Rework / Retest Load", "Rework Load contributesTo Temporary Quality Bottleneck Risk", "OP30 contributesTo Waiting Time before OP40"],
  knowledgeOutput: ["OP30 is downstream of OP20", "Retest loops lower OP30 effective capacity", "Rework / Retest Load raises Waiting Time before OP40", "M220 program, calibration and fixture can cause false rejects"],
  evidenceOutput: ["QMS distribution supports reject/retest comparison", "VSM supports waiting and queue changes", "Control Plan supports containment", "SOP supports M220 stability checks"],
  summary: "瓶颈可能从 OP20 转移或扩展到 OP30。Leak Rate 异常增加复测循环后，OP30 有效产能下降，Rework / Retest Load 与 Waiting Time before OP40 上升，从而形成临时质量瓶颈。",
  findings: ["Production: OP30 output 会因 retest loop 下降。", "Quality: CTQ Leak Rate 仍需受控后才能放行。", "Value Stream: retest load 与 OP40 waiting 上升。", "Engineering: M220 setup/program/fixture 需排除 false reject。"],
  actions: ["比较 OP20 WIP 与 OP30 retest queue。", "计算包含 retest loop 的 OP30 effective capacity。", "检查 OP40 waiting trend。", "确认 OP30 first-pass fail rate。", "复核 M220 test stability。"],
  risks: ["OP20 持续约束与 OP30 临时质量瓶颈可能同时存在。"],
  assumptions: ["Leak Rate fail/retest signal已高于正常 baseline。"],
  citations: [
    { claim: "Leak abnormalities increase retest workload.", referenceIds: [id.evidence.qmsLeakDistribution, id.document.controlPlan] },
    { claim: "Retest load can increase OP40 waiting and temporary bottleneck risk.", referenceIds: [id.document.valueStreamMap] },
    { claim: "M220 setup and V3.4 checks are governed by SOP.", referenceIds: [id.document.sopOp30] },
  ],
  objectIds: [id.operation.op20, id.operation.op30, id.operation.op40, id.quality.leakRate, id.quality.ctqLeakRate, id.machine.m220, id.program.leakTestV34, id.fixture.fx002, id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40, id.valueStream.qualityBottleneckRisk, id.valueStream.wipBeforeOp20],
  relationIds: [id.ontology.affects, id.ontology.contributesTo, id.ontology.nextOperation],
  referenceIds: [id.evidence.qmsLeakDistribution, id.document.controlPlan, id.document.valueStreamMap, id.document.sopOp30, id.document.routingSheet],
  viewIndexes: bottleneckShiftViewIndexes,
  contextUpdate: contextUpdate("Possible OP20 to OP30 bottleneck shift", [id.operation.op20, id.operation.op30, id.quality.leakRate, id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40], [id.evidence.qmsLeakDistribution, id.document.valueStreamMap], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, bottleneck: id.operation.op30, metrics: [id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40] }),
});

const bottleneckTurn3 = scriptedTurn({
  id: "bottleneck-data-plan",
  question: "我应该优先收集哪些数据来确认真实瓶颈？",
  matchTerms: ["收集", "数据", "确认", "真实瓶颈", "data"],
  intent: "Bottleneck verification data plan",
  detectedTerms: ["priority data", "verify", "real bottleneck"],
  contextOutput: ["Previous context used: OP20 constraint hypothesis and possible OP30 quality-bottleneck shift."],
  semanticOutput: ["真实瓶颈 → sustained capacity constraint", "数据 → cycle time / output / WIP / waiting / quality / resource status"],
  ontologyOutput: ["Operation contributesTo Value Stream Metric", "Quality Issue affects Rework Load", "Machine and Program affect Operation capacity", "WIP Buffer indicates flow state"],
  knowledgeOutput: ["Production: actual cycle time, output/hour, downtime and resource availability", "Value Stream: WIP and waiting before OP20/OP40", "Quality: Leak Rate fail, retest, rework and containment", "Engineering: M220 version/calibration and OP20 standard-work adherence"],
  evidenceOutput: ["MES shift sample supplies cycle time", "VSM supplies WIP and waiting", "QMS supplies fail/retest distribution", "Line Balance Study and Standard Work explain OP20 loss", "SOP supports M220 checks"],
  summary: "确认真实瓶颈需要联合收集生产节拍、WIP、等待时间、质量返工和资源状态数据；仅看 Cycle Time 不足以区分持续 OP20 约束与临时 OP30 质量瓶颈。",
  findings: ["Production data: actual cycle time、output/hour、downtime。", "Value Stream data: WIP 与 waiting by buffer。", "Quality data: first-pass fail、retest、rework、containment。", "Engineering data: M220 version/calibration 与 OP20 standard work。"],
  actions: ["建立 OP10 / OP20 / OP30 / OP40 短期 bottleneck dashboard。", "按 buffer 跟踪 WIP 与 waiting。", "区分 first-pass output 与 retest output。", "比较 OP20 capacity loss 与 OP30 retest load。", "围堵后重新计算 bottleneck risk。"],
  risks: ["混合 first-pass 与 retest output 会高估 OP30 实际产能。"],
  assumptions: ["所有数据按同一时间窗口和产品组合对齐。"],
  citations: [
    { claim: "Cycle time and output evidence come from MES and routing sources.", referenceIds: [id.evidence.mesShift, id.document.routingSheet] },
    { claim: "WIP and waiting require value-stream evidence.", referenceIds: [id.document.valueStreamMap, id.document.lineBalanceStudy] },
    { claim: "Retest and quality-load evidence comes from QMS controls.", referenceIds: [id.evidence.qmsLeakDistribution, id.document.controlPlan] },
    { claim: "Resource-state checks use Standard Work and SOP.", referenceIds: [id.document.standardWorkOp20, id.document.sopOp30] },
  ],
  objectIds: [id.operation.op10, id.operation.op20, id.operation.op30, id.operation.op40, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.reworkRetestLoad, id.valueStream.waitingBeforeOp40, id.valueStream.lineBottleneckRisk, id.quality.leakRate, id.machine.m220, id.program.leakTestV34, id.document.standardWorkOp20, id.semantic.mesOperationCycleTime, id.semantic.mesWipQuantity, id.semantic.ieLineBalanceResult],
  relationIds: [id.ontology.contributesTo, id.ontology.affects, id.ontology.nextOperation],
  referenceIds: [id.evidence.mesShift, id.document.routingSheet, id.document.valueStreamMap, id.document.lineBalanceStudy, id.evidence.qmsLeakDistribution, id.document.controlPlan, id.document.standardWorkOp20, id.document.sopOp30],
  viewIndexes: bottleneckDataPlanViewIndexes,
  contextUpdate: contextUpdate("Bottleneck verification data plan", [id.operation.op20, id.operation.op30, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.reworkRetestLoad], [id.evidence.mesShift, id.document.valueStreamMap, id.document.lineBalanceStudy, id.evidence.qmsLeakDistribution], { bottleneck: id.operation.op20, metrics: [id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.valueStream.reworkRetestLoad] }),
});

export const scriptedTurnsByScenario: Record<string, ScriptedTurnTemplate[]> = {
  "quality-issue-trace": [qualityTurn1, qualityTurn2, qualityTurn3],
  "engineering-change-impact": [engineeringTurn1, engineeringTurn2, engineeringTurn3],
  "bottleneck-analysis": [bottleneckTurn1, bottleneckTurn2, bottleneckTurn3],
};

export const fallbackClarificationTurn: ScriptedTurnTemplate = scriptedTurn({
  id: "clarification",
  question: "",
  matchTerms: [],
  intent: "Clarification required",
  detectedTerms: [],
  contextOutput: ["Use any governed context already present, but do not infer an unsupported subject."],
  semanticOutput: ["No manufacturing entity resolved with sufficient confidence."],
  ontologyOutput: ["Ontology traversal not started because the source entity is unresolved."],
  knowledgeOutput: ["No knowledge objects retrieved."],
  evidenceOutput: ["No unrelated evidence attached."],
  summary: "我需要更多上下文来完成可追溯分析。请提供 operation、machine、quality characteristic、document 或 value stream metric 之一。",
  findings: ["Semantic Layer could not confidently resolve the request."],
  actions: ["补充至少一个明确的制造对象或指标。"],
  assumptions: ["The agent does not infer unsupported manufacturing context."],
  confidence: "low",
  citations: [],
  objectIds: [],
  relationIds: [],
  referenceIds: [],
  viewIndexes: [],
  contextUpdate: { resolvedObjectIds: [], referenceIds: [], assumptions: [] },
});

export function selectScriptedTurnTemplate(scenarioId: string, userMessage: string, _previousTurns: AgentConversationTurn[], _sharedContext: AgentSharedContext) {
  const templates = scriptedTurnsByScenario[scenarioId] ?? [];
  const normalized = normalize(userMessage);
  const exact = templates.find((template) => getSuggestedQuestionAliases(scenarioId, template.question).some((alias) => normalize(alias) === normalized));
  if (exact) return exact;
  const scored = templates
    .map((template) => ({ template, score: template.matchTerms.filter((term) => normalized.includes(normalize(term))).length }))
    .sort((left, right) => right.score - left.score)[0];
  return scored?.score ? scored.template : fallbackClarificationTurn;
}

function scriptedTurn(definition: TurnDefinition): ScriptedTurnTemplate {
  const referenceIds = unique([...definition.referenceIds, ...definition.viewIndexes.flatMap((index) => index.referenceIds), ...definition.citations.flatMap((citation) => citation.referenceIds)]);
  const objectIds = unique([...definition.objectIds, ...definition.relationIds, ...definition.viewIndexes.flatMap((index) => index.objectIds)]);
  const crossViewOutput = definition.viewIndexes.map((index) => `${index.view}: ${index.findings[0]}`);
  const trace = [
    traceStep(`${definition.id}-context`, 1, "context", "Context Resolution", "Resolve the current prompt against prior governed session context.", ["Session context"], "Use prior entities only when they were resolved by an earlier completed turn.", definition.contextOutput, "contextResolver", objectIds, []),
    traceStep(`${definition.id}-semantic`, 2, "semantic", "Semantic Resolution", "Resolve business language to governed terms and system fields.", definition.detectedTerms, "Resolve terms through the Semantic Explorer catalog.", definition.semanticOutput, "semanticResolver", objectIds, referenceIds.filter((referenceId) => referenceId.startsWith("evidence.semantic"))),
    traceStep(`${definition.id}-ontology`, 3, "ontology", "Ontology Mapping", "Map the request to approved object and relationship types.", definition.semanticOutput, "Construct only governed ontology traversals.", definition.ontologyOutput, "ontologyMapper", definition.relationIds, referenceIds.filter((referenceId) => referenceId.startsWith("evidence.ontology"))),
    traceStep(`${definition.id}-knowledge`, 4, "knowledge", "Knowledge Retrieval", "Retrieve canonical manufacturing objects connected by the mapped relations.", definition.ontologyOutput, "Retrieve route, quality, engineering and value-stream instances.", definition.knowledgeOutput, "knowledgeRetriever", objectIds, referenceIds.filter((referenceId) => referenceId === id.document.routingSheet || referenceId.startsWith("evidence.mes") || referenceId.startsWith("evidence.qms"))),
    traceStep(`${definition.id}-cross-view`, 5, "crossView", "Cross-view Knowledge Indexing", "Index each finding to its source view, canonical objects and references.", definition.knowledgeOutput, "Build Production, Quality, Engineering and Value Stream indexes.", crossViewOutput, "crossViewIndexer", definition.viewIndexes.flatMap((index) => index.objectIds), definition.viewIndexes.flatMap((index) => index.referenceIds)),
    traceStep(`${definition.id}-evidence`, 6, "evidence", "Evidence Assembly", "Assemble governed evidence for each material claim.", crossViewOutput, "Collect released documents and source records without unsupported citations.", definition.evidenceOutput, "evidenceFinder", objectIds, referenceIds),
    traceStep(`${definition.id}-answer`, 7, "answer", "Response Generation", "Compose an evidence-backed response and recommended actions.", definition.evidenceOutput, "Generate a decision-ready answer with claim-level citations.", [definition.summary], "answerComposer", objectIds, referenceIds),
  ];
  return {
    id: definition.id,
    question: definition.question,
    matchTerms: definition.matchTerms,
    intent: definition.intent,
    detectedTerms: definition.detectedTerms,
    trace,
    response: { summary: definition.summary, findings: definition.findings, recommendedActions: definition.actions, risks: definition.risks, assumptions: definition.assumptions, citations: definition.citations, confidence: definition.confidence ?? "high" },
    references: referenceIds.map(agentReference),
    relatedObjects: objectIds.map(agentRelatedObject),
    viewIndexes: definition.viewIndexes,
    contextUpdate: definition.contextUpdate,
  };
}

function traceStep(stepId: string, order: number, layer: AgentReasoningStep["layer"], title: string, description: string, input: string[], action: string, output: string[], toolName: AgentReasoningStep["toolName"], referencedObjectIds: string[], referenceIds: string[]): AgentReasoningStep {
  return { id: stepId, order, layer, title, description, input, action, output, confidence: "approved", toolName, toolInput: { input, structuredTrace: true }, toolOutput: { outputCount: output.length, status: "approved" }, referencedObjectIds: unique(referencedObjectIds), referenceIds: unique(referenceIds), durationMs: 120 };
}

function contextUpdate(activeTopic: string, resolvedObjectIds: string[], referenceIds: string[], active: { operation?: string; machine?: string; quality?: string; program?: string; bottleneck?: string; metrics?: string[] }): ScriptedTurnTemplate["contextUpdate"] {
  return { activeTopic, activeOperationId: active.operation, activeMachineId: active.machine, activeQualityCharacteristicId: active.quality, activeProgramId: active.program, candidateBottleneckId: active.bottleneck, relatedMetricIds: active.metrics, resolvedObjectIds, referenceIds, assumptions: [] };
}

function unique(values: string[]) { return [...new Set(values)]; }
function normalize(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }
