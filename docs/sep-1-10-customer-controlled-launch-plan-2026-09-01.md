# September 1 Controlled Launch Plan

Launch date: September 1, 2026

Pilot size: 10 named customers only

## Purpose

This is the execution plan for launching GST Compliance to a 10-customer controlled pilot on September 1, 2026.

Use it to answer:

- who is allowed into the launch
- what features are enabled
- what must be proven before go-live
- how the first week is monitored
- when to stop, rollback, or pause expansion

Use together with:

- [final-go-no-go-checklist-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/final-go-no-go-checklist-2026-08-24.md:1)
- [release-signoff-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/release-signoff-2026-08-24.md:1)
- [production-launch-ops-checklist-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/production-launch-ops-checklist-2026-08-24.md:1)
- [live-release-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/live-release-runbook.md:1)
- [public-launch-blocker-burn-down-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/public-launch-blocker-burn-down-2026-08-30.md:1)
- [postgres-oom-mitigation-plan-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/postgres-oom-mitigation-plan-2026-08-24.md:1)

## Launch Decision

Current recommendation:

- controlled 10-customer pilot: `Go after final owner, production posture, and customer-scope signoff`
- broad rollout: `No-go`

Decision rule:

- launch only if every item in `Must Be Complete Before September 1` is complete
- launch only for the 10 named customers recorded in this document or the linked signoff artifact
- do not expand beyond 10 customers before the September 10 review

## Supported Launch Scope

Allowed for September 1:

- login and authenticated navigation
- workspace, client, GSTIN, and compliance-period setup
- imports
- reconciliation review
- return readiness and preparation surfaces
- notices
- IMS operator/read-oriented surface
- settings, workspace, and team administration
- reports and audit trail

Allowed filing mode:

- operator-managed filing flow only
- maker-checker must remain enabled
- provider write actions must remain phased unless explicitly approved in final signoff

Not approved for September 1:

- broad self-serve rollout
- unsupervised provider write enablement for all customers
- launch to customers outside the named pilot list
- broad rollout from the current low-memory staging evidence alone

## Named Owners

These must be filled before go-live:

- Release owner: `TBD`
- Production deploy owner: `TBD`
- Support owner: `TBD`
- Rollback owner: `TBD`
- Business approver: `TBD`
- Engineering on-call primary: `TBD`
- Engineering on-call backup: `TBD`

## Pilot Customer Register

Fill this before September 1 go-live.

| # | Customer / tenant | Workspace ID | Primary contact | Internal owner | Enabled scope | Provider writes | Status |
|---|---|---|---|---|---|---|---|
| 1 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 2 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 3 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 4 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 5 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 6 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 7 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 8 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 9 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |
| 10 | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `disabled / phased / enabled` | `pending` |

## Must Be Complete Before September 1

- [ ] Release owner, support owner, rollback owner, deploy owner, business approver, and on-call owners are named.
- [ ] The 10-customer register is filled and approved.
- [ ] Production secrets are rotated and stored outside repo-managed env files.
- [ ] Production transport settings are confirmed: `DEBUG=False`, secure cookies, SSL redirect, HSTS, and forwarded-proto handling.
- [ ] Production `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` are reviewed.
- [ ] Production `manage.py check`, `manage.py check --deploy`, and `audit_security_posture` are reviewed and accepted.
- [ ] Production frontend `npm run lint && npm run build` passes.
- [ ] Actual production service topology is recorded: backend, frontend, Redis, Postgres, queue workers, scheduled worker, and Celery Beat.
- [ ] Retention and scheduled jobs are enabled or consciously deferred with owner approval.
- [ ] Logging and alert routing exists for auth failures, provider auth failures, request rejections, worker failures, and 5xx spikes.
- [ ] Rollback procedure and rollback owner are confirmed.
- [ ] September 1 release window and rollback window are recorded.
- [ ] Memory/capacity risk is explicitly accepted for the 10-customer pilot scope.
- [ ] Final staging validation is green on launch day.

## August 30: Candidate Freeze

Objective:

- freeze the launch candidate and stop non-critical product churn

Tasks:

- [x] Backend verification passed: `319 passed, 2 warnings`.
- [x] Frontend lint passed with two existing warnings.
- [x] Frontend production build passed.
- [x] Frontend launch gate passed: `5 passed`.
- [x] Staging recovery validation passed.
- [x] Staging live visual smoke passed after approved live-baseline refresh.
- [ ] Confirm no open critical or high-severity product bugs remain.
- [ ] Freeze code changes except release blockers, production deployment fixes, and documentation/signoff updates.

## August 31: Production Readiness Closeout

Objective:

- convert technical readiness into production launch readiness

Required production commands:

```bash
./venv/bin/python manage.py check
./venv/bin/python manage.py check --deploy
./venv/bin/python manage.py audit_security_posture --fail-on-warn
./venv/bin/python manage.py enforce_security_retention --audit-days 1 --filing-days 1 --provider-auth-days 1 --import-days 1
cd gst-compliance-frontend && npm run lint && npm run build
```

