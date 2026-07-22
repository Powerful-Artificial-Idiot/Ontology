import { seedLeakRateCanonicalBaselineWithCredentials } from "../../packages/neo4j-repository/src/index";
import { neo4jOptionsFromEnvironment } from "./runtime";

const options = neo4jOptionsFromEnvironment({ ...process.env, MKG_AGENT_KNOWLEDGE_MODE: "neo4j" });
await seedLeakRateCanonicalBaselineWithCredentials({
  uri: options.uri ?? "bolt://127.0.0.1:7687",
  username: options.username ?? "neo4j",
  password: options.password ?? "",
  database: options.database,
});
console.info("Seeded the Leak Rate canonical baseline into Neo4j.");
