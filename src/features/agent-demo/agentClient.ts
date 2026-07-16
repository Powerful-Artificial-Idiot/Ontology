import type { AgentConversationSession, AgentConversationTurn, AgentLanguage, AgentReasoningStep, AgentScenario, AgentSharedContext } from "./agentDemoTypes";

export type { AgentTurnRequest, AgentTurnResponse, ContractAgentClient } from "../../../packages/knowledge-contracts/src/index";

export type AgentRunEvent =
  | { type: "session-started"; session: AgentConversationSession }
  | { type: "turn-started"; turn: AgentConversationTurn }
  | { type: "step-started"; turnId: string; step: AgentReasoningStep }
  | { type: "step-completed"; turnId: string; step: AgentReasoningStep }
  | { type: "turn-completed"; turn: AgentConversationTurn; sharedContext: AgentSharedContext }
  | { type: "error"; turnId?: string; message: string };

export type AgentRunTurnOptions = {
  sessionId: string;
  scenarioId: string;
  userMessage: string;
  language?: AgentLanguage;
  previousTurns: AgentConversationTurn[];
  sharedContext: AgentSharedContext;
  onEvent: (event: AgentRunEvent) => void;
  signal?: AbortSignal;
};

export interface AgentClient {
  listScenarios(): Promise<AgentScenario[]>;
  startSession(scenarioId: string): Promise<AgentConversationSession>;
  runTurn(options: AgentRunTurnOptions): Promise<void>;
}
