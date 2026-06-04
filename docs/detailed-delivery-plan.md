# Detailed Delivery Plan

## Purpose

This document is the detailed execution plan for the GST Compliance product from the current build state to production readiness.

It is intended to answer four questions clearly:

- what is already implemented
- what is in progress or operationally usable
- what still needs to be built
- in what order we should build the remaining work

This is the most detailed task-oriented plan in the repo and should be used together with:

- [implementation-status-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/implementation-status-plan.md:1)
- [current-execution-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/current-execution-backlog.md:1)
- [import-correction-workflow-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-workflow-plan.md:1)
- [import-correction-implementation-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-implementation-backlog.md:1)
- [whitebooks-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-implementation-plan.md:1)
- [whitebooks-adapter-design.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-adapter-design.md:1)
- [scale-readiness-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/scale-readiness-plan.md:1)

## Current state snapshot

As of the current build:

- the Django backend has a provider-neutral filings domain
- WhiteBooks sandbox/live-guarded GSTR-1 flow is partially implemented
- support-facing filing operations now exist in both Returns and a dedicated Operations workspace
- backend summaries exist for:
  - provider evidence
  - intervention history
  - support actions
  - support status
- frontend now supports:
  - direct support actions from `/operations`
  - direct jump from Operations into the correct return in Returns
  - automatic focus on the filing lifecycle section in Returns

What this means:

- the product is no longer just “pilot workflow plus filing ideas”
- it now has the beginnings of a real support console and filing operations model
- the remaining work is mostly about finishing live provider completion, production controls, and scaling the operational model

## Workstreams

The remaining work is best managed through eight workstreams:

1. Filing completion for GSTR-1
2. WhiteBooks provider hardening
3. GSTR-3B live enablement
4. Support and operations console
5. SaaS platform hardening
6. Security, audit, and controls
7. QA, UAT, and release management
8. Production rollout and post-launch operations

## Workstream 1: GSTR-1 filing completion

### Goal

Take GSTR-1 from partial live workflow to complete production-usable filing lifecycle.

### Already done

- live-guarded `retsave`
- live-guarded `proceed-to-file`
- live-guarded `retfile` transport path
- pending-confirmation state after final file request
- status sync path that can move filing to filed or failed
- ARN/status handling at a basic operational level

### Remaining tasks

#### Backend

- confirm and normalize final WhiteBooks `retfile` success responses
- harden ARN extraction rules across `retstatus` and `rettrack`
- tighten ambiguous provider-state handling after file request
- improve idempotency around repeated final-file or resync calls
- add backend-side replay protection for all file-stage transitions
- persist clearer filing-state reason codes for support analytics

#### Frontend

- make confirmation-pending states more explicit in the Returns workflow
- show richer file-stage success/failure guidance
- surface clearer distinctions between:
  - draft saved
  - proceeded
  - file requested
  - ARN received
  - filed
  - failed

#### QA

- delayed ARN after successful file request
- status endpoint returns pending while track endpoint returns filed
- file step timeout followed by successful resync
- file step rejection after earlier proceed success
- duplicate file trigger prevention

### Definition of done

- GSTR-1 filing can run end to end in controlled live mode
- local state only moves to final filed after confirmed provider status
- support can explain every intermediate state without engineering help

## Workstream 2: WhiteBooks provider hardening

### Goal

Reduce provider-specific fragility and make WhiteBooks safer as a long-term production integration.

### Already done

- provider-neutral registry
- provider-neutral auth-session service
- WhiteBooks auth OTP flow
- guarded capability-driven provider stages
- sanitized provider response persistence

### Remaining tasks

#### Provider contract

- move more provider semantics out of shared filing services and fully into provider implementations
- standardize provider result envelopes for:
  - save
  - proceed
  - file
  - status
  - track
- add explicit provider error categories for:
  - retryable transport
  - retryable provider-side
  - terminal provider rejection
  - credential/session mismatch

#### WhiteBooks transport

- verify and document all production URLs and headers
- add stricter timeout handling
- add transport retry strategy only where safe
- add better provider response parsing for non-happy-path payloads
- confirm credential rotation and auth-session expiry handling

#### Provider-neutral futureproofing

- keep all feature gates capability-driven
- validate that another provider can support the same lifecycle without workflow changes
- add another richer non-WhiteBooks stub if needed for contract coverage

### Definition of done

- WhiteBooks is production-safe within the provider abstraction
- provider-specific assumptions are minimized in core filing logic

## Workstream 3: GSTR-3B live enablement

### Goal

Build the second live filing lane after GSTR-1.

### Already done

- GSTR-3B payload mapping groundwork
- client methods exist for:
  - `retsave`
  - `retoffset`
  - `retfile`

### Remaining tasks

#### Domain model

- add liability offset model
- add payment/ledger allocation structure
- persist offset calculation breakdown
- version offset decisions with filing attempts

#### Provider work

- enable guarded live `gstr3b/retsave`
- enable guarded live `gstr3b/retoffset`
- enable guarded live `gstr3b/retfile`
- add GSTR-3B status sync normalization

#### Frontend

- show GSTR-3B-specific readiness blockers
- expose liability offset review state
- surface offset evidence and filing states distinctly from GSTR-1

#### QA

- save without offset
- save plus offset plus file
- offset rejection
- partial success after save
- final status sync after file

### Definition of done

- GSTR-3B supports the same operational control level as GSTR-1

