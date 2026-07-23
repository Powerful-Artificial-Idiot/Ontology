import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import type { ConnectorProfile } from "../../packages/knowledge-contracts/src/index";
import { EnvironmentSourceSecretResolver, FixtureHttpJsonSourceConnector, validateConnectorProfiles } from "../../packages/source-sync/src/index";
import { createSourceSyncFixtureHandler } from "../source-sync-fixture/app";
import { runtimeDataPath } from "../runtimePaths";

const outputPath = runtimeDataPath(process.env, "source-sync/fixture-live-report.json");
const token = randomBytes(32).toString("hex");
const server = createServer((request, response) => { void createSourceSyncFixtureHandler({ token })(request, response).catch(() => { response.writeHead(500); response.end(); }); });
await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind to a TCP port.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const registry = validateConnectorProfiles(JSON.parse(await readFile(resolve("packages/demo-data/source-sync/connector-profiles.v1.json"), "utf8")) as unknown);
  const httpProfiles = registry.filter((item) => item.adapterType === "fixture-http-json").map((item): ConnectorProfile => ({ ...item, endpoint: { ...item.endpoint!, baseUrl } }));
  const environment = { MKG_SOURCE_SECRET_FIXTURE_TOKEN: token };
  const sources = [];
  for (const profile of httpProfiles) {
    const batch = await new FixtureHttpJsonSourceConnector({ profile, path: `/fixture/${profile.sourceSystem}/records`, secrets: new EnvironmentSourceSecretResolver(environment), timeoutMs: 2_000 }).readBatch();
    sources.push({ sourceSystem: profile.sourceSystem, records: batch.records.length, extractId: batch.manifest.extractId, status: "passed" });
  }
  const serialized = JSON.stringify(sources);
  const report = { reportVersion: "1.0.0", generatedAt: new Date().toISOString(), status: sources.length === 3 && sources.every((item) => item.records > 0) && !serialized.includes(token) ? "passed" : "failed", server: "localhost-controlled-fixture", enterpriseEndpointUsed: false, sourceAuthentication: "static-bearer-runtime-only", sources, controls: { endpointAllowlist: "passed", localhostExplicit: "passed", bearerNotPersisted: !serialized.includes(token) ? "passed" : "failed" } };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.info(`Phase 5D HTTP fixture live acceptance: ${report.status} (${sources.length}/3 sources)`);
  if (report.status !== "passed") process.exitCode = 1;
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}
