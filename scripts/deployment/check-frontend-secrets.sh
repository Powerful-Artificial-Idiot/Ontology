#!/usr/bin/env bash
set -euo pipefail

dist="${1:-dist}"
[[ -d "${dist}" ]] || { printf 'Frontend secret check: missing build directory\n' >&2; exit 1; }

patterns='VITE_AGENT_API_TOKEN|VITE_DEEPSEEK_API_KEY|MKG_DEEPSEEK_API_KEY|MKG_NEO4J_PASSWORD|MKG_AGENT_AUTH_STATIC_TOKEN|/etc/manufacturing-graph-explorer|/var/lib/manufacturing-graph-explorer|api\.deepseek\.com/chat/completions'
if grep -RIE --binary-files=without-match "${patterns}" "${dist}" >/dev/null; then
  printf 'Frontend secret check: forbidden server-only marker detected\n' >&2
  exit 1
fi

printf 'Frontend secret check: passed\n'
