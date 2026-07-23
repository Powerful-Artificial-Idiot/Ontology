import { validateAgentDeploymentConfiguration } from "./deploymentConfig";

let exitCode = 0;
try {
  const { status } = await validateAgentDeploymentConfiguration(process.env);
  print("NODE_ENV production", status.nodeEnvironmentProduction);
  print("DeepSeek configured", status.deepSeekConfigured);
  print("DeepSeek official endpoint configured", status.deepSeekEndpointConfigured);
  print("DeepSeek semantic model configured", status.semanticModelConfigured);
  print("DeepSeek answer model configured", status.answerModelConfigured);
  print("Neo4j configured", status.neo4jConfigured);
  print("Authentication configured", status.authenticationConfigured);
  print("Data directory configured", status.dataDirectoryConfigured);
  print("Data directory writable", status.dataDirectoryWritable);
  print("Governed documents configured", status.governedDocumentsConfigured);
  print("Persistent Agent store configured", status.persistentStoreConfigured);
  print("Agent API loopback only", status.apiLoopbackOnly);
} catch (error) {
  console.error(`Deployment configuration: invalid (${safeCode(error)})`);
  exitCode = 1;
}
process.exitCode = exitCode;

function print(label: string, value: boolean) {
  console.info(`${label}: ${value}`);
}

function safeCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("MKG_DATA_DIR")) return "DATA_DIRECTORY_INVALID";
  if (message.startsWith("Production Agent configuration")) return "PRODUCTION_CONFIGURATION_INCOMPLETE";
  return "CONFIGURATION_CHECK_FAILED";
}
