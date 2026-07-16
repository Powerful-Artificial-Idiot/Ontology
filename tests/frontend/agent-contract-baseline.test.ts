import { describe, expect, it } from "vitest";
import { AGENT_CONTRACT_VERSION } from "../../packages/knowledge-contracts/src/index";
import {
  leakRateQualityIssueTraceBaseline,
  leakRateQualityIssueTraceIds,
} from "../../packages/demo-data/src/index";
import { stackNodes } from "../../src/data/mockGraph";
import { knowledgeIds, resolveCanonicalKnowledgeId } from "../../src/data/mockKnowledgeRegistry/ids";
import { semanticMappings } from "../../src/data/mockKnowledgeRegistry/semanticMappings";
import { agentDemoScenarios } from "../../src/features/agent-demo/agentDemoData";
import { ScriptedAgentClient } from "../../src/features/agent-demo/scriptedAgentClient";
import type { AgentRunEvent } from "../../src/features/agent-demo/agentClient";
import { MockKnowledgeRepository } from "../../src/repositories/MockKnowledgeRepository";

describe("Phase 1 shared Agent contract and canonical knowledge baseline", () => {
  it("publishes the governed canonical IDs for the Leak Rate trace", () => {
    expect(leakRateQualityIssueTraceIds).toMatchObject({
      product: { brakeBooster: "product.brake-booster" },
      operation: { op30: "operation.op30" },
      machine: { m220: "machine.m220" },
      program: { leakTestV34: "program.leak-test.v3-4" },
      quality: {
        leakRate: "quality-characteristic.leak-rate",
        internalLeakage: "failure-mode.internal-leakage",
      },
      document: {
        controlPlan: "document.control-plan.cp-bb01.rev-a",
        pfmea: "document.pfmea.pf-bb01.rev-b",
        sopOp30: "document.sop.op30-leak-test",
      },
    });
    expect(knowledgeIds.operation.op30).toBe(leakRateQualityIssueTraceIds.operation.op30);
    expect(resolveCanonicalKnowledgeId("operation.op30-leak-test")).toBe(knowledgeIds.operation.op30);
    expect(resolveCanonicalKnowledgeId("quality.leak-rate")).toBe(knowledgeIds.quality.leakRate);
  });

  it("uses the same OP30 facts in the canonical baseline and Route Explorer", () => {
    const canonicalById = new Map(leakRateQualityIssueTraceBaseline.entities.map((entity) => [entity.id, entity]));
    const routeOp30 = stackNodes.find((node) => node.id === "OP30");
    const routeObjectById = new Map(routeOp30?.stackObjects.map((object) => [object.id, object]));

    [
      knowledgeIds.operation.op30,
      knowledgeIds.machine.m220,
      knowledgeIds.fixture.fx002,
      knowledgeIds.program.leakTestV34,
      knowledgeIds.quality.leakRate,
      knowledgeIds.quality.sealingLeak,
      knowledgeIds.document.controlPlan,
      knowledgeIds.document.pfmea,
      knowledgeIds.document.sopOp30,
    ].forEach((id) => {
      expect(routeObjectById.has(id), id).toBe(true);
      expect(routeObjectById.get(id)?.label).toBe(canonicalById.get(id)?.label);
      expect(routeObjectById.get(id)?.version).toBe(canonicalById.get(id)?.version);
    });
  });

  it("keeps Semantic Explorer and Agent Demo aligned to the canonical quality object", () => {
    expect(semanticMappings.some((mapping) => mapping.targetId === knowledgeIds.quality.leakRate)).toBe(true);
    const scenario = agentDemoScenarios.find((item) => item.id === "quality-issue-trace");
    expect(scenario?.canonicalBaseline?.baselineId).toBe(leakRateQualityIssueTraceBaseline.baselineId);
    expect(scenario?.canonicalBaseline?.request.contractVersion).toBe(AGENT_CONTRACT_VERSION);
    expect(scenario?.relatedObjects.some((object) => object.id === knowledgeIds.operation.op30)).toBe(true);
    expect(scenario?.relatedObjects.some((object) => object.id === knowledgeIds.machine.m220)).toBe(true);
    expect(scenario?.relatedObjects.some((object) => object.id === knowledgeIds.quality.leakRate)).toBe(true);
  });

  it("keeps Evidence Pack claims, citations, and entity references closed", () => {
    const baseline = leakRateQualityIssueTraceBaseline;
    const entityIds = new Set(baseline.entities.map((entity) => entity.id));
    const evidenceIds = new Set(baseline.evidencePack.items.map((item) => item.id));
    const claimIds = new Set(baseline.expectedResponse.answer.claims.map((claim) => claim.id));

    expect(baseline.expectedResponse.queryPlan).toEqual(baseline.queryPlan);
    expect(baseline.expectedResponse.evidencePack).toEqual(baseline.evidencePack);
    baseline.relations.forEach((relation) => {
      expect(entityIds.has(relation.sourceId), relation.id).toBe(true);
      expect(entityIds.has(relation.targetId), relation.id).toBe(true);
    });
    baseline.evidencePack.items.forEach((item) => {
      expect(item.linkedEntityIds.every((id) => entityIds.has(id)), item.id).toBe(true);
      expect(item.supportsClaimIds.every((id) => claimIds.has(id)), item.id).toBe(true);
    });
    baseline.expectedResponse.answer.claims.forEach((claim) => {
      if (claim.classification === "fact") expect(claim.citations.length).toBeGreaterThan(0);
      expect(claim.citations.every((citation) => evidenceIds.has(citation.evidenceId)), claim.id).toBe(true);
    });
  });

  it("supports canonical and legacy repository lookups without changing the scripted UI boundary", async () => {
    const repository = new MockKnowledgeRepository();
    const canonical = await repository.getEntityById(knowledgeIds.operation.op30);
    const legacy = await repository.getEntityById("operation.op30-leak-test");
    expect(legacy).toEqual(canonical);

    const client = new ScriptedAgentClient(0);
    const session = await client.startSession("quality-issue-trace");
    const events: AgentRunEvent[] = [];
    await client.runTurn({
      sessionId: session.id,
      scenarioId: session.scenarioId,
      userMessage: leakRateQualityIssueTraceBaseline.scenario.question,
      language: "zh",
      previousTurns: [],
      sharedContext: session.sharedContext,
      onEvent: (event) => events.push(event),
    });
    const completed = events.find((event) => event.type === "turn-completed");
    expect(completed?.type).toBe("turn-completed");
    if (completed?.type !== "turn-completed") return;
    expect(completed.turn.relatedObjects.some((object) => object.id === knowledgeIds.operation.op30)).toBe(true);
    expect(completed.turn.relatedObjects.some((object) => object.id === knowledgeIds.machine.m220)).toBe(true);
    expect(completed.turn.relatedObjects.some((object) => object.id === knowledgeIds.quality.leakRate)).toBe(true);
  });
});