Repeatable audit helper:

```bash
bash tools/public_launch_readiness_audit.sh
```

Retention enforcement mutates old sensitive payloads. The helper skips it by default; enable it only after confirming the target environment and retention windows are approved.

Required production topology commands:

```bash
systemctl list-unit-files | grep -E 'celery|gst'
systemctl list-units --type=service | grep -E 'celery|gst'
ls -1 /etc/systemd/system | grep -E 'celery|gst'
redis-cli ping
```

Record results:

- Command runner: `TBD`
- Environment checked: `TBD`
- Date/time checked: `TBD`
- Evidence location: `TBD`
- Exceptions accepted: `TBD`

Exit criteria:

- all production checks are passed or explicitly accepted
- all owners are named
- all 10 customers are recorded
- rollback path is rehearsed enough that the rollback owner can execute it without new design work

## September 1: Launch-Day Runbook

Recommended launch window:

- start: `TBD`
- end: `TBD`
- rollback decision time: `TBD`

Pre-launch checks:

```bash
bash tools/staging_recovery_validation.sh
cd gst-compliance-frontend && npm run test:e2e:launch
cd gst-compliance-frontend && PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com PLAYWRIGHT_LIVE_PASSWORD=demo12345 npm run test:e2e:live:visual
```

Production release steps:

1. Announce release window internally.
2. Confirm production backup/snapshot point.
3. Deploy backend.
4. Apply migrations.
5. Restart backend and workers.
6. Deploy frontend with production API base URL.
7. Restart frontend.
8. Verify production login and auth.
9. Verify production workspace context.
10. Enable only the 10 named pilot customers.
11. Confirm maker-checker and tenant rollout enforcement.
12. Keep provider write enablement phased unless final signoff says otherwise.
13. Run one guided customer workflow before opening access to the remaining pilot customers.
14. Announce pilot access to the 10-customer support group.

Launch-day validation:

- [ ] production login works
- [ ] password reset works
- [ ] workspace/client/GSTIN/period context loads
- [ ] import page loads
- [ ] sample import path succeeds for one pilot workspace or staging-equivalent production tenant
- [ ] reconciliation page loads
- [ ] returns readiness loads
- [ ] notices page loads
- [ ] IMS page loads
- [ ] audit trail captures expected activity
- [ ] support owner can see enough information to triage first-cycle issues

## Rollback And Pause Rules

Pause new customer activation if:

- production auth fails for any pilot customer and cannot be resolved within 30 minutes
- production 5xx rate rises above the agreed threshold
- worker queues stall or imports do not process
- Postgres, Redis, or the app host shows sustained memory/swap pressure
- provider auth failures affect more than one pilot customer
- filing state becomes ambiguous for any live provider action

Rollback if:

- login or core workspace context fails for multiple pilot customers
- data integrity is in doubt
- filings or provider write actions enter an unrecoverable or unclear state
- production deployment cannot be stabilized within the rollback window
- the release owner, support owner, or rollback owner calls no-go

Rollback actions:

1. Disable tenant rollout policy for affected customers.
2. Disable provider write feature flags for affected operations.
3. Stop new filing starts.
4. Keep read-only access if safe.
5. Record incident notes for in-flight work.
6. Restore previous deploy artifact if application regression is confirmed.
7. Re-run auth, imports, returns, notices, and audit smoke checks.

## September 1-3: Hypercare

Cadence:

- morning readiness check
- mid-day support review
- end-of-day launch health review

Daily checks:

- [ ] all pilot customers can log in
- [ ] all pilot customers have the intended workspace/client/GSTIN/period setup
- [ ] imports are processing
- [ ] reconciliation and return readiness are loading
- [ ] no unresolved critical support tickets
- [ ] no unresolved provider auth failures
- [ ] no unexplained 5xx spike
- [ ] no worker queue backlog requiring manual intervention
- [ ] memory, swap, and disk pressure reviewed

## September 4-10: Controlled Confidence Build

Do not expand beyond the original 10 customers unless explicitly approved.

Focus:

- stabilize first-cycle workflows
- resolve support issues
- review import volumes and processing times
- review provider auth and filing readiness
- review memory/swap behavior under real pilot usage
- prepare September 10 continue/pause/expand recommendation

September 10 decision options:

- continue 10-customer pilot
- expand to the next named cohort
- pause expansion until operational risks are reduced
- roll back provider write scope while keeping read/review features available

## Final Signoff Block

```text
GST Compliance 10-Customer Controlled Launch Signoff
Date: September 1, 2026

Decision: Go / No-go

Release owner:
Production deploy owner:
Support owner:
Rollback owner:
Business approver:
Engineering on-call primary:
Engineering on-call backup:

Pilot customer count: 10
Pilot customer register approved: Yes / No

Target tenant scope:
Filing scope:
Provider write mode:
Maker-checker enforcement:
Tenant rollout enforcement:

Release window:
Rollback window:

Production check posture:
Secrets posture:
Service topology posture:
Logging and alerting posture:

Risk acceptance:

Approval notes:
```
