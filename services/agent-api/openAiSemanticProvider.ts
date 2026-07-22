import { OpenAiStructuredOutputClient, type OpenAiStructuredOutputClientOptions } from "./openAiStructuredOutputClient";
import { StructuredSemanticProvider } from "./structuredSemanticProvider";

export type OpenAiResponsesSemanticProviderOptions = OpenAiStructuredOutputClientOptions;

export class OpenAiResponsesSemanticProvider extends StructuredSemanticProvider {
  constructor(options: OpenAiResponsesSemanticProviderOptions) {
    super(new OpenAiStructuredOutputClient(options));
  }
}
