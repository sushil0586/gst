# GST Compliance Production Roadmap

## 1. Purpose

This document defines the path from the current pilot-ready GST Compliance product to a production-grade platform that supports actual GST return filing using WhiteBooks APIs.

It is intended to guide:

- product scoping
- backend and frontend engineering
- integration work with WhiteBooks
- security and operational hardening
- UAT and rollout planning

This roadmap builds on the current system state documented in [technical-project-review.md](/Users/ansh/Documents/Gst-Compliance/docs/technical-project-review.md:1).

## 2. Current baseline

Today the project already includes:

- Django + DRF backend with JWT auth and workspace RBAC
- client, GSTIN, and compliance period hierarchy
- import pipelines for sales, purchase, credit note, debit note, and GSTR-2B
- GST transaction storage
- reconciliation flows
- return preparation flows
- approvals and audit logs
- reporting and export endpoints
- Next.js frontend for operational workflows

This means the project is not starting from zero. The production journey is primarily about:

- hardening domain correctness
- completing the filing lifecycle
- integrating WhiteBooks safely
- improving observability and operational resilience
- removing remaining pilot/demo ambiguity

## 3. Production target state

The v1 production platform should support the following end-to-end flow:

1. create or select client, GSTIN, and period
2. upload books and portal data
3. validate imports and detect issues
4. run reconciliation and resolve blockers
5. prepare GSTR-1 and GSTR-3B
6. run readiness checks
7. obtain internal approval
8. submit the return through WhiteBooks
9. fetch ARN and final filing status
10. maintain audit history, filing evidence, and downloadable reports

Operationally, the system should also support:

- maker-checker controls
- retriable filing attempts
- status polling and provider resync
- clear error visibility
- secure credential handling
- support/admin workflows for recovery

## 4. Scope assumptions

The roadmap assumes the following default v1 scope unless product decisions change:

- return types:
  - GSTR-1
  - GSTR-3B
- taxpayer type:
  - regular taxpayers first
- filing cadence:
  - monthly first
- filing integration:
  - WhiteBooks as the sole production filing provider
- approvals:
  - maker-checker required before live filing
- environments:
  - local
  - staging/UAT
  - production

If WhiteBooks supports additional workflows such as OTP, taxpayer authorization, draft upload, submission, and ARN polling through separate endpoints, the internal design should accommodate that without binding the rest of the product directly to provider-specific details.

## 5. Core architecture direction

### 5.1 Backend direction

The backend should evolve toward four clear domains:

- `returns`
  - computes prepared return data
  - stores immutable prepared snapshots
- `filings`
  - manages filing lifecycle, attempts, status, ARN, and evidence
- `integrations`
  - owns WhiteBooks provider adapter logic
- `common`
  - keeps shared audit, permissions, exports, pagination, and exception handling

### 5.2 Frontend direction

The frontend should distinguish four operational states clearly:

- draft/preparation
- ready for review
- approved and ready to file
- filing in progress / filed / failed

Critical filing paths must not depend on silent mock fallbacks. For filing-adjacent areas, the UI should always show whether the user is seeing:

- live backend data
- empty live data
- preview shell
- API error state

### 5.3 Provider abstraction

WhiteBooks should be integrated behind a provider interface rather than scattered across views or services.

Recommended abstraction:

- `FilingProvider`
  - `authenticate()`
  - `prepare_payload()`
  - `submit_return()`
  - `get_status()`
  - `get_acknowledgement()`
  - `normalize_error()`

Recommended implementation:

- `WhiteBooksProvider(FilingProvider)`

This keeps the product portable and makes provider-specific testing much easier.

## 6. Proposed filing domain model

Create a dedicated filing app, for example `apps/filings/`.

Recommended entities:

- `ReturnFiling`
  - one record per filing lifecycle for a prepared return snapshot
- `ReturnFilingAttempt`
  - one record per provider submission attempt
- `ReturnFilingEvent`
  - append-only event history for status transitions, retries, syncs, and operator actions

Suggested `ReturnFiling` fields:

- `id`
- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `prepared_return`
- `prepared_snapshot_version`
- `provider`
- `status`
- `arn`
- `provider_reference_id`
- `submitted_at`
- `filed_at`
- `last_status_sync_at`
- `error_summary`
- `created_by`
- `approved_by`
- `filed_by`

Suggested `ReturnFilingAttempt` fields:

- `id`
- `return_filing`
- `attempt_number`
- `provider_request_id`
- `status`
- `request_payload_hash`
- `response_summary`
- `failure_code`
- `failure_message`
- `started_at`
- `completed_at`
- `triggered_by`

