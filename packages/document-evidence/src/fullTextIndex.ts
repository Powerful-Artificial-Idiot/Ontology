import { tokenizeForSearch } from "./normalization";
import type { DocumentAccessContext, DocumentRetrievalHit, DocumentRetrievalQuery, GovernedDocumentChunk } from "./types";

export class DeterministicDocumentFullTextIndex {
  private readonly indexed: Array<{ chunk: GovernedDocumentChunk; tokens: Set<string> }>;

  constructor(chunks: GovernedDocumentChunk[]) {
    this.indexed = chunks.map((chunk) => ({ chunk, tokens: new Set(tokenizeForSearch(`${chunk.title}\n${chunk.content}\n${chunk.locator}`)) }));
  }

  search(query: DocumentRetrievalQuery): { hits: DocumentRetrievalHit[]; excludedByAccess: number; excludedByGovernance: number } {
    const limit = boundedInteger(query.limit, 20, 1, 100, "limit");
    const perDocumentLimit = boundedInteger(query.perDocumentLimit, 2, 1, 10, "perDocumentLimit");
    const requestedEntities = new Set(query.linkedEntityIds);
    const requestedTokens = new Set(query.searchTerms.flatMap(tokenizeForSearch));
    const typeFilter = query.documentTypes ? new Set(query.documentTypes) : undefined;
    const sourceFilter = query.sourceSystems ? new Set(query.sourceSystems) : undefined;
    let excludedByAccess = 0;
    let excludedByGovernance = 0;
    const candidates: DocumentRetrievalHit[] = [];

    for (const entry of this.indexed) {
      const { chunk } = entry;
      if (!isGovernedAndEffective(chunk, query.asOf)) {
        excludedByGovernance += 1;
        continue;
      }
      if (!canAccess(chunk, query.access)) {
        excludedByAccess += 1;
        continue;
      }
      if (typeFilter && !typeFilter.has(chunk.documentType)) continue;
      if (sourceFilter && !sourceFilter.has(chunk.sourceSystem)) continue;
      const matchedEntityIds = chunk.linkedEntityIds.filter((id) => requestedEntities.has(id));
      if (requestedEntities.size && !matchedEntityIds.length) continue;
      const matchedTerms = [...requestedTokens].filter((term) => entry.tokens.has(term));
      if (!requestedEntities.size && requestedTokens.size && !matchedTerms.length) continue;
      const score = matchedEntityIds.length * 100 + matchedTerms.length * 10 + Math.max(0, 10 - chunk.ordinal);
      candidates.push({ chunk, score, matchedTerms, matchedEntityIds });
    }

    candidates.sort((a, b) => b.score - a.score || a.chunk.documentId.localeCompare(b.chunk.documentId) || a.chunk.ordinal - b.chunk.ordinal);
    const counts = new Map<string, number>();
    const hits = candidates.filter((candidate) => {
      const count = counts.get(candidate.chunk.documentId) ?? 0;
      if (count >= perDocumentLimit) return false;
      counts.set(candidate.chunk.documentId, count + 1);
      return true;
    }).slice(0, limit);
    return { hits, excludedByAccess, excludedByGovernance };
  }
}

function isGovernedAndEffective(chunk: GovernedDocumentChunk, asOf: string): boolean {
  const timestamp = Date.parse(asOf);
  return chunk.securityStatus === "accepted"
    && chunk.approvalStatus === "approved"
    && chunk.lifecycleStatus === "effective"
    && Date.parse(chunk.effectiveFrom) <= timestamp
    && (!chunk.effectiveTo || timestamp < Date.parse(chunk.effectiveTo));
}

function canAccess(chunk: GovernedDocumentChunk, context: DocumentAccessContext): boolean {
  if (chunk.access.classification === "public") return true;
  if (context.roleIds.includes("agent-admin")) return true;
  const roleAllowed = chunk.access.allowedRoleIds.length === 0 || chunk.access.allowedRoleIds.some((role) => context.roleIds.includes(role));
  const allowedDomains = new Set(context.domainIds.map(normalizeDomain));
  const domainAllowed = chunk.access.allowedDomainIds.length === 0 || chunk.access.allowedDomainIds.some((domain) => allowedDomains.has(normalizeDomain(domain)));
  const objectAllowed = !context.objectIds?.length
    || context.objectIds.includes("*")
    || chunk.linkedEntityIds.every((entityId) => context.objectIds!.includes(entityId));
  return roleAllowed && domainAllowed && objectAllowed;
}

function normalizeDomain(domainId: string): string {
  if (domainId === "production" || domainId === "manufacturing") return "manufacturing";
  if (domainId === "valueStream" || domainId === "valuestream") return "value-stream";
  return domainId;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error(`Document retrieval ${name} must be an integer from ${minimum} to ${maximum}.`);
  return result;
}
