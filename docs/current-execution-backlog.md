# Current Execution Backlog

## Purpose

This document converts the current implementation plan into an execution backlog we can actively run.

It is focused on:

- immediate next sprints
- clear ownership lanes
- ticket-sized work items

This is intentionally status-aware. It starts from what is already built in the codebase today, not from a blank roadmap.

Related documents:

- [implementation-status-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/implementation-status-plan.md:1)
- [whitebooks-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-implementation-plan.md:1)
- [whitebooks-adapter-design.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-adapter-design.md:1)
- [engineering-backlog-90-days.md](/Users/ansh/Documents/Gst-Compliance/docs/engineering-backlog-90-days.md:1)
- [import-correction-workflow-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-workflow-plan.md:1)
- [import-correction-implementation-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-implementation-backlog.md:1)
- [scale-readiness-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/scale-readiness-plan.md:1)
- [reconciliation-correction-and-itc-audit-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/reconciliation-correction-and-itc-audit-implementation-plan.md:1)
- [phase-2-gstr9-gstr9c-gstr2x-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/phase-2-gstr9-gstr9c-gstr2x-plan.md:1)
- [gstr7-gstr2x-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-gstr2x-implementation-plan.md:1)
- [gstr9-implementation-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-implementation-backlog.md:1)
- [gstr9-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-qa-high-level-checklist.md:1)
- [gstr9-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-qa-detailed-scenarios.md:1)
- [gstr9-gstr9c-status.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-gstr9c-status.md:1)
- [gstr9c-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9c-qa-high-level-checklist.md:1)
- [gstr9c-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9c-qa-detailed-scenarios.md:1)
- [gstr7-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-qa-high-level-checklist.md:1)
- [gstr7-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-qa-detailed-scenarios.md:1)
- [gstr7-gstr9-gstr9c-whitebooks-integration-readiness.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-gstr9-gstr9c-whitebooks-integration-readiness.md:1)
- [gstr7-gstr9-gstr9c-whitebooks-payload-attachment-contract.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-gstr9-gstr9c-whitebooks-payload-attachment-contract.md:1)
- [portal-data-download-opportunities.md](/Users/ansh/Documents/Gst-Compliance/docs/portal-data-download-opportunities.md:1)

## Delivery assumptions

- sprint length: 2 weeks
- planning horizon: next 4 sprints
- delivery mode: controlled rollout, not big-bang release
- primary filing priority: GSTR-1 first, GSTR-3B second
- SaaS rule: every live provider step must remain tenant-safe, auditable, and feature-gated

## Current baseline

Already done:

- filings domain models and APIs
- provider-neutral filing architecture
- provider-neutral auth-session APIs
- WhiteBooks auth flow integration
- guarded live `GSTR-1 retsave`
- live `GSTR-1 proceed-to-file`
- draft/proceed provider-stage visibility in frontend
- provider-neutral frontend auth-session hooks
- second provider stub to validate swappable provider architecture

Not done yet:

- live `GSTR-1 retfile`
- real ARN/status normalization
- support/admin replay tooling
- GSTR-3B live offset and filing
- production-grade rollout, observability, and intervention tooling

## Ownership lanes

### Backend

Owns:

- filing orchestration
- provider contract
- provider transport
- auth session lifecycle
- domain models and migrations
- audit logging and recovery actions

### Frontend

Owns:

- returns workflow UX
- filing evidence and support visibility
- operator messaging and error states
- feature-state clarity between draft, proceed, filed, failed

### QA and UAT

Owns:

- filing scenario validation
- regression coverage
- UAT scripts for happy path and failure paths
- release signoff inputs

### DevOps and Operations

Owns:

- environment configuration
- feature flag rollout controls
- worker/runtime readiness
- secrets rotation and incident readiness

### Product and Compliance

Owns:

- approval and maker-checker policy
- filing workflow acceptance
- evidence requirements
- release readiness and live client enablement decisions

## Sprint plan

