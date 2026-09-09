#!/usr/bin/env bash
# Merge committed flavor env + local crash ingest token for Flutter dart-defines.
# Writes mobile/env/local.json (gitignored). Does not print secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLAVOR="${1:-production}"
BASE="${ROOT}/mobile/env/${FLAVOR}.json"
OUT="${ROOT}/mobile/env/local.json"

if [[ ! -f "$BASE" ]]; then
  echo "Missing $BASE" >&2
  exit 1
fi

read_env_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '\r' || true
}

token="$(read_env_value "${ROOT}/backend/.env" EXOSITES_CRASH_INGEST_TOKEN)"
if [[ -z "$token" ]]; then
  token="$(read_env_value "${ROOT}/cloud-node/.env" CRASH_INGEST_TOKEN)"
fi

node "${ROOT}/scripts/lib/merge-mobile-dart-defines.cjs" "$BASE" "$token" "$OUT"
