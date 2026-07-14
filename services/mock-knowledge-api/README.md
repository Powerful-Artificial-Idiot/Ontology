# Mock Knowledge API

A dependency-light Node HTTP service backed by the local `KnowledgeRepository`.

```bash
npm run api:dev
```

The default base URL is `http://127.0.0.1:4174/api`. Set `MKG_API_PORT` or `MKG_API_HOST` to override it.

Endpoints:

- `GET /api/meta`
- `GET /api/entities/:id`
- `GET /api/entities/:id/relations`
- `GET /api/relations?entityId=...`
- `GET /api/graph/views/:viewId`
- `GET /api/ontology/graph`
- `GET /api/semantic/catalog`
- `POST /api/semantic/search`

Errors use the shared `{ error: { code, message, details, traceId } }` envelope and never include local filesystem paths.
