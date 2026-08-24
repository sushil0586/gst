# Service Topology Verification Worksheet

Date: August 24, 2026

## Purpose

Use this worksheet during Day 1 of the broad-rollout confidence plan to compare:

- expected service topology from repo docs
- actual service topology on the target environment

This exists because the current launch risk is not just whether services should exist.
It is whether the real environment matches the documented assumptions.

## Expected service topology from current docs

Source references:

- [aws-ec2-staging-deployment.md](/Users/ansh/Documents/Gst-Compliance/docs/aws-ec2-staging-deployment.md:259)
- [worker-topology-and-loadtest-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/worker-topology-and-loadtest-runbook.md:68)

Expected app services:

- `gst-backend`
- `gst-frontend`

Expected worker services:

- `gst-celery-imports`
- `gst-celery-reconciliation`
- `gst-celery-filings`
- `gst-celery-scheduled`
- `gst-celery-beat`

Expected queue split:

- imports
- reconciliation
- filings
- scheduled

Expected infra dependencies:

- PostgreSQL
- Redis

## Verification commands

Run these on the target host:

```bash
systemctl list-unit-files | grep -E 'celery|gst'
systemctl list-units --type=service | grep -E 'celery|gst'
ls -1 /etc/systemd/system | grep -E 'celery|gst'
redis-cli ping
sudo -u postgres psql -c '\l'
```

Optional deeper checks:

```bash
systemctl status gst-backend
systemctl status gst-frontend
systemctl status gst-celery-imports
systemctl status gst-celery-reconciliation
systemctl status gst-celery-filings
systemctl status gst-celery-scheduled
systemctl status gst-celery-beat
journalctl -u gst-backend -n 100 --no-pager
journalctl -u gst-celery-filings -n 100 --no-pager
```

## Expected vs actual table

| Area | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- |
| Backend service | `gst-backend` | `gst-backend.service` | `match` | Enabled and running on August 24, 2026. |
| Frontend service | `gst-frontend` | `gst-frontend.service` | `match` | Enabled and running on August 24, 2026. |
| Imports worker | `gst-celery-imports` | `gst-celery-imports.service` | `match` | Installed, enabled, and running on August 24, 2026. |
| Reconciliation worker | `gst-celery-reconciliation` | `gst-celery-reconciliation.service` | `match` | Installed, enabled, and running on August 24, 2026. |
| Filings worker | `gst-celery-filings` | `gst-celery-filings.service` | `match` | Installed, enabled, and running on August 24, 2026. |
| Scheduled worker | `gst-celery-scheduled` | `gst-celery-scheduled.service` | `match` | Installed, enabled, and running on August 24, 2026. |
| Beat service | `gst-celery-beat` | `gst-celery-beat.service` | `match` | Installed, enabled, and running on August 24, 2026. |
| Redis availability | `PONG` | `PONG` | `match` | Redis reachable on host. |
| PostgreSQL availability | local reachable DB | reachable | `match` | `gst_compliance` database present; PostgreSQL reachable. |

Status values to use:

- `match`
- `mismatch`
- `missing`
- `unknown`

## Queue mapping table

| Queue | Expected worker name | Actual worker name | Concurrency | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| imports | `gst-celery-imports` | `gst-celery-imports.service` | `4` | `match` | Running with configured concurrency 4. |
| reconciliation | `gst-celery-reconciliation` | `gst-celery-reconciliation.service` | `4` | `match` | Running with configured concurrency 4. |
| filings | `gst-celery-filings` | `gst-celery-filings.service` | `2` | `match` | Running with configured concurrency 2. |
| scheduled | `gst-celery-scheduled` | `gst-celery-scheduled.service` | `1` | `match` | Running with configured concurrency 1. |

## Mismatch log

Record every mismatch explicitly.

### Mismatch 1

- Expected: clean service-file naming under `/etc/systemd/system`
- Actual: `gst-frontend.service.save`, `gst-frontend.service.save.1`, and `gst-frontend.servicey` also exist
- Impact: suggests manual service-file drift and raises deployment-discipline concerns
- Owner: `TBD`
- Fix required before launch: `no`

## Day 1 closeout

Mark complete only when all of these are true:

- [ ] all expected services were checked
- [ ] actual service names were recorded
- [ ] all queue mappings were recorded
- [ ] all mismatches were logged
- [ ] launch-impacting mismatches were assigned owners
- [ ] the result was copied into `docs/production-launch-ops-checklist-2026-08-24.md`

## Outcome summary

- Reviewer: `Codex with direct SSH checks`
- Environment reviewed: `16.16.166.34`
- Date completed: `August 24, 2026`
- Overall result: `backend, frontend, Redis, Postgres, Celery workers, and beat verified on host`
- Broad-rollout blocker found: `no from topology alone`
- Controlled-launch blocker found: `no from topology alone`
