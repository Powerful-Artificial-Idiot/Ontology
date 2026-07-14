import type { SemanticCatalogModel } from "../features/semantic/semanticCatalogModel";
import type { OntologyEntity, OntologySourceData } from "../features/ontology/ontologyTypes";
import type { OntologyRouteTarget, SemanticRouteTarget } from "./explorerRouter";

export type DeepLinkResolution<T> =
  | { status: "resolved"; value: T }
  | { status: "invalid"; message: string };

export function resolveOntologyTarget(
  target: OntologyRouteTarget,
  source: OntologySourceData,
): DeepLinkResolution<OntologyEntity> {
  if (target.kind === "class") {
    return source.nodes.some((node) => node.id === target.id)
      ? { status: "resolved", value: { kind: "node", id: target.id } }
      : { status: "invalid", message: `Ontology class “${target.id}” was not found.` };
  }

  const owner = source.nodes.find((node) => node.properties.some((property) => property.id === target.id));
  return owner
    ? { status: "resolved", value: { kind: "property", objectTypeId: owner.id, propertyId: target.id } }
    : { status: "invalid", message: `Ontology property “${target.id}” was not found.` };
}

export function resolveSemanticTarget(
  target: SemanticRouteTarget,
  catalog: SemanticCatalogModel,
): DeepLinkResolution<{ conceptId: string; entityId: string; defaultQuery?: string }> {
  if (target.kind === "scenario") {
    if (target.id !== "machine-impact-analysis") {
      return { status: "invalid", message: `Semantic scenario “${target.id}” was not found.` };
    }
    const bundle = catalog.conceptById.get("leak-rate");
    return bundle
      ? { status: "resolved", value: { conceptId: bundle.id, entityId: bundle.primaryTermId, defaultQuery: "CQ-004" } }
      : { status: "invalid", message: "Semantic scenario “machine-impact-analysis” is missing its leak-rate concept." };
  }

  const entity = catalog.entityById.get(target.id);
  const bundle = entity ? catalog.conceptById.get(entity.conceptId) : undefined;
  return entity && bundle
    ? { status: "resolved", value: { conceptId: bundle.id, entityId: entity.id } }
    : { status: "invalid", message: `Semantic entity “${target.id}” was not found.` };
}
