# Implementation Status And Build Plan

## Purpose

This document is the practical working plan for the project.

It answers two questions clearly:

- what has already been implemented
- what we are going to build next

It is meant to be the simplest current reference for delivery planning, especially as we move the product from pilot mode to SaaS-ready production filing.

Related documents:

- [technical-project-review.md](/Users/ansh/Documents/Gst-Compliance/docs/technical-project-review.md:1)
- [production-roadmap.md](/Users/ansh/Documents/Gst-Compliance/docs/production-roadmap.md:1)
- [whitebooks-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-implementation-plan.md:1)
- [whitebooks-adapter-design.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-adapter-design.md:1)
- [engineering-backlog-90-days.md](/Users/ansh/Documents/Gst-Compliance/docs/engineering-backlog-90-days.md:1)

## Current implementation status

### 1. Product foundation implemented

Backend:

- JWT authentication and current-user session APIs
- workspaces, clients, GSTINs, and compliance periods
- import templates and import batch processing
- GST transaction storage and remediation support
- reconciliation runs and reconciliation issue handling
- return preparation and approval-linked filing readiness
- audit logs, notices, dashboard summaries, and exports

Frontend:

- login, onboarding, dashboard shell, and protected routing
- clients, GSTINs, compliance periods, imports, reconciliation, returns, approvals, reports, and audit trail screens
- live API integration through TanStack Query for core flows
- clearer pilot-shell labeling for routes that are not fully operational yet

### 2. Filing domain implemented

Backend filing models now exist:

- `ReturnFiling`
- `ReturnFilingAttempt`
- `ReturnFilingEvent`
- provider auth session model using the existing persisted `WhiteBooksAuthSession` table with a provider-neutral `ProviderAuthSession` alias in code

Backend filing APIs now exist for:

- filing list and detail
- filing start
- filing retry
- filing resync
- filing attempts
- filing events
- provider auth-session request OTP
- provider auth-session verify OTP
- provider auth-session list and detail

### 3. Provider architecture implemented

The filing engine is no longer tightly hardcoded to WhiteBooks.

Implemented:

- generic filing provider contract under `apps/filings/providers/`
- provider capability model
- provider registry
- provider-neutral auth/session service layer
- generic provider exceptions
- real `whitebooks` provider implementation
- real `demo_gsp` provider stub implementation

This means the system is now structurally prepared for multi-provider GST filing rather than only a single GSP integration.

### 4. WhiteBooks integration implemented

Confirmed and integrated auth flow:

- OTP request
- OTP verification / auth-token exchange
- `txn` capture and persistence

Confirmed and implemented client methods for:

- GSTR-1 save
- GSTR-1 proceed-to-file
- GSTR-1 file
- GSTR-3B save
- GSTR-3B offset
- GSTR-3B file
- status lookup
- return tracking

Implemented in code today:

- guarded live `GSTR-1 retsave`
- draft-save evidence capture
- provider-stage eventing and audit logging
- live/sandbox capability gating
- filing response sanitization before storage

### 5. Payload mapping implemented

Implemented:

- GSTR-1 `retsave` payload mapping from internal transaction data
- GSTR-1 proceed context mapping
- GSTR-1 `retfile` payload generation with deterministic checksum-backed section summaries
- GSTR-3B `retsave` payload mapping
- status/tracking request mapping for GSTR-1 and GSTR-3B

Important note:

- payload generation is ahead of live transport in some areas
- not every mapped operation is enabled for real provider submission yet

### 6. Frontend filing UX implemented

Implemented in the Returns workflow:

- provider auth-session request OTP
- provider auth-session verify OTP
- filing lifecycle panel
- filing attempt history
- filing event timeline
- intervention history summary for support operators
- provider-stage visibility
- support-facing sanitized response evidence
- indication of which auth session was used

### 7. Quality and verification status

Current verified state:

- backend filing and WhiteBooks test suite is green
- frontend production build is green
- provider-neutral auth/session cleanup is complete

Latest known verification:

- `./venv/bin/pytest -q tests/test_whitebooks_client.py apps/filings/tests.py`
- `./venv/bin/python manage.py check`
- `./venv/bin/python manage.py makemigrations --check`
- `npm run build` in `gst-compliance-frontend`

## What is partially implemented

These areas exist but are not yet complete enough to treat as production-ready:

- live WhiteBooks flow now covers guarded `GSTR-1` save, proceed, final file request, status sync, ARN handling, and recovery tooling, but still needs broader production hardening
- provider-neutral architecture is in place, but some persisted model/table naming remains legacy for compatibility
- filing UI now includes a dedicated operations workspace, but still needs broader SaaS controls, bulk operations, and production analytics
- GSTR-3B transport design and client coverage are prepared, but live save, offset, and final filing are not yet enabled end to end

## What is not implemented yet

### Product and SaaS readiness gaps

- full tenant-safe operational controls for production filing rollout
- stronger role and permission separation for preparer, reviewer, approver, and filer journeys
- production-grade support console for intervention and recovery
- complete filing evidence pack export
- full operational dashboards and alerting

