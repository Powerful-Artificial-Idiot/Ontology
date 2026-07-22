import type { AgentConversationSession, AgentConversationTurn, AgentLanguage, AgentReasoningStep, AgentScenario, AgentSharedContext } from "./agentDemoTypes";

export type { AgentTurnRequest, AgentTurnResponse, ContractAgentClient } from "../../../packages/knowledge-contracts/src/index";

export type AgentRunEvent =
  | { type: "session-started"; session: AgentConversationSession }
  | { type: "turn-started"; turn: AgentConversationTurn }
  | { type: "run-accepted"; provisionalTurnId: string; runId: string; turnId: string }
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

export type AgentTurnDetails = Pick<AgentConversationTurn, "trace" | "references">;

export interface AgentClient {
  readonly runtimeMode: "scripted" | "api";
  listScenarios(): Promise<AgentScenario[]>;
  resumeSession?(scenarioId: string, language?: AgentLanguage): Promise<AgentConversationSession | null>;
  startSession(scenarioId: string, language?: AgentLanguage): Promise<AgentConversationSession>;
  runTurn(options: AgentRunTurnOptions): Promise<void>;
  retryRun?(runId: string, options: AgentRunTurnOptions): Promise<void>;
  getTurnDetails(turnId: string): Promise<AgentTurnDetails | null>;
}
