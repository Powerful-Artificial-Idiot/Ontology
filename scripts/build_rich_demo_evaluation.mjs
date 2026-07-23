import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "packages/demo-data/evaluations/op30-leak-rate-rich-demo.v1.json");

const cases = [
  quality("rich.specification.zh", "OP30 的 Leak Rate 容许范围是多少？", "zh", ["claim.specification", "claim.control-thresholds", "claim.measurement-capability"]),
  quality("rich.specification.en", "What is the OP30 Leak Rate acceptance specification and USL?", "en", ["claim.specification", "claim.control-thresholds", "claim.measurement-capability"]),
  quality("rich.warning-limit", "OP30 Leak Rate 的预警限是多少？", "zh", ["claim.control-thresholds", "claim.reaction-plan"]),
  quality("rich.action-limit", "What is the OP30 Leak Rate action limit?", "en", ["claim.control-thresholds", "claim.reaction-plan"]),
  quality("rich.latest.zh", "OP30 当前 Leak Rate 水平、最大值和 Cpk 是多少？", "zh", ["claim.latest-metric"]),
  quality("rich.latest.en", "What is the latest OP30 Leak Rate mean, maximum and Cpk?", "en", ["claim.latest-metric"]),
  quantitative("rich.percent.ambiguous.zh", "OP30 的 Leak Rate 提升 50% 是否超标？", "zh"),
  quantitative("rich.percent.ambiguous.en", "Does a 50 percent increase in OP30 Leak Rate exceed the limit?", "en"),
  quantitative("rich.percent.latest", "If OP30 Leak Rate increases 50 percent from the latest mean, is it nonconforming?", "en"),
  quantitative("rich.percent.center", "OP30 Leak Rate 从 control center 0.20 sccm 提升 50% 是否超标？", "zh"),
  quantitative("rich.percent.explicit-022", "If OP30 Leak Rate increases 50 percent from 0.22 sccm, what is the result?", "en"),
  quantitative("rich.percent.explicit-025", "If OP30 Leak Rate increases 20 percent from 0.25 sccm, is it acceptable?", "en"),
  quantitative("rich.boundary.usl", "Is OP30 Leak Rate 0.30 sccm acceptable?", "en"),
  quantitative("rich.boundary.measurement-max", "Is OP30 Leak Rate 0.50 sccm conforming and measurable?", "en"),
  quantitative("rich.boundary.outside-range", "Is OP30 Leak Rate 0.51 sccm acceptable and within the equipment range?", "en"),
  control("rich.control-method.zh", "OP30 Leak Rate 的检测设备量程和控制方法是什么？", "zh", ["claim.measurement-capability", "claim.specification"]),
  control("rich.control-method.en", "What is the OP30 Leak Rate control method and measurement range?", "en", ["claim.measurement-capability", "claim.specification"]),
  control("rich.measurement-system", "What do M220 MSA, GRR and calibration evidence say for OP30 Leak Rate?", "en", ["claim.measurement-system"]),
  control("rich.calibration.zh", "OP30 Leak Rate 的 M220 测量系统校准是否有效？", "zh", ["claim.measurement-system"]),
  engineering("rich.program-v34-current", "For OP30 Leak Rate, is v3.5 effective or does V3.4 remain current?", "en"),
  engineering("rich.program-v35-proposed", "M220 程序 v3.5 是否已经可以用于正式生产？ OP30 Leak Rate", "zh"),
  engineering("rich.program-validation", "Which validation evidence remains for OP30 Leak Rate program v3.5?", "en"),
  engineering("rich.program-impact-boundary", "Does proposed OP30 Leak Rate program v3.5 prove an improvement?", "en"),
  reaction("rich.reaction.zh", "超过 0.27 sccm 后需要执行哪些措施？ OP30 Leak Rate", "zh"),
  reaction("rich.reaction.en", "Which reaction plan actions apply when OP30 Leak Rate exceeds 0.27 sccm?", "en"),
  causal("rich.causal.zh", "OP20 是瓶颈，是否证明它导致了 OP30 Leak Rate 上升？", "zh"),
  causal("rich.causal.en", "Does the OP20 bottleneck prove that it caused the OP30 Leak Rate increase?", "en"),
  crossEngineering("rich.cross.quality-engineering", "For OP30 Leak Rate, switch to engineering context: is program v3.5 effective?", "en"),
  causal("rich.cross.bottleneck-quality", "Can the OP20 bottleneck be treated as causal proof for the OP30 Leak Rate change?", "en"),
  quality("rich.document-evidence", "OP30 Leak Rate is abnormal. Which products, equipment, risks and documents are involved?", "en", [
    "claim.affected-product",
    "claim.affected-equipment",
    "claim.quality-risk",
    "claim.governed-documents",
    "claim.signal-limitation",
  ], 1),
];

