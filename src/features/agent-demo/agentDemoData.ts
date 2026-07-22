import { canonicalKnowledgeBaselineByScenarioId } from "../../../packages/demo-data/src/index";
import { agentRelatedObject } from "../../data/mockKnowledgeRegistry/agentAdapters";
import { knowledgeIds as id } from "../../data/mockKnowledgeRegistry/ids";
import { agentSourceCatalog, agentToolCatalog } from "./agentUiCatalog";
import { scriptedTurnsByScenario } from "./agentConversationData";
import { agentSuggestedQuestionsByScenario } from "./agentSuggestedQuestions";
import type { AgentReferenceType, AgentScenario, AgentSharedContext, AgentSuggestedQuestion, AgentToolName } from "./agentDemoTypes";

export const agentToolDefinitions = agentToolCatalog;
export const agentKnowledgeSources = agentSourceCatalog;

const fullProcessTools: AgentToolName[] = ["contextResolver", "semanticResolver", "ontologyMapper", "knowledgeRetriever", "crossViewIndexer", "evidenceFinder", "answerComposer"];

const scenarioDefinitions: Array<{
  id: string;
  title: string;
  domain: AgentScenario["domain"];
  description: string;
  questions: AgentSuggestedQuestion[];
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
    questions: agentSuggestedQuestionsByScenario["quality-issue-trace"],
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
    questions: agentSuggestedQuestionsByScenario["engineering-change-impact"],
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
    questions: agentSuggestedQuestionsByScenario["bottleneck-analysis"],
    businessGoal: "Compare route capacity, WIP, waiting and quality-retest load to identify the active constraint.",
    expectedOutcome: "Bounded OP20 hypothesis, OP30 shift risk and verification data plan.",
    knowledgeSources: ["Value Stream Map", "Line Balance Study", "Route Graph", "MES Mock Data", "Standard Work", "QMS Mock Data"],
    initialContext: initialContext("Bottleneck analysis", [id.operation.op20, id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20, id.operation.op30], { operation: id.operation.op20, bottleneck: id.operation.op20, metrics: [id.valueStream.op20CycleTime, id.valueStream.wipBeforeOp20, id.valueStream.waitingBeforeOp20] }),
  },
];

export const agentDemoScenarios: AgentScenario[] = scenarioDefinitions.map((definition) => {
  const firstTurn = scriptedTurnsByScenario[definition.id]?.[0];
  if (!firstTurn) throw new Error(`Missing scripted turns for Agent scenario: ${definition.id}`);
  const baseline = canonicalKnowledgeBaselineByScenarioId.get(definition.id);
  const canonicalBaseline = baseline ? {
    baselineId: baseline.baselineId,
    request: baseline.request,
    queryPlan: baseline.queryPlan,
    graphQueryPlan: baseline.graphQueryPlan,
    evidencePack: baseline.evidencePack,
  } : undefined;
  return {
    id: definition.id,
    title: definition.title,
    sidebarLabel: definition.title,
    subtitle: definition.description,
    domain: definition.domain,
    userQuestion: definition.questions[0].zh,
    suggestedQuestions: definition.questions.map((question) => question.zh),
    suggestedQuestionOptions: definition.questions,
    exampleQuestions: definition.questions.slice(0, 3).map((question) => question.zh),
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
    canonicalBaseline,
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
