# Scale Readiness Plan

## Purpose

This document turns the current scaling concerns into an execution-ready plan for taking GST Compliance from a solid product build to a platform that can safely onboard hundreds to low-thousands of customers.

It is focused on four questions:

- what is already good enough in the current codebase
- what still blocks confident multi-tenant scale
- what should be changed in code versus infrastructure versus operations
- in what order the scale work should be delivered

This should be read together with:

- [performance-guardrails.md](/Users/ansh/Documents/Gst-Compliance/docs/performance-guardrails.md:1)
- [observability-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/observability-runbook.md:1)
- [production-security-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/production-security-checklist.md:1)
- [current-execution-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/current-execution-backlog.md:1)
- [detailed-delivery-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/detailed-delivery-plan.md:1)

## Current assessment

### What is already strong

- shared workspace context and page payloads are lighter than before
- major list/detail payload duplication has been reduced
- export memory usage is flatter than before
- security, throttling, and observability baselines are much stronger
- the import correction workflow is operationally mature and policy-driven
- background-job entry points already exist for imports, reconciliation, filings, digests, and retention

### What is not yet scale-ready by default

- heavy work can still fall back to synchronous execution if workers are not set up correctly
- media and import files are still stored as local filesystem uploads
- database connection and cache tuning are still minimal
- queue isolation and worker specialization are not yet defined
- provider throughput and rate behavior need operational controls beyond app logic
- production monitoring is improved, but not yet full platform monitoring

## Target scale assumption

For planning, assume:

- 1,000 onboarded customers
- 50 to 150 concurrent active monthly-close users during peak windows
- bursty import traffic near filing deadlines
- high provider traffic concentration around GSTR-1 and GSTR-3B deadlines
- many customers operating in the same filing calendar, not evenly distributed

This means the design must survive burst load, not just average load.

## Workstreams

## Workstream 1: Async execution hardening

### Problem

The codebase already uses Celery-based background work, but current defaults and fallback behavior are too forgiving for production scale.

### Risks

- uploads or reconciliation can execute in request/response paths if workers are misconfigured
- filing tasks can compete with import and scheduled tasks in the same worker pool
- operational issues may degrade user-facing latency instead of failing fast

### Required changes

#### Code

- force `CELERY_TASK_ALWAYS_EAGER=False` in production profiles
- remove synchronous fallback for heavy paths in production mode
- fail loudly if broker/worker infrastructure is unavailable for heavy tasks
- tag tasks with queue names by workload class

#### Operations

- run dedicated worker pools for:
  - imports
  - reconciliation
  - filings
  - scheduled jobs and retention
- define retry/backoff policy per task class
- monitor queue lag and worker failure rates

### Definition of done

- no heavy import, reconciliation, or filing job runs inline in production
- worker outages fail safely and observably
- queue lag is measurable by workload type

## Workstream 2: Shared file storage

### Problem

Import files currently live under Django `MEDIA_ROOT`, which is fine for a single node but not for horizontally scaled infrastructure.

### Risks

- multi-instance app servers cannot reliably share uploaded files
- reprocessing and audit access become fragile across deployments
- retention and backup policy become inconsistent

### Required changes

#### Infrastructure

- move media/import file storage to object storage such as S3-compatible storage
- define bucket structure and lifecycle policies for:
  - active import source files
  - replacement/superseded files
  - generated export files if persisted

#### Code

- make storage backend environment-configurable
- verify import reprocessing works against remote storage paths
- keep audit-safe lineage after file replacement/discard

### Definition of done

- app servers are stateless with respect to import media
- import correction and reprocess flows work across multiple instances

## Workstream 3: Database and cache readiness

### Problem

The app uses a strong relational model, but database tuning and shared caching are still basic.

### Risks

- connection churn under load
- slow queries during month-close bursts
- repeated context and summary reads without cache support
- admin and export workloads competing with live operator traffic

### Required changes

#### Infrastructure

- add connection pooling
- define `CONN_MAX_AGE` and production DB timeout settings
- provision a shared cache layer such as Redis for hot/shared reads

#### Code

- identify read-heavy shared surfaces for cache candidates:
  - workspace context
  - dashboard summaries
  - readiness summaries where safe
- add query-budget tests for the next tier of heavy endpoints
- review index coverage for:
  - import batches by context and status
  - reconciliation runs by context and freshness
  - returns/filings by context and status

