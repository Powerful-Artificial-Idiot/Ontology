import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    target: "node20",
    outDir: "dist-agent-api",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        server: "services/agent-api/start.ts",
        "check-config": "services/agent-api/check-config.ts",
      },
      output: {
        entryFileNames: "[name].mjs",
      },
    },
  },
});
