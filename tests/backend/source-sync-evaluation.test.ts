import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateSourceSyncRelease, validateDataset, type SourceSyncEvaluationDataset, type SourceSyncEvaluationObservation } from "../../packages/source-sync-evaluation/src/index";

describe("Phase 5D evaluation and release gate", () => {
  it("requires unique non-empty cases and minimum coverage in every source domain", async () => {
    const dataset = await load();
    expect(() => validateDataset(dataset)).not.toThrow();
    expect(dataset.cases).toHaveLength(40);
    const count = (domain: string) => dataset.cases.filter((item) => item.domain === domain).length;
    expect(count("mes")).toBeGreaterThanOrEqual(8);
    expect(count("plm")).toBeGreaterThanOrEqual(8);
    expect(count("qms")).toBeGreaterThanOrEqual(8);
    expect(count("cross-source-recovery")).toBeGreaterThanOrEqual(8);
    expect(() => validateDataset({ ...dataset, cases: [...dataset.cases, dataset.cases[0]!] })).toThrow(/Duplicate/u);
    expect(() => validateDataset({ ...dataset, cases: dataset.cases.map((item, index) => index === 0 ? { ...item, assertionIds: [] } : item) })).toThrow(/effective assertion/u);
  });

  it("passes only with complete observations, zero blockers and every rate at 100%", async () => {
    const dataset = await load();
    const metrics = { connectorCriticalFailures: 0, unauthorizedPublicationCount: 0, crossTenantPublicationCount: 0, canonicalIdViolationCount: 0, ontologyInvalidPublicationCount: 0, shaclInvalidPublicationCount: 0, staleOverwriteCount: 0, duplicateCanonicalMutationCount: 0, sameVersionHashConflictPublicationCount: 0, partialRunMarkedCompletedCount: 0, failedRunCheckpointAdvanceCount: 0, cancelledRunCheckpointAdvanceCount: 0, missingLineageCount: 0, unresolvedCriticalReconciliationCount: 0, permanentDeleteCount: 0, secretLeakageCount: 0, rawPayloadLeakageCount: 0, idempotencyAccuracy: 1, checkpointMonotonicity: 1, mappingDeterminism: 1, publicationVerification: 1, authorizationEnforcement: 1, recoveryDetection: 1, lineageCompleteness: 1, ssrfEnforcement: 1 };
    const observations: SourceSyncEvaluationObservation[] = dataset.cases.map((item, index) => ({ caseId: item.caseId, passed: true, detail: "passed", ...(index === 0 ? { metrics } : {}) }));
    expect(evaluateSourceSyncRelease(dataset, observations).status).toBe("passed");
    expect(evaluateSourceSyncRelease(dataset, observations.slice(1)).status).toBe("failed");
    const regressed = observations.map((item, index) => index === 0 ? { ...item, metrics: { ...metrics, missingLineageCount: 1, recoveryDetection: 0 } } : item);
    const report = evaluateSourceSyncRelease(dataset, regressed);
    expect(report.status).toBe("failed");
    expect(report.reasons.join(" ")).toMatch(/missingLineageCount.*recoveryDetection/u);
  });
});

async function load(): Promise<SourceSyncEvaluationDataset> { return JSON.parse(await readFile(resolve("packages/demo-data/source-sync/phase5d-evaluation.v1.json"), "utf8")) as SourceSyncEvaluationDataset; }
