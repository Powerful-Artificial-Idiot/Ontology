# DeepSeek API Key Deployment on Alibaba Cloud ECS

## 1. Scope

This guide configures the server-side path only:

```text
Browser -> Nginx -> Agent API -> DeepSeek API
```

The browser must never call DeepSeek directly or receive `MKG_DEEPSEEK_API_KEY`. The current static Bearer adapter is suitable only for controlled acceptance. Do not place a long-lived token in any `VITE_` variable; enterprise browser authentication remains dependent on the deferred OIDC/JWKS integration.

Release target: `/opt/manufacturing-graph-explorer/current`

Service: `manufacturing-graph-explorer.service`

Protected environment file: `/etc/manufacturing-graph-explorer/app.env`

Runtime state: `/var/lib/manufacturing-graph-explorer`

## 2. Discovered Project Configuration

| Configuration | Actual setting | Default | Production requirement | Consumer | Sensitive | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| Provider | `MKG_LLM_PROVIDER` | `openai` when an LLM mode is selected | Set to `deepseek` | `services/agent-api/runtime.ts` | No | Unknown values fail startup |
| API key | `MKG_DEEPSEEK_API_KEY` | None | Required for DeepSeek LLM modes | `services/agent-api/runtime.ts` | Yes | Missing value fails startup |
| Semantic model | `MKG_DEEPSEEK_MODEL` | `deepseek-v4-flash` | Required by deployment check | Runtime and provider | No | Only v4 flash/pro accepted |
| Answer model | `MKG_DEEPSEEK_ANSWER_MODEL` | Semantic model, then v4 flash | Required by deployment check | Runtime and provider | No | Only v4 flash/pro accepted |
| API root | `MKG_DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Official HTTPS root | Provider client | No | Deployment check restricts to official root |
| Semantic mode | `MKG_AGENT_SEMANTIC_PARSER_MODE` | `deterministic` | `llm` for this deployment | Runtime | No | deterministic/llm/hybrid only |
| Answer mode | `MKG_AGENT_ANSWER_COMPOSER_MODE` | `template` | `llm` for this deployment | Runtime | No | template/llm/hybrid only |
| API host | `MKG_AGENT_API_HOST` | `127.0.0.1` | Keep loopback behind Nginx | `services/agent-api/start.ts` | No | Node listen validation |
| API port | `MKG_AGENT_API_PORT` | `4175` | Set explicitly | Agent API start | No | Numeric listen validation |
| Session store | `MKG_AGENT_STORE_PATH` | `.data/agent-store.json` | Use `/var/lib/...` | FileAgentStore | No | Parent creation and state schema validation |
| Telemetry | `MKG_AGENT_TELEMETRY_PATH` | `.data/agent-telemetry.jsonl` | Use `/var/lib/...` | Redacted JSONL sink | No | Sensitive attribute names are redacted |

The native adapter is `DeepSeekChatCompletionsClient`. It sends `POST https://api.deepseek.com/chat/completions`, uses JSON Object mode, sets `thinking.type` to `disabled`, and reads only final `message.content`. It does not persist prompts, raw responses, `reasoning_content`, Authorization values, or chain-of-thought. Provider errors are reduced to sanitized status/code metadata. There is no successful-provider fallback in `llm` mode.

Actual runtime details:

- Build: `npm ci --no-audit --no-fund` then `npm run build`
- Backend start: `npm run start:agent-api`
- Built entry point: `dist-agent-api/server.mjs`, executed directly by Node
- Host/port: `127.0.0.1:4175`
- Health: `/api/agent/health`, `/api/agent/health/live`, `/api/agent/health/ready`
- Persistent state and telemetry: paths selected by the two variables above

The production build emits a Node 20 SSR bundle for the Agent API and a separate fail-closed configuration checker.

## 3. Build and Runtime Preparation

```bash
cd /home/deploy/manufacturing-graph-explorer
git status --short
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm run test
npm run build
command -v node
command -v npm
readlink -f "$(command -v node)"
readlink -f "$(command -v npm)"
```

Record the absolute `npm` path. The example unit uses `/usr/bin/npm`; change `ExecStart` when the server reports another path. Do not depend on an interactive NVM shell from systemd.

## 4. Protected Environment File

```bash
sudo mkdir -p /etc/manufacturing-graph-explorer
sudo install -o root -g root -m 600 /dev/null \
  /etc/manufacturing-graph-explorer/app.env
sudo vi /etc/manufacturing-graph-explorer/app.env
```

Use [the repository template](../../deploy/env/app.env.example) as the field list, then enter the real DeepSeek key directly on the server. Sensitive fields are intentionally blank in Git. Do not copy the completed file into the repository.

Default ownership:

