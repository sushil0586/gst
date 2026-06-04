# Worker Topology And Load-Test Runbook

This runbook turns the scale-readiness plan into something the team can actually run before onboarding larger customer cohorts.

It covers:

- recommended Celery worker split
- the environment knobs that matter for worker behavior
- practical launch commands for local and production-like staging
- a lightweight authenticated load probe for hot API paths

Use this together with:

- [scale-readiness-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/scale-readiness-plan.md:1)
- [observability-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/observability-runbook.md:1)
- [performance-guardrails.md](/Users/ansh/Documents/Gst-Compliance/docs/performance-guardrails.md:1)

## Recommended queue split

Current queues:

- `imports`
- `reconciliation`
- `filings`
- `scheduled`

Recommended purpose:

- `imports`
  - import parsing
  - import processing
  - import reprocessing
- `reconciliation`
  - reconciliation runs
  - mismatch-heavy calculations
- `filings`
  - return filing requests
  - filing status sync
  - provider-dependent retry work
- `scheduled`
  - digests
  - reminders
  - security retention

If async exports are added later, introduce a separate `exports` queue instead of sharing with `scheduled`.

## Worker tuning knobs

These are now environment-configurable:

- `CELERY_TASK_TIME_LIMIT`
- `CELERY_TASK_SOFT_TIME_LIMIT`
- `CELERY_TASK_ACKS_LATE`
- `CELERY_WORKER_PREFETCH_MULTIPLIER`
- `CELERY_WORKER_MAX_TASKS_PER_CHILD`
- `CELERY_WORKER_SEND_TASK_EVENTS`
- `CELERY_IMPORTS_QUEUE`
- `CELERY_RECONCILIATION_QUEUE`
- `CELERY_FILINGS_QUEUE`
- `CELERY_SCHEDULED_QUEUE`

Recommended staging/production defaults:

- `CELERY_TASK_ACKS_LATE=True`
- `CELERY_WORKER_PREFETCH_MULTIPLIER=1`
- `CELERY_WORKER_MAX_TASKS_PER_CHILD=200`
- `CELERY_WORKER_SEND_TASK_EVENTS=True`
- `CELERY_TASK_SOFT_TIME_LIMIT=240`
- `CELERY_TASK_TIME_LIMIT=300`

Why:

- `acks_late` reduces silent task loss during worker crashes
- `prefetch=1` reduces long-task starvation during bursty close windows
- `max_tasks_per_child` limits memory growth in long-lived workers
- task events make queue/worker monitoring much easier

## Recommended worker topology

For a staging or small production footprint:

1. imports worker
2. reconciliation worker
3. filings worker
4. scheduled worker
5. celery beat

### Example commands

Run from the repository root:

```bash
celery -A config worker -l info -Q imports --concurrency=4 --hostname=imports@%h
celery -A config worker -l info -Q reconciliation --concurrency=4 --hostname=reconciliation@%h
celery -A config worker -l info -Q filings --concurrency=2 --hostname=filings@%h
celery -A config worker -l info -Q scheduled --concurrency=1 --hostname=scheduled@%h
celery -A config beat -l info
```

Suggested starting point for a moderate multi-tenant staging environment:

- imports: `4`
- reconciliation: `4`
- filings: `2`
- scheduled: `1`

These are not final production numbers. They are a safe first topology for load rehearsal.

## What to watch during scale rehearsal

- queue lag by queue name
- worker restarts and crash loops
- task runtime p95 for imports, reconciliation, and filings
- provider-facing filing latency and failure rate
- DB CPU and connection count
- cache hit ratio for shared summary/context reads
- request latency on:
  - workspace context
  - dashboard summary
  - returns readiness

## Lightweight authenticated API load probe

A small script is available at:

- [tools/loadtest_api.py](/Users/ansh/Documents/Gst-Compliance/tools/loadtest_api.py:1)

It uses real login plus authenticated `GET` requests, which makes it useful for quick pre-UAT or pre-scale smoke checks.

### Example usage

```bash
cd /Users/ansh/Documents/Gst-Compliance
./venv/bin/python tools/loadtest_api.py \
  --base-url http://127.0.0.1:7000/api/v1 \
  --email demo_admin@example.com \
  --password demo12345 \
  --endpoint "workspaces/context/?workspace=<workspace-id>" \
  --endpoint "dashboard/summary/?workspace=<workspace-id>&client=<client-id>&gstin=<gstin-id>&compliance_period=<period-id>" \
  --endpoint "returns/readiness/?workspace=<workspace-id>&client=<client-id>&gstin=<gstin-id>&compliance_period=<period-id>" \
  --concurrency 10 \
  --requests-per-worker 20
```

The script reports:

- total requests
- wall time
- throughput
- status counts
- average latency
- p50 latency
- p95 latency
- max latency

Use it as a repeatable before/after check when changing:

- DB connection settings
- cache backend or TTLs
- worker topology
- query-heavy service code

## Recommended scale rehearsal sequence

### Pass 1

- one app server
- one Redis
- one Postgres
- split workers by queue
- run the API load probe at low concurrency

Goal:

- validate basic queue separation
- confirm no heavy work runs inline
- confirm shared summary endpoints stay stable

### Pass 2

- production-like staging infra
- object storage enabled
- Redis cache enabled
- Celery events enabled
- observability dashboards on

Goal:

- verify queue lag
- verify cache effectiveness
- observe provider and DB behavior during burst

### Pass 3

- simulate month-close burst
- imports + reconciliation + readiness/dashboard traffic together

Goal:

- identify which queue saturates first
- identify whether filings need stricter concurrency isolation
- identify whether provider traffic needs stronger rollout gating

## Exit criteria before large onboarding

- queue lag stays controlled under rehearsal load
- no inline fallback is observed for heavy workflows
- dashboard/context/readiness stay within acceptable latency budget
- worker memory growth is stable
- provider-facing flows remain operationally controllable

