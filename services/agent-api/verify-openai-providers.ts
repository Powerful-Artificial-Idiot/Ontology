import { acceptanceFailed, runLiveProviderAcceptance } from "./providerLiveAcceptance";
import { runtimeDataPath } from "../runtimePaths";

const outputPath = runtimeDataPath(process.env, "evaluations/openai-provider-acceptance.json", process.env.MKG_PROVIDER_ACCEPTANCE_PATH);
const artifact = await runLiveProviderAcceptance({ provider: "openai", outputPath });
console.log(JSON.stringify({ ...artifact, outputPath }, null, 2));
if (acceptanceFailed(artifact)) process.exitCode = 1;