## Sprint 1: Finish Phase 1 and close live draft-save gaps

Goal:

- make `GSTR-1` live draft save fully supportable and SaaS-safe

Primary outcome:

- draft save is reliable, inspectable, tenant-safe, and honestly represented in the UI

Backend focus:

- finalize sanitized response persistence patterns
- tighten auth-session validation and stale-session handling
- improve audit event coverage for draft-save scenarios
- add backend config validation for live draft-save rollout

Frontend focus:

- improve operator guidance for draft-saved state
- show current vs linked auth session more clearly
- surface draft-save evidence more cleanly for support users

QA focus:

- draft-save success path
- missing auth session path
- stale auth session path
- config-disabled path

Exit criteria:

- support can diagnose draft-save outcomes from product UI and admin
- the system never implies draft save equals filing

## Sprint 2: Finish Phase 2 and stabilize proceed-to-file

Goal:

- make `save -> proceed` a controlled, evidence-rich live flow

Primary outcome:

- proceed results are persisted, visible, retryable where safe, and do not corrupt the filing state

Backend focus:

- normalize proceed response persistence
- add proceed-specific failure codes and retry semantics
- add resync behavior for partially progressed filings
- improve attempt metadata for proceed-stage support analysis

Frontend focus:

- show proceed stage separately from draft save and final file
- show proceed failure reasons cleanly
- add better action-state guidance for what operator should do next

QA focus:

- save succeeds, proceed succeeds
- save succeeds, proceed fails
- proceed retry eligibility
- resync after partial success

Exit criteria:

- a filing can safely reach proceeded state in live controlled mode
- partial progress is preserved correctly

## Sprint 3: Build guarded live GSTR-1 final filing

Goal:

- enable final `retfile` through the provider contract behind an explicit rollout gate

Primary outcome:

- final filing transport exists, is auditable, and does not prematurely mark the return filed

Backend focus:

- wire live `GSTR-1 retfile`
- persist request/response evidence for file step
- add waiting-for-confirmation state after final file call
- map provider file failure outcomes into internal states

Frontend focus:

- show final file requested state
- show pending confirmation state
- show file-step evidence and failure details

QA focus:

- file transport success with pending confirmation
- file transport failure
- double-submit protection
- feature-flag-off behavior

Exit criteria:

- final file call can run in controlled live mode without falsely marking the return filed

## Sprint 4: Status sync, ARN, and operational recovery

Goal:

- make the live `GSTR-1` lifecycle operationally usable end to end

Primary outcome:

- ARN/status transitions, resync, and support intervention workflows are usable in real operations

Backend focus:

- implement real status and tracking sync normalization
- map ARN and terminal states properly
- add support/admin replay or recovery actions
- add stronger retry and reconciliation logic for uncertain provider outcomes
- preserve intervention history and operator-visible recovery evidence

Frontend focus:

- show ARN and final status clearly
- add recovery and resync affordances where safe
- improve timeline clarity for support workflows

QA focus:

- delayed ARN
- status mismatch
- timeout then success
- timeout then failure
- resync after manual recovery

Exit criteria:

- support can recover and understand live filing states without engineering intervention
- reviewed requeue, retry, and resync decisions are audit-traceable from both API and UI

## Owner-wise task list

## Backend immediate queue

- BE-101 finalize draft-save audit/event taxonomy
- BE-102 enforce stricter tenant-scoped auth-session selection rules
- BE-103 persist normalized proceed response summaries
- BE-104 add proceed-stage retry policy and failure classification
- BE-105 wire guarded live `GSTR-1 retfile`
- BE-106 add post-file pending-confirmation status handling
- BE-107 normalize ARN/status sync responses
- BE-108 add support/admin replay and resync actions
- BE-109 add intervention-history summaries and support requeue visibility

## Frontend immediate queue

