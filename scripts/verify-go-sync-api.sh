#!/usr/bin/env bash
# Verify GO SYNC relay endpoints against production (or staging) API.
# Requires a fresh register/login token unless EXOSITES_VERIFY_TOKEN is set.
#
# Usage:
#   ./scripts/verify-go-sync-api.sh [base_url]
#   EXOSITES_VERIFY_TOKEN=eyJ... ./scripts/verify-go-sync-api.sh
set -euo pipefail

BASE="${1:-https://api.exosites.ch}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail=0

check() {
  local name="$1"
  local ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo -e "${GREEN}✓${NC} $name"
  else
    echo -e "${RED}✗${NC} $name"
    fail=1
  fi
}

echo "GO SYNC relay verify → ${BASE}"
echo ""

health="$(curl -fsS "${BASE}/health" 2>/dev/null || echo '{}')"
if echo "$health" | grep -q '"sync_relay":true'; then
  check "GET /health features.sync_relay=true (migration 004 applied)" 1
elif echo "$health" | grep -q '"sync_relay":false'; then
  check "GET /health features.sync_relay=true (run migration 004 + restart Node)" 0
else
  check "GET /health includes sync_relay (deploy latest cloud-node + restart)" 0
fi

unauth_code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/v1/sync/status" || echo 000)"
if [[ "$unauth_code" == "401" ]]; then
  check "GET /v1/sync/status without token → 401" 1
else
  check "GET /v1/sync/status without token → 401 (route mounted?)" 0
  echo "  HTTP ${unauth_code}"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/ga-fetch-verify-token.sh
source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "$BASE" || true
access_token="${GA_ACCESS_TOKEN:-}"

if [[ -z "$access_token" ]]; then
  check "GO SYNC authenticated checks (need access_token)" 0
  echo ""
  echo -e "${YELLOW}Set EXOSITES_VERIFY_TOKEN or cloud-node/.env.verify (npm run ga:provision-verify).${NC}"
  exit 1
fi
if [[ "${GA_AUTH_SOURCE:-}" == "login" ]]; then
  echo -e "${GREEN}✓${NC} Auth via GA verify login"
fi

auth_header=(-H "Authorization: Bearer ${access_token}" -H "Content-Type: application/json")

status_body="$(curl -fsS "${BASE}/v1/sync/status" "${auth_header[@]}" 2>/dev/null || echo '{}')"
if echo "$status_body" | grep -q '"ok":true'; then
  check "GET /v1/sync/status (authenticated)" 1
else
  check "GET /v1/sync/status (authenticated — migration 004?)" 0
  echo "  response: ${status_body}"
fi

device_body="$(curl -fsS -X POST "${BASE}/v1/sync/devices/register" "${auth_header[@]}" \
  -d '{"name":"verify-script","platform":"test"}' 2>/dev/null || echo '{}')"
if echo "$device_body" | grep -q '"device_id"'; then
  check "POST /v1/sync/devices/register" 1
else
  check "POST /v1/sync/devices/register" 0
  echo "  response: ${device_body}"
fi

# Envelope must satisfy the hardened relay contract (syncRelay.validateBlob):
# allowlisted collection, 64-hex content_hash, schema_version 2-3.
record_id="verify-$(date +%s)"
content_hash="$(printf 'dGVzdA==' | shasum -a 256 | cut -d' ' -f1)"
push_body="$(curl -fsS -X POST "${BASE}/v1/sync/blobs/push" "${auth_header[@]}" \
  -d "{\"blobs\":[{\"collection\":\"tasks\",\"record_id\":\"${record_id}\",\"device_id\":\"verify-script\",\"logical_clock\":1,\"updated_at\":\"2026-06-16T12:00:00Z\",\"schema_version\":3,\"ciphertext\":\"dGVzdA==\",\"content_hash\":\"${content_hash}\"}]}" \
  2>/dev/null || echo '{}')"
if echo "$push_body" | grep -q '"accepted":1'; then
  check "POST /v1/sync/blobs/push (test envelope)" 1
else
  check "POST /v1/sync/blobs/push" 0
  echo "  response: ${push_body}"
fi

# Pull from just before the cursor returned by push, so the check stays exact
# regardless of how much history the verify account has accumulated.
push_cursor="$(echo "$push_body" | sed -n 's/.*"cursor":\([0-9][0-9]*\).*/\1/p')"
pull_from=$(( ${push_cursor:-1} - 1 ))
pull_body="$(curl -fsS "${BASE}/v1/sync/blobs/pull?cursor=${pull_from}&limit=10" -H "Authorization: Bearer ${access_token}" 2>/dev/null || echo '{}')"
if echo "$pull_body" | grep -q "\"record_id\":\"${record_id}\""; then
  check "GET /v1/sync/blobs/pull returns pushed blob" 1
else
  check "GET /v1/sync/blobs/pull returns pushed blob" 0
  echo "  response: ${pull_body}"
fi

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo -e "${YELLOW}See docs/runbooks/relay-deploy.md — apply migration 004 and restart Node on Infomaniak.${NC}"
  exit 1
fi
echo -e "${GREEN}GO SYNC relay checks passed.${NC}"
