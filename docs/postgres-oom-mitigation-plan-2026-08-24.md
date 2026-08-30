# Postgres OOM Mitigation Plan

Date: August 24, 2026

## Purpose

This plan addresses the staging incident observed on August 24, 2026 where:

- the PostgreSQL cluster `16-main` was OOM-killed
- staging login started returning `500 Internal Server Error`
- the cluster required manual restart before the product recovered

The goal is not only to restore service.

The goal is to reduce the chance of repeat failure and make recovery faster and more predictable if memory pressure happens again.

## Incident summary

Observed facts:

- PostgreSQL cluster `16-main` was down
- Django login failed because database connections to `127.0.0.1:5432` were refused
- systemd logs showed the cluster was killed by the OOM killer
- PostgreSQL logs showed the failure happened during heavy import-related insert activity
- root disk pressure was also high on the same day before storage was expanded
- service recovered after manual cluster restart
- follow-up verification still showed the mounted root volume at `6.8G` with `96%` used, so the intended storage expansion was not yet reflected on `/`
- the root partition and filesystem were later expanded successfully, bringing `/` to approximately `15G` with about `7.8G` free
- after security hardening, staging login regressed a second time because the deployed frontend build still pointed at `http://127.0.0.1:8001/api/v1`
- that auth regression was corrected by switching the staging frontend API base URL to `https://gst-stage.accerio.in/api/v1`, rebuilding the production frontend, and revalidating login at `200 OK`
- later follow-up validation was blocked by staging host instability:
  - SSH to `16.16.166.34` timed out during banner exchange
  - external fetches to `https://gst-stage.accerio.in/login` also timed out during revalidation attempts
- staging later recovered and the validation pass completed successfully:
  - SSH access stabilized
  - public login and auth returned `200 OK`
  - Playwright live smoke passed after installing missing Chromium and Linux browser dependencies on the host
- staging post-hardening validation later completed successfully again:
  - imports and reconciliation concurrency were reduced from `4` to `2`
  - SSH remained stable
  - public login and auth remained `200 OK`
  - Playwright live smoke passed again
  - swap usage improved from roughly `770 MiB` to roughly `361 MiB`
- backend logs from the same day still showed a Gunicorn worker timeout and likely memory-pressure worker recycle:
  - `WORKER TIMEOUT`
  - `Worker ... was sent SIGKILL! Perhaps out of memory?`

Practical interpretation:

- this was a real runtime-capacity incident
- the product recovered, but broader rollout confidence should remain capped until we harden this path and confirm host availability is stable after recovery/config changes

## Risk statement

Current risk:

- heavy imports or related error-row writes can create enough memory pressure to destabilize the database process on a small environment
- even after the app-side auth regression was fixed and staging recovered, memory pressure still appears capable of destabilizing backend workers on this host size

Why this matters:

- a database outage cascades into login failure
- the issue affects both usability and confidence in recovery
- manual restart is acceptable for controlled launch only if it is explicitly owned and documented
- if the host becomes intermittently unreachable after recovery, final release verification and incident handling are both weakened
- even when public auth works, backend worker recycling under memory pressure can still reduce rollout confidence materially

## Immediate mitigation actions

These should be completed first.

### 1. Keep storage pressure under control

- confirm the host now has the expanded 16 GB volume mounted on `/`
- keep root usage comfortably below 85%
- remove stale build artifacts, logs, and unused packages if needed
- verify Postgres has room for WAL and temp files

Earlier observed state on August 24, 2026:

- mounted root volume: `6.8G`
- used: `96%`
- available: `289M`

Resolved follow-up state on August 24, 2026:

- root partition `nvme0n1p1` was expanded
- ext4 filesystem on `/` was grown online
- mounted root volume now shows approximately `15G`
- used: `47%`
- available: `7.8G`

Interpretation:

- the underlying cloud disk had been enlarged, but the root partition/filesystem had not yet been expanded
- storage pressure from the earlier state is no longer the immediate critical risk
- capacity hardening should now focus more on database memory pressure and import workload shape than raw disk shortage

Exit criteria:

- root filesystem usage is below 85%
- there is enough headroom for logs, builds, imports, and DB temp files

### 2. Confirm the database cluster auto-recovers cleanly

- verify `postgresql@16-main` starts on reboot
- verify the service is enabled and healthy after restart
- document the exact recovery command used:
  - `sudo pg_ctlcluster 16 main start`
- add a short validation sequence after restart:
  - cluster online
  - TCP port `5432` listening on `127.0.0.1`
  - login endpoint returns `200`
  - public staging login page responds normally
  - SSH remains stable long enough to complete smoke and log review