## Workstream 4: Support and operations console

### Goal

Turn filing support from a return-detail workflow into a real operations workspace.

### Already done

- dashboard operations queue
- dedicated `/operations` page
- backend `filings/operations/` feed
- support status summary
- support actions summary
- intervention history
- provider evidence summary
- direct actions from operations:
  - retry
  - resync
  - requeue after review
- deep-link handoff into Returns with lifecycle focus

### Remaining tasks

#### Operations page

- add filter persistence in query params
- preserve queue state when moving between Operations and Returns
- support pagination and sorting
- add richer client-period grouping
- add bulk queue analytics at top of page

#### Row actions and detail

- show action result toasts with better state refresh context
- expose provider reference, ARN, and auth-session link more directly
- add inline raw-evidence preview toggles
- add support note history if multiple interventions occurred

#### Operator workflow

- add “Back to Operations” context-preserving link from Returns
- add direct link to audit trail filtered for the current filing
- add support decision timeline view per filing
- add escalation / handoff markers for unresolved provider issues

#### Admin/support actions

- add replay/resubmit controls only where safe
- add forced resync note action
- add support override notes for operational investigations
- add operator-facing warnings around destructive or high-risk actions

### Definition of done

- support can manage unresolved filings from Operations without relying on Returns for every action

## Workstream 5: SaaS platform hardening

### Goal

Make the product safe for multi-tenant production operation.

### Remaining tasks

#### Multi-tenant behavior

- verify every filing action is workspace-safe
- verify client/GSTIN/period scoping is enforced consistently
- eliminate any misleading mock fallback in filing-critical surfaces
- ensure operations feed and support actions behave correctly across tenant context changes

#### Feature management

- centralize rollout flag visibility and documentation
- support tenant/workspace/provider feature targeting
- add operational readiness bannering for partially enabled capabilities

#### Product fit

- reduce pilot/demo wording where real functionality now exists
- keep remaining preview routes explicitly marked
- separate production-ready modules from shell/demo modules in navigation and docs if needed

### Definition of done

- the product behaves like a multi-tenant SaaS application, not a single-environment internal tool

## Workstream 6: Security, audit, and controls

### Goal

Meet the audit and control expectations of a production GST filing platform.

### Remaining tasks

#### Security

- rotate any exposed provider secrets
- verify secrets are never persisted in raw response history
- validate auth-session lifecycle and expiry handling
- ensure least-privilege usage across support/operator roles

#### Audit

- expand filing evidence pack
- include support interventions in exportable audit context
- capture all replay/resync/requeue decisions with clear comments
- expose operator identity consistently across support actions

#### Maker-checker controls

- validate approval-to-filing gates thoroughly
- decide whether support requeue needs additional approval rules
- add explicit guardrails for who can override or replay filing steps

### Definition of done

- every critical support or filing action is auditable, attributable, and reviewable

## Workstream 7: QA, UAT, and release management

### Goal

Move from engineering validation to repeatable business acceptance.

### Remaining tasks

#### Automated testing

- increase backend coverage for filing operations feed and operations actions
- add more integration-style tests for multi-step filing lifecycles
- add frontend tests for operations state handling where feasible

#### UAT packs

- GSTR-1 end-to-end controlled live path
- GSTR-1 failure recovery matrix
- support operations workflow
- auth-session lifecycle workflow
- operations-to-returns handoff workflow
- period-scoped queue validation

#### Release readiness

- release checklist per environment
- deployment smoke checks
- rollback notes for filing features
- support signoff checklist

### Definition of done

- releases are repeatable and UAT is not dependent on informal manual memory

## Workstream 8: Production rollout and post-launch operations

### Goal

Launch progressively and operate safely after launch.

### Remaining tasks

#### Rollout model

- define enablement sequence by workspace/client/GSTIN
- separate staging, UAT, and production rollout playbooks
- define support ownership during first live cycles

#### Observability

- filing queue monitoring
- provider error dashboards
- auth-session issue alerts
- operational stale-state alerts
- retry/resync/requeue action monitoring

#### Post-launch support

- incident runbook for:
  - final-file uncertainty
  - delayed ARN
  - provider rejection after partial success
  - auth-session issues
- support escalation matrix
- customer communication templates if filing is delayed

### Definition of done

- the team can safely run real filing cycles and handle incidents without ad hoc firefighting

## Recommended execution order

The best build order from this point is:

1. finish GSTR-1 completion hardening
2. keep improving the support and operations console
3. harden WhiteBooks provider handling
4. close SaaS and security gaps
5. enable GSTR-3B live flow
6. finish UAT/release/observability
7. run controlled production rollout

## Immediate next tasks

These are the most practical next tasks from today’s codebase:

### Product and UX

- add “Back to Operations” context-preserving link from Returns
- persist Operations filters in query params
- add pagination/sorting to the Operations workspace

### Backend

- add richer operations endpoint filtering and sorting support
- add more filing operations endpoint tests
- expand support replay actions beyond reviewed requeue where safe

### WhiteBooks

- tighten final-file and ARN confirmation handling
- expand provider-side error normalization

### Documentation

- keep this plan updated as operations console and GSTR-1 completion advance

## Practical rule for execution

Every remaining task should be evaluated against three checks before it is considered complete:

- is it tenant-safe
- is it supportable from product UI and audit trail
- does it avoid overstating filing completion or provider certainty

If any answer is no, the task is not production-ready yet.
