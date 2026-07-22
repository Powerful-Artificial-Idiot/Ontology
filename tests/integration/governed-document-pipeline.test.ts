import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StrictCitationValidator, createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import { AGENT_CONTRACT_VERSION, type AgentTurnRequest } from "../../packages/knowledge-contracts/src/index";
import { GovernedDocumentEvidenceRetriever } from "../../services/agent-api/governedDocumentEvidence";
import { createConfiguredAgentApiRuntime } from "../../services/agent-api/runtime";

const now = () => new Date("2026-07-22T00:00:00.000Z");

describe("Phase 4C governed document retrieval pipeline", () => {
  it("merges graph evidence with stable document chunks and passes the existing publication gate", async () => {
    const documentRetriever = new GovernedDocumentEvidenceRetriever({
      registryPath: resolve("packages/demo-data/documents/leak-rate/document-registry.json"),
      access: { principalId: "test-agent", roleIds: ["agent-evidence-reader"], domainIds: ["quality", "manufacturing", "engineering"] },
      now,
    });
    const pipeline = createDeterministicAgentPipeline({ documentRetriever });
    const response = await pipeline.run(request());

    expect(response.evidencePack.items).toHaveLength(5);
    expect(response.evidencePack.items[0]?.id).toBe("evidence.route.brake-booster.rev-c");
    const documentItems = response.evidencePack.items.slice(1);
    expect(documentItems.every((item) => item.id.startsWith("evidence-chunk."))).toBe(true);
    expect(documentItems.every((item) => item.source.locator && item.governance?.approvalStatus === "approved")).toBe(true);
    expect(response.answer.claims.flatMap((claim) => claim.citations).filter((citation) => citation.evidenceId !== "evidence.route.brake-booster.rev-c").every((citation) => citation.evidenceId.startsWith("evidence-chunk."))).toBe(true);
    expect(response.citationValidation).toMatchObject({ status: "passed", issues: [] });
    expect(response.trace.stages.find((stage) => stage.stage === "document-retrieval")?.tool).toBe("governed-document-evidence-retriever.v1");
    expect((await documentRetriever.getIngestionResult()).issues).toEqual([]);
  });

  it("blocks publication when chunk-level document governance metadata is removed", async () => {
    const documentRetriever = new GovernedDocumentEvidenceRetriever({
      registryPath: resolve("packages/demo-data/documents/leak-rate/document-registry.json"),
      access: { principalId: "test-agent", roleIds: ["agent-evidence-reader"], domainIds: ["quality", "manufacturing", "engineering"] },
      now,
    });
    const response = await createDeterministicAgentPipeline({ documentRetriever }).run(request());
    const evidencePack = structuredClone(response.evidencePack);
    const citedDocument = evidencePack.items.find((item) => item.kind === "document");
    if (!citedDocument) throw new Error("Expected governed document evidence.");
    citedDocument.governance = undefined;
    const validation = await new StrictCitationValidator().validate(response.answer, evidencePack);

    expect(validation.status).toBe("failed");
    expect(validation.issues.map((issue) => issue.code)).toContain("ungoverned-evidence");
  });

  it("uses governed retrieval by default and rejects unknown document modes", async () => {
    const runtime = await createConfiguredAgentApiRuntime({ MKG_AGENT_STORE_MODE: "memory" });
    try {
      expect(runtime.documentEvidenceMode).toBe("governed");
    } finally {
      await runtime.close();
    }
    await expect(createConfiguredAgentApiRuntime({ MKG_AGENT_STORE_MODE: "memory", MKG_AGENT_DOCUMENT_MODE: "unknown" })).rejects.toThrow("Use governed or canonical");
  });
});

function request(): AgentTurnRequest {
  return {
    contractVersion: AGENT_CONTRACT_VERSION,
    requestId: "phase-4c-pipeline",
    scenarioId: "quality-issue-trace",
    mode: "live",
    language: "en",
    message: "OP30 Leak Rate is abnormal. Which equipment, quality risks, and documents may be affected?",
  };
}
