#!/usr/bin/env bash

set -euo pipefail

REQUIRED_SYSTEMD_SERVICES="${REQUIRED_SYSTEMD_SERVICES:-gst-backend,gst-frontend,postgresql@16-main,gst-celery-imports,gst-celery-reconciliation,gst-celery-filings,gst-celery-scheduled,gst-celery-beat}"
CHECK_REDIS="${CHECK_REDIS:-true}"

IFS=',' read -r -a services <<< "$REQUIRED_SYSTEMD_SERVICES"

echo "GST Compliance service topology audit"
echo "Date: $(date)"
echo "Required services: $REQUIRED_SYSTEMD_SERVICES"

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is not available; cannot verify production service topology." >&2
  exit 1
fi

failed=0

for service in "${services[@]}"; do
  service="$(echo "$service" | xargs)"
  if [[ -z "$service" ]]; then
    continue
  fi

  echo
  echo "== $service =="
  if ! systemctl status "$service" --no-pager --lines=0 >/tmp/gst-service-status.out 2>&1; then
    echo "MISSING_OR_ERROR"
    cat /tmp/gst-service-status.out
    failed=1
    continue
  fi

  if systemctl is-active --quiet "$service"; then
    echo "ACTIVE"
  else
    echo "NOT_ACTIVE"
    systemctl status "$service" --no-pager --lines=20 || true
    failed=1
  fi
done

if [[ "$CHECK_REDIS" == "true" ]]; then
  echo
  echo "== Redis =="
  if ! command -v redis-cli >/dev/null 2>&1; then
    echo "redis-cli is not available; cannot verify Redis." >&2
    failed=1
  elif redis-cli ping | grep -q '^PONG$'; then
    echo "PONG"
  else
    echo "Redis ping failed." >&2
    failed=1
  fi
fi

echo
if [[ "$failed" -eq 0 ]]; then
  echo "Service topology audit passed."
else
  echo "Service topology audit failed." >&2
fi

exit "$failed"
