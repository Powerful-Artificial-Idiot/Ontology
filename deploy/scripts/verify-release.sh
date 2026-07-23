#!/usr/bin/env bash
set -euo pipefail

release=""
while (($#)); do
  case "$1" in
    --release) release="${2:?missing release}"; shift 2 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[[ -n "${release}" && -d "${release}" ]] || { printf 'Valid release directory is required\n' >&2; exit 2; }
for path in \
  dist/index.html \
  dist-agent-api/server.mjs \
  dist-agent-api/check-config.mjs \
  packages/demo-data/documents/leak-rate/document-registry.json \
  deploy/systemd/manufacturing-graph-explorer.service \
  deploy/nginx/manufacturing-graph-explorer.conf; do
  [[ -e "${release}/${path}" ]] || { printf 'Missing release artifact: %s\n' "${path}" >&2; exit 1; }
done
bash "${release}/scripts/deployment/check-frontend-secrets.sh" "${release}/dist"
printf 'Release verification: passed\n'
