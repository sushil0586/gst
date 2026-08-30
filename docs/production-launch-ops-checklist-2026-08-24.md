# Production Launch Ops Checklist

Date: August 24, 2026

## Purpose

This checklist converts the remaining operational launch gaps into a single closeout sheet for the release owner, deploy owner, and support owner.

Use it together with:

- [release-signoff-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/release-signoff-2026-08-24.md:1)
- [live-release-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/live-release-runbook.md:1)
- [production-security-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/production-security-checklist.md:1)
- [worker-topology-and-loadtest-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/worker-topology-and-loadtest-runbook.md:1)
- [one-week-broad-rollout-confidence-plan-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/one-week-broad-rollout-confidence-plan-2026-08-24.md:1)
- [public-launch-blocker-burn-down-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/public-launch-blocker-burn-down-2026-08-30.md:1)
- [postgres-oom-mitigation-plan-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/postgres-oom-mitigation-plan-2026-08-24.md:1)

## Launch owners

- Release owner: `TBD`
- Production deploy owner: `TBD`
- Support owner: `TBD`
- Rollback owner: `TBD`
- Completion date: `TBD`

## 1. Security posture

### Secrets

- [ ] `SECRET_KEY` is production-only and strong
- [ ] `JWT_SIGNING_KEY` is production-only and strong
- [ ] WhiteBooks and other provider credentials have been rotated if previously shared
- [ ] Secrets are stored in a secret manager, deployment secret store, or equivalent non-repo mechanism

Evidence:

- Secret source confirmed: `TBD`
- Rotation confirmed by: `TBD`
- Date confirmed: `TBD`

### Transport and cookie safety

- [ ] `DEBUG=False`
- [ ] `SECURE_SSL_REDIRECT=True`
- [ ] `SESSION_COOKIE_SECURE=True`
- [ ] `CSRF_COOKIE_SECURE=True`
- [ ] `SECURE_HSTS_SECONDS` is set to a positive production value
- [ ] `WHITEBOOKS_SSL_VERIFY=True`
- [ ] `USE_X_FORWARDED_PROTO=True` if TLS terminates before Django

Evidence:

- Environment checked by: `TBD`
- Host or service checked: `TBD`
- Date confirmed: `TBD`

### Surface area and abuse protection

- [ ] `ENABLE_API_DOCS=False` unless explicitly approved
- [ ] `ALLOWED_HOSTS` contains only intended production hosts
- [ ] `CORS_ALLOWED_ORIGINS` contains only intended frontend origins
- [ ] `CSRF_TRUSTED_ORIGINS` contains only intended frontend origins
- [ ] auth and provider throttles are reviewed for production traffic

Evidence:

- Config reviewer: `TBD`
- Final host/origin set: `TBD`
- Throttle decision notes: `TBD`

## 2. Security verification commands

Run these on the target release environment:

```bash
./venv/bin/python manage.py check
./venv/bin/python manage.py check --deploy
./venv/bin/python manage.py audit_security_posture --fail-on-warn
./venv/bin/python manage.py enforce_security_retention --audit-days 1 --filing-days 1 --provider-auth-days 1 --import-days 1
cd gst-compliance-frontend && npm run lint && npm run build
```

For a repeatable public-launch audit, run:

```bash
bash tools/public_launch_readiness_audit.sh
```

The helper skips retention enforcement by default because retention mutates old sensitive payloads. Set `RUN_RETENTION_EXERCISE=true` only on an approved target environment.

Record outcomes:

- [x] `manage.py check` passed on staging on August 30, 2026
- [x] `manage.py check --deploy` reviewed on staging on August 30, 2026; remaining warnings are drf-spectacular schema warnings, not runtime launch blockers
- [ ] `audit_security_posture` reviewed and acceptable
- [ ] retention command completed successfully
- [x] frontend lint completed successfully on August 30, 2026 with two existing non-blocking `live-ims.spec.ts` unused-variable warnings
- [x] frontend build completed successfully on August 30, 2026

Evidence:

- Command runner: `Codex`
- Date run: `August 30, 2026`
- Output location or paste link: `Current terminal session; stage deploy validated at commit 38885f4`
- Remaining audit note: `Staging audit has one warning: FILING_ALERT_EMAIL_ENABLED=False. Do not enable filing alert email until alert routing is confirmed through active users in FILING_DEFAULT_ALERT_RECIPIENT_ROLES or explicit OperationalAlertRoutingRule rows.`

## 3. Worker and service topology

### Minimum expected production topology

The intended topology should be explicitly confirmed before launch:

- [ ] `gst-backend` service exists and runs
- [ ] `gst-frontend` service exists and runs
- [ ] imports worker service exists and runs
- [ ] reconciliation worker service exists and runs
- [ ] filings worker service exists and runs
- [ ] scheduled worker service exists and runs
- [ ] celery beat service exists and runs
- [ ] Redis exists and is reachable
- [ ] Postgres exists and is reachable

Recommended queue split:

- imports
- reconciliation
- filings
- scheduled

Evidence:

