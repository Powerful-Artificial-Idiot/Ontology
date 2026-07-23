#!/usr/bin/env bash
set -euo pipefail

base="${MKG_RELEASE_BASE:-/opt/manufacturing-graph-explorer}"
commit=""
dry_run=false
while (($#)); do
  case "$1" in
    --commit) commit="${2:?missing commit}"; shift 2 ;;
    --base) base="${2:?missing base}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

target="${base}/releases/${commit}"
[[ -n "${commit}" && -d "${target}" ]] || { printf 'Installed release is required\n' >&2; exit 2; }
bash "${target}/deploy/scripts/verify-release.sh" --release "${target}"

if "${dry_run}"; then
  printf 'DRY RUN: atomically switch current to %s and preserve previous\n' "${target}"
  exit 0
fi

current_target="$(readlink -f "${base}/current" 2>/dev/null || true)"
[[ -z "${current_target}" ]] || ln -sfn "${current_target}" "${base}/previous.next"
[[ ! -L "${base}/previous.next" ]] || mv -Tf "${base}/previous.next" "${base}/previous"
ln -sfn "${target}" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"
printf 'Current release: %s\n' "${commit}"
