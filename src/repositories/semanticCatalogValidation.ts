import type {
  ContractMetadata,
  SemanticCatalogResponse,
  SemanticSearchResponse,
} from "../../packages/knowledge-contracts/src/index";

export const supportedKnowledgeVersions = {
  contractMajor: 1,
  ontologyVersion: "1.1.0",
  dataVersion: "0.5.0",
} as const;

const semanticDomains = new Set(["production", "quality", "engineering", "valueStream", "governance"]);
const semanticTypes = new Set(["businessTerm", "synonym", "metric", "ontologyObject", "ontologyProperty", "ontologyRelationship", "systemField", "sourceEvidence", "aiContext", "governance"]);
const laneIds = new Set(["business", "ontology", "system", "evidence", "ai"]);

export class KnowledgePayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgePayloadError";
  }
}

export function assertCompatibleMetadata(metadata: ContractMetadata): void {
  const contractMajor = Number(metadata.contractVersion.split(".")[0]);
  if (!Number.isInteger(contractMajor) || contractMajor !== supportedKnowledgeVersions.contractMajor) {
    throw new KnowledgePayloadError(`Unsupported knowledge contract version ${metadata.contractVersion}.`);
  }
  if (metadata.ontologyVersion !== supportedKnowledgeVersions.ontologyVersion) {
    throw new KnowledgePayloadError(`Ontology version mismatch: expected ${supportedKnowledgeVersions.ontologyVersion}, received ${metadata.ontologyVersion}.`);
  }
  if (metadata.dataVersion !== supportedKnowledgeVersions.dataVersion) {
    throw new KnowledgePayloadError(`Dataset version mismatch: expected ${supportedKnowledgeVersions.dataVersion}, received ${metadata.dataVersion}.`);
  }
}

export function assertSemanticCatalogResponse(payload: unknown): asserts payload is SemanticCatalogResponse {
  if (!isRecord(payload) || !isRecord(payload.metadata)) {
    throw new KnowledgePayloadError("Semantic catalog payload is missing metadata.");
  }
  const metadata = payload.metadata;
  for (const key of ["contractVersion", "ontologyVersion", "dataVersion", "traceId", "generatedAt"] as const) {
    if (typeof metadata[key] !== "string") throw new KnowledgePayloadError(`Semantic catalog metadata is missing ${key}.`);
  }
  assertCompatibleMetadata(metadata as ContractMetadata);
  const { lanes, concepts, entities, mappings } = payload;
  if (!Array.isArray(lanes) || !Array.isArray(concepts) || !Array.isArray(entities) || !Array.isArray(mappings)) {
    throw new KnowledgePayloadError("Semantic catalog payload is missing lanes, concepts, entities, or mappings.");
  }
  if (!lanes.every((lane) => isRecord(lane) && typeof lane.id === "string" && laneIds.has(lane.id) && strings(lane, ["label", "description"]))
    || !concepts.every(isConcept)
    || !entities.every(isEntity)
    || !mappings.every(isMapping)) {
    throw new KnowledgePayloadError("Semantic catalog payload contains an invalid concept, entity, or mapping.");
  }
  const typedConcepts = concepts as SemanticCatalogResponse["concepts"];
  const typedEntities = entities as SemanticCatalogResponse["entities"];
  const typedMappings = mappings as SemanticCatalogResponse["mappings"];
  const entityIds = new Set(typedEntities.map((entity) => entity.id));
  const mappingIds = new Set(typedMappings.map((mapping) => mapping.id));
  for (const concept of typedConcepts) {
    if (!entityIds.has(concept.primaryTermId) || concept.entityIds.some((id) => !entityIds.has(id)) || concept.mappingIds.some((id) => !mappingIds.has(id))) {
      throw new KnowledgePayloadError(`Semantic concept ${concept.id} references a missing entity or mapping.`);
    }
  }
}

export function assertSemanticSearchResponse(payload: unknown): asserts payload is SemanticSearchResponse {
  if (!isRecord(payload) || !isRecord(payload.metadata) || !Array.isArray(payload.results) || typeof payload.total !== "number") {
    throw new KnowledgePayloadError("Semantic search payload is invalid.");
  }
  assertCompatibleMetadata(payload.metadata as ContractMetadata);
  if (payload.total !== payload.results.length) throw new KnowledgePayloadError("Semantic search total does not match the result count.");
}

function isConcept(value: unknown): value is SemanticCatalogResponse["concepts"][number] {
  return isRecord(value)
    && strings(value, ["id", "primaryTermId", "title", "domain", "summary"])
    && semanticDomains.has(value.domain as string)
    && Array.isArray(value.entityIds)
    && Array.isArray(value.mappingIds)
    && isRecord(value.aiContext)
    && strings(value.aiContext, ["resolvedMeaning", "promptContext", "evidenceCoverage"])
    && Array.isArray(value.aiContext.relevantObjects)
    && Array.isArray(value.aiContext.availableActions);
}

function isEntity(value: unknown): value is SemanticCatalogResponse["entities"][number] {
  return isRecord(value)
    && strings(value, ["id", "conceptId", "label", "type", "domain", "description"])
    && semanticDomains.has(value.domain as string)
    && semanticTypes.has(value.type as string);
}

function isMapping(value: unknown): value is SemanticCatalogResponse["mappings"][number] {
  return isRecord(value) && strings(value, ["id", "conceptId", "sourceId", "targetId", "relation", "label", "description"]);
}

function strings(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => typeof value[key] === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
