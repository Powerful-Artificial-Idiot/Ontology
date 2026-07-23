import type { AgentAuthorizationContext, ConnectorRunMode } from "../../packages/knowledge-contracts/src/index";
import { createSourceSyncRuntime, publicConnectorProfile, publicConnectorRun } from "./runtime";

const command = process.argv[2];
const runtime = await createSourceSyncRuntime();
const argument = (name: string): string | undefined => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const required = (name: string): string => { const value = argument(name); if (!value) throw new Error(`${name} is required.`); return value; };
const authorization: AgentAuthorizationContext = { principal: { id: "principal.source-sync-cli", tenantId: "tenant.demo-manufacturing", roleIds: ["source-sync-operator"], domainIds: ["production", "quality"], objectIds: ["*"], authenticationMethod: "none" }, authenticatedAt: new Date().toISOString(), requestId: `source-sync-cli.${Date.now()}` };

let output: unknown;
switch (command) {
  case "list": output = { connectors: runtime.profiles.map(publicConnectorProfile) }; break;
  case "inspect": output = { connector: publicConnectorProfile(requireProfile(required("--connector"))) }; break;
  case "run": {
    const mode = required("--mode") as ConnectorRunMode;
    if (!["snapshot", "incremental", "dry-run", "validate-only", "reconcile-only"].includes(mode)) throw new Error("--mode is invalid.");
    const result = await runtime.execute({ connectorId: required("--connector"), mode, authorization, idempotencyKey: argument("--idempotency-key") ?? `cli.${Date.now()}` });
    output = { run: publicConnectorRun(result.run), report: result.report, reconciliation: result.reconciliation };
    if (result.run.status !== "completed") process.exitCode = 1;
    break;
  }
  case "runs-list": output = { runs: (await runtime.runs.list(argument("--connector"))).map(publicConnectorRun) }; break;
  case "checkpoint-inspect": output = { connectorId: required("--connector"), checkpoints: (await runtime.syncStore.getSnapshot()).checkpoints }; break;
  case "quarantine-list": output = { items: await runtime.quarantine.list() }; break;
  case "quarantine-inspect": output = { item: await runtime.quarantine.get(required("--id")) }; break;
  case "quarantine-replay": output = { run: publicConnectorRun((await runtime.service.replayQuarantine(required("--id"), authorization)).run) }; break;
  case "reconcile": output = await runtime.execute({ connectorId: required("--connector"), mode: "reconcile-only", authorization, idempotencyKey: `reconcile.${Date.now()}` }); break;
  case "recover": output = { run: publicConnectorRun((await runtime.service.recover(required("--run"))).run) }; break;
  default: throw new Error("Unknown source synchronization CLI command.");
}
console.info(JSON.stringify(output, null, 2));

function requireProfile(id: string) { const profile = runtime.profiles.find((item) => item.id === id); if (!profile) throw new Error("Connector not found."); return profile; }