### Filing lifecycle gaps

- deeper provider response normalization and operational hardening after final filing
- stronger replay controls for save, proceed, file, and resync beyond the current reviewed requeue flow
- broader production observability and alerting around uncertain provider outcomes

### GSTR-3B gaps

- delayed ARN, rejection, and mismatch UAT coverage
- broader replay controls beyond current retry, resync, and reviewed requeue
- operational alerting and escalation for uncertain provider outcomes

### General platform gaps

- production observability and alert routing
- release checklist enforcement
- stronger UAT automation around filing-specific paths
- final removal or conversion of remaining pilot-shell pages

## What we are going to build

The plan below is the recommended build sequence from here.

## Phase 1: Enable live GSTR-3B save

Objective:

- bring `GSTR-3B retsave` to the same controlled live-save maturity as GSTR-1

Build:

- wire guarded live `GSTR-3B retsave`
- validate mapped request payloads against provider responses
- persist sanitized save evidence and provider-stage metadata
- expose GSTR-3B draft-save stage in Returns and Operations

Definition of done:

- operators can safely run live GSTR-3B draft save in controlled environments
- support can inspect save outcomes without database digging
- the UI never misrepresents a draft save as a filed return

## Phase 2: Implement GSTR-3B liability offset

Objective:

- add the domain model and transport needed for `GSTR-3B retoffset`

Build:

- add liability-ledger and payment allocation support
- wire guarded live `GSTR-3B retoffset`
- persist sanitized offset evidence and normalized failure states
- show offset readiness blockers and retry/review guidance

Definition of done:

- the system can execute provider offset safely with traceable business inputs and outputs

## Phase 3: Enable guarded live GSTR-3B final filing

Objective:

- add final `GSTR-3B retfile` transport behind a separate feature flag and keep final-state handling honest

Build:

- wire live `GSTR-3B retfile` through the provider contract
- persist filing request/response evidence
- map provider success/failure into internal filing states
- keep filing in a waiting/confirmation state until status sync confirms outcome

Definition of done:

- a GSTR-3B can be finally filed through the provider in a guarded environment
- the system does not mark it filed until the provider outcome is confirmed

## Phase 4: Normalize GSTR-3B status sync, ARN, and recovery

Objective:

- make GSTR-3B provider status tracking production-usable

Current status:

- implemented in code
- UAT and release validation are still active

Build:

- implement real GSTR-3B status and tracking sync against provider responses
- normalize ARN, provider reference, and terminal-state transitions
- add safe resync and recovery workflows
- build admin/support actions for manual intervention

Definition of done:

- support can understand the exact state of a filing without engineering help
- filing status can be refreshed safely after timeouts or uncertain responses

## Phase 5: Provider and SaaS hardening

Objective:

- make the platform SaaS-ready for real customer operations

Build:

- full rollout controls by workspace/client/GSTIN/provider/return type
- stronger RBAC for approval and filing actions
- observability, alerting, and incident runbooks
- support evidence pack exports
- production UAT checklist and release controls
- staged rollout from internal pilot to live client usage

Definition of done:

- the platform is supportable, auditable, and safe to run as a production SaaS workflow

Current status:

- tenant rollout policies are implemented and visible in Returns and Operations
- operational alerts and filing-scoped incident notes are implemented for support workflows
- filing evidence pack export is implemented through `exports/filing-evidence-pack`
- maker-checker enforcement is implemented at approval and filing start behind `FILING_ENFORCE_MAKER_CHECKER`
- alert routing/escalation workflow is implemented through routing rules plus `filings/{id}/escalate-alerts/`
- support recovery roles and default alert recipients are configurable through environment policy
- filing incident and live release runbooks are implemented
- final operational escalation policy tuning is still pending

## Immediate next sprint recommendation

Recommended next sprint:

1. execute GSTR-3B delayed ARN, rejection, and mismatch UAT scenarios
2. tighten support/operator wording for confirmation-pending states
3. move into provider and SaaS hardening

Recommended engineering order:

1. complete GSTR-3B UAT coverage for live support scenarios
2. harden cross-endpoint provider error handling
3. finalize operational escalation policy defaults and release governance review

## Planning notes

- avoid hardcoding provider assumptions in core filing services
- keep provider-specific logic inside provider implementations
- prefer compatibility aliases over risky rename migrations unless there is product value in the rename
- every live step should stay behind explicit capability checks and feature flags
- every externally visible filing action should leave an audit trail and support evidence

## Summary

The project has already moved beyond planning and into real implementation:

- the filing domain is built
- provider-neutral architecture is built
- WhiteBooks auth and live GSTR-1 workflows are built
- the frontend can operate, inspect, and support filing state

The next major focus is not “start filing work,” because that is already in production-shaped form for GSTR-1.
The next focus is to validate and harden the now-implemented GSTR-3B lifecycle, then finish SaaS hardening for multi-tenant production rollout.
