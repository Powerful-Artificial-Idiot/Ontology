#!/usr/bin/env bash

set -Eeuo pipefail

readonly expected_user="deploy"
readonly branch="${1:-main}"
readonly repo_dir="${REPO_DIR:-/home/deploy/apps/Ontology}"
readonly release_root="${RELEASE_ROOT:-/var/www/ontology}"
readonly releases_dir="${release_root}/releases"
readonly current_link="${release_root}/current"
readonly previous_link="${release_root}/previous"

staging_dir=""
temporary_link=""

cleanup() {
  local exit_code=$?
  if [[ -n "${staging_dir}" && -d "${staging_dir}" ]]; then
    rm -rf "${staging_dir}"
  fi
  if [[ -n "${temporary_link}" && -L "${temporary_link}" ]]; then
    rm -f "${temporary_link}"
  fi
  if [[ ${exit_code} -ne 0 ]]; then
    printf 'Deployment failed before the production link was switched.\n' >&2
  fi
  exit "${exit_code}"
}
trap cleanup EXIT

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$(id -un)" == "${expected_user}" ]] || fail "Run this script as ${expected_user}."
[[ "${branch}" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "Invalid branch name: ${branch}"

for command_name in git node npm find cp mv ln readlink; do
  command -v "${command_name}" >/dev/null || fail "Missing required command: ${command_name}"
done

[[ -d "${repo_dir}/.git" ]] || fail "Repository not found at ${repo_dir}."
[[ -f "${repo_dir}/package-lock.json" ]] || fail "package-lock.json is required for npm ci."
[[ -d "${releases_dir}" ]] || fail "Release directory does not exist: ${releases_dir}"
[[ -w "${releases_dir}" && -w "${release_root}" ]] || fail "${expected_user} must own the release root."

cd "${repo_dir}"
[[ -z "$(git status --porcelain)" ]] || fail "Git worktree is not clean."

current_branch="$(git branch --show-current)"
[[ "${current_branch}" == "${branch}" ]] || fail "Checked out branch ${current_branch}; expected ${branch}."

printf 'Fetching origin/%s...\n' "${branch}"
git fetch --prune origin "${branch}"
git merge --ff-only "origin/${branch}"
[[ -z "$(git status --porcelain)" ]] || fail "Git worktree changed after fast-forward."

commit="$(git rev-parse HEAD)"
short_commit="$(git rev-parse --short=12 HEAD)"
build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
release_id="$(date -u +%Y%m%d%H%M%S)-${short_commit}"
release_dir="${releases_dir}/${release_id}"
[[ ! -e "${release_dir}" ]] || fail "Release already exists: ${release_dir}"

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"
export VITE_KNOWLEDGE_MODE="${VITE_KNOWLEDGE_MODE:-local}"
if [[ "${VITE_KNOWLEDGE_MODE}" == "http" && -z "${VITE_KNOWLEDGE_API_BASE_URL:-}" ]]; then
  fail "VITE_KNOWLEDGE_API_BASE_URL is required in http mode."
fi

printf 'Installing locked dependencies...\n'
npm ci --no-audit --no-fund
printf 'Running lint...\n'
npm run lint
printf 'Running typecheck...\n'
npm run typecheck
printf 'Running tests...\n'
npm run test
printf 'Building production assets...\n'
printf 'Knowledge repository mode: %s\n' "${VITE_KNOWLEDGE_MODE}"
npm run build

[[ -f "${repo_dir}/dist/index.html" ]] || fail "Build did not produce dist/index.html."
[[ -d "${repo_dir}/dist/assets" ]] || fail "Build did not produce dist/assets."

staging_dir="$(mktemp -d "${release_root}/.staging-${release_id}-XXXXXX")"
cp -a "${repo_dir}/dist/." "${staging_dir}/"

cat > "${staging_dir}/.deployment.json" <<EOF
{
  "commit": "${commit}",
  "branch": "${branch}",
  "builtAt": "${build_time}",
  "release": "${release_id}"
}
EOF

find "${staging_dir}" -type d -exec chmod 0755 {} +
find "${staging_dir}" -type f -exec chmod 0644 {} +
[[ -f "${staging_dir}/index.html" ]] || fail "Staged release is incomplete."

mv "${staging_dir}" "${release_dir}"
staging_dir=""

old_release=""
if [[ -L "${current_link}" ]]; then
  old_release="$(readlink -f "${current_link}")"
  [[ -f "${old_release}/index.html" ]] || fail "Current release link is invalid: ${old_release}"
fi

if [[ -n "${old_release}" && "${old_release}" != "${release_dir}" ]]; then
  temporary_link="${release_root}/.previous-${release_id}"
  ln -s "${old_release}" "${temporary_link}"
  mv -Tf "${temporary_link}" "${previous_link}"
  temporary_link=""
fi

temporary_link="${release_root}/.current-${release_id}"
ln -s "${release_dir}" "${temporary_link}"
mv -Tf "${temporary_link}" "${current_link}"
temporary_link=""

printf '\nDeployment complete.\n'
printf 'Commit: %s\n' "${commit}"
printf 'Release: %s\n' "${release_dir}"
printf 'Current: %s\n' "$(readlink -f "${current_link}")"
if [[ -L "${previous_link}" ]]; then
  printf 'Previous: %s\n' "$(readlink -f "${previous_link}")"
  printf 'Rollback: cd %q && rollback_target=$(readlink -f previous) && test -f "$rollback_target/index.html" && ln -s "$rollback_target" .current.rollback && mv -Tf .current.rollback current\n' "${release_root}"
else
  printf 'Previous: none (first deployment)\n'
fi
