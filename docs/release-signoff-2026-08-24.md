# Release Signoff Record

Date: August 24, 2026

## Purpose

This document is the final release-decision artifact for the current GST Compliance launch candidate.

It is meant to capture:

- what was verified
- what decision is being recommended
- who owns the release
- what still must be explicitly confirmed before go-live

## Release candidate status

Recommendation: **go for controlled launch after final owner signoff**, not for broad unsupervised rollout.

Why:

- backend verification baseline is green
- frontend launch gate is green
- staging live functional verification is green
- staging live visual smoke is green
- the remaining risk is primarily operational, not feature-completeness risk

## Verified evidence

### Backend

- verification command:
  - `pytest -q`
- last known verified result:
  - `318 passed, 2 warnings`

### Frontend local release gate

- command:
  - `cd gst-compliance-frontend && npm run test:e2e:launch`
- last known verified result:
  - `5 passed`

### Staging environment

- URL:
  - `https://gst-stage.accerio.in`
- demo admin:
  - `demo_admin@example.com`

### Staging live functional verification on August 24, 2026

- result:
  - `14 passed`
- verified areas:
  - auth sign-in, refresh persistence, and sign-out
  - mobile-width auth and navigation
  - dashboard and major signed-in route navigation
  - settings, team, workspace, and change-password flows
  - clients, GSTINs, and compliance periods
  - imports, returns blocker guidance, and reconciliation routing
  - operations, approvals, follow-ups, notices, and audit trail
  - IMS read-only provider checks

### Staging operational incident on August 24, 2026

- login temporarily failed with `500 Internal Server Error`
- root cause:
  - PostgreSQL cluster `16-main` was down after an OOM-kill event during heavy import-related activity
- recovery:
  - PostgreSQL cluster was started manually
  - login endpoint returned `200 OK` afterward
- interpretation:
  - immediate outage resolved
  - broader rollout confidence still depends on capacity and recovery hardening

### Staging security-hardening regression and recovery on August 24, 2026

- after enabling `SECURE_SSL_REDIRECT=True`, staging login regressed again
- root cause:
  - the frontend production bundle still targeted `http://127.0.0.1:8001/api/v1`
  - Django correctly redirected that internal HTTP request path, which broke the Next.js auth proxy route
- recovery:
  - staging frontend API base URL was updated to `https://gst-stage.accerio.in/api/v1`
  - the frontend production bundle was rebuilt
  - `gst-frontend` was restarted
  - `POST https://gst-stage.accerio.in/api/auth/login` returned `200 OK` again
- interpretation:
  - the application-side auth regression was fixed correctly
  - the SSL redirect hardening can remain enabled

### Staging availability instability later on August 24, 2026

- after the auth fix was revalidated, final smoke completion was blocked by environment instability
- observed symptoms:
  - SSH to `16.16.166.34` timed out during banner exchange
  - follow-up external fetches to `https://gst-stage.accerio.in/login` also timed out
- interpretation:
  - this is currently treated as a staging host or access-path availability problem
  - final launch approval should remain pending until the environment is reachable and final smoke can be re-run cleanly

### Staging recovery validation on August 24, 2026

- the staging host became reachable again over SSH
- recovery validation was executed through `tools/staging_recovery_validation.sh`
- verified results:
  - SSH access stable during validation
  - root filesystem healthy at approximately `15G` total with `7.7G` free
  - `gst-backend`, `gst-frontend`, and `postgresql@16-main` all running
  - `https://gst-stage.accerio.in/login` returned `200 OK`
  - `POST https://gst-stage.accerio.in/api/auth/login` returned `200 OK`
  - Playwright live smoke passed after staging browser dependencies were installed:
    - `2 passed (10.2s)`
- additional operational findings:
  - the first Playwright rerun failed because Chromium was not installed on the host
  - the second rerun failed because Linux browser dependencies such as `libatk-1.0.so.0` were missing
  - both issues were corrected with:
    - `npx playwright install chromium`
    - `sudo npx playwright install-deps chromium`
- interpretation:
  - staging availability and core operator flow verification are green again
  - the remaining material risk is memory and capacity hardening, not basic auth or environment reachability
  - the clearest near-term mitigation is to reduce staging Celery concurrency or move GST staging off the shared low-memory host before any broader rollout step

### Staging post-hardening validation on August 24, 2026

- the staging imports and reconciliation workers were reduced from concurrency `4` to `2`
- verification after the tuning change was executed again through `tools/staging_recovery_validation.sh`
- verified results:
  - SSH remained stable through the full validation pass
  - `https://gst-stage.accerio.in/login` returned `200 OK`
  - `POST https://gst-stage.accerio.in/api/auth/login` returned `200 OK`
  - Playwright live smoke passed again:
    - `2 passed (10.4s)`
- capacity signal improvement:
  - swap usage dropped from roughly `770 MiB` during the earlier follow-up review to roughly `361 MiB` after the concurrency reduction and worker restart
- interpretation:
  - the staging environment is in a better operational state than it was before the worker tuning change
  - the risk is reduced, but not eliminated, because GST staging still shares a `1.9 GiB` host with the Finacc stack

### Staging live visual verification on August 24, 2026

- command family:
  - `cd gst-compliance-frontend && npm run test:e2e:live:visual`
- result:
  - `1 passed`
- verified visual areas:
  - dashboard hero
  - imports
  - returns
  - reports
  - IMS
  - settings team management

### Verification refresh on August 30, 2026

- backend verification:
  - `./venv/bin/python -m pytest -q`
  - `319 passed, 2 warnings`