Suggested `ReturnFilingEvent` fields:

- `id`
- `return_filing`
- `filing_attempt`
- `event_type`
- `old_status`
- `new_status`
- `metadata`
- `created_by`
- `created_at`

## 7. Recommended state machines

### 7.1 Return preparation state

Suggested progression:

- `draft`
- `ready_for_review`
- `approved`
- `queued_for_filing`
- `submitted`
- `arn_received`
- `filed`
- `failed`
- `needs_retry`

### 7.2 Filing attempt state

Suggested progression:

- `created`
- `queued`
- `in_progress`
- `submitted_to_provider`
- `awaiting_status`
- `completed`
- `failed`
- `cancelled`

### 7.3 Transition rules

Core rules should include:

- a period cannot be filed unless it passes readiness checks
- a return cannot be filed unless approved
- a filing attempt must be idempotent per prepared snapshot
- period locking rules must prevent unsafe post-approval mutation
- failed attempts should remain fully auditable rather than overwritten

## 8. WhiteBooks integration direction

## 8.1 Integration objectives

WhiteBooks should become the execution layer for:

- filing authentication/session setup
- return payload submission
- ARN retrieval
- filing status retrieval
- provider error retrieval

## 8.2 Questions to settle before implementation

Before coding, confirm the WhiteBooks contract for:

- sandbox vs production base URLs
- authentication model
- API credentials and rotation
- OTP or taxpayer authorization flow
- payload schema per return type
- async vs sync submission behavior
- ARN timing
- status polling cadence and rate limits
- error code taxonomy
- webhook availability, if any
- environment onboarding requirements

## 8.3 Integration design principles

- never call WhiteBooks directly from views
- capture normalized provider errors
- redact sensitive content from logs
- hash or summarize request payloads where possible
- keep raw external response storage controlled and minimal
- support resync if local status drifts from provider status

## 8.4 Recommended backend package structure

```text
apps/
  filings/
    models.py
    serializers.py
    views.py
    selectors/
    services/
  integrations/
    whitebooks/
      client.py
      provider.py
      serializers.py
      exceptions.py
      mappers.py
```

## 9. Phase-by-phase roadmap

## Phase 0: Scope freeze and filing definition
Duration: 1-2 weeks

Goals:

- finalize v1 return types and taxpayer profiles
- define maker-checker rules
- define exact filing happy path
- define WhiteBooks production dependencies

Deliverables:

- signed-off v1 scope note
- filing workflow diagram
- WhiteBooks capability checklist

## Phase 1: Architecture hardening
Duration: 1-2 weeks

Goals:

- formalize filing-related service boundaries
- introduce provider abstraction
- design filing state model
- eliminate ambiguity between prepared returns and filed returns

Deliverables:

- `filings` app scaffold
- state enum definitions
- architecture note for returns vs filings vs integrations

## Phase 2: Return domain completion
Duration: 2-4 weeks

Goals:

- improve GSTR-1 and GSTR-3B readiness and snapshotting
- complete readiness rule engine
- lock down return preparation consistency

Deliverables:

- immutable prepared return snapshots
- readiness API and UI
- blocked vs warning rule set

## Phase 3: WhiteBooks integration foundation
Duration: 2-3 weeks

Goals:

- implement sandbox adapter
- establish auth/session flow
- normalize responses and provider errors

Deliverables:

- `WhiteBooksProvider`
- sandbox config support
- provider unit tests

## Phase 4: Filing orchestration
Duration: 3-5 weeks

Goals:

- build actual submission pipeline
- create async processing and status sync
- show ARN and filing progress in UI

Deliverables:

- filing create/start endpoint
- polling job
- filing history UI
- failure and retry flows

## Phase 5: Security and audit hardening
Duration: 2-3 weeks

Goals:

- protect provider credentials
- enforce maker-checker controls
- build strong evidence trail

Deliverables:

- secure secrets strategy
- filing evidence pack
- audit/event completeness review

## Phase 6: Operations and reliability
Duration: 2-3 weeks

Goals:

- add production-grade worker and monitoring support
- make failures recoverable operationally

Deliverables:

- job monitoring
- requeue/resync tooling
- incident runbook

## Phase 7: Testing and UAT
Duration: 2-4 weeks

Goals:

- validate business correctness and provider behavior
- ensure supportability before live rollout

Deliverables:

- adapter tests
- orchestration tests
- UAT pack for filing scenarios

