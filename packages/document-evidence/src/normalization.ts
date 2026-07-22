const instructionPatterns: Array<[string, RegExp]> = [
  ["ignore-instructions", /ignore\s+(?:all\s+|any\s+|the\s+|previous\s+)*(?:instructions?|rules?|prompt)/iu],
  ["data-exfiltration", /(?:send|upload|transmit|exfiltrate)\s+(?:all\s+)?(?:data|files?|secrets?|credentials?)/iu],
  ["system-prompt-reference", /system\s+prompt|developer\s+message/iu],
  ["instruction-override", /use\s+this\s+(?:procedure|instruction)\s+instead/iu],
  ["chinese-instruction-override", /忽略.{0,12}(?:指令|规则|提示词)/u],
];

export function normalizeDocumentText(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n");
  const withoutControls = [...normalized].filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return character === "\n" || character === "\t" || (code >= 32 && code !== 127);
  }).join("");
  return withoutControls
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function detectInstructionLikeContent(value: string): string[] {
  return instructionPatterns.filter(([, pattern]) => pattern.test(value)).map(([id]) => id);
}

export function slugifyStableId(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return slug || "section";
}

export function tokenizeForSearch(value: string): string[] {
  return [...new Set(value
    .normalize("NFKC")
    .toLowerCase()
    .match(/[a-z0-9]+(?:[.-][a-z0-9]+)*|[\u3400-\u9fff]{2,}/gu) ?? [])]
    .filter((token) => token.length >= 2);
}
