# API Review And Next Enhancement Plan

## Purpose

This document reviews the current full API surface and defines the next enhancement plan from an API-first point of view.

It is meant to answer:

- what API areas are already strong
- what API areas are only partially mature
- what API areas should be built next
- what sequence best improves the product as a SaaS platform

Related references:

- [implementation-status-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/implementation-status-plan.md:1)
- [current-execution-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/current-execution-backlog.md:1)
- [whitebooks-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-implementation-plan.md:1)
- [filings-api-spec.md](/Users/ansh/Documents/Gst-Compliance/docs/filings-api-spec.md:1)

## Current API surface review

Base API path:

- `/api/v1/`

Auth and developer-facing API docs:

- `/auth/token/`
- `/auth/token/refresh/`
- `/auth/me/`
- `/auth/register/`
- `/schema/`
- `/docs/`
- `/redoc/`

Core resource groups currently exposed:

- organizations
- workspaces
- workspace-members
- clients
- gstins
- compliance-periods
- import-templates
- imports/batches
- gst-transactions
- gst-transaction-review-snapshots
- gst-transaction-remediation-assignments
- gst-transaction-remediation-digests
- gst-transaction-remediation-follow-ups
- reconciliation/runs
- reconciliation/items
- returns
- filings
- provider-auth-sessions
- approvals
- notices
- audit-logs

Operational/reporting endpoints currently exposed:

- `dashboard/summary/`
- `dashboard/close-manager/`
- `dashboard/close-manager/report/`
- `exports/transactions/`
- `exports/import-errors/`
- `exports/reconciliation/`
- `exports/return-summary/`
- `exports/audit-logs/`
- `exports/filing-evidence-pack/`
- `exports/close-manager-report/`

Important custom action APIs already implemented:

- GSTIN taxpayer enrichment:
  - `GET /gstins/search-taxpayer/`
- returns:
  - `POST /returns/prepare/`
  - `GET /returns/readiness/`
  - `POST /returns/{id}/approve/`
  - `POST /returns/{id}/mark-filed/`
- filings:
  - `GET /filings/operations/`
  - `POST /filings/start/`
  - `GET /filings/{id}/attempts/`
  - `GET /filings/{id}/events/`
  - `POST /filings/{id}/retry/`
  - `POST /filings/{id}/requeue-after-review/`
  - `POST /filings/{id}/resync/`
  - `POST /filings/{id}/escalate-alerts/`
  - `GET|POST /filings/{id}/incident-notes/`
  - `POST /filings/{id}/incident-notes/{note_id}/resolve/`
- provider auth:
  - `POST /provider-auth-sessions/request-otp/`
  - `POST /provider-auth-sessions/{id}/verify-otp/`
- approvals:
  - `POST /approvals/{id}/approve/`
  - `POST /approvals/{id}/reject/`
  - `POST /approvals/{id}/cancel/`
- imports:
  - `GET /imports/batches/{id}/errors/`
- reconciliation:
  - `GET /reconciliation/runs/{id}/items/`
- compliance periods:
  - `POST /compliance-periods/{id}/lock/`
  - `POST /compliance-periods/{id}/unlock/`
  - `GET /compliance-periods/{id}/workspace-summary/`
- transaction remediation:
  - bulk-correct
  - escalate / clear-escalation
  - mark-completed / dismiss
  - send-now / acknowledge / dispatch

## API maturity by area

### 1. Strong areas

These areas are already strong enough to act as the product backbone:

- auth and workspace-scoped identity
- client, GSTIN, and compliance-period master data
- import, transaction, and reconciliation APIs
- return preparation and filing lifecycle APIs
- provider-auth and operational support APIs
- audit and export APIs

Why they are strong:

- they are live in both backend and frontend
- they follow the project’s service/selectors/viewset structure
- they already support supportability, audit, and operational visibility

### 2. Strong but still maturing

These areas are implemented but still need product-grade refinement:

- notices
- settings-adjacent operational APIs
- onboarding enrichment and automation
- filing operations dashboard APIs
- export/report jobs for larger datasets

Why they are only partially mature:

- some of the workflow is product-ready but still UI-constrained
- some endpoints are single-record oriented where true SaaS operations will need batch or async patterns
- some operational flows are present but not yet generalized

### 3. Real gaps

These are the main API gaps now:

- bulk onboarding APIs
- richer onboarding/master-data enrichment APIs
- settings/configuration APIs for tenant operations
- async job status APIs for heavier exports/import workflows
- webhook/callback ingestion strategy for provider events
- stronger public/internal API separation
- API contract hardening and examples for external integrations

## What should be next

The next enhancement plan should move in this order.

## Phase 1: Finish onboarding and tenant setup APIs

Objective:

- make new-client onboarding low-friction and software-assisted

Build next:

- enrich taxpayer lookup beyond GSTIN search into a real onboarding helper contract
- add a single onboarding summary API that returns:
  - organization/workspace status
  - client setup status
  - GSTIN setup status
  - period setup status
  - suggested next action
