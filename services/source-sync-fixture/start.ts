import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createSourceSyncFixtureHandler } from "./app";

const host = "127.0.0.1";
const port = Number(process.env.MKG_SOURCE_FIXTURE_PORT ?? 4176);
const token = process.env.MKG_SOURCE_SECRET_FIXTURE_TOKEN ?? randomBytes(24).toString("hex");
const handler = createSourceSyncFixtureHandler({ token });
const server = createServer((request, response) => { void handler(request, response).catch(() => { response.writeHead(500); response.end(); }); });
server.listen(port, host, () => console.info(`Source fixture server listening on http://${host}:${port}.`));
