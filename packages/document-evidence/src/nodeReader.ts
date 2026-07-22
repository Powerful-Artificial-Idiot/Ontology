import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { DocumentContentReader } from "./types";

export class DirectoryDocumentContentReader implements DocumentContentReader {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  async read(relativePath: string): Promise<string> {
    if (!relativePath || isAbsolute(relativePath)) throw new Error("Document content path must be relative to the controlled document root.");
    const absolutePath = resolve(this.root, relativePath);
    if (!absolutePath.startsWith(`${this.root}${sep}`)) throw new Error("Document content path escapes the controlled document root.");
    return readFile(absolutePath, "utf8");
  }
}
