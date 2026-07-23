import { createServer } from "node:http";
import { createSourceSyncApi } from "./app";
import { createSourceSyncRuntime } from "../source-sync/runtime";

const runtime = await createSourceSyncRuntime();
const handler = createSourceSyncApi(runtime);
const port = Number(process.env.MKG_SOURCE_SYNC_API_PORT ?? 4177);
createServer(handler).listen(port, "127.0.0.1", () => console.info(`Source Sync API listening on http://127.0.0.1:${port}/api/source-sync.`));