Exit criteria:

- DB restart procedure is documented and tested
- support/deploy owners know how to validate recovery
- recovery does not leave the environment in a partially healthy but operationally unstable state

### 3. Re-run post-recovery staging smoke

- run login
- load dashboard
- load imports
- load returns
- run the live smoke suite if practical
- confirm SSH/log access remains available throughout validation

Exit criteria:

- the recovered environment behaves normally after DB restart
- recovery validation can be completed without new host-access instability

## Near-term hardening actions

These are the highest-value actions for the next few days.

### 4. Reduce import pressure on Postgres

Investigate the import path that triggered the OOM event:

- large `import_row_errors` inserts
- very large bulk payloads in one transaction
- memory-heavy error materialization

Recommended review questions:

- are row-error inserts chunked safely
- are very large error arrays being built in memory before insert
- can row-error persistence be streamed or chunked more aggressively
- can the error payload stored in `raw_row` be trimmed or normalized

Status update on August 24, 2026:

- import row error and transaction writes were updated to use chunked `bulk_create` calls in `apps/imports/services/parsers/base.py`
- regression coverage was added in `apps/imports/tests.py`
- local verification result for the import suite change:
  - `36 passed`
- staging recovery validation result after environment repair:
  - public login/auth green
  - live smoke green
  - memory/capacity follow-up still required because of Gunicorn timeout/SIGKILL evidence

Interpretation:

- one concrete application-side mitigation is already in place
- the remaining question is whether environment sizing and worker tuning are now sufficient for realistic staging/prod import volumes

Exit criteria:

- team identifies whether the OOM risk is primarily environment size, import write pattern, or both
- the implemented chunking change is deployed and verified on the target environment
- one additional import-memory mitigation is selected if chunking alone is not enough

### 5. Add environment-level memory safeguards

Review:

- instance size
- swap configuration
- Postgres memory settings
- Celery concurrency settings

Suggested checks:

- `shared_buffers`
- `work_mem`
- `maintenance_work_mem`
- imports worker concurrency
- reconciliation worker concurrency
- swap presence and size
- recent OOM events in `journalctl -k`
- load average and memory profile during/after heavy imports

Practical principle:

- staging should not be tuned like a large production host
- but it should not be so small that ordinary test imports can kill the database

Observed staging profile on August 24, 2026:

- host memory:
  - `1.9 GiB` RAM total
  - approximately `770 MiB` swap already in use during follow-up review
- Postgres settings:
  - `shared_buffers=128MB`
  - `work_mem=4MB`
  - `maintenance_work_mem=64MB`
  - `effective_cache_size=4GB`
  - `max_connections=100`
- worker topology on the same host:
  - imports queue concurrency `4`
  - reconciliation queue concurrency `4`
  - filings queue concurrency `2`
  - scheduled queue concurrency `1`
  - Django backend gunicorn workers `1`
- co-tenancy note:
  - the same EC2 host is also running the Finacc application stack, including a separate gunicorn service using three workers
- observed service peaks:
  - `gst-celery-imports.service` peak memory `232.1M`, swap peak `222.9M`
  - `gst-celery-reconciliation.service` peak memory `219.1M`, swap peak `186.3M`
  - `gst-celery-filings.service` peak memory `132.3M`, swap peak `112.1M`
  - `gst-celery-scheduled.service` peak memory `104.6M`, swap peak `90.0M`
  - `gst-celery-beat.service` peak memory `76.3M`, swap peak `70.4M`
- kernel evidence:
  - `postgres` was OOM-killed on August 24, 2026 at 07:51 UTC
  - backend logs later showed Gunicorn worker timeout and likely memory-pressure recycle

Practical interpretation:

- current Postgres settings are not obviously oversized
- the stronger risk signal is total host oversubscription:
  - multiple Celery workers
  - Next.js frontend
  - Django backend
  - PostgreSQL
  - Redis
  - Finacc stack on the same machine
  - all competing inside less than `2 GiB` RAM

Recommended staging tuning change for immediate risk reduction:

- reduce imports concurrency from `4` to `2`
- reduce reconciliation concurrency from `4` to `2`
- keep filings at `2` for now
- keep scheduled at `1`
- keep gunicorn at `1` worker unless request latency becomes unacceptable

Status on August 24, 2026:

- imports concurrency was reduced to `2`
- reconciliation concurrency was reduced to `2`
- post-change staging validation remained green
- swap pressure improved materially, but host free memory remains tight

Recommended environment recommendation:

