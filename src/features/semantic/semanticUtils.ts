import { semanticConceptBundles, semanticEntities, semanticEntityById } from "./semanticData";
import type { SemanticConceptBundle, SemanticEntity, SemanticLaneId, SemanticSearchMatch } from "./semanticTypes";

export const semanticLaneDefinitions: Array<{ id: SemanticLaneId; label: string; description: string }> = [
  { id: "business", label: "Business Language", description: "Terms, aliases and metrics" },
  { id: "ontology", label: "Ontology Mapping", description: "Objects, properties and relations" },
  { id: "system", label: "System Field", description: "Authoritative data fields" },
  { id: "evidence", label: "Source Evidence", description: "Approved records and documents" },
  { id: "ai", label: "AI Context", description: "Resolved agent-ready context" },
];

export function getSemanticLaneId(entity: SemanticEntity): SemanticLaneId {
  if (["businessTerm", "synonym", "metric"].includes(entity.type)) return "business";
  if (["ontologyObject", "ontologyProperty", "ontologyRelationship"].includes(entity.type)) return "ontology";
  if (entity.type === "systemField") return "system";
  if (["sourceEvidence", "governance"].includes(entity.type)) return "evidence";
  return "ai";
}

export function getBundleEntities(bundle: SemanticConceptBundle) {
  return bundle.entityIds.map((id) => semanticEntityById.get(id)).filter((entity): entity is SemanticEntity => Boolean(entity));
}

export function searchSemanticCatalog(keyword: string): SemanticSearchMatch[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];
  const matches: SemanticSearchMatch[] = [];
  const seen = new Set<string>();

  semanticEntities.forEach((entity) => {
    const bundle = semanticConceptBundles.find((item) => item.id === entity.conceptId);
    if (!bundle) return;
    const searchableValues = [entity.label, entity.description, ...(entity.aliases ?? []), ...(entity.examples ?? []), ...(entity.sourceSystems ?? []), ...(entity.sourceDocuments ?? []), ...Object.values(entity.attributes ?? {})];
    const entityMatches = query.length <= 2
      ? [entity.label, ...(entity.aliases ?? [])].some((value) => {
          const normalized = normalizeShortTerm(value);
          return normalized === normalizeShortTerm(query) || normalized.startsWith(normalizeShortTerm(query));
        })
      : searchableValues.join(" ").toLowerCase().includes(query);
    if (!entityMatches) return;
    seen.add(entity.id);
    matches.push({
      entity,
      concept: bundle,
      group: getSearchGroup(entity),
      ambiguity: query === "ct" && ["cycle-time", "ctq"].includes(bundle.id)
        ? "CT can refer to Cycle Time and may be confused with CTQ. Use domain context to disambiguate."
        : undefined,
    });
  });

  if (query.length > 2) semanticConceptBundles.forEach((bundle) => {
    const contextText = [bundle.aiContext.resolvedMeaning, bundle.aiContext.promptContext, ...(bundle.aiContext.ambiguityNotes ?? []), ...bundle.aiContext.relevantObjects, ...bundle.aiContext.availableActions].join(" ").toLowerCase();
    const aiEntity = semanticEntityById.get(`${bundle.id}-ai-context`);
    if (!contextText.includes(query) || !aiEntity || seen.has(aiEntity.id)) return;
    matches.push({ entity: aiEntity, concept: bundle, group: "AI Context" });
  });

  return matches.sort((a, b) => searchGroupOrder.indexOf(a.group) - searchGroupOrder.indexOf(b.group) || a.entity.label.localeCompare(b.entity.label));
}

export const searchGroupOrder: SemanticSearchMatch["group"][] = ["Business Terms", "Synonyms", "Metrics", "System Fields", "Evidence Documents", "AI Context"];

function getSearchGroup(entity: SemanticEntity): SemanticSearchMatch["group"] {
  if (entity.type === "synonym") return "Synonyms";
  if (entity.type === "metric") return "Metrics";
  if (entity.type === "systemField") return "System Fields";
  if (entity.type === "sourceEvidence") return "Evidence Documents";
  if (entity.type === "aiContext") return "AI Context";
  return "Business Terms";
}

function normalizeShortTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
