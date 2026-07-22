import type { DocumentParser, ParsedDocumentSection } from "./types";
import { normalizeDocumentText } from "./normalization";

export class ControlledJsonDocumentParser implements DocumentParser {
  readonly parserId = "controlled-json";
  readonly parserVersion = "1.0.0";

  parse(content: string): ParsedDocumentSection[] {
    let payload: unknown;
    try {
      payload = JSON.parse(content) as unknown;
    } catch {
      throw new Error("Controlled document is not valid JSON.");
    }
    if (!isRecord(payload) || payload.schemaVersion !== "1.0.0" || !Array.isArray(payload.sections)) {
      throw new Error("Controlled document must use schemaVersion 1.0.0 and contain sections.");
    }
    assertOnlyKeys(payload, ["schemaVersion", "sections"]);
    if (payload.sections.length === 0 || payload.sections.length > 100) throw new Error("Controlled document must contain 1 to 100 sections.");
    return payload.sections.map((section, index) => {
      if (!isRecord(section)) throw new Error(`Controlled document section ${index} must be an object.`);
      assertOnlyKeys(section, ["locator", "heading", "text"]);
      const locator = requiredText(section.locator, `sections[${index}].locator`, 300);
      const heading = requiredText(section.heading, `sections[${index}].heading`, 300);
      const text = normalizeDocumentText(requiredText(section.text, `sections[${index}].text`, 20_000));
      if (!text) throw new Error(`Controlled document section ${index} is empty after normalization.`);
      return { locator, heading, text };
    });
  }
}

function requiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${name} must contain 1 to ${maxLength} characters.`);
  return value.trim();
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`Controlled document contains undeclared fields: ${unexpected.join(", ")}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
