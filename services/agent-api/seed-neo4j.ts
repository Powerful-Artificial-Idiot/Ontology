import { seedCanonicalKnowledgeBaselinesWithCredentials } from "../../packages/neo4j-repository/src/index";
import { neo4jOptionsFromEnvironment } from "./runtime";

const options = neo4jOptionsFromEnvironment({ ...process.env, MKG_AGENT_KNOWLEDGE_MODE: "neo4j" });
await seedCanonicalKnowledgeBaselinesWithCredentials({
  uri: options.uri ?? "bolt://127.0.0.1:7687",
  username: options.username ?? "neo4j",
  password: options.password ?? "",
  database: options.database,
});
console.info("Seeded all registered canonical knowledge baselines into Neo4j.");
