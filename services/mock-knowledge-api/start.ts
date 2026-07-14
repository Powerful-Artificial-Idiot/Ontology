import { createServer } from "node:http";
import { knowledgeRepository } from "../../src/repositories";
import { createMockKnowledgeApi } from "./app";

const port = Number(process.env.MKG_API_PORT ?? 4174);
const host = process.env.MKG_API_HOST ?? "127.0.0.1";
const server = createServer(createMockKnowledgeApi(knowledgeRepository));

server.listen(port, host, () => {
  console.log(`Mock Knowledge API listening on http://${host}:${port}/api`);
});
