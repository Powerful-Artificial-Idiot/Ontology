import { resolve } from "node:path";
import {
  runPersonalKnowledgeQuery,
  SnapshotKnowledgeRepository,
} from "../../packages/snapshot-knowledge-repository/src/index";

const snapshotPath = process.env.PERSONAL_KNOWLEDGE_SNAPSHOT
  ?? resolve(process.cwd(), "../personal website/generated/knowledge-snapshot.json");
const repository = SnapshotKnowledgeRepository.fromFile(snapshotPath);
const questions = [
  "Show content related to Knowledge Engineering.",
  "What projects demonstrate my interest in knowledge graphs?",
  "What do I currently believe about language and concept space?",
];

const results = await Promise.all(questions.map((question) => runPersonalKnowledgeQuery(repository, question)));
console.log(JSON.stringify({
  experimental: true,
  productionRuntimeDependency: false,
  status: results.every((result) => result.citationValidation.status === "passed") ? "passed" : "failed",
  snapshot: {
    schemaVersion: repository.snapshot.schemaVersion,
    contentHash: repository.snapshot.contentHash,
    objects: repository.snapshot.objects.length,
    relations: repository.snapshot.relations.length,
  },
  queries: results.map((result) => ({
    question: result.plan.question,
    intent: result.plan.intent,
    entityIds: result.entities.map((entity) => entity.id),
    evidenceIds: result.evidencePack.items.map((item) => item.id),
    answer: result.answer.summary,
    limitations: result.evidencePack.limitations,
    citationStatus: result.citationValidation.status,
  })),
}, null, 2));
