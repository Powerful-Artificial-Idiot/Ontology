import type { AgentClient, AgentRunTurnOptions } from "./agentClient";

/**
 * Future transport boundary for:
 * GET /api/agent/scenarios
 * POST /api/agent/sessions
 * GET /api/agent/sessions/:sessionId
 * POST /api/agent/sessions/:sessionId/turns
 * GET /api/agent/turns/:turnId/trace
 * SSE /api/agent/sessions/:sessionId/events
 */
export class ApiAgentClient implements AgentClient {
  constructor(private readonly baseUrl: string) {}

  async listScenarios(): Promise<never> {
    throw new Error(`ApiAgentClient is not implemented in demo mode (${this.baseUrl}).`);
  }

  async startSession(_scenarioId: string): Promise<never> {
    throw new Error(`ApiAgentClient is not implemented in demo mode (${this.baseUrl}).`);
  }

  async runTurn(_options: AgentRunTurnOptions): Promise<never> {
    throw new Error(`ApiAgentClient is not implemented in demo mode (${this.baseUrl}).`);
  }
}
