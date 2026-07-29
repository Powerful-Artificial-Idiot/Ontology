import dataset from "../../packages/demo-data/authoring/phase5e-evaluation.v1.json";
import { evaluateKnowledgeAuthoringDataset, type KnowledgeAuthoringEvaluationDataset } from "../../packages/knowledge-authoring/src/index";

const report = evaluateKnowledgeAuthoringDataset(dataset as KnowledgeAuthoringEvaluationDataset);
console.info(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
