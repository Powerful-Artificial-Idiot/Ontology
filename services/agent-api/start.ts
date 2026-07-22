import { createServer } from "node:http";
import { createAgentApi } from "./app";
import { createConfiguredAgentApiRuntime } from "./runtime";

const port = Number(process.env.MKG_AGENT_API_PORT ?? 4175);
const host = process.env.MKG_AGENT_API_HOST ?? "127.0.0.1";
const runtime = await createConfiguredAgentApiRuntime();
const server = createServer(createAgentApi({
  ...runtime,
  logger: {
    info: (message, metadata) => console.info(message, metadata),
    error: (message, metadata) => console.error(message, metadata),
  },
}));

server.listen(port, host, () => {
  console.info(`Agent API listening on http://${host}:${port}/api/agent using ${runtime.knowledgeRepositoryType} repository, ${runtime.documentEvidenceMode} document evidence, ${runtime.semanticParserMode} semantic parser, and ${runtime.answerComposerMode} answer composer`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void runtime.close().finally(() => process.exit(0));
    });
  });
}
