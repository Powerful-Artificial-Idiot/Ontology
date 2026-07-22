import type { AgentClient } from "./agentClient";
import { ApiAgentClient } from "./apiAgentClient";
import { ScriptedAgentClient } from "./scriptedAgentClient";

export type AgentClientRuntimeConfig = {
  mode?: "scripted" | "api";
  apiBaseUrl?: string;
  timeoutMs?: number;
};

export function createAgentClient(config: AgentClientRuntimeConfig = {}): AgentClient {
  const mode = config.mode ?? import.meta.env.VITE_AGENT_MODE ?? "scripted";
  if (mode === "scripted") return new ScriptedAgentClient();
  return new ApiAgentClient(
    config.apiBaseUrl ?? import.meta.env.VITE_AGENT_API_BASE_URL ?? "http://127.0.0.1:4175/api/agent",
    validTimeout(config.timeoutMs ?? Number(import.meta.env.VITE_AGENT_TIMEOUT_MS ?? 12_000)),
  );
}

function validTimeout(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 12_000;
}
