import { DeepSeekChatCompletionsClient, type DeepSeekChatCompletionsClientOptions } from "./deepSeekChatCompletionsClient";
import { StructuredAnswerProvider } from "./structuredAnswerProvider";

export type DeepSeekAnswerProviderOptions = DeepSeekChatCompletionsClientOptions;

export class DeepSeekAnswerProvider extends StructuredAnswerProvider {
  constructor(options: DeepSeekAnswerProviderOptions) {
    super(new DeepSeekChatCompletionsClient(options));
  }
}
