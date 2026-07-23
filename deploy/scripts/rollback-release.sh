#!/usr/bin/env bash
set -euo pipefail

base="${MKG_RELEASE_BASE:-/opt/manufacturing-graph-explorer}"
dry_run=false
while (($#)); do
  case "$1" in
    --base) base="${2:?missing base}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

previous="$(readlink -f "${base}/previous" 2>/dev/null || true)"
[[ -n "${previous}" && -d "${previous}" ]] || { printf 'Previous release is unavailable\n' >&2; exit 1; }
if "${dry_run}"; then
  printf 'DRY RUN: atomically restore %s\n' "${previous}"
  exit 0
fi
current="$(readlink -f "${base}/current" 2>/dev/null || true)"
ln -sfn "${previous}" "${base}/current.next"
mv -Tf "${base}/current.next" "${base}/current"
[[ -z "${current}" ]] || ln -sfn "${current}" "${base}/previous.next"
[[ ! -L "${base}/previous.next" ]] || mv -Tf "${base}/previous.next" "${base}/previous"
printf 'Rollback release restored\n'
