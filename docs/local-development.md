# Local Development

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

## Knowledge Assets

```bash
make ontology-validate
make shapes-validate
make mappings-validate
make contracts-validate
make competency-test
make validate
```

## Full Release

```bash
make build
```

The release under `dist/` contains `frontend-demo/`, `ontology-release/`, `demo-data/`, `contracts/`, `manifest.json`, and `checksums.txt`.
