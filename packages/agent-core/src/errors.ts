import type { AgentError, AgentErrorCode, AgentTraceStage, AgentTraceStageName } from "../../knowledge-contracts/src/index";

export class AgentPipelineError extends Error {
  readonly detail: AgentError;
  traceStages: AgentTraceStage[] = [];

  constructor(code: AgentErrorCode, message: string, stage?: AgentTraceStageName, details: AgentError["details"] = {}) {
    super(message);
    this.name = "AgentPipelineError";
    this.detail = { code, message, stage, details };
  }

  withTrace(stages: AgentTraceStage[]): this {
    this.traceStages = stages.map((stage) => ({ ...stage, inputRefs: [...stage.inputRefs], outputRefs: [...stage.outputRefs] }));
    return this;
  }
}

export function assertPipeline(condition: unknown, code: AgentErrorCode, message: string, stage?: AgentTraceStageName, details?: AgentError["details"]): asserts condition {
  if (!condition) throw new AgentPipelineError(code, message, stage, details);
}