- FE-101 improve draft-saved state messaging in Returns workflow
- FE-102 highlight linked auth session vs currently active auth session
- FE-103 improve support-facing provider response evidence panel
- FE-104 add proceed-stage UI and operator guidance
- FE-105 add final-file pending confirmation UI
- FE-106 show ARN and terminal provider status clearly
- FE-107 add safe support controls for retry and resync visibility
- FE-108 add intervention-history summary for support operators

## QA and UAT immediate queue

- QA-101 create draft-save regression checklist
- QA-102 create proceed-stage regression checklist
- QA-103 create final-file guarded rollout checklist
- QA-104 create ARN/status resync test matrix
- QA-105 create multi-tenant isolation checks for filing/auth-session flows

## DevOps and operations immediate queue

- OPS-101 document required live WhiteBooks env configuration
- OPS-102 define feature-flag enablement path by environment
- OPS-103 define client-secret rotation procedure
- OPS-104 confirm worker/runtime setup for filing tasks
- OPS-105 create incident notes for provider timeout and unclear status outcomes

## Product and compliance immediate queue

- PC-101 confirm operator wording for draft, proceed, file, filed states
- PC-102 confirm approval gate before final provider file
- PC-103 confirm evidence required for support and audit pack
- PC-104 confirm first controlled rollout scope by workspace/client/GSTIN

## Ticket-sized build backlog

## Sprint 1 tickets

- FIL-201 add draft-save event coverage for success, failure, and blocked states
- FIL-202 harden stale auth-session validation before live draft save
- FIL-203 add backend validation error for missing live provider config
- FIL-204 expose sanitized draft-save evidence consistently in attempt summaries
- FIL-205 improve Returns modal copy for draft-saved but not filed state
- FIL-206 add QA checklist for live draft-save guardrails

## Sprint 2 tickets

- FIL-221 persist normalized `newproceedfile` response summary on attempt
- FIL-222 classify proceed failures into retryable vs non-retryable buckets
- FIL-223 preserve save success when proceed fails in all retry/resync branches
- FIL-224 show proceeded-to-file stage and next action guidance in UI
- FIL-225 add QA/UAT cases for partial progress and resync

## Sprint 3 tickets

- FIL-241 add provider capability gate for live `GSTR-1 retfile`
- FIL-242 wire final file request transport through provider contract
- FIL-243 store sanitized final-file request/response evidence
- FIL-244 add internal filing state for pending confirmation after file request
- FIL-245 show final-file requested and confirmation-pending states in UI
- FIL-246 add regression coverage for double-submit protection

## Sprint 4 tickets

- FIL-261 normalize WhiteBooks status and tracking responses
- FIL-262 map ARN and filed terminal states into `ReturnFiling`
- FIL-263 improve resync logic for ambiguous provider outcomes
- FIL-264 add admin/support replay action design and implementation
- FIL-265 surface ARN and recovery states in the Returns workflow
- FIL-266 build UAT matrix for timeout, delayed ARN, and mismatch scenarios
- FIL-267 surface intervention history and reviewed requeue evidence in the Returns workflow

## After Sprint 4

Next major stream:

- GSTR-3B live save
- GSTR-3B offset data model
- GSTR-3B final filing
- production hardening and rollout controls

## Next phase stream: GSTR-3B and SaaS completion

This is the next implementation program after the now-built GSTR-1 operational flow.

### Phase A: GSTR-3B live save

Primary outcome:

- guarded live `gstr3b/retsave` works with the same evidence, eventing, and support visibility already available for GSTR-1

Suggested tickets:

- FIL-3B-301 wire guarded live `GSTR-3B retsave`
- FIL-3B-302 persist sanitized `GSTR-3B retsave` evidence
- FIL-3B-303 expose GSTR-3B draft-save stage in Returns and Operations
- FIL-3B-304 add QA coverage for success, config-disabled, and missing-auth-session paths

### Phase B: GSTR-3B offset

Primary outcome:

- liability offset is domain-backed, auditable, and executable through `gstr3b/retoffset`

Suggested tickets:

