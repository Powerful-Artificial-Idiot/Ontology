import { agentRelatedObject } from "../../data/mockKnowledgeRegistry/agentAdapters";
import { knowledgeIds as id } from "../../data/mockKnowledgeRegistry/ids";
import { agentSourceCatalog, agentToolCatalog } from "./agentUiCatalog";
import { scriptedTurnsByScenario } from "./agentConversationData";
import type { AgentReferenceType, AgentScenario, AgentSharedContext, AgentToolName } from "./agentDemoTypes";

export const agentToolDefinitions = agentToolCatalog;
export const agentKnowledgeSources = agentSourceCatalog;

const fullProcessTools: AgentToolName[] = ["contextResolver", "semanticResolver", "ontologyMapper", "knowledgeRetriever", "crossViewIndexer", "evidenceFinder", "answerComposer"];

const scenarioDefinitions: Array<{
  id: string;
  title: string;
  domain: AgentScenario["domain"];
  description: string;
  questions: string[];
  businessGoal: string;
  expectedOutcome: string;
  knowledgeSources: AgentReferenceType[];
  initialContext: AgentSharedContext;
}> = [
  {
    id: "quality-issue-trace",
    title: "Quality Issue Trace",
    domain: "quality",
    description: "Trace a Leak Rate abnormality across production route, quality controls, engineering resources and value stream impact.",
    questions: [
      "OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险、工程文件和价值流指标？",
      "如果问题来自 M220 的测试程序版本变更，它会通过哪些知识关系影响 Leak Rate 和后续质量判断？",
      "基于前两轮分析，下一步我应该优先安排哪些验证动作？",
      "如果 Leak Rate 异常持续扩大，是否可能形成临时质量瓶颈？",
    ],
    businessGoal: "Trace an OP30 quality deviation across product, equipment, controls, evidence and flow impact.",
    expectedOutcome: "Cross-view quality impact and prioritized validation actions.",
    knowledgeSources: ["Semantic Catalog", "Ontology", "Route Graph", "Control Plan", "PFMEA", "SOP", "QMS Mock Data"],
    initialContext: initialContext("Leak Rate abnormality trace", [id.operation.op30, id.machine.m220, id.quality.leakRate], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate }),
  },
  {
    id: "engineering-change-impact",
    title: "Engineering Change Impact",
    domain: "engineering",
    description: "Analyze how a machine, program or engineering document change propagates through route, quality controls and value stream performance.",
    questions: [
      "如果 M220 Leak Test Bench 的测试程序从 V3.4 升级到 V3.5，会影响哪些工序、质量特性、文件和放行条件？",
      "这个工程变更需要哪些质量文件和验证记录支撑？",
      "如果验证失败，应该如何评估对生产和价值流的影响？",
      "哪些对象需要在 Route Explorer、Ontology Explorer 和 Semantic Explorer 中同步更新？",
    ],
    businessGoal: "Trace a controlled M220 program change to operations, quality criteria, documents and release gates.",
    expectedOutcome: "Governed V3.5 change scope, evidence package and rollback impact.",
    knowledgeSources: ["Engineering Change Request", "Validation Record", "SOP", "Control Plan", "PFMEA", "Route Graph", "MES Mock Data"],
    initialContext: initialContext("M220 program version change", [id.machine.m220, id.program.leakTestV34, id.program.leakTestV35, id.operation.op30, id.quality.leakRate], { operation: id.operation.op30, machine: id.machine.m220, quality: id.quality.leakRate, program: id.program.leakTestV35 }),
  },
  {
    id: "bottleneck-analysis",
    title: "Bottleneck Analysis",
    domain: "valueStream",
    description: "Analyze whether OP20 or OP30 is a bottleneck by combining production route, cycle time, WIP, waiting time and quality rework data.",
    questions: [
      "为什么 OP20 可能是当前路线的瓶颈？请同时从 Production 和 Value Stream 两个视角解释。",
      "如果 OP30 的 Leak Rate 异常导致返工复测增加，瓶颈会不会从 OP20 转移到 OP30？",
      "我应该优先收集哪些数据来确认真实瓶颈？",
      "如果瓶颈确认在 OP20，应该从哪些改善方向入手？",
    ],
    businessGoal: "Compare route capacity, WIP, waiting and quality-retest load to identify the active constraint.",
    expectedOutcome: "Bounded OP20 hypothesis, OP30 shift risk and verification data plan.",
    knowledgeSources: ["Value Stream Map", "Line Balance Study", "Route Graph", "MES Mock Data", "Standard Work", "QMS Mock Data"],
    initialContext: initialContext("Bottleneck analysis", [id.operation.op20, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.operation.op30], { operation: id.operation.op20, bottleneck: id.operation.op20, metrics: [id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20] }),
  },
];

export const agentDemoScenarios: AgentScenario[] = scenarioDefinitions.map((definition) => {
  const firstTurn = scriptedTurnsByScenario[definition.id]?.[0];
  if (!firstTurn) throw new Error(`Missing scripted turns for Agent scenario: ${definition.id}`);
  return {
    id: definition.id,
    title: definition.title,
    sidebarLabel: definition.title,
    subtitle: definition.description,
    domain: definition.domain,
    userQuestion: definition.questions[0],
    suggestedQuestions: definition.questions,
    exampleQuestions: definition.questions.slice(0, 3),
    businessGoal: definition.businessGoal,
    expectedOutcome: definition.expectedOutcome,
    steps: firstTurn.trace,
    finalAnswer: firstTurn.response,
    references: firstTurn.references,
    relatedObjects: firstTurn.relatedObjects,
    viewIndexes: firstTurn.viewIndexes,
    tools: fullProcessTools,
    knowledgeSources: definition.knowledgeSources,
    initialContext: definition.initialContext,
  };
});

function initialContext(activeTopic: string, objectIds: string[], active: { operation?: string; machine?: string; quality?: string; program?: string; bottleneck?: string; metrics?: string[] }): AgentSharedContext {
  return {
    activeTopic,
    activeOperationId: active.operation,
    activeMachineId: active.machine,
    activeQualityCharacteristicId: active.quality,
    activeProgramId: active.program,
    candidateBottleneckId: active.bottleneck,
    relatedMetricIds: active.metrics,
    resolvedEntities: objectIds.map(agentRelatedObject),
    accumulatedReferences: [],
    assumptions: [],
  };
}
