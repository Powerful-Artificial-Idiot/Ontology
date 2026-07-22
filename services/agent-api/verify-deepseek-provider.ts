import { resolve } from "node:path";
import { acceptanceFailed, runLiveProviderAcceptance } from "./providerLiveAcceptance";

const outputPath = resolve(process.env.MKG_PROVIDER_ACCEPTANCE_PATH ?? ".data/evaluations/deepseek-provider-acceptance.json");
const artifact = await runLiveProviderAcceptance({ provider: "deepseek", outputPath });
console.log(JSON.stringify({ ...artifact, outputPath }, null, 2));
if (acceptanceFailed(artifact)) process.exitCode = 1;
