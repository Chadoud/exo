#!/usr/bin/env bash
# Deploy Exo cloud API (cloud-node/) to Infomaniak via SSH/rsync.
#
# Setup:
#   cp cloud-node/.env.deploy.example cloud-node/.env.deploy
#
# Usage:
#   ./scripts/deploy-cloud-api.sh
#   UPLOAD_ENV=1 ./scripts/deploy-cloud-api.sh    # also scp cloud-node/.env
#   VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT}/cloud-node"
ENV_FILE="${API_DIR}/.env.deploy"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Missing ${ENV_FILE}${NC}"
  echo "Copy cloud-node/.env.deploy.example and fill in SSH + REMOTE_PATH."
  exit 1
fi

set -a
_cli_skip_remote_npm="${SKIP_REMOTE_NPM-}"
# shellcheck disable=SC1090
source "$ENV_FILE"
if [[ -n "${_cli_skip_remote_npm}" ]]; then
  SKIP_REMOTE_NPM="$_cli_skip_remote_npm"
fi
set +a

: "${SSH_USER:?Set SSH_USER in .env.deploy}"
: "${SSH_HOST:?Set SSH_HOST in .env.deploy}"
REMOTE_PATH="${REMOTE_PATH:-./sites/api.exosites.ch}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

run_ssh() {
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

run_rsync() {
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" rsync -avz --delete \
      --exclude node_modules \
      --exclude .env \
      --exclude .env.deploy \
      --exclude server.log \
      -e "$RSYNC_SSH" \
      "$@" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
  else
    rsync -avz --delete \
      --exclude node_modules \
      --exclude .env \
      --exclude .env.deploy \
      --exclude server.log \
      -e "$RSYNC_SSH" \
      "$@" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
  fi
}

echo -e "${GREEN}Deploying cloud-node → ${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}${NC}"

cd "$API_DIR"
npm install --omit=dev

run_rsync ./

echo -e "${YELLOW}Applying database migrations (idempotent)…${NC}"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-001.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-002.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-003.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-004.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-005.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-006.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-007.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-008.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-009.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-010.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-011.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-012.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-013.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-014.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-016.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-017.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-018.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-019.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-020.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-021.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-022.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-023.js"
run_ssh "cd ${REMOTE_PATH} && node scripts/apply-migration-024.js"
if [[ "${TRIAL_GRANDFATHER_EXPIRED:-0}" == "1" ]]; then
  echo -e "${YELLOW}Grandfathering expired trials (one-time — TRIAL_GRANDFATHER_EXPIRED=1)…${NC}"
  run_ssh "cd ${REMOTE_PATH} && TRIAL_GRANDFATHER_EXPIRED=1 node scripts/apply-migration-003.js"
fi

if [[ "${UPLOAD_ENV:-0}" == "1" && -f "${API_DIR}/.env" ]]; then
  echo -e "${YELLOW}Uploading runtime .env (UPLOAD_ENV=1)…${NC}"
  if [[ -n "${SSH_PASSWORD:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "${SSH_PASSWORD}" scp "${SSH_OPTS[@]}" "${API_DIR}/.env" \
      "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/.env"
  else
    scp "${SSH_OPTS[@]}" "${API_DIR}/.env" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/.env"
  fi
elif [[ -f "${API_DIR}/.env" ]]; then
  echo -e "${YELLOW}Skipped .env upload (set UPLOAD_ENV=1 to push local secrets).${NC}"
else
  echo -e "${YELLOW}No cloud-node/.env locally — use Infomaniak Node.js panel for secrets.${NC}"
fi

if [[ "${SKIP_REMOTE_NPM:-0}" == "1" ]]; then
  echo -e "${YELLOW}Skipped remote npm (SKIP_REMOTE_NPM=1).${NC}"
  echo -e "${YELLOW}Required: Infomaniak Manager → Node.js → api.exosites.ch → Restart${NC}"
  echo -e "${YELLOW}Then: VERIFY_AFTER=1 ./scripts/restart-cloud-api.sh  (or npm run verify:go-sync)${NC}"
else
  echo -e "${YELLOW}Remote npm install + restart attempt…${NC}"
  set +e
  run_ssh "cd ${REMOTE_PATH} && npm install --omit=dev"
  INSTALL_EXIT=$?
  set -e
  if [[ $INSTALL_EXIT -ne 0 ]]; then
    echo -e "${YELLOW}Remote npm failed — use Infomaniak panel to install dependencies / restart.${NC}"
  else
    run_ssh "cd ${REMOTE_PATH} && (pkill -f 'node server.js' 2>/dev/null || true)"
    echo -e "${GREEN}Files uploaded. Restart Node.js in Infomaniak Manager → api.exosites.ch if it did not auto-reload.${NC}"
  fi
fi

if [[ "${VERIFY_AFTER_DEPLOY:-0}" == "1" ]]; then
  echo -e "${YELLOW}Running post-deploy verify…${NC}"
  "${ROOT}/scripts/verify-cloud-auth-api.sh" || {
    echo -e "${RED}Verify failed — restart Node on Infomaniak and re-run verify.${NC}"
    exit 1
  }
else
  echo "Verify: VERIFY_AFTER_DEPLOY=1 ./scripts/deploy-cloud-api.sh"
  echo "Or: ./scripts/verify-cloud-auth-api.sh"
fi

echo ""
echo -e "${YELLOW}After deploy: set Infomaniak Node.js env for cloud sort (if not in .env):${NC}"
echo "  SORT_LLM_BASE_URL=https://llm-staging.exosites.ch"
echo "  LITELLM_MASTER_KEY=<server-only LiteLLM master key>"
echo "  SORT_LLM_ALLOW_MASTER_DELEGATION=0  # staging may use 1 until /key/generate works"

echo -e "${GREEN}Done.${NC}"