- Actual service names: `gst-backend`, `gst-frontend`, `postgresql@16-main`, `gst-celery-imports`, `gst-celery-reconciliation`, `gst-celery-filings`, `gst-celery-scheduled`, `gst-celery-beat`
- Queue-to-service mapping: `imports`, `reconciliation`, `filings`, `scheduled`, plus Celery Beat
- Verified by: `Codex on staging`
- Date confirmed: `August 30, 2026`

Recommended worksheet:

- [service-topology-verification-worksheet-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/service-topology-verification-worksheet-2026-08-24.md:1)

### Service verification commands

Run commands like these on the target host:

```bash
bash tools/service_topology_audit.sh
```

If service names differ from the defaults, set `REQUIRED_SYSTEMD_SERVICES` to the exact comma-separated service names before running the audit.

Record outcomes:

- [x] Unit-file list reviewed on staging
- [x] Running-service list reviewed on staging
- [x] Systemd service files reviewed by `tools/service_topology_audit.sh`
- [x] Redis connectivity confirmed with `PONG`
- [ ] Missing or renamed worker units reconciled with the deployment docs

Evidence:

- Host reviewed: `16.16.166.34`
- Reviewer: `Codex`
- Notes on mismatches: `No staging service topology mismatches found on August 30, 2026`

## 4. Retention, scheduled jobs, and observability

- [ ] `SECURITY_RETENTION_ENABLED=True`
- [ ] retention window values are reviewed
- [ ] Celery Beat is running in the target environment
- [ ] security log destination is writable and monitored
- [ ] `gst_compliance.security` logging is forwarded or otherwise captured
- [ ] alerting exists for repeated `auth.login_failed`
- [ ] alerting exists for repeated `provider_auth.failed`
- [ ] alerting exists for repeated `request.rejected`

Evidence:

- Beat service name: `gst-celery-beat`
- Log destination: `TBD`
- Alerting destination: `TBD; filing alert routing/users still need confirmation on staging`
- Verified by: `Codex for service presence on August 30, 2026; alert routing owner still needed`

### Capacity and recovery checks

- [ ] root disk usage is at a safe operating level after the August 24, 2026 storage incident
- [ ] PostgreSQL cluster health is confirmed after the August 24, 2026 OOM-kill outage
- [ ] Postgres recovery steps are documented for the active environment
- [ ] import workload and large-row-error behavior are reviewed for memory-pressure risk
- [ ] host SSH access and public app availability remain stable during release validation
- [ ] frontend production environment variables are aligned with hardened transport settings before rebuilding and restarting services

Evidence:

- Current disk usage: `August 24, 2026 follow-up after root partition/filesystem expansion showed /dev/root at 47% used with 7.8G free on a 15G mounted root volume`
- Current Postgres cluster status: `online after manual restart of postgresql@16-main`
- Frontend transport/alignment note: `August 24, 2026 staging login regressed after SECURE_SSL_REDIRECT was enabled because the deployed frontend build still targeted http://127.0.0.1:8001/api/v1; corrected by switching NEXT_PUBLIC_API_BASE_URL to https://gst-stage.accerio.in/api/v1 and rebuilding the frontend`
- Current availability note: `Later on August 24, 2026, SSH to 16.16.166.34 timed out during banner exchange and follow-up public staging fetches also timed out; staging later recovered and full recovery validation succeeded, including 200 OK public login/auth checks and a passing Playwright live smoke`
- Browser automation readiness note: `Staging required both npx playwright install chromium and sudo npx playwright install-deps chromium before live smoke could run successfully`
- Remaining memory-pressure note: `Backend logs still showed a Gunicorn worker timeout and likely OOM-style worker recycle earlier on August 24, 2026; capacity follow-up remains required before broad rollout`
- Staging sizing/tuning note: `The host has only 1.9 GiB RAM and is also running the Finacc stack; imports and reconciliation concurrency were reduced from 4 to 2 on August 24, 2026, and swap usage improved from roughly 770 MiB to roughly 361 MiB after the change, but a larger or dedicated host is still the stronger broad-rollout option`
- August 30, 2026 stage deploy note: `Commit 38885f4 deployed; migrations applied; frontend build completed; all GST services active; public login/auth smoke passed; live smoke passed 2/2; notice sync-history endpoint returned 200 OK`
- August 30, 2026 host health note: `Staging host showed 1.9 GiB RAM, about 800 MiB available, and 488 MiB swap in use during validation`
- Recovery owner: `TBD`
- Incident notes link: `TBD`

## 5. Release-runbook execution

- [ ] auth smoke completed
- [ ] user-management path completed
- [ ] notices path completed
- [ ] live-data path completed
- [ ] filing control path completed to the approved rollout boundary
- [ ] screenshots and support evidence captured

Evidence:

- Runbook executor: `TBD`
- Run date: `TBD`
- Evidence location: `TBD`

## 6. Final go/no-go closeout

Mark complete only when all required sections above are done.

- [ ] Release owner approves controlled launch
- [ ] Deploy owner approves environment readiness
- [ ] Support owner approves first-cycle support readiness
- [ ] Rollback owner confirms rollback path

Final notes:

- Go / no-go decision: `TBD`
- Approved release window: `TBD`
- Rollback window: `TBD`
- Open risks accepted explicitly: `TBD`
