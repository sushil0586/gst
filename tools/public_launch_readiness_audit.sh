#!/usr/bin/env bash

set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-./venv/bin/python}"
FRONTEND_ROOT="${FRONTEND_ROOT:-gst-compliance-frontend}"
RUN_BACKEND_TESTS="${RUN_BACKEND_TESTS:-true}"
RUN_FRONTEND_CHECKS="${RUN_FRONTEND_CHECKS:-true}"
RUN_RUNTIME_CHECKS="${RUN_RUNTIME_CHECKS:-true}"
RUN_SERVICE_CHECKS="${RUN_SERVICE_CHECKS:-true}"
RUN_RETENTION_EXERCISE="${RUN_RETENTION_EXERCISE:-false}"
RUN_STAGING_CHECKS="${RUN_STAGING_CHECKS:-false}"

run() {
  local label="$1"
  shift
  echo
  echo "== $label =="
  "$@"
}

run_shell() {
  local label="$1"
  shift
  echo
  echo "== $label =="
  bash -lc "$*"
}

echo "GST Compliance public launch readiness audit"
echo "Date: $(date)"
echo "Python: $PYTHON_BIN"
echo "Frontend: $FRONTEND_ROOT"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  run "Git branch" git branch --show-current
  run "Git status" git status --short
fi

if [[ "$RUN_BACKEND_TESTS" == "true" ]]; then
  run "Backend verification" "$PYTHON_BIN" -m pytest -q
else
  echo
  echo "== Backend verification =="
  echo "Skipped because RUN_BACKEND_TESTS=$RUN_BACKEND_TESTS"
fi

if [[ "$RUN_FRONTEND_CHECKS" == "true" ]]; then
  run_shell "Frontend lint" "cd '$FRONTEND_ROOT' && npm run lint"
  run_shell "Frontend build" "cd '$FRONTEND_ROOT' && npm run build"
  run_shell "Frontend launch gate" "cd '$FRONTEND_ROOT' && npm run test:e2e:launch"
else
  echo
  echo "== Frontend checks =="
  echo "Skipped because RUN_FRONTEND_CHECKS=$RUN_FRONTEND_CHECKS"
fi

if [[ "$RUN_RUNTIME_CHECKS" == "true" ]]; then
  run "Django runtime check" "$PYTHON_BIN" manage.py check
  run "Django deploy check" "$PYTHON_BIN" manage.py check --deploy
  run "Security posture audit" "$PYTHON_BIN" manage.py audit_security_posture --fail-on-warn
else
  echo
  echo "== Runtime checks =="
  echo "Skipped because RUN_RUNTIME_CHECKS=$RUN_RUNTIME_CHECKS"
fi

if [[ "$RUN_RETENTION_EXERCISE" == "true" ]]; then
  run "Retention enforcement exercise" "$PYTHON_BIN" manage.py enforce_security_retention --audit-days 1 --filing-days 1 --provider-auth-days 1 --import-days 1
else
  echo
  echo "== Retention enforcement exercise =="
  echo "Skipped by default because it mutates old sensitive payloads. Set RUN_RETENTION_EXERCISE=true only on an approved target environment."
fi

if [[ "$RUN_SERVICE_CHECKS" == "true" ]]; then
  run "Service topology audit" bash tools/service_topology_audit.sh
else
  echo
  echo "== Service checks =="
  echo "Skipped because RUN_SERVICE_CHECKS=$RUN_SERVICE_CHECKS"
fi

if [[ "$RUN_STAGING_CHECKS" == "true" ]]; then
  run "Staging recovery validation" bash tools/staging_recovery_validation.sh
else
  echo
  echo "== Staging recovery validation =="
  echo "Skipped because RUN_STAGING_CHECKS=$RUN_STAGING_CHECKS"
fi

echo
echo "Public launch readiness audit completed."
