import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export function runtimeDataDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  return resolve(environment.MKG_DATA_DIR ?? ".data");
}

export function runtimeDataPath(
  environment: NodeJS.ProcessEnv,
  relativePath: string,
  explicitPath?: string,
): string {
  return resolve(explicitPath ?? runtimeDataDirectory(environment), explicitPath ? "" : relativePath);
}

export function validateProductionDataDirectory(environment: NodeJS.ProcessEnv, workingDirectory = process.cwd()): string {
  const directory = runtimeDataDirectory(environment);
  if (environment.NODE_ENV !== "production") return directory;
  if (!environment.MKG_DATA_DIR?.trim()) {
    throw new Error("MKG_DATA_DIR is required when NODE_ENV=production.");
  }
  if (!isAbsolute(environment.MKG_DATA_DIR)) {
    throw new Error("MKG_DATA_DIR must be an absolute path when NODE_ENV=production.");
  }
  const relationship = relative(resolve(workingDirectory), directory);
  if (!relationship.startsWith("..") && !isAbsolute(relationship)) {
    throw new Error("MKG_DATA_DIR must be outside the repository working directory in production.");
  }
  return directory;
}

export async function ensureWritableDataDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await access(directory, constants.R_OK | constants.W_OK);
  const probe = resolve(directory, `.write-probe-${randomUUID()}`);
  try {
    await writeFile(probe, "", { flag: "wx", mode: 0o600 });
  } finally {
    await unlink(probe).catch(() => undefined);
  }
}
