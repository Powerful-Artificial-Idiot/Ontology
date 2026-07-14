# Production Deployment

## Architecture

The production Demo is a static React/Vite single-page application. Node.js is used only by the `deploy` user during validation and build; no Node process listens in production. Nginx serves the immutable release selected by the `current` symlink.

```text
GitHub (read-only Deploy Key)
  -> /home/deploy/apps/Ontology
  -> npm ci + lint + typecheck + test + build
  -> /var/www/ontology/releases/<timestamp>-<commit>
  -> /var/www/ontology/current
  -> Nginx :80
```

## Production Host Baseline

- OS: Alibaba Cloud Linux 4 or another supported systemd Linux distribution.
- Runtime user: `deploy` for Git, npm, tests, builds, and release files.
- Node.js: 22.x; npm: 10.x.
- Nginx: 1.30.x or a supported distribution package.
- Git: 2.47.x or a supported distribution package.
- Repository: `/home/deploy/apps/Ontology`.
- Release root: `/var/www/ontology`.
- Nginx site: `/etc/nginx/conf.d/ontology.conf`.
- Public port: TCP 80. There is no internal application port or Node service.

## One-Time Administrator Setup

Install only the required distribution packages. Use the host package manager and review candidate versions before installation.

```bash
sudo dnf install -y git nginx nodejs nodejs-npm
sudo install -d -o root -g root -m 0755 /var/www
sudo install -d -o deploy -g deploy -m 0755 /var/www/ontology
sudo install -d -o deploy -g deploy -m 0755 /var/www/ontology/releases
```

Install the reviewed Nginx site without changing the packaged default server:

```bash
sudo install -o root -g root -m 0644 \
  /home/deploy/apps/Ontology/deploy/nginx/ontology.conf \
  /etc/nginx/conf.d/ontology.conf
sudo nginx -t
sudo systemctl enable --now nginx
```

The Nginx worker needs read and traverse access to `/var/www/ontology/current`; it does not need write access to the repository or release files.

## GitHub Read Access

Use a repository-scoped, read-only GitHub Deploy Key owned by `deploy`. Do not enable write access and do not store private keys in the repository.

Before adding GitHub to `known_hosts`, compare the scanned ED25519 fingerprint with GitHub's published fingerprint. Configure the repository key in `~deploy/.ssh/config` with `IdentitiesOnly yes`, then verify:

```bash
ssh -T git@github.com
```

GitHub returns exit code `1` after a successful authentication message because it does not provide shell access.

## Initial Clone

```bash
install -d -m 0755 /home/deploy/apps
git clone --branch main --single-branch \
  git@github.com:Powerful-Artificial-Idiot/Ontology.git \
  /home/deploy/apps/Ontology
cd /home/deploy/apps/Ontology
git status
```

Do not reset or overwrite a dirty repository. Resolve or preserve local changes before deployment.

## Standard Deployment

Run as `deploy`:

```bash
cd /home/deploy/apps/Ontology
./scripts/deploy-production.sh main
```

The script:

1. Requires the `deploy` user and checks Git, Node.js, npm, and the lockfile.
2. Refuses a dirty Git worktree.
3. Fetches and fast-forwards only from `origin/<branch>`.
4. Runs `npm ci`, lint, typecheck, all tests, and the Vite build.
5. Validates `dist/index.html` before creating a release.
6. Copies the build to a timestamped staging directory.
7. Records commit and build time in `.deployment.json`.
8. Atomically moves staging into `releases/` and switches `current`.
9. Preserves the former `current` target as `previous`.

Build or test failure leaves the current production release unchanged. Releases are not automatically deleted; keep at least the current and previous known-good versions.

The current repository is a contract-backed Demo and defaults to `VITE_KNOWLEDGE_MODE=local`, which bundles `MockKnowledgeRepository` data into the static application. This is intentional for the present Demo deployment. A future Pilot HTTP API must set `VITE_KNOWLEDGE_MODE=http` and provide `VITE_KNOWLEDGE_API_BASE_URL` at build time.

## Service Management

There is no application systemd service. Nginx is the only production service.

```bash
sudo systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl is-enabled nginx
sudo nginx -t
sudo journalctl -u nginx --since "30 minutes ago"
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

Static release changes do not require an Nginx reload because its root remains `/var/www/ontology/current`.

## Health Checks

```bash
readlink -f /var/www/ontology/current
curl -fsSI -H 'Host: 139.196.109.86' http://127.0.0.1/
curl -fsSI -H 'Host: 139.196.109.86' http://127.0.0.1/routes/quality
curl -fsSI -H 'Host: 139.196.109.86' http://127.0.0.1/ontology/classes/Operation
curl -fsSI -H 'Host: 139.196.109.86' http://127.0.0.1/assets/<hashed-file>.js
```

Expected behavior:

- `/`, Route, Ontology, and Semantic deep links return `200` and the SPA entry document.
- Hashed JavaScript and CSS return their correct MIME types with long cache headers.
- `index.html` uses no-cache headers.
- Dotfiles, `.env`, `.git`, and source maps are not served.

## Rollback

Inspect both links before rollback:

```bash
readlink -f /var/www/ontology/current
readlink -f /var/www/ontology/previous
```

As `deploy`, atomically switch `current` to the previous release:

```bash
cd /var/www/ontology
rollback_target=$(readlink -f previous)
test -f "$rollback_target/index.html"
ln -s "$rollback_target" .current.rollback
mv -Tf .current.rollback current
```

Then verify without restarting the server:

```bash
sudo nginx -t
curl -fsSI -H 'Host: 139.196.109.86' http://127.0.0.1/
```

## Domain and HTTPS

The initial deployment uses `http://139.196.109.86`. For a domain:

1. Complete required DNS and ICP filing/备案 for the deployment region.
2. Point the domain A record to the ECS public IP.
3. Replace or add the domain in `server_name` without removing the verified IP entry until cutover.
4. Obtain a valid certificate after DNS ownership is confirmed.
5. Add an HTTPS server block and redirect HTTP only after `nginx -t` passes.

Do not create placeholder certificates or expose HTTPS before a valid domain and certificate exist.

## Alibaba Cloud Security Group

Required inbound rules:

- TCP 22 from approved administration source ranges only.
- TCP 80 from intended users for the initial HTTP deployment.
- TCP 443 only after HTTPS is configured.

Security-group changes are made in the Alibaba Cloud console, not by this repository or deployment script.

## Troubleshooting

- **Git authentication:** run `ssh -T git@github.com`; verify the repository Deploy Key and GitHub host fingerprint.
- **Dirty worktree:** inspect `git status`; do not use `git reset --hard` to bypass the deployment guard.
- **npm failure:** confirm Node/npm versions, disk/memory, registry access, and the first real npm error.
- **Test failure:** do not publish; run the failing test directly and classify code versus environment errors.
- **Nginx syntax:** run `sudo nginx -t` before every reload or restart.
- **403:** inspect parent-directory execute permissions, release ownership, and `/var/log/nginx/error.log`.
- **Deep-link 404:** confirm `try_files $uri $uri/ /index.html` is present in the active server block.
- **Wrong site:** send the expected Host header and inspect all Nginx `listen` and `server_name` directives.
- **Public timeout:** verify Nginx locally first, then check the Alibaba Cloud TCP 80 security-group rule.
