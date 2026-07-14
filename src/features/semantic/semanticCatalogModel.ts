import type { SemanticCatalogResponse, SemanticSearchResponse } from "../../../packages/knowledge-contracts/src/index";
import type {
  SemanticConceptBundle,
  SemanticDomain,
  SemanticEntity,
  SemanticMapping,
  SemanticSearchMatch,
} from "./semanticTypes";
import { getSearchGroup } from "./semanticUtils";

export type SemanticCatalogModel = {
  metadata: SemanticCatalogResponse["metadata"];
  lanes: SemanticCatalogResponse["lanes"];
  bundles: SemanticConceptBundle[];
  entities: SemanticEntity[];
  mappings: SemanticMapping[];
  conceptById: Map<string, SemanticConceptBundle>;
  entityById: Map<string, SemanticEntity>;
  mappingById: Map<string, SemanticMapping>;
  domainLabels: Record<SemanticDomain, string>;
};

export function createSemanticCatalogModel(response: SemanticCatalogResponse): SemanticCatalogModel {
  const bundles = response.concepts as SemanticConceptBundle[];
  const entities = response.entities as SemanticEntity[];
  const mappings = response.mappings as SemanticMapping[];
  return {
    metadata: response.metadata,
    lanes: response.lanes,
    bundles,
    entities,
    mappings,
    conceptById: new Map(bundles.map((bundle) => [bundle.id, bundle])),
    entityById: new Map(entities.map((entity) => [entity.id, entity])),
    mappingById: new Map(mappings.map((mapping) => [mapping.id, mapping])),
    domainLabels: {
      production: "Production",
      quality: "Quality",
      engineering: "Engineering",
      valueStream: "Value Stream",
      governance: "Governance",
    },
  };
}

export function createSemanticSearchMatches(response: SemanticSearchResponse, catalog: SemanticCatalogModel): SemanticSearchMatch[] {
  return response.results.flatMap((result) => {
    const entity = catalog.entityById.get(result.entity.id);
    const concept = result.matchedConcepts.map((id) => catalog.conceptById.get(id)).find(Boolean);
    if (!entity || !concept) return [];
    return [{
      entity,
      concept,
      group: getSearchGroup(entity),
      ambiguity: result.explanation?.includes("confused") ? result.explanation : undefined,
    }];
  });
}