- preferred: move GST staging to a dedicated host or increase instance memory materially before broader rollout
- minimum short-term: lower Celery concurrency on this shared host before the next heavy import or reconciliation run

Exit criteria:

- memory-sensitive settings are reviewed
- one explicit environment-sizing recommendation is recorded
- one explicit worker-concurrency recommendation is recorded
- Gunicorn worker-memory behavior is reviewed alongside database memory pressure, not treated as a separate unrelated symptom

### 6. Add monitoring around DB survival signals

Track:

- Postgres service state
- root disk usage
- memory usage
- swap pressure
- repeated import failures
- repeated `connection refused` DB errors in backend logs
- SSH/banner timeouts during or after recovery work
- public HTTP timeout symptoms on the staging URL

Useful signals:

- `postgresql@16-main.service` health
- `gst_compliance.performance` slow requests
- `gst_compliance.security` and application error logs
- system journal for OOM events

Exit criteria:

- operators know what to check before the next heavy import run
- at least one alert or manual watch point exists for DB health
- operators know how to distinguish DB failure, frontend misconfiguration, and host-level availability drift

## Recommended recovery runbook snippet

If staging login starts returning `500` and backend logs show database connection refusal:

1. Check cluster state:
   - `pg_lsclusters`
2. If cluster is down:
   - `sudo pg_ctlcluster 16 main start`
3. Validate listener:
   - `ss -ltnp | grep 5432`
4. Validate app:
   - test `https://gst-stage.accerio.in/api/auth/login`
   - test `https://gst-stage.accerio.in/login`
5. Review logs:
   - `sudo journalctl -u postgresql@16-main -n 120 --no-pager`
   - `sudo journalctl -u gst-backend -u gst-frontend -n 120 --no-pager`
   - `sudo tail -n 120 /var/log/postgresql/postgresql-16-main.log`
6. Confirm host access is still healthy:
   - retry SSH
   - check whether the public staging URL still responds
7. Record whether the cause appears to be:
   - OOM
   - disk pressure
   - config issue
   - corrupted shutdown
   - host/network instability

## Recommended next validation pass

Once SSH to staging is stable again, run this sequence in order:

1. Basic host health:
   - `uptime`
   - `free -h`
   - `df -h`
2. Core services:
   - `sudo systemctl status gst-backend gst-frontend postgresql@16-main --no-pager`
3. Recent incident logs:
   - `sudo journalctl -u gst-backend -u gst-frontend -u postgresql@16-main -n 200 --no-pager`
4. Local service reachability:
   - `curl -I http://127.0.0.1:8001`
   - `curl -I http://127.0.0.1:3001`
5. Public auth validation:
   - `curl -sS -D - -o /tmp/gst-login.out -X POST https://gst-stage.accerio.in/api/auth/login -H 'Content-Type: application/json' --data '{"email":"demo_admin@example.com","password":"demo12345"}'`
6. Full user-flow smoke:
   - `cd /srv/gst-compliance/gst/gst-compliance-frontend && npx playwright test tests/e2e/live-smoke.spec.ts --project=chromium`

Optional helper:

- use `tools/staging_recovery_validation.sh` from the repo root to run the same sequence as one repeatable validation pass

Success criteria for this pass:

- host access remains stable throughout
- core services stay healthy
- login remains `200 OK`
- smoke completes without environment-level interruption

Status on August 24, 2026:

- completed successfully after staging recovered
- follow-up action remains open because backend logs showed worker timeout/SIGKILL evidence consistent with memory pressure earlier in the day
- completed successfully again after reducing imports and reconciliation concurrency to `2`
- the second pass strengthens controlled-launch confidence because it combines green user-flow smoke with improved swap headroom

## Confidence impact

If this mitigation plan is completed well:

- controlled-launch confidence should rise because recovery becomes predictable
- broader rollout confidence should rise because runtime risk is no longer undocumented or unmanaged
- staging confidence should rise further only if host/public availability remains stable after the fix and smoke rerun
- controlled-launch confidence can rise now that staging smoke is green again
- broad-rollout confidence should remain capped until worker/database memory hardening is reviewed explicitly
- the post-hardening rerun supports a modest confidence increase because it improved the host memory profile without breaking staging flows

If it is not completed:

- confidence remains capped because database survival under pressure is still uncertain

## Done condition

This plan is complete when:

- the August 24, 2026 incident is documented
- recovery steps are documented and tested
- disk headroom is confirmed
- the chunked import-write mitigation is deployed and verified on the target environment
- one concrete environment/memory recommendation is selected
- DB health monitoring expectations are recorded
- a stable post-recovery validation pass is completed without SSH or HTTP timeout symptoms
