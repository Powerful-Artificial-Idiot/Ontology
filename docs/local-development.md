# Local Development

## Governed Source Synchronization

List and inspect configured demo connectors:

```bash
npm run source-sync:list
npm run source-sync:inspect -- --connector connector.mes.controlled-file
```

Run controlled modes with an explicit connector and mode:

```bash
npm run source-sync:run -- --connector connector.mes.controlled-file --mode dry-run
npm run source-sync:run -- --connector connector.mes.controlled-file --mode snapshot
```

Start the localhost fixture and protected management API in separate terminals with `npm run source-sync:fixture` and `npm run source-sync:api`. HTTP fixture profiles require a runtime `MKG_SOURCE_SECRET_FIXTURE_TOKEN`; do not place it in source files or committed environment files.

Formal local checks are `npm run source-sync:release-gate`. Neo4j publication acceptance additionally requires the local Compose service and `npm run neo4j:publication-test` with the locally configured development credential.

## Prerequisites

- Node.js 20 LTS or 22+.
- npm 10+.
- Python 3.11+.
- GNU Make or compatible macOS Make.

## Install

```bash
make install
```

This installs npm dependencies and creates `.venv` for RDF, SHACL, Schema, and YAML validation.

## Frontend

```bash
make demo-dev
make demo-lint
make demo-test
make demo-build
```

The original commands remain available: `npm run dev`, `npm run build`, and `npm run preview`.

Repository-specific frontend commands:

```bash
make demo-dev-local
make demo-dev-http
```

HTTP mode expects the Mock Knowledge API on port `4174`. Source selection, base URL, timeout, and version policy are centralized in `src/repositories/index.ts`; Explorer pages do not read Vite environment variables.

## Knowledge Assets

```bash
make ontology-validate
make shapes-validate
make mappings-validate
make contracts-validate
make competency-test
make validate
```

## Mock Knowledge API

```bash
make mock-api-dev
make mock-api-test
```

The service defaults to `http://127.0.0.1:4174/api` and runs independently from Vite.

## Full Release

```bash
make build
```

The release under `dist/` contains `frontend-demo/`, `ontology-release/`, `generated/ontology/`, `demo-data/`, `contracts/`, `manifest.json`, and `checksums.txt`.