```bash
sudo stat -c '%U %G %a %n' \
  /etc/manufacturing-graph-explorer/app.env
```

Expected:

```text
root root 600 /etc/manufacturing-graph-explorer/app.env
```

Use `root:deploy 640` only when an approved operating procedure requires direct group access. systemd can read the default root-owned file and inject its values into the `deploy` process.

## 5. Data Directory

The runtime supports independent writable paths, so the hardened unit can keep the repository read-only:

```bash
sudo install -d -o deploy -g deploy -m 700 \
  /var/lib/manufacturing-graph-explorer
```

The environment template points session state and sanitized telemetry into this directory. Governed document registries remain read-only repository assets.

## 6. systemd Service

Inspect and adjust the npm path before installation:

```bash
cd /home/deploy/manufacturing-graph-explorer
grep -n '^ExecStart=' deploy/systemd/manufacturing-graph-explorer.service.example
command -v npm
sudo install -o root -g root -m 644 \
  deploy/systemd/manufacturing-graph-explorer.service.example \
  /etc/systemd/system/manufacturing-graph-explorer.service
sudo vi /etc/systemd/system/manufacturing-graph-explorer.service
```

The unit uses `ProtectSystem=strict`, `ProtectHome=read-only`, and only allows writes to `/var/lib/manufacturing-graph-explorer`. Its working tree and governed documents remain readable. Keep `ExecStartPre` enabled so missing or invalid DeepSeek configuration fails closed.

## 7. Safe Configuration Verification

Do not use `env`, `printenv`, `set`, `export -p`, `/proc/<pid>/environ`, or `systemctl show ... --property=Environment`.

Run the checker from a protected root shell; it reports presence only:

```bash
sudo bash -c '
  set -a
  . /etc/manufacturing-graph-explorer/app.env
  set +a
  exec /home/deploy/manufacturing-graph-explorer/scripts/deployment/check-deepseek-config.sh
'
```

## 8. Start and Restart

```bash
sudo systemctl daemon-reload
sudo systemctl enable manufacturing-graph-explorer
sudo systemctl restart manufacturing-graph-explorer
sudo systemctl status manufacturing-graph-explorer --no-pager
```

Logs:

```bash
sudo journalctl -u manufacturing-graph-explorer -n 100 --no-pager
sudo journalctl -u manufacturing-graph-explorer -f
```

Never use `set -x` or `curl -v` around authenticated requests.

## 9. DeepSeek Connectivity Verification

This script performs bounded TLS, model-list, minimal text, and JSON Object checks. It stores responses only in a mode-0700 temporary directory and deletes them on exit.

```bash
sudo bash -c '
  set -a
  . /etc/manufacturing-graph-explorer/app.env
  set +a
  exec /home/deploy/manufacturing-graph-explorer/scripts/deployment/verify-deepseek-api.sh
'
```

The script never accepts a key argument and prints only safe pass/fail summaries.

## 10. Application-level Verification

Liveness and readiness do not call DeepSeek or consume tokens:

```bash
curl --fail --silent --show-error \
  http://127.0.0.1:4175/api/agent/health/live
curl --fail --silent --show-error \
  http://127.0.0.1:4175/api/agent/health/ready
```

Verify that a protected route rejects an unauthenticated request:

```bash
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  -H 'Content-Type: application/json' \
  --data '{"contractVersion":"1.0.0","scenarioId":"quality-issue-trace","mode":"live","language":"en"}' \
  http://127.0.0.1:4175/api/agent/sessions
```

Expected status: `401`.

For controlled server-side verification, open a root shell without tracing, load the protected file, and create a session using the real route and contract:

```bash
sudo -i
set -a
. /etc/manufacturing-graph-explorer/app.env
set +a
cd /home/deploy/manufacturing-graph-explorer

session_response="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer ${MKG_AGENT_AUTH_STATIC_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"contractVersion":"1.0.0","scenarioId":"quality-issue-trace","mode":"live","language":"en"}' \
  http://127.0.0.1:4175/api/agent/sessions)"
session_id="$(node -e 'const v=JSON.parse(process.argv[1]); process.stdout.write(v.session.id)' "${session_response}")"

run_response="$(curl --fail --silent --show-error \
  -H "Authorization: Bearer ${MKG_AGENT_AUTH_STATIC_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data "{\"contractVersion\":\"1.0.0\",\"requestId\":\"ecs-deepseek-check-$(date +%s)\",\"sessionId\":\"${session_id}\",\"scenarioId\":\"quality-issue-trace\",\"mode\":\"live\",\"language\":\"en\",\"message\":\"Trace the OP30 Leak Rate issue.\"}" \
  "http://127.0.0.1:4175/api/agent/sessions/${session_id}/runs")"
run_id="$(node -e 'const v=JSON.parse(process.argv[1]); process.stdout.write(v.run.id)' "${run_response}")"

curl --no-buffer --fail --silent --show-error \
  -H "Authorization: Bearer ${MKG_AGENT_AUTH_STATIC_TOKEN}" \
  "http://127.0.0.1:4175/api/agent/runs/${run_id}/events"
unset session_response run_response session_id run_id MKG_DEEPSEEK_API_KEY MKG_AGENT_AUTH_STATIC_TOKEN
exit
```

