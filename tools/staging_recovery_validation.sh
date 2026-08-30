#!/usr/bin/env bash

set -euo pipefail

HOST="${GST_STAGE_HOST:-16.16.166.34}"
USER_NAME="${GST_STAGE_USER:-ubuntu}"
KEY_PATH="${GST_STAGE_SSH_KEY:-$HOME/Downloads/bansalrenu.pem}"
APP_ROOT="${GST_STAGE_APP_ROOT:-/srv/gst-compliance/gst}"
FRONTEND_ROOT="${GST_STAGE_FRONTEND_ROOT:-$APP_ROOT/gst-compliance-frontend}"
LOGIN_EMAIL="${GST_STAGE_LOGIN_EMAIL:-demo_admin@example.com}"
LOGIN_PASSWORD="${GST_STAGE_LOGIN_PASSWORD:-demo12345}"
PUBLIC_BASE_URL="${GST_STAGE_PUBLIC_BASE_URL:-https://gst-stage.accerio.in}"

SSH_OPTS=(
  -o ConnectTimeout=10
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
  -o StrictHostKeyChecking=no
  -i "$KEY_PATH"
)

REMOTE="${USER_NAME}@${HOST}"

run_remote() {
  local label="$1"
  shift
  echo
  echo "== $label =="
  ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
}

run_local() {
  local label="$1"
  shift
  echo
  echo "== $label =="
  "$@"
}

echo "Staging recovery validation"
echo "Date: $(date)"
echo "Host: $HOST"
echo "Public URL: $PUBLIC_BASE_URL"

run_remote "SSH sanity" "echo SSH_OK && hostname && date"
run_remote "Host health" "uptime && printf '\n' && free -h && printf '\n' && df -h"
run_remote "Core service status" "sudo systemctl status gst-backend gst-frontend postgresql@16-main --no-pager"
run_remote "Recent service logs" "sudo journalctl -u gst-backend -u gst-frontend -u postgresql@16-main -n 200 --no-pager"
run_remote "Local backend reachability" "curl -sS -I http://127.0.0.1:8001"
run_remote "Local frontend reachability" "curl -sS -I http://127.0.0.1:3001"
run_local "Public login page reachability" curl -sS -I "$PUBLIC_BASE_URL/login"
run_local "Public auth login validation" \
  curl -sS -D - -o /tmp/gst-stage-login.out \
    -X POST "$PUBLIC_BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}"

echo
echo "== Public auth login response body preview =="
head -c 500 /tmp/gst-stage-login.out || true
printf '\n'

run_remote "Playwright live smoke" \
  "cd $FRONTEND_ROOT && PLAYWRIGHT_BASE_URL=$PUBLIC_BASE_URL PLAYWRIGHT_LIVE_EMAIL=$LOGIN_EMAIL PLAYWRIGHT_LIVE_PASSWORD=$LOGIN_PASSWORD npx playwright test tests/e2e/live-smoke.spec.ts --project=chromium"
