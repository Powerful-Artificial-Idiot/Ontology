import { describe, expect, it } from "vitest";
import { evidenceDocuments } from "../../src/data/mockKnowledgeRegistry/evidenceDocuments";
import { knowledgeIds } from "../../src/data/mockKnowledgeRegistry/ids";
import { manufacturingObjects } from "../../src/data/mockKnowledgeRegistry/manufacturingObjects";
import { ontologyRelations } from "../../src/data/mockKnowledgeRegistry/ontologyRelations";
import { mockKnowledgeValidationReport } from "../../src/data/mockKnowledgeRegistry/runtimeValidation";
import { semanticMappings } from "../../src/data/mockKnowledgeRegistry/semanticMappings";
import { stackNodes } from "../../src/data/mockGraph";
import { semanticEntities } from "../../src/features/semantic/semanticData";

describe("Mock Knowledge Registry", () => {
  it("has no duplicate canonical IDs within registry collections", () => {
    [manufacturingObjects, evidenceDocuments, ontologyRelations, semanticMappings].forEach((items) => {
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    });
  });

  it("keeps canonical OP30 knowledge available in Route and Semantic explorers", () => {
    const routeObjectIds = new Set(stackNodes.flatMap((node) => node.stackObjects.map((object) => object.id)));
    [knowledgeIds.operation.op20, knowledgeIds.operation.op30, knowledgeIds.machine.m220, knowledgeIds.fixture.fx002, knowledgeIds.program.leakTestV34, knowledgeIds.program.leakTestV35, knowledgeIds.quality.leakRate, knowledgeIds.document.controlPlan, knowledgeIds.document.pfmea, knowledgeIds.document.sopOp30, knowledgeIds.document.validationRecordV35, knowledgeIds.document.engineeringChangeM220, knowledgeIds.document.standardWorkOp20, knowledgeIds.document.valueStreamMap, knowledgeIds.document.lineBalanceStudy, knowledgeIds.valueStream.op20CycleTime, knowledgeIds.valueStream.wipBeforeOp20, knowledgeIds.valueStream.waitingBeforeOp20, knowledgeIds.valueStream.lineBottleneckRisk, knowledgeIds.valueStream.reworkRetestLoad, knowledgeIds.valueStream.qualityBottleneckRisk].forEach((id) => expect(routeObjectIds.has(id), id).toBe(true));
    const semanticIds = new Set(semanticEntities.map((entity) => entity.id));
    [knowledgeIds.semantic.leakRate, knowledgeIds.semantic.airLeak, knowledgeIds.semantic.leakage, knowledgeIds.semantic.leakTestResult, knowledgeIds.semantic.wip, knowledgeIds.semantic.engineeringChange, knowledgeIds.semantic.programVersion, knowledgeIds.semantic.validation, knowledgeIds.semantic.qmsLeakRate, knowledgeIds.semantic.mesOp30Value, knowledgeIds.semantic.mesOperationCycleTime, knowledgeIds.semantic.mesWipQuantity, knowledgeIds.semantic.ieLineBalanceResult].forEach((id) => expect(semanticIds.has(id), id).toBe(true));
  });

  it("passes cross-explorer and Agent reference validation", () => {
    expect(mockKnowledgeValidationReport.issues).toEqual([]);
    expect(mockKnowledgeValidationReport.passed).toBe(true);
  });
});
