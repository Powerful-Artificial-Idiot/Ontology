import type { ConnectorProfile } from "../../knowledge-contracts/src/index";

export interface SourceSecretResolver {
  resolve(reference: string): Promise<string | undefined>;
}

export class EnvironmentSourceSecretResolver implements SourceSecretResolver {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}
  async resolve(reference: string): Promise<string | undefined> { return this.environment[reference]; }
}

export class SourceAuthenticationError extends Error {
  readonly code: "SOURCE_AUTH_CONFIGURATION_INVALID" | "SOURCE_AUTHENTICATION_FAILED";
  constructor(code: SourceAuthenticationError["code"], message: string) {
    super(message);
    this.name = "SourceAuthenticationError";
    this.code = code;
  }
}

export async function sourceAuthenticationHeaders(profile: ConnectorProfile, resolver: SourceSecretResolver): Promise<Record<string, string>> {
  if (profile.authentication.type === "fixture-none") return {};
  const reference = profile.authentication.secretReference;
  if (!reference) throw new SourceAuthenticationError("SOURCE_AUTH_CONFIGURATION_INVALID", "Static source authentication has no secret reference.");
  const secret = await resolver.resolve(reference);
  if (!secret) throw new SourceAuthenticationError("SOURCE_AUTH_CONFIGURATION_INVALID", "Configured source authentication secret is unavailable.");
  return { Authorization: `Bearer ${secret}` };
}
