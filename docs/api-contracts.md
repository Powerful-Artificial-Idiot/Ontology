# Knowledge API Contracts

Contract version: `1.0.0`. Formal TypeScript and JSON Schema definitions live in `packages/knowledge-contracts`.

## Common Metadata

Every response includes `contractVersion`, `ontologyVersion`, `dataVersion`, `traceId`, and `generatedAt`. Clients must log the trace ID and reject incompatible major contract versions.

## Endpoints

### `GET /api/entities/:id`

Returns one `KnowledgeEntity`, or `404` when the ID is unknown. Optional query parameter: `asOf` ISO timestamp.

### `GET /api/entities/:id/relations`

Returns inbound and outbound `KnowledgeRelation` records. Parameters: `direction`, `predicate`, `asOf`, `cursor`, `limit`.

### `GET /api/graph/views/:viewId`

`viewId` is `production`, `quality`, `engineering`, or `valueStream`. Parameters: `rootEntityId`, `depth`, `asOf`, `ontologyVersion`, `cursor`, `limit`. Returns entities, relations, Graph View Model nodes, and edges.

### `GET /api/ontology/classes`

Returns released ontology classes. Parameters: `module`, `version`, `status`, `cursor`, `limit`.

### `GET /api/ontology/properties`

Returns object and datatype properties. Parameters: `domain`, `range`, `module`, `version`, `cursor`, `limit`.

### `GET /api/ontology/graph`

Returns `OntologyGraphResponse`. Parameters: `domain`, `version`.

### `POST /api/semantic/search`

Request fields: `query`, optional `domain`, `limit`, and `asOf`. Returns ranked `SemanticSearchResult` values with matched concepts, relations, explanation, and evidence.

## Error Response

```json
{
  "error": {
    "code": "ONTOLOGY_VERSION_UNAVAILABLE",
    "message": "Requested ontology version is not available.",
    "details": {},
    "traceId": "01J..."
  }
}
```

Use `400` for invalid requests, `404` for unknown resources, `409` for incompatible versions, `422` for semantic or contract validation failures, `429` for throttling, and `500` for unexpected failures.

## Pagination and Time

Collection endpoints use opaque cursor pagination with a server-capped `limit`. `asOf` filters business validity; `recordedBefore` may filter system recording time. The API must not infer either value from Git history.

## Replacing Mock Data

The frontend currently instantiates `MockKnowledgeRepository`. Production configuration will instantiate `HttpKnowledgeRepository` with the API base URL. Page components remain unchanged; loading, error, authorization, and retry states must be added before pilot deployment.
