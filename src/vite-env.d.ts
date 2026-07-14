/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KNOWLEDGE_MODE?: "local" | "http";
  readonly VITE_KNOWLEDGE_API_BASE_URL?: string;
  readonly VITE_KNOWLEDGE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