The SSE stream must reach a completed event. Trace and evidence can then be retrieved using the documented `/turns/:turnId/trace` and `/turns/:turnId/evidence` routes.

Run the existing governed provider acceptance to verify both Semantic Parser and Answer Composer, `fallbackUsed: false`, and citation coverage. Keep its sanitized report outside the repository:

```bash
sudo -i
set -a
. /etc/manufacturing-graph-explorer/app.env
set +a
cd /home/deploy/manufacturing-graph-explorer
export MKG_PROVIDER_ACCEPTANCE_PATH=/var/lib/manufacturing-graph-explorer/deepseek-provider-acceptance.json
runuser -u deploy --preserve-environment -- /usr/bin/npm run deepseek:acceptance
unset MKG_DEEPSEEK_API_KEY MKG_AGENT_AUTH_STATIC_TOKEN
exit
```

Replace `/usr/bin/npm` with the audited absolute path.

## 11. Nginx Boundary

Add the following location before generic SPA locations, then validate with `sudo nginx -t`:

```nginx
location /api/agent/ {
    proxy_pass http://127.0.0.1:4175/api/agent/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 90s;
}
```

Nginx must never serve `/etc/manufacturing-graph-explorer`, `/var/lib/manufacturing-graph-explorer`, or repository `.data`. Configure the frontend API base as `/api/agent`; do not embed the DeepSeek key or a long-lived static Bearer token in Vite.

## 12. Frontend Secret Check

The current frontend output directory is `dist`:

```bash
grep -R --binary-files=without-match \
  -E 'MKG_DEEPSEEK_API_KEY|VITE_DEEPSEEK|api\.deepseek\.com/chat/completions|(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}' \
  /home/deploy/manufacturing-graph-explorer/dist
```

No output is expected. The boundary and minimum length prevent ontology identifiers such as `risk-mitigated-by-control` from becoming false positives. This command does not inspect the protected environment file.

## 13. Git Secret Check

```bash
cd /home/deploy/manufacturing-graph-explorer
git status --ignored
git ls-files
git grep -n -E 'MKG_DEEPSEEK_API_KEY=.+|VITE_DEEPSEEK_API_KEY|NEXT_PUBLIC_DEEPSEEK_API_KEY|REACT_APP_DEEPSEEK_API_KEY' -- ':!docs/deployment/deepseek-api-key-alibaba-cloud.md'
git ls-files .data
```

An empty example assignment is valid. Do not print or compare the real key.

## 14. Rotation Procedure

1. Edit `/etc/manufacturing-graph-explorer/app.env` as root and replace only the key value.
2. Restart the service.
3. Verify readiness.
4. Run the bounded DeepSeek verification script.
5. Run the provider acceptance.
6. Review sanitized service logs.
7. Revoke the old key at the provider after the new key passes.

Frontend rebuild is not required.

## 15. Rollback

Restore the previous protected EnvironmentFile from the approved secret-management backup, restart the service, and verify readiness. Do not put current or previous keys in Git. Frontend rollback is not required for key rotation.

## 16. Acceptance Checklist

- [ ] Repository built successfully with locked dependencies
- [ ] Absolute Node/npm paths audited in the unit
- [ ] Environment file is `root:root 600`
- [ ] Runtime directory is `deploy:deploy 700`
- [ ] DeepSeek key exists only in the protected environment file or approved secret manager
- [ ] `ExecStartPre` configuration check passes
- [ ] Service starts as `deploy`
- [ ] Liveness and readiness return sanitized responses
- [ ] Unauthenticated session creation returns 401
- [ ] DeepSeek TLS, authentication, configured models, text, and JSON mode pass
- [ ] Semantic Parser, Answer Composer, and full pipeline pass without fallback
- [ ] Citation validation coverage is 100%
- [ ] SSE reaches completion
- [ ] Frontend bundle contains no DeepSeek secret or endpoint call
- [ ] `.data` and acceptance reports are not tracked
- [ ] Nginx exposes only the Agent API path, not protected files

## 17. Known Production Inputs

The operator must supply or decide the real DeepSeek API key, audited Node/npm binary paths, public domain and TLS certificate, production Neo4j credentials when Neo4j mode is enabled, and a controlled static Bearer value or future enterprise IAM configuration. Never send these values to Codex or commit them to the repository.
