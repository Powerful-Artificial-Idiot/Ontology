import neo4j, { type Driver, type Node, type Relationship } from "neo4j-driver";
import { describe, expect, it, vi } from "vitest";
import { leakRateQualityIssueTraceBaseline } from "../../packages/demo-data/src/index";
import { RepositoryGraphRetriever, createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import { NEO4J_READ_QUERIES, Neo4jKnowledgeRepository } from "../../packages/neo4j-repository/src/index";
import { createConfiguredAgentApiRuntime } from "../../services/agent-api/runtime";

describe("Neo4jKnowledgeRepository", () => {
  it("uses only static read templates with parameterized business values", () => {
    for (const query of Object.values(NEO4J_READ_QUERIES)) {
      expect(query).not.toMatch(/\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|CALL|LOAD\s+CSV)\b/iu);
      expect(query).not.toContain("${");
    }
    expect(NEO4J_READ_QUERIES.traverseQualityIssueNodes).toContain("[:RELATED_TO*0..2]");
    expect(NEO4J_READ_QUERIES.traverseQualityIssueNodes).toContain("$allowedRelationTypes");
    expect(NEO4J_READ_QUERIES.traverseQualityIssueNodes).toContain("$resultLimit");
  });

  it("normalizes Neo4j records and runs the unchanged deterministic pipeline", async () => {
    const calls: Array<{ query: string; parameters: Record<string, unknown> }> = [];
    const driver = fakeDriver(calls);
    const repository = new Neo4jKnowledgeRepository({ driver });
    const pipeline = createDeterministicAgentPipeline({ graphRetriever: new RepositoryGraphRetriever(repository) });
    const response = await pipeline.run({
      ...leakRateQualityIssueTraceBaseline.request,
      requestId: "request.neo4j-adapter-test",
      mode: "live",
    });

    expect(response.status).toBe("completed");
    expect(response.citationValidation.status).toBe("passed");
    expect(response.trace.stages.find((stage) => stage.stage === "graph-retrieval")?.summary).toContain("neo4j");
    expect(calls).toHaveLength(2);
    expect(calls[0].parameters.seedEntityIds).toEqual(["operation.op30", "quality-characteristic.leak-rate"]);
    expect(calls[0].parameters.allowedRelationTypes).toEqual(leakRateQualityIssueTraceBaseline.graphQueryPlan.allowedRelationTypes);
    expect(neo4j.isInt(calls[0].parameters.resultLimit)).toBe(true);
    expect((calls[0].parameters.resultLimit as ReturnType<typeof neo4j.int>).toNumber()).toBe(50);
    expect(JSON.stringify(calls[0].parameters)).not.toMatch(/MATCH|RETURN|CREATE/iu);
  });

  it("requires explicit credentials instead of silently falling back to Mock", async () => {
    await expect(createConfiguredAgentApiRuntime({ MKG_AGENT_KNOWLEDGE_MODE: "neo4j" })).rejects.toThrow("MKG_NEO4J_PASSWORD is required");
    await expect(createConfiguredAgentApiRuntime({ MKG_AGENT_KNOWLEDGE_MODE: "unexpected" })).rejects.toThrow("Use mock or neo4j");
  });
});

function fakeDriver(calls: Array<{ query: string; parameters: Record<string, unknown> }>): Driver {
  const session = {
    run: vi.fn(async (query: string, parameters: Record<string, unknown>) => {
      calls.push({ query, parameters });
      if (query === NEO4J_READ_QUERIES.traverseQualityIssueNodes) {
        return { records: leakRateQualityIssueTraceBaseline.entities.map((entity) => record({ entity: entityNode(entity) })) };
      }
      if (query === NEO4J_READ_QUERIES.relationsForEntities) {
        return { records: leakRateQualityIssueTraceBaseline.relations.map((relation) => record({ sourceId: relation.sourceId, relation: relationRecord(relation), targetId: relation.targetId })) };
      }
      throw new Error("Unexpected query in fake Neo4j driver.");
    }),
    close: vi.fn(async () => undefined),
  };
  return {
    session: vi.fn(() => session),
    verifyConnectivity: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as Driver;
}

function record(values: Record<string, unknown>) {
  return { get: (key: string) => values[key] };
}

function entityNode(entity: (typeof leakRateQualityIssueTraceBaseline.entities)[number]): Node {
  return {
    properties: {
      id: entity.id,
      type: entity.type,
      label: entity.label,
      description: entity.description ?? null,
      domain: entity.domain ?? null,
      propertiesJson: JSON.stringify(entity.properties),
      sourceJson: JSON.stringify(entity.source ?? []),
      validFrom: entity.validFrom ?? null,
      validTo: entity.validTo ?? null,
      version: entity.version ?? null,
      status: entity.status ?? null,
    },
  } as unknown as Node;
}

function relationRecord(relation: (typeof leakRateQualityIssueTraceBaseline.relations)[number]): Relationship {
  return {
    properties: {
      id: relation.id,
      predicate: relation.predicate,
      businessType: relation.label ?? relation.predicate,
      propertiesJson: JSON.stringify(relation.properties ?? {}),
      provenanceJson: JSON.stringify(relation.provenance ?? []),
      validFrom: relation.validFrom ?? null,
      validTo: relation.validTo ?? null,
      confidence: relation.confidence ?? null,
      evidenceType: relation.evidenceType ?? null,
      assertionType: relation.assertionType ?? "asserted",
    },
  } as unknown as Relationship;
}
