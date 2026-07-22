import type { AgentTraceStageName } from "../../knowledge-contracts/src/index";

export type StructuredOutputCapability = {
  transport: "responses-api" | "chat-completions";
  jsonMode: "strict-json-schema" | "json-object";
  supportsServerSideJsonSchema: boolean;
  supportsJsonObjectMode: boolean;
  supportsThinkingControl: boolean;
  supportsUsageMetadata: boolean;
  supportsRequestCancellation: boolean;
};

export type StructuredGenerationRequest<T = unknown> = {
  instructions: string;
  input: T;
  schemaName: string;
  schema: Record<string, unknown>;
  stage: AgentTraceStageName;
  operationLabel: string;
  maxOutputTokens: number;
};

export type StructuredGenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type StructuredGenerationResult<T> = {
  value: T;
  providerId: string;
  modelId: string;
  usage?: StructuredGenerationUsage;
};

export interface StructuredOutputProvider {
  readonly providerId: string;
  readonly capabilities: StructuredOutputCapability;
  generateStructured<T>(request: StructuredGenerationRequest, signal?: AbortSignal): Promise<StructuredGenerationResult<T>>;
}
