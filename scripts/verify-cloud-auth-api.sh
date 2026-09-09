#!/usr/bin/env bash
# Verify production cloud auth + trial endpoints (Phase 0 smoke test).
# Usage: ./scripts/verify-cloud-auth-api.sh [base_url]
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

echo "Cloud auth verify → ${BASE}"
echo ""

health="$(curl -fsS "${BASE}/health" 2>/dev/null || echo '{}')"
if echo "$health" | grep -q '"ok":true'; then
  check "GET /health" 1
  if echo "$health" | grep -q '"features"'; then
    check "GET /health includes features (new build)" 1
  else
    check "GET /health includes features (restart Node app on server)" 0
  fi
else
  check "GET /health" 0
  echo "$health"
fi

auth_config="$(curl -fsS "${BASE}/v1/public/auth-config" 2>/dev/null || echo '{}')"
if echo "$auth_config" | grep -q '"providers"'; then
  check "GET /v1/public/auth-config" 1
  echo "  $auth_config"
else
  check "GET /v1/public/auth-config (deploy latest cloud-node)" 0
  echo "  response: $auth_config"
fi

google_code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/auth/start/google" || echo 000)"
if [[ "$google_code" == "302" || "$google_code" == "301" ]]; then
  check "GET /auth/start/google → redirect (${google_code})" 1
else
  check "GET /auth/start/google (set GOOGLE_CLIENT_ID/SECRET on server)" 0
  echo "  HTTP ${google_code}"
fi

apple_code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/auth/start/apple" || echo 000)"
if [[ "$apple_code" == "302" || "$apple_code" == "301" ]]; then
  check "GET /auth/start/apple → redirect (${apple_code})" 1
elif echo "$auth_config" | grep -q '"apple":false'; then
  check "GET /auth/start/apple (Apple not configured — skipped)" 1
else
  check "GET /auth/start/apple (set APPLE_* on server)" 0
  echo "  HTTP ${apple_code}"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

verify_email="verify-$(date +%s)@example.com"
register_raw="$(curl -sS -w $'\n%{http_code}' -X POST "${BASE}/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${verify_email}\",\"password\":\"verifypass123\",\"first_name\":\"Verify\",\"last_name\":\"User\"}" 2>/dev/null || printf '\n000')"
register_code="${register_raw##*$'\n'}"
register_body="${register_raw%$'\n'*}"
access_token=""
if [[ "$register_code" == "200" ]]; then
  check "POST /auth/register" 1
  access_token="$(echo "$register_body" | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)"
elif [[ "$register_code" == "429" ]]; then
  # shellcheck source=scripts/lib/ga-fetch-verify-token.sh
  source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "$BASE" || true
  access_token="${GA_ACCESS_TOKEN:-}"
  if [[ -n "$access_token" && "${GA_AUTH_SOURCE:-}" == "login" ]]; then
    echo -e "${YELLOW}○${NC} POST /auth/register (rate-limited — using GA verify login)"
    check "POST /auth/register (skipped — login token OK)" 1
  else
    echo -e "${YELLOW}○${NC} POST /auth/register (rate-limited — set cloud-node/.env.verify)"
    check "POST /auth/register (rate-limited; npm run ga:provision-verify)" 0
  fi
else
  check "POST /auth/register" 0
  echo "  HTTP ${register_code}"
  echo "  body: ${register_body}"
fi

if [[ -z "$access_token" ]]; then
  # shellcheck source=scripts/lib/ga-fetch-verify-token.sh
  source "${ROOT}/scripts/lib/ga-fetch-verify-token.sh" "$BASE" || true
  access_token="${GA_ACCESS_TOKEN:-}"
fi

if [[ -n "$access_token" ]]; then
  me_body="$(curl -fsS "${BASE}/v1/me" -H "Authorization: Bearer ${access_token}" 2>/dev/null || echo '{}')"
  if echo "$me_body" | grep -q '"trial_ends_at"'; then
    check "GET /v1/me includes trial_ends_at (migration 003)" 1
  else
    check "GET /v1/me includes trial_ends_at (run migration 003 + restart)" 0
    echo "  response: $me_body"
  fi
  if [[ "${GA_AUTH_SOURCE:-}" == "login" ]]; then
    echo -e "${YELLOW}○${NC} GET /v1/me trial fields (skipped — GA verify login, not fresh register)"
  elif echo "$me_body" | grep -q '"trial_active":true'; then
    check "GET /v1/me trial_active=true for new account" 1
  else
    check "GET /v1/me trial_active=true (check trial_ends_at / server clock)" 0
    echo "  response: $me_body"
  fi
  if [[ "${GA_AUTH_SOURCE:-}" != "login" ]]; then
    if echo "$me_body" | grep -q '"plan":"trial"'; then
      check "GET /v1/me plan=trial for new account" 1
    else
      check "GET /v1/me plan=trial" 0
    fi
  fi
else
  if [[ "$register_code" == "429" ]]; then
    echo -e "${YELLOW}○${NC} GET /v1/me (skipped — register rate-limited)"
  else
    check "GET /v1/me trial fields (need access_token from register)" 0
  fi
fi

if echo "$health" | grep -q '"sort_credentials"'; then
  if echo "$health" | grep -q '"sort_credentials":true'; then
    check "GET /health features.sort_credentials=true (route deployed)" 1
  else
    check "GET /health features.sort_credentials=true (set LITELLM_MASTER_KEY on server)" 0
  fi
else
  check "GET /health features.sort_credentials (restart Node app in Infomaniak Manager)" 0
