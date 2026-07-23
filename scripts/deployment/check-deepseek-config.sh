#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 0 ]]; then
  printf 'arguments: not allowed\n' >&2
  exit 64
fi

failed=0

require_variable() {
  local name="$1"
  local label="$2"
  if [[ -z "${!name:-}" ]]; then
    printf '%s: missing\n' "${name}" >&2
    failed=1
    return
  fi
  printf '%s: configured\n' "${label}"
}

require_model() {
  local name="$1"
  local label="$2"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    printf '%s: missing\n' "${name}" >&2
    failed=1
    return
  fi
  if [[ "${value}" != "deepseek-v4-flash" && "${value}" != "deepseek-v4-pro" ]]; then
    printf '%s: unsupported-model\n' "${name}" >&2
    failed=1
    return
  fi
  printf '%s: configured\n' "${label}"
}

require_variable "MKG_DEEPSEEK_API_KEY" "DeepSeek API key"
require_model "MKG_DEEPSEEK_MODEL" "DeepSeek semantic model"
require_model "MKG_DEEPSEEK_ANSWER_MODEL" "DeepSeek answer model"

case "${MKG_DEEPSEEK_BASE_URL:-}" in
  https://api.deepseek.com|https://api.deepseek.com/)
    printf 'DeepSeek base URL: configured\n'
    ;;
  "")
    printf 'MKG_DEEPSEEK_BASE_URL: missing\n' >&2
    failed=1
    ;;
  *)
    printf 'MKG_DEEPSEEK_BASE_URL: invalid-url\n' >&2
    failed=1
    ;;
esac

if [[ ${failed} -ne 0 ]]; then
  printf 'DeepSeek deployment configuration: FAILED\n' >&2
  exit 1
fi

printf 'DeepSeek deployment configuration: OK\n'
