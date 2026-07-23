#!/usr/bin/env bash
set -euo pipefail

service="deploy/systemd/manufacturing-graph-explorer.service"
nginx="deploy/nginx/manufacturing-graph-explorer.conf"
environment="deploy/env/app.env.example"
compose="deploy/neo4j/compose.yml"

grep -Fq 'EnvironmentFile=/etc/manufacturing-graph-explorer/app.env' "${service}"
grep -Fq 'ExecStart=/usr/bin/node /opt/manufacturing-graph-explorer/current/dist-agent-api/server.mjs' "${service}"
grep -Fq 'ReadWritePaths=/var/lib/manufacturing-graph-explorer' "${service}"
grep -Fq 'proxy_buffering off;' "${nginx}"
grep -Fq 'try_files $uri $uri/ /index.html;' "${nginx}"
grep -Fq '127.0.0.1:4175' "${nginx}"
grep -Fq 'MKG_DEEPSEEK_API_KEY=' "${environment}"
grep -Fq 'MKG_AGENT_AUTH_STATIC_TOKEN=' "${environment}"
grep -Fq 'MKG_NEO4J_PASSWORD=' "${environment}"
grep -Fq '127.0.0.1:7687:7687' "${compose}"

if grep -Eq 'MKG_(DEEPSEEK_API_KEY|AGENT_AUTH_STATIC_TOKEN|NEO4J_PASSWORD)=.+' "${environment}"; then
  printf 'Deployment template validation: credential field is not empty\n' >&2
  exit 1
fi

printf 'Deployment template validation: passed\n'
