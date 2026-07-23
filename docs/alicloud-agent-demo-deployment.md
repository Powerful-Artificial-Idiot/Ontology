# Alibaba Cloud Agent Demo Deployment

## Scope

This is a single-node controlled Agent demonstration:

```text
Browser -> existing HTTPS Nginx -> React build -> same-origin /api
        -> localhost Agent API -> DeepSeek + localhost Neo4j
        -> governed documents -> citation and authorization gates
```

The source-system layer uses controlled MES/QMS/PLM extracts. Enterprise live
integration is pending. The deployment does not claim enterprise IAM, OIDC,
JWKS, high availability, CDC, Kafka, source writeback, or distributed
transactions.

## Layout

| Purpose | Path |
| --- | --- |
| Releases | `/opt/manufacturing-graph-explorer/releases/<commit>` |
| Active release | `/opt/manufacturing-graph-explorer/current` |
| Previous release | `/opt/manufacturing-graph-explorer/previous` |
| Runtime state | `/var/lib/manufacturing-graph-explorer` |
| Protected configuration | `/etc/manufacturing-graph-explorer/app.env` |
| Service | `manufacturing-graph-explorer.service` |
| API | `127.0.0.1:4175` |
| Neo4j | `127.0.0.1:7474`, `127.0.0.1:7687` |

The runtime directories are outside Git. The release tree is read-only under
systemd; session, run, audit, telemetry, source-sync, checkpoint, quarantine,
lineage, and report artifacts resolve below `MKG_DATA_DIR`.

## Preconditions

- Linux host with the `deploy` user.
- Node.js 20 or newer and npm available at stable system paths.
- Docker Engine and Docker Compose.
- Existing Nginx HTTPS site remains active.
- Deployment candidate tag has been pushed.

Do not use an NVM-only interactive-shell Node path from systemd.

## Install Candidate

Fetch the candidate in a clean deployment checkout and install by immutable
commit:

```bash
git fetch --all --tags
git checkout --detach alicloud-agent-demo-rc1
commit="$(git rev-parse HEAD)"
deploy/scripts/install-release.sh --repository "$PWD" --commit "$commit"
```

The installer rejects uncommitted source changes, creates a commit-addressed
release, runs `npm ci`, builds both artifacts, and verifies the frontend and
governed document assets. Use `--dry-run` to inspect operations.

Do not switch `current` or Nginx until backend acceptance passes.

## Protected Configuration

Create the file but let the operator enter secrets:

```bash
sudo install -d -o root -g root -m 700 /etc/manufacturing-graph-explorer
sudo install -o root -g root -m 600 /dev/null \
  /etc/manufacturing-graph-explorer/app.env
sudoedit /etc/manufacturing-graph-explorer/app.env
```

Use `deploy/env/app.env.example` as the field list. Never copy the completed
file into Git, display its content, or place the DeepSeek key, Neo4j password,
or controlled demo bearer token in a `VITE_` variable.

The static bearer adapter is only for controlled demonstration access. The
browser receives the token at runtime, keeps it in tab-scoped
`sessionStorage`, and sends it only to the same-origin API. Enterprise
OIDC/JWKS, revocation, and group mapping remain pending.

## Neo4j

The production template binds both Neo4j ports to loopback. Load the protected
environment from a non-tracing root shell before using the compose template,
then run `npm run neo4j:seed` and `npm run neo4j:verify`.

Do not start Neo4j before the operator has configured a non-default password.
Verify exposure with `sudo ss -lntp`; ports 7474 and 7687 must not bind a
public address.

## systemd

Install the unit without starting it:

```bash
sudo install -o root -g root -m 644 \
  /opt/manufacturing-graph-explorer/current/deploy/systemd/manufacturing-graph-explorer.service \
  /etc/systemd/system/manufacturing-graph-explorer.service
sudo systemctl daemon-reload
```

The unit starts the built Node artifact directly, runs a fail-closed config
check first, writes only to `/var/lib/manufacturing-graph-explorer`, and exits
cleanly on SIGTERM.

After secrets and Neo4j are ready, enable and restart the service.

## Health and Authorization

Liveness performs no provider or database call:

```bash
curl --fail http://127.0.0.1:4175/api/agent/health/live
curl --fail http://127.0.0.1:4175/api/agent/health/ready
```

Readiness returns only booleans. It verifies startup configuration, the data
directory, authorization, Neo4j connectivity, governed documents, and runtime
packages. It does not generate a DeepSeek answer.

Acceptance must prove unauthenticated denial, valid controlled access,
tenant/domain denial, DeepSeek and Neo4j execution for the three governed
scenarios, citation coverage, SSE replay, and restart persistence. Never use
`curl -v` with an Authorization header.

## Nginx and SSE

`deploy/nginx/manufacturing-graph-explorer.conf` is a disabled loopback
candidate for static review. Before cutover, merge its locations into the
existing HTTPS server without replacing certificate directives:

- `/` serves `current/dist` with SPA fallback;
- `/api/` proxies to `127.0.0.1:4175`;
- `/api/agent/runs/<runId>/events` disables buffering and caching;
- environment, Git, runtime data, controlled extracts, and governed source
  document paths are denied.

Run `sudo nginx -t`. Only after backend acceptance succeeds may Nginx be
reloaded.

## Switch and Rollback

After backend acceptance:

```bash
deploy/scripts/switch-release.sh --commit "<candidate-commit>"
```

This atomically updates `current` and preserves `previous`. If public
validation fails, restore the previous Nginx configuration, run
`deploy/scripts/rollback-release.sh`, test Nginx, and reload it. The failed
release remains available for sanitized diagnosis.

## Security Limitations

Pending enterprise work includes OIDC/JWKS, token revocation, enterprise group
mapping, centralized SIEM, real MES/PLM/QMS endpoints and OAuth, CDC, Kafka,
distributed transactions, bidirectional writeback, multi-instance
persistence, high availability, and disaster recovery.