### Definition of done

- database connections are pooled and stable
- hot shared reads avoid unnecessary repeat DB work
- critical list screens stay within budget under representative data

## Workstream 4: Queue and job isolation

### Problem

Not all workloads have the same runtime profile, but the current Celery shape does not yet formalize separation.

### Risks

- a burst of imports can starve filing or reconciliation work
- long-running exports and scheduled jobs can interfere with operator-critical tasks

### Required changes

- define named queues and worker routing
- separate high-priority operator actions from low-priority scheduled work
- add per-queue concurrency tuning
- document worker topology for production

Recommended queue split:

- `imports`
- `reconciliation`
- `filings`
- `scheduled`
- `exports` if async export generation is added later

### Definition of done

- workloads are isolated by operational priority
- month-close spikes do not collapse unrelated background work

## Workstream 5: Provider throughput and tenant rollout controls

### Problem

The app can be internally healthy while the provider becomes the bottleneck.

### Risks

- OTP and filing bursts hit provider-side limits
- simultaneous status sync loops create unnecessary provider pressure
- one noisy tenant can consume disproportionate provider capacity

### Required changes

#### Code

- tighten provider retry cadence and status-sync spacing where needed
- add tenant-aware guardrails for live filing and resync bursts
- add stronger idempotency and replay protection around file-stage actions

#### Operations

- define provider concurrency and escalation policy
- onboard tenants in controlled live cohorts
- track provider latency/failure by tenant and return type

### Definition of done

- provider-facing workflows remain controlled during deadline spikes
- rollout controls can protect the platform from provider instability

## Workstream 6: Production observability and alerting

### Problem

Current observability is strong for engineering validation, but not yet complete for platform operations.

### Required additions

- centralized log shipping
- request ID propagation through reverse proxy and worker logs
- queue lag dashboards
- worker failure dashboards
- DB slow query monitoring
- provider failure alerting
- tenant-level operational metrics:
  - imports queued
  - reconciliations stale
  - returns blocked
  - filings in retry/failure

### Definition of done

- engineering and operations can diagnose live incidents without shell access
- noisy tenants, failing providers, and queue stalls are visible quickly

## Workstream 7: Load and resilience testing

### Problem

We have strong code review and guardrails, but real scale confidence needs controlled stress testing.

### Test plan

#### Phase A: API and background baseline

- burst import creation across many client/period contexts
- concurrent reconciliation runs
- return preparation under active reconciliation and filing load

#### Phase B: Provider workflow simulation

- filing queue bursts
- retry/resync storms
- delayed provider responses
- provider partial failure waves

#### Phase C: Multi-tenant month-close simulation

- representative mix of:
  - uploads
  - corrections
  - reconciliations
  - return prep
  - filing attempts

### Success signals

- no heavy work leaks into request latency
- queue lag remains bounded
- database stays stable
- stale-state propagation remains correct under concurrency

## Delivery phases

## Phase 1: Foundation hardening

- production worker-only execution for heavy jobs
- queue routing design
- production storage strategy decided
- connection pooling and cache plan decided

## Phase 2: Infrastructure rollout

- shared object storage live
- production worker topology live
- cache and DB tuning live
- baseline dashboards live

## Phase 3: Controlled load validation

- load test baseline run
- hotspot query review
- queue lag review
- provider throughput review

## Phase 4: Controlled tenant ramp

- small live cohort
- monitor operational indicators
- tune queue, DB, and provider controls
- widen rollout only after stable filing windows

## Immediate next tickets

1. Add a production guard that blocks synchronous fallback for imports/reconciliation/filings when `DEBUG=False`.
2. Define queue names and route Celery tasks by workload.
3. Add storage-backend abstraction/env config for remote media.
4. Add production DB and cache configuration plan to environment docs.
5. Add queue lag and worker-failure metrics to observability runbook.
6. Write the first load-test scenarios for import burst and reconciliation burst.

## Executive summary

The app is no longer “prototype fragile.” The main remaining scaling gaps are operational and infrastructural:

- async execution must be made strict
- file storage must become shared
- DB/cache must be tuned for bursty tenant load
- queues must be isolated
- provider throughput must be treated as a first-class limit
- load testing and monitoring must be part of release readiness

That means the path to 1,000 customers is realistic, but it is a scale-readiness program, not just a “ship the current defaults” step.
