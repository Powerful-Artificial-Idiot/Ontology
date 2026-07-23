#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 0 ]]; then
  printf 'arguments: not allowed\n' >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${script_dir}/check-deepseek-config.sh" >/dev/null

for command_name in curl node mktemp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    printf '%s: command-missing\n' "${command_name}" >&2
    exit 1
  fi
done

temporary_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${temporary_dir}"
}
trap cleanup EXIT

base_url="${MKG_DEEPSEEK_BASE_URL%/}"
auth_header="${temporary_dir}/authorization.header"
models_response="${temporary_dir}/models.json"
text_request="${temporary_dir}/text-request.json"
text_response="${temporary_dir}/text-response.json"
json_request="${temporary_dir}/json-request.json"
json_response="${temporary_dir}/json-response.json"

umask 077
printf 'Authorization: Bearer %s\n' "${MKG_DEEPSEEK_API_KEY}" >"${auth_header}"

curl_common=(
  --silent
  --show-error
  --connect-timeout 5
  --max-time 20
  --proto '=https'
  --tlsv1.2
)

curl "${curl_common[@]}" --output /dev/null "${base_url}/"
printf 'DeepSeek TLS reachability: OK\n'

curl "${curl_common[@]}" --fail-with-body \
  --header "@${auth_header}" \
  --output "${models_response}" \
  "${base_url}/models"
printf 'DeepSeek authentication: OK\n'

model_available() {
  node -e '
    const fs = require("node:fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const ids = Array.isArray(payload.data) ? payload.data.map((item) => item && item.id).filter(Boolean) : [];
    process.exit(ids.includes(process.argv[2]) ? 0 : 1);
  ' "${models_response}" "$1"
}

if model_available "${MKG_DEEPSEEK_MODEL}"; then
  printf 'Configured model available: yes\n'
else
  printf 'Configured model available: no\n' >&2
  exit 1
fi

if model_available "${MKG_DEEPSEEK_ANSWER_MODEL}"; then
  printf 'Configured answer model available: yes\n'
else
  printf 'Configured answer model available: no\n' >&2
  exit 1
fi

node -e '
  const fs = require("node:fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({
    model: process.argv[2],
    messages: [{ role: "user", content: "Reply with exactly: API_OK" }],
    thinking: { type: "disabled" },
    stream: false,
    temperature: 0,
    max_tokens: 16
  }));
' "${text_request}" "${MKG_DEEPSEEK_MODEL}"

curl "${curl_common[@]}" --fail-with-body \
  --header "@${auth_header}" \
  --header 'Content-Type: application/json' \
  --data-binary "@${text_request}" \
  --output "${text_response}" \
  "${base_url}/chat/completions"

node -e '
  const fs = require("node:fs");
  const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const content = payload?.choices?.[0]?.message?.content;
  process.exit(typeof content === "string" && content.trim() === "API_OK" ? 0 : 1);
' "${text_response}"
printf 'DeepSeek text completion: OK\n'

node -e '
  const fs = require("node:fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({
    model: process.argv[2],
    messages: [{ role: "user", content: "Return one JSON object with status equal to API_OK." }],
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
    stream: false,
    temperature: 0,
    max_tokens: 32
  }));
' "${json_request}" "${MKG_DEEPSEEK_MODEL}"

curl "${curl_common[@]}" --fail-with-body \
  --header "@${auth_header}" \
  --header 'Content-Type: application/json' \
  --data-binary "@${json_request}" \
  --output "${json_response}" \
  "${base_url}/chat/completions"

node -e '
  const fs = require("node:fs");
  const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") process.exit(1);
  const value = JSON.parse(content);
  process.exit(value && value.status === "API_OK" ? 0 : 1);
' "${json_response}"
printf 'DeepSeek JSON mode: OK\n'
