import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class AtomicJsonFile<T> {
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly path: string, private readonly validate: (value: unknown) => T, private readonly initial: () => T) {}

  async initialize(): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      return this.validate(JSON.parse(await readFile(this.path, "utf8")) as unknown);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const value = this.initial();
      await this.write(value);
      return value;
    }
  }

  write(value: T): Promise<void> {
    this.queue = this.queue.then(async () => {
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await rename(temporary, this.path);
    });
    return this.queue;
  }
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
