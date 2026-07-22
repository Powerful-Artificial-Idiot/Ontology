import { OpenAiStructuredOutputClient, type OpenAiStructuredOutputClientOptions } from "./openAiStructuredOutputClient";
import { StructuredAnswerProvider } from "./structuredAnswerProvider";

export type OpenAiResponsesAnswerProviderOptions = OpenAiStructuredOutputClientOptions;

export class OpenAiResponsesAnswerProvider extends StructuredAnswerProvider {
  constructor(options: OpenAiResponsesAnswerProviderOptions) {
    super(new OpenAiStructuredOutputClient(options));
  }
}
