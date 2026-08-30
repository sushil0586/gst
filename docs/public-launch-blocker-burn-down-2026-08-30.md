# Public Launch Blocker Burn-Down

Date: August 30, 2026

## Purpose

This document tracks the work needed to move GST Compliance from controlled 10-customer launch readiness to public-launch readiness.

Current state:

- controlled launch: technically ready
- public launch: not yet approved

The public-launch blocker is no longer a single product feature. It is the combination of production proof, operating capacity, monitoring, support ownership, and pilot evidence.

## Blocker Status

| Blocker | Current status | What changed on August 30 | Remaining action |
|---|---|---|---|
| Product test gates | `Closed for controlled launch` | Backend, frontend build, launch gate, staging smoke, and live visual smoke are green. August 30 local audit also passed backend `355 passed`, frontend build, and launch e2e `5 passed`. | Keep gates mandatory before public launch. |
| Public launch audit gate | `Improved` | `audit_security_posture --fail-on-warn` now fails unsafe public-launch posture. August 30 staging audit is down to one warning: filing alert email is disabled until routing is confirmed. | Confirm active alert recipients/routing, enable filing alert email, then run on the real production environment with production secrets/settings. |
| Repeatable launch audit command | `Improved` | Added `tools/public_launch_readiness_audit.sh`. | Run on target production host and archive output as release evidence. |
| Production secrets | `Open` | Audit can now fail placeholder secret posture. | Rotate and confirm `SECRET_KEY`, `JWT_SIGNING_KEY`, provider credentials, and storage secrets outside repo env files. |
| Production deploy posture | `Open` | Audit command now covers more production-specific settings. | Run `manage.py check`, `manage.py check --deploy`, and `audit_security_posture --fail-on-warn` on production. |
| Production service topology | `Improved` | Added `tools/service_topology_audit.sh`; the public audit helper now fails missing or inactive expected services. August 30 staging topology passed for backend, frontend, Postgres, Redis, all Celery workers, and Beat. | Run on production with exact service names and archive output. |
| Logging and alert routing | `Open` | Public launch audit now checks security logging level and filing alert email flag. Stage has SMTP configured, but filing alert recipient routing/users still need confirmation. | Confirm active recipients/routing, enable filing alert email, and confirm alert rules for auth/provider/request/worker/5xx events. |
| Capacity and memory risk | `Improved` | Import bulk creates are chunked at 500 rows, and `tools/loadtest_api.py` now supports p95/error-rate thresholds. | Prove production capacity under real or production-like load; avoid using the shared low-memory staging host as public-launch evidence. |
| Retention and scheduled jobs | `Open` | Audit helper keeps retention exercise opt-in to avoid accidental production mutation. | Confirm retention settings and Celery Beat; run retention exercise only on an approved target. |
| Support and rollback ownership | `Open` | September 1 plan has named fields and rollback/pause rules. | Fill owner names, release window, rollback window, and escalation channel. |
| Pilot evidence | `Open` | September 1 10-customer pilot plan exists. | Complete pilot and review first-cycle evidence before expanding. |

## New Public Launch Gate

Run this on the target production environment:

```bash
bash tools/public_launch_readiness_audit.sh
```

Default behavior:

- runs backend tests
- runs frontend lint, build, and launch gate
- runs Django `check`
- runs Django `check --deploy`
- runs `audit_security_posture --fail-on-warn`
- runs `tools/service_topology_audit.sh`
- skips retention enforcement by default because it mutates old sensitive payloads
- skips staging checks by default

Useful options:

```bash
RUN_BACKEND_TESTS=false bash tools/public_launch_readiness_audit.sh
RUN_FRONTEND_CHECKS=false bash tools/public_launch_readiness_audit.sh
RUN_RETENTION_EXERCISE=true bash tools/public_launch_readiness_audit.sh
RUN_STAGING_CHECKS=true bash tools/public_launch_readiness_audit.sh
PYTHON_BIN=/srv/gst-compliance/venv/bin/python bash tools/public_launch_readiness_audit.sh
FRONTEND_ROOT=/srv/gst-compliance/gst/gst-compliance-frontend bash tools/public_launch_readiness_audit.sh
REQUIRED_SYSTEMD_SERVICES="gst-backend,gst-frontend,postgresql@16-main,<imports-worker>,<reconciliation-worker>,<filings-worker>,<scheduled-worker>,<celery-beat>" bash tools/public_launch_readiness_audit.sh
```

## Capacity Evidence Gate

Run a production-like authenticated load probe against hot read paths:

```bash
./venv/bin/python tools/loadtest_api.py \
  --base-url https://<production-host>/api/v1 \
  --email <pilot-admin-email> \
  --password <pilot-admin-password> \
  --endpoint "workspaces/context/?workspace=<workspace-id>" \
  --endpoint "dashboard/summary/?workspace=<workspace-id>&client=<client-id>&gstin=<gstin-id>&compliance_period=<period-id>" \
  --endpoint "returns/readiness/?workspace=<workspace-id>&client=<client-id>&gstin=<gstin-id>&compliance_period=<period-id>" \
  --concurrency 10 \
  --requests-per-worker 20 \
  --max-p95-ms 1500 \
  --max-error-rate 0
```

Record the output together with host memory, swap, disk, Postgres, Redis, and worker queue observations. Public launch should remain blocked if p95/error thresholds fail or if memory/swap pressure climbs during the probe.

## Public Launch Exit Criteria

Public launch should not be approved until all of these are true:

- [ ] September 1 10-customer pilot has completed enough first-cycle workflows to produce real support and capacity evidence.
- [ ] Production audit helper passes on the target production environment.
- [ ] Production secrets and provider credentials are rotated and externally stored.
- [ ] Actual service topology is documented and matches the intended queue split.
- [ ] Celery Beat and scheduled retention jobs are confirmed.
- [ ] Logging and alert routing are confirmed for auth failures, provider failures, request rejections, worker failures, queue backlog, 5xx spikes, OOM, swap pressure, and disk pressure.
- [ ] Production or production-like load evidence shows acceptable memory, swap, DB, and queue behavior.
- [ ] Support owner, rollback owner, release owner, deploy owner, and business approver are named.
- [ ] Public rollout scope and provider-write policy are explicitly approved.

## August 30 Staging Evidence

- Commit `38885f4` deployed to staging.
- Migrations applied successfully, including notice provider sync fields, notice sync history, IMS, and provider return summary snapshot migrations.
- Public staging login page returned `200 OK`.
- Public staging auth login returned `200 OK`.
- Staging live smoke passed `2/2`.
- Stage notice sync-history endpoint returned `200 OK`.
- Stage service topology audit passed.
- Stage security posture audit has one remaining warning: filing alert email is disabled until recipient routing/users are confirmed.
- Stage capacity remains non-production-grade: 1.9 GiB RAM, roughly 800 MiB available, and swap in use during validation.

## Recommendation

Use September 1 to launch the 10-customer controlled pilot.

Use September 1-10 to gather real evidence.

Make a public-launch decision on September 10 only after the production audit, monitoring, capacity, and support evidence are complete.
