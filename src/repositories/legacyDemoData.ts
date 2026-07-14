// Single compatibility entry point while legacy fixtures are migrated to contract-aligned JSON.
export { graphEdges, stackNodes } from "../data/mockGraph";
export { ontologyActionTypes, ontologyLinkTypes, ontologyObjectTypes } from "../data/ontologyData";
export {
  semanticConceptBundles,
  semanticConceptById,
  semanticEntities,
  semanticEntityById,
  semanticMappingById,
  semanticMappings,
} from "../features/semantic/semanticData";