## Phase 8: Controlled production rollout
Duration: 1-2 weeks

Goals:

- release to limited real usage safely

Deliverables:

- staged rollout plan
- feature flags
- live monitoring checklist

## 10. Detailed engineering backlog

### 10.1 Backend backlog

- create `apps/filings`
- add filing models, migrations, serializers, selectors, and viewsets
- add filing state transitions in service layer
- create WhiteBooks adapter package
- implement async filing submission via Celery
- implement polling/status sync tasks
- add idempotency protection for provider submission
- add provider configuration model or environment-backed config strategy
- add filing audit events
- add admin/support actions for retry and resync

### 10.2 Frontend backlog

- add filing readiness screen
- add filing confirmation modal
- add filing status timeline
- add ARN visibility and filing evidence panel
- add provider error states with retry guidance
- add filing history table
- mark any remaining shell routes explicitly

### 10.3 Documentation backlog

- WhiteBooks integration spec mapping
- filing lifecycle doc
- production environment setup doc
- support runbook
- operational escalation and incident playbook

## 11. Security and compliance requirements

Before production use, the following should be complete:

- provider credentials stored securely
- sensitive values redacted in logs
- maker-checker enforced for filing
- permission boundaries for prepare, approve, and file actions
- immutable audit trail for submission and retries
- evidence trail linking:
  - prepared snapshot
  - approval
  - filing attempt
  - ARN
  - final status

Recommended role model:

- `preparer`
- `reviewer`
- `approver`
- `filer`
- `admin`

## 12. Operational readiness requirements

Production filing requires operational controls beyond application code.

Required capabilities:

- staging/UAT environment with sandbox provider access
- background worker reliability
- monitoring for failed or stuck filing jobs
- provider outage handling
- manual resync and retry support
- database backups
- release checklist and rollback plan

Recommended tooling:

- PostgreSQL in managed or hardened deployment
- Redis + Celery workers
- structured logging
- Sentry or equivalent error monitoring
- health checks for API and workers

## 13. Testing strategy

### Unit tests

- return computation
- readiness rules
- WhiteBooks adapter request/response mapping
- provider error normalization

### Integration tests

- filing orchestration flow
- approval to filing transition rules
- status polling and update behavior
- retry safety

### End-to-end tests

- import -> reconcile -> prepare -> approve -> file -> ARN
- failed filing -> retry -> success
- approval rejection -> rework -> approve -> file

### UAT scenarios

- GSTR-1 monthly normal filing
- GSTR-3B monthly normal filing
- provider auth/session failure
- invalid payload rejection
- ARN delayed or pending
- local/provider status mismatch

## 14. 90-day execution view

### Days 1-30

- freeze v1 production scope
- create `filings` app
- define filing models and states
- complete return snapshot and readiness design
- map WhiteBooks APIs to internal service boundaries

### Days 31-60

- build WhiteBooks sandbox integration
- implement filing orchestration and polling
- create filing UI surfaces
- add provider error handling and audit events

### Days 61-90

- harden security and ops
- complete UAT
- run limited rollout with feature flags
- onboard first real production GSTINs

## 15. Immediate next sprint recommendation

The most productive next sprint is:

1. create `apps/filings` with models and state enums
2. add provider abstraction and WhiteBooks adapter scaffold
3. define readiness API contract for filing
4. freeze GSTR-1 and GSTR-3B filing status model
5. design filing UI states and API endpoints
6. document WhiteBooks API mapping and open integration questions

## 16. Recommended first implementation artifacts

The first code deliverables should be:

- `apps/filings/models.py`
- `apps/filings/services/filings.py`
- `apps/integrations/whitebooks/provider.py`
- `apps/integrations/whitebooks/client.py`
- filing status enums and transition helpers
- frontend filing readiness and filing status screens

## 17. Success metrics

Production readiness should be measured, not assumed.

Suggested metrics:

- filing success rate
- average time from approval to filed
- percentage of filings blocked by readiness checks
- retry rate by provider error class
- number of manual support interventions per period
- status sync lag between provider and local system

## 18. Practical conclusion

This project already has enough business workflow depth to justify moving toward real filing. The main work ahead is not broad CRUD expansion; it is productionization of the return lifecycle and safe integration with WhiteBooks.

The critical sequence is:

1. formalize the filing domain
2. complete readiness and snapshot correctness
3. integrate WhiteBooks behind a provider boundary
4. add operational safety, auditability, and recovery
5. release gradually with feature controls

If executed in that order, the product can evolve from a strong pilot operations platform into a dependable GST filing system.