- add idempotent “create tenant starter setup” API for production onboarding
- add optional bulk GSTIN onboarding support for firms onboarding multiple entities

Why this should be next:

- onboarding is the top-of-funnel API
- it reduces setup friction immediately
- it improves SaaS usability more than another deep filing feature right now

Definition of done:

- a new client can be onboarded with minimal manual typing
- the frontend does not need to stitch setup state together from many endpoints

## Phase 2: Add tenant operations and settings APIs

Objective:

- convert remaining product-shell areas into real operational APIs

Build next:

- settings APIs for:
  - workspace preferences
  - filing policy defaults
  - alert-routing defaults
  - rollout-policy management
- notices APIs beyond placeholder/demo state
- support/admin tenant policy summary APIs
- role-policy introspection API so frontend can render what a user is allowed to do without duplicating logic

Why this should be next:

- the product is now filing-capable
- the next big SaaS need is tenant control and policy management

Definition of done:

- `/settings` and `/notices` can become live operational screens
- operators can manage tenant behavior through supported APIs instead of only admin or seed data

## Phase 3: Introduce async job and large-workload APIs

Objective:

- prepare the system for real production volume

Build next:

- async export job APIs
- async import-processing status APIs
- long-running reconciliation/filing support job APIs
- generic job status endpoints for:
  - queued
  - running
  - completed
  - failed
- downloadable artifact endpoints tied to job records

Why this should be next:

- synchronous APIs are fine for pilot scale
- production SaaS operations will need job tracking and retry for large files and reports

Definition of done:

- users can start long-running actions without keeping the request open
- support can inspect and recover failed jobs

## Phase 4: Harden external/provider integration contracts

Objective:

- make provider-facing APIs cleaner, safer, and more replaceable

Build next:

- provider webhook/callback ingestion design
- normalized provider event API model
- idempotency-key support for critical filing actions
- stronger error-code normalization across providers
- explicit provider contract examples in OpenAPI/docs

Why this should be next:

- the internal filing lifecycle is now strong
- the next maturity jump is making provider integration more production-safe and swappable

Definition of done:

- provider events and retries are deterministic
- external integration behavior is easier to document and support

## Phase 5: Create operational summary APIs for dashboards and support consoles

Objective:

- reduce frontend composition burden for operational screens

Build next:

- consolidated operations dashboard API
- support queue summary API
- filing health summary API
- onboarding health summary API
- unresolved issues summary API across imports, reconciliation, returns, and filings

Why this should be next:

- the product already has many record-level APIs
- operations at scale need summary and queue endpoints, not only detail endpoints

Definition of done:

- dashboard and support screens depend less on many stitched queries
- the product has a true operations API layer

## Phase 6: API contract hardening and developer usability

Objective:

- make the platform easier to integrate, maintain, and evolve

Build next:

- improve schema completeness for custom actions
- add request/response examples in OpenAPI
- standardize action naming and filtering patterns
- review pagination/filter/search consistency across all resources
- add API changelog/versioning policy notes

Why this should be next:

- the platform is now broad enough that developer ergonomics matter
- better contract clarity reduces frontend drift and future partner confusion

Definition of done:

- API docs become reliable for both internal and external consumers
- custom action endpoints are discoverable and clearly documented

## Recommended immediate next sprint

This is the strongest next sprint from the current state:

1. onboarding summary API
2. tenant settings and rollout-policy management APIs
3. notices API activation
4. support/dashboard summary API consolidation

Why this sprint:

- it improves SaaS readiness directly
- it unlocks remaining shell UI areas
- it reduces frontend orchestration complexity

## Concrete next ticket groups

### Group A: Onboarding APIs

- add `GET /onboarding/summary/`
- add `POST /onboarding/bootstrap/`
- add `POST /gstins/bulk-onboard/`
- extend taxpayer enrichment with more normalized fields where provider data allows

### Group B: Settings and policy APIs

- add rollout-policy CRUD APIs
- add alert-routing-rule CRUD APIs
- add filing policy summary API
- add support-role policy summary API

### Group C: Notices and operational messaging APIs

- define live notice workflow
- add notice state transitions
- add notice assignment/escalation if in scope
- connect dashboard/support alerts with notices where appropriate

### Group D: Operations summary APIs

- add filing health summary endpoint
- add onboarding exceptions summary endpoint
- add unresolved work queue endpoint
- add support KPI endpoint

## What should not be the immediate next focus

These are worthwhile later, but not the best immediate next move:

- another deep single-provider filing enhancement without broader SaaS gains
- broad UI polish without matching API consolidation
- new report screens before async/report job APIs exist
- multi-provider expansion before tenant settings and operational summaries are cleaner

## Short conclusion

The API foundation is no longer the weak point of the product.

The next enhancement plan should shift from:

- “can we file and support filings?”

to:

- “can a SaaS tenant onboard, configure, operate, and support the platform cleanly at scale?”

That means the next API work should focus on:

1. onboarding APIs
2. settings and tenant policy APIs
3. operational summary APIs
4. async job and provider event hardening