const dataset = {
  datasetId: "evaluation.op30-leak-rate-rich-demo",
  version: "1.0.0",
  domain: "manufacturing-quality",
  description: "Synthetic governed rich-demo evaluation for OP30 Leak Rate quantitative reasoning, control-method distinction, engineering version state and cross-domain causal boundaries.",
  cases,
};

writeFileSync(output, `${JSON.stringify(dataset, null, 2)}\n`);
console.info(JSON.stringify({
  status: "built",
  datasetId: dataset.datasetId,
  cases: cases.length,
  categories: countTags(cases),
}, null, 2));

function quality(caseId, message, language, claims, limitations = 0) {
  return testCase(caseId, message, language, claims, ["quality-quantitative"], limitations);
}

function quantitative(caseId, message, language) {
  return testCase(caseId, message, language, [
    "claim.percentage-projection",
    "claim.control-thresholds",
    "claim.specification",
    "claim.measurement-capability",
    "claim.reaction-plan",
  ], ["quality-quantitative", "deterministic-arithmetic"], 0, 10);
}

function control(caseId, message, language, claims) {
  return testCase(caseId, message, language, claims, ["control-method-msa"]);
}

function engineering(caseId, message, language) {
  return testCase(caseId, message, language, ["claim.version-status", "claim.change-validation"], ["engineering-change"]);
}

function reaction(caseId, message, language) {
  return testCase(caseId, message, language, ["claim.reaction-plan"], ["quality-quantitative", "reaction-plan"]);
}

function causal(caseId, message, language) {
  return testCase(caseId, message, language, ["claim.causal-boundary"], ["cross-domain", "causal-boundary"], 1);
}

function crossEngineering(caseId, message, language) {
  return testCase(caseId, message, language, ["claim.version-status", "claim.change-validation"], ["cross-domain", "engineering-change", "domain-switch"]);
}

function testCase(caseId, message, language, requiredClaimIds, tags, minimumLimitations = 0, expectedPipelineStages = 9) {
  return {
    caseId,
    scenarioId: "quality-issue-trace",
    title: caseId.replaceAll(".", " "),
    severity: tags.includes("deterministic-arithmetic") ? "blocker" : "critical",
    tags: [...tags, language === "zh" ? "chinese" : "english", "citation"],
    turns: [{
      turnId: "turn-1",
      input: { message, language, scenarioId: "quality-issue-trace" },
      expected: {
        answer: {
          requiredClaimIds,
          minimumLimitations,
          minimumCitationCoverage: 1,
          forbiddenTerms: ["production specification value from a real factory"],
        },
        runtime: { maxLatencyMs: 5000, expectedPipelineStages },
      },
    }],
  };
}

function countTags(items) {
  const counts = {
    qualityQuantitative: 0,
    controlMethodMsa: 0,
    engineeringChange: 0,
    crossDomain: 0,
  };
  items.forEach((item) => {
    if (item.tags.includes("quality-quantitative")) counts.qualityQuantitative += 1;
    if (item.tags.includes("control-method-msa")) counts.controlMethodMsa += 1;
    if (item.tags.includes("engineering-change")) counts.engineeringChange += 1;
    if (item.tags.includes("cross-domain")) counts.crossDomain += 1;
  });
  return counts;
}