- frontend local release checks:
  - `npm run lint`
    - passed with two existing unused-variable warnings in `tests/e2e/live-ims.spec.ts`
  - `npm run build`
    - passed
  - `npm run test:e2e:launch`
    - `5 passed`
- staging recovery validation:
  - executed through `tools/staging_recovery_validation.sh`
  - SSH reachable
  - `gst-backend`, `gst-frontend`, and `postgresql@16-main` running
  - public login returned `200 OK`
  - public auth login returned `200 OK`
  - live smoke returned `2 passed`
- staging live visual smoke:
  - first run failed on `/imports` because live staging import batches had moved from queued/discarded zero-row state to processed three-row state
  - `live-visual-smoke.spec.ts` was adjusted to stabilize the imports screenshot around first-screen layout and normalize volatile live status text
  - refreshed live baselines were approved for current seeded staging data
  - final result: `1 passed`
- current capacity signal:
  - staging memory remained tight during validation: `1.9 GiB` total RAM, roughly `146 MiB` free, and roughly `510 MiB` swap used
  - this supports controlled launch only, with explicit memory/capacity risk acceptance

## Launch scope covered by this signoff

This signoff currently supports a controlled release for:

1. Returns workflow surfaces in the current supported scope
2. Notices
3. Settings administration surfaces currently in release scope
4. IMS operator workbench in the currently supported read-oriented scope
5. Core authenticated navigation and seeded staging operator flows

## Required named owners

These fields must be filled before final go-live approval:

- Release owner: `TBD`
- Support owner: `TBD`
- Rollback owner: `TBD`
- Production deploy owner: `TBD`
- Business approver: `TBD`

## Required rollout decisions

These decisions must be explicitly recorded before launch:

- Target tenant scope: `Recommended: small named pilot cohort only`
- Rollout mode: `controlled launch`
- Filing scope allowed at launch: `Recommended: approved operator-managed flows only`
- Whether provider write actions are enabled immediately: `Recommended: phased rollout, not broad day-one enablement`
- Whether live staging smoke is mandatory before every release: `Recommended: yes until host-capacity risk is retired`

## Required operational confirmations

These items are not yet confirmed inside this record and still need explicit completion:

1. Production secrets are rotated and stored outside repo-managed env files.
2. Production `check --deploy` posture is acceptable.
3. Celery/systemd service topology is confirmed and matches the intended production deployment.
4. Retention and scheduled jobs are enabled in the target environment.
5. Logging and alert routing exists for auth failures, provider auth failures, and request rejection events.
6. The full release runbook in `docs/live-release-runbook.md` is executed and marked complete by an assigned owner.
7. Capacity and recovery follow-up for the August 24, 2026 Postgres OOM incident is explicitly reviewed.
8. Staging host/public availability is stable enough to complete final release validation without SSH or HTTP timeouts.
9. Memory-pressure follow-up from the Gunicorn worker timeout and probable OOM-style recycle on August 24, 2026 is explicitly reviewed.

Use this checklist to close these items:

- `docs/production-launch-ops-checklist-2026-08-24.md`

Recommended execution track for closing them this week:

- `docs/sep-1-10-customer-controlled-launch-plan-2026-09-01.md`
- `docs/one-week-broad-rollout-confidence-plan-2026-08-24.md`
- `docs/postgres-oom-mitigation-plan-2026-08-24.md`

## Go decision rule

Approve controlled launch only if all of the following are true:

1. Backend verification is green.
2. Frontend launch gate is green.
3. Staging live functional smoke is green.
4. Staging live visual smoke is green.
5. Staging availability is stable during final validation.
6. Release owner and support owner are explicitly assigned.
7. Target tenant scope is explicitly documented.
8. Production security and worker topology confirmations are complete.
9. Rollback owner is named and rollback path is understood.
10. Memory/capacity risk acceptance is explicit for the intended rollout scope.

## No-go conditions

Do not approve launch if any of the following are true:

1. Staging auth or operator flows are unreliable.
2. Staging host access or public staging availability is unstable.
3. Required release checks are failing.
4. Target tenant scope is not explicitly bounded.
5. Production worker/service topology is still unclear.
6. Support handling for first-cycle incidents is not assigned.
7. Rollback responsibility is unclear.
8. Memory-pressure risk is not understood or accepted for the intended rollout scope.

## Decision log

- August 24, 2026:
  - Controlled-launch recommendation recorded based on green backend baseline, green frontend launch gate, green staging functional smoke, and green staging visual smoke.
  - Remaining work is primarily operational signoff and production-environment confirmation.
  - A staging login outage caused by a down PostgreSQL cluster after an OOM event was recovered manually; this remains a capacity/reliability risk for broader rollout.
  - A second staging login regression introduced during SSL hardening was corrected by moving the frontend API base URL to the public HTTPS staging API and rebuilding the production frontend bundle.
  - Final signoff was intentionally left pending because staging SSH/public availability later became unstable during final smoke completion.
  - Staging recovery validation later completed successfully: SSH recovered, public login and auth returned `200 OK`, and the live smoke suite passed after installing missing Playwright browser/runtime dependencies on the host.
  - Backend logs still showed a Gunicorn worker timeout and likely memory-pressure recycle earlier in the day, so broader rollout remains capped by capacity hardening rather than auth or route health.
  - Imports and reconciliation worker concurrency were then reduced from `4` to `2`, and the full staging recovery validation passed again with lower swap pressure afterward.

## Final approval

- Decision: `Pending final named-owner approval`
- Approved by: `TBD`
- Approval timestamp: `TBD`
- Release window: `TBD`
- Rollback window: `TBD`