- FIL-3B-321 add liability-ledger and settlement allocation domain model
- FIL-3B-322 wire guarded live `GSTR-3B retoffset`
- FIL-3B-323 persist offset evidence and normalize retryability
- FIL-3B-324 expose offset blockers and outcomes in support UI

### Phase C: GSTR-3B final filing

Primary outcome:

- guarded live `gstr3b/retfile` exists without prematurely marking a filing complete

Suggested tickets:

- FIL-3B-341 wire guarded live `GSTR-3B retfile`
- FIL-3B-342 add confirmation-pending state after final file request
- FIL-3B-343 persist file-step evidence and replay protection
- FIL-3B-344 expose file-requested state and guidance in UI

### Phase D: GSTR-3B status, ARN, and recovery

Primary outcome:

- GSTR-3B has the same operational recovery posture as GSTR-1

Current status:

- `FIL-3B-361`, `FIL-3B-362`, and `FIL-3B-363` are implemented in code
- UAT hardening remains active for delayed ARN, rejection, and mismatch cases

Suggested tickets:

- FIL-3B-364 add UAT coverage for delayed ARN, rejection, and mismatch cases

### Phase E: Provider and SaaS hardening

Primary outcome:

- WhiteBooks execution is safe for controlled multi-tenant production rollout

Suggested tickets:

- SaaS-401 rollout controls by workspace, GSTIN, return type, and provider
- SaaS-401A expose rollout-policy summaries in Returns and Operations
- SaaS-403A add operational alerts and filing-scoped incident notes
- SaaS-402 filing-role separation and maker-checker enforcement review
- SaaS-403 provider observability, alerting, and incident runbook completion
- SaaS-404 filing evidence pack export and support diagnostics hardening

Current status:

- `SaaS-401`, `SaaS-401A`, and `SaaS-403A` are implemented
- `SaaS-402` is partially implemented:
  - approval-time and filing-start maker-checker enforcement exist behind `FILING_ENFORCE_MAKER_CHECKER`
  - broader filing-role/RBAC review remains open
- `SaaS-404` is partially implemented:
  - filing evidence pack export is live
  - additional support diagnostics polish can continue incrementally
- `SaaS-403` remains the main open hardening stream:
  - alert routing rules and escalate-alerts workflow are implemented
  - release and incident runbooks are implemented
  - configurable default recipient/support-role policy is implemented
  - tenant-specific production recipient-policy tuning remains open

Recommended ticket prefixes for that stream:

- FIL-3B-301 onward for GSTR-3B transport and domain work
- SaaS-401 onward for platform hardening

## Recommended next implementation order

1. `FIL-3B-301` wire guarded live `GSTR-3B retsave`
2. `FIL-3B-302` persist sanitized `GSTR-3B retsave` evidence
3. `FIL-3B-303` expose GSTR-3B draft-save stage in Returns and Operations
4. `FIL-3B-321` add liability-ledger and settlement allocation domain model
5. `FIL-3B-322` wire guarded live `GSTR-3B retoffset`
6. `FIL-3B-341` wire guarded live `GSTR-3B retfile`
7. `FIL-3B-361` normalize GSTR-3B status and tracking responses
8. `SaaS-401` add tenant-safe rollout controls for provider execution
9. `SaaS-403A` expose operational alerts and incident notes for support handling
10. `SaaS-402` finish filing-role/RBAC review around maker-checker policy
11. `SaaS-403` finalize routed alert recipient policy, escalation ownership, and production operating defaults
12. `SaaS-404` expand support diagnostics beyond the first evidence-pack export

## Summary

The project is past foundation stage.

The immediate execution path is:

- enable live `GSTR-3B retsave`
- add GSTR-3B offset domain support and transport
- enable guarded GSTR-3B final filing
- normalize GSTR-3B status sync and recovery
- finish routed observability, escalation workflow, and production runbook hardening

That sequence gives the fastest path to a second production-usable filing lane without reopening already-completed GSTR-1 milestones.
