import { DeepSeekChatCompletionsClient, type DeepSeekChatCompletionsClientOptions } from "./deepSeekChatCompletionsClient";
import { StructuredSemanticProvider } from "./structuredSemanticProvider";

export type DeepSeekSemanticProviderOptions = DeepSeekChatCompletionsClientOptions;

export class DeepSeekSemanticProvider extends StructuredSemanticProvider {
  constructor(options: DeepSeekSemanticProviderOptions) {
    super(new DeepSeekChatCompletionsClient(options));
  }
}
