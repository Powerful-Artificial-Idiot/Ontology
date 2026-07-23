#!/usr/bin/env bash
set -euo pipefail

base="${MKG_RELEASE_BASE:-/opt/manufacturing-graph-explorer}"
repository="${MKG_RELEASE_REPOSITORY:-$PWD}"
commit=""
dry_run=false

while (($#)); do
  case "$1" in
    --commit) commit="${2:?missing commit}"; shift 2 ;;
    --repository) repository="${2:?missing repository}"; shift 2 ;;
    --base) base="${2:?missing base}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

[[ -n "${commit}" ]] || { printf '%s\n' '--commit is required' >&2; exit 2; }
if [[ -n "$(git -C "${repository}" status --porcelain)" ]]; then
  printf 'Deployment repository must be clean\n' >&2
  exit 1
fi
branch="$(git -C "${repository}" symbolic-ref --short -q HEAD || true)"
if [[ -n "${branch}" ]]; then
  if "${dry_run}"; then printf 'DRY RUN: git pull --ff-only\n'; else git -C "${repository}" pull --ff-only; fi
fi
resolved="$(git -C "${repository}" rev-parse --verify "${commit}^{commit}")"
release="${base}/releases/${resolved}"

run() {
  if "${dry_run}"; then printf 'DRY RUN: %q ' "$@"; printf '\n'; else "$@"; fi
}

run mkdir -p "${base}/releases"
if [[ ! -d "${release}" ]]; then
  if "${dry_run}"; then
    printf 'DRY RUN: archive commit %s into %s\n' "${resolved}" "${release}"
  else
    mkdir -p "${release}"
    git -C "${repository}" archive "${resolved}" | tar -x -C "${release}"
  fi
fi
run npm --prefix "${release}" ci --no-audit --no-fund
if "${dry_run}"; then
  printf 'DRY RUN: build frontend in API mode with same-origin /api/agent\n'
else
  VITE_AGENT_MODE=api VITE_AGENT_API_BASE_URL=/api/agent npm --prefix "${release}" run build
fi
run bash "${release}/deploy/scripts/verify-release.sh" --release "${release}"
printf 'Release installed: %s\n' "${resolved}"
