import { createDeterministicAgentPipeline } from "../../packages/agent-core/src/index";
import { AGENT_CONTRACT_VERSION } from "../../packages/knowledge-contracts/src/index";
import { createDefaultGovernedDocumentRetriever } from "./governedDocumentEvidence";

const retriever = createDefaultGovernedDocumentRetriever();
const ingestion = await retriever.getIngestionResult();
if (ingestion.rejectedDocumentIds.length || ingestion.issues.length) {
  throw new Error(`Governed document ingestion failed: ${JSON.stringify(ingestion.issues)}`);
}
const response = await createDeterministicAgentPipeline({ documentRetriever: retriever }).run({
  contractVersion: AGENT_CONTRACT_VERSION,
  requestId: "document-evidence-acceptance",
  scenarioId: "quality-issue-trace",
  mode: "live",
  language: "en",
  message: "OP30 Leak Rate is abnormal. Which equipment, quality risks, and documents may be affected?",
});
if (response.citationValidation.status !== "passed") throw new Error("Governed document citation validation failed.");
const documentChunks = response.evidencePack.items.filter((item) => item.kind === "document" || item.kind === "system-record");
if (!documentChunks.length || documentChunks.some((item) => !item.id.startsWith("evidence-chunk.") || !item.source.locator || !item.governance)) {
  throw new Error("Evidence Pack does not contain governed chunk-level citations.");
}
console.log(JSON.stringify({
  acceptedDocuments: ingestion.acceptedDocumentIds.length,
  chunks: ingestion.chunks.length,
  evidenceItems: response.evidencePack.items.length,
  citationValidation: response.citationValidation.status,
}, null, 2));