fi

if [[ -n "$access_token" ]]; then
  CREDS_BASE="${SORT_CREDENTIALS_BASE:-https://llm-staging.exosites.ch}"
  sort_code="$(curl -sS -o /tmp/sort-creds.json -w '%{http_code}' -X POST "${CREDS_BASE}/v1/sort/credentials" \
    -H "Authorization: Bearer ${access_token}" \
    -H 'Content-Type: application/json' \
    -d '{}' 2>/dev/null || echo 000)"
  if [[ "$sort_code" == "200" ]]; then
    check "POST ${CREDS_BASE}/v1/sort/credentials → 200" 1
    if grep -q '"endpoint"' /tmp/sort-creds.json 2>/dev/null && grep -q '"token"' /tmp/sort-creds.json 2>/dev/null; then
      check "POST /v1/sort/credentials returns endpoint + token" 1
    else
      check "POST /v1/sort/credentials payload shape" 0
      cat /tmp/sort-creds.json 2>/dev/null || true
    fi
  elif [[ "$sort_code" == "404" ]]; then
    if echo "$health" | grep -q '"sort_credentials"'; then
      check "POST /v1/sort/credentials (unexpected 404 — check reverse proxy)" 0
    else
      check "POST /v1/sort/credentials (Infomaniak Manager → api.exosites.ch → Restart)" 0
    fi
  elif [[ "$sort_code" == "503" ]]; then
    check "POST /v1/sort/credentials (set LITELLM_MASTER_KEY + SORT_LLM_BASE_URL on server)" 0
    cat /tmp/sort-creds.json 2>/dev/null || true
  else
    check "POST /v1/sort/credentials (HTTP ${sort_code})" 0
    cat /tmp/sort-creds.json 2>/dev/null || true
  fi
  rm -f /tmp/sort-creds.json
else
  if [[ "$register_code" == "429" ]]; then
    echo -e "${YELLOW}○${NC} POST /v1/sort/credentials (skipped — register rate-limited)"
  else
    check "POST /v1/sort/credentials (need access_token)" 0
  fi
fi

done_ok_html="$(curl -fsS "${BASE}/auth/done?exo_code=probe" 2>/dev/null || echo '')"
if echo "$done_ok_html" | grep -qi 'Open Exo' \
  && echo "$done_ok_html" | grep -q 'exo://auth/callback' \
  && echo "$done_ok_html" | grep -q 'color-scheme.*light\|--bg: #f0f2f8'; then
  check "GET /auth/done (success) → branded handoff + Open Exo button" 1
else
  check "GET /auth/done (success) → branded handoff (restart Node app)" 0
fi

done_err_html="$(curl -fsS "${BASE}/auth/done?error=signin_failed" 2>/dev/null || echo '')"
if echo "$done_err_html" | grep -q "Sign-in didn" \
  && ! echo "$done_err_html" | grep -q "<h2>You're signed in"; then
  check "GET /auth/done (error) → error headline, not success copy" 1
elif echo "$done_err_html" | grep -q "You're signed in" && echo "$done_err_html" | grep -q "signin_failed"; then
  check "GET /auth/done (error) → stale server HTML (restart Node app)" 0
else
  check "GET /auth/done (error) → branded error page" 0
fi

if echo "$health" | grep -q '"sync_relay":true'; then
  check "GET /health features.sync_relay=true (migration 004)" 1
elif echo "$health" | grep -q '"sync_relay":false'; then
  check "GET /health features.sync_relay=true (run apply-migration-004.js)" 0
elif echo "$health" | grep -q '"features"'; then
  check "GET /health includes sync_relay (deploy latest cloud-node)" 0
fi

if echo "$health" | grep -q '"product_analytics":true'; then
  check "GET /health features.product_analytics=true (migration 005)" 1
elif echo "$health" | grep -q '"product_analytics":false'; then
  check "GET /health features.product_analytics=true (run apply-migration-005.js)" 0
elif echo "$health" | grep -q '"features"'; then
  check "GET /health includes product_analytics (deploy latest cloud-node)" 0
fi

if echo "$health" | grep -q '"whatsapp_webhooks":true'; then
  check "GET /health features.whatsapp_webhooks=true (migration 008)" 1
elif echo "$health" | grep -q '"whatsapp_webhooks":false'; then
  check "GET /health features.whatsapp_webhooks=true (run apply-migration-008.js + set WHATSAPP_* env)" 0
elif echo "$health" | grep -q '"features"'; then
  check "GET /health includes whatsapp_webhooks (deploy latest cloud-node)" 0
fi

client_config="$(curl -fsS "${BASE}/v1/public/client-config" 2>/dev/null || echo '{}')"
if echo "$client_config" | grep -q '"telemetry_ingest_enabled":true'; then
  check "GET /v1/public/client-config telemetry enabled" 1
else
  check "GET /v1/public/client-config (deploy latest cloud-node)" 0
fi

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo -e "${YELLOW}See docs/CLOUD_AUTH_RELEASE.md — restart Node app in Infomaniak Manager after deploy.${NC}"
  exit 1
fi
echo -e "${GREEN}Cloud auth checks passed.${NC}"

if [[ "${VERIFY_GO_SYNC:-1}" == "1" ]]; then
  echo ""
  EXOSITES_VERIFY_TOKEN="${access_token:-}" VERIFY_GO_SYNC=0 \
    "${BASH_SOURCE%/*}/verify-go-sync-api.sh" "$BASE" || exit 1
fi
