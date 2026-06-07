# Reconciliation Correction And ITC Audit Implementation Plan

## Purpose

This document defines the end-to-end implementation plan for moving reconciliation from:

- a mostly read-only mismatch review screen

to:

- a controlled correction workspace
- an accountant-friendly ITC decision system
- a month-over-month audit trail for missed, deferred, excess, and recovered ITC

This plan is intentionally focused on:

- CA and reviewer workflow
- auditability
- controlled corrections
- carry-forward continuity
- GSTR-3B consequence management

It is not limited to UI polish. It covers domain model, workflow, data retention, review behavior, and next-month continuity.

## Problem Statement

Today the product expects many corrections to happen outside the application:

- edit import file
- re-import file
- rerun reconciliation
- re-prepare return

That is too operational for a CA-grade workflow.

It creates 4 problems:

1. review flow breaks
- users must leave reconciliation, find a source file, edit it, and return

2. audit trail is weak
- the product knows the final imported values, but not the business reason for a correction decision

3. next-month continuity is weak
- if ITC is deferred, held back, over-claimed, or later recovered, there is no dedicated domain trail for that decision

4. source-vs-working truth is mixed
- users need both original import truth and current corrected working truth
- today those concepts are not modeled clearly enough

## Product Goal

The product should let a CA do all of the following without leaving the app:

- inspect reconciliation mismatches
- correct books-side data safely
- record decision rationale
- defer or block ITC explicitly
- carry unresolved items into next month
- re-run reconciliation from corrected working values
- prepare GSTR-3B using the audited decision state

## Core Design Principles

### 1. Preserve original import truth

Imported raw values must remain preserved.

The system should never silently rewrite the raw imported transaction as if the file itself always had the corrected value.

### 2. Introduce working truth

The product needs a separate corrected working layer used by:

- reconciliation
- GSTR-3B preparation
- follow-up review

### 3. Decisions must be explicit

If a user does not claim ITC, claims it conservatively, or marks it for follow-up, the system should store that as a first-class decision.

### 4. Current month and next month are connected

A row deferred today must be visible next month.

An excess claim or later recovery must also be visible next month.

### 5. Audit is a product feature, not a log side effect

The system must explain:

- what changed
- who changed it
- why it changed
- what effect that had on filing decisions
- what still needs to happen later

## Scope

In scope for this plan:

- purchase-side reconciliation correction workflow
- books-side correction of purchase transactions
- explicit ITC decisioning
- carry-forward and reversal tracking
- audit history in UI and backend
- GSTR-3B preparation based on corrected and decisioned state

Out of scope for first implementation:

- full editing of portal-side GSTR-2B rows
- OCR or document upload-backed dispute evidence
- automated supplier communication
- auto-posting back into external ERPs
- amendment-style correction workflows for all transaction families

## End-State Workflow

### Current user flow

1. import purchase file
2. import GSTR-2B file
3. run reconciliation
4. see mismatches
5. leave app to edit import files
6. re-import
7. rerun reconciliation
8. prepare GSTR-3B

### Target user flow

1. import purchase file
2. import GSTR-2B file
3. run reconciliation
4. open a mismatch row
5. choose action:
   - correct books entry
   - defer ITC
   - vendor follow-up
   - mark blocked
   - mark books correction required
6. optionally edit books-side fields in-app
7. save with reason and notes
8. rerun reconciliation or auto-refresh row
9. prepare GSTR-3B
10. review:
   - claim-ready ITC
   - at-risk ITC
   - deferred items
   - blocked items
11. file conservatively if needed
12. next month, reopen carry-forward items automatically

## Domain Model Changes

## 1. Transaction correction layer

Add a dedicated model for books-side corrections instead of mutating the raw import concept.

Suggested model:

`TransactionCorrection`

Fields:

- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `transaction`
- `reconciliation_item`
- `status`
  - `draft`
  - `applied`
  - `superseded`
  - `reverted`
- `correction_scope`
  - `books_value_change`
  - `books_identity_change`
  - `classification_change`
- `reason_code`
  - `books_entry_error`
  - `supplier_filed_wrong`
  - `document_number_typo`
  - `date_entry_error`
  - `tax_split_error`
  - `internal_review_adjustment`
- `reason_note`
- `before_snapshot`
- `after_snapshot`
- `effective_from_period`
- `effective_to_period`
- `created_by`
- `applied_by`
- `reviewed_by`
- `applied_at`
- `reviewed_at`

Purpose:

- preserve what the imported row was
- preserve what the corrected working version is
- preserve why the change happened

## 2. Reconciliation decision layer

Add a dedicated monthly ITC decision model.

Suggested model:

`ReconciliationDecision`

Fields:

- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `reconciliation_run`
- `reconciliation_item`
- `decision_status`
  - `open`
  - `reviewed`
  - `approved`
  - `superseded`
- `decision_type`
  - `claim_now`
  - `defer_to_next_month`
  - `block_itc`
  - `vendor_follow_up`
  - `books_correction_required`
  - `portal_discrepancy_only`
  - `claim_with_override`
- `itc_effect`
  - `eligible`
  - `deferred`
  - `blocked`
  - `at_risk`
  - `recovery_required`
- `claim_amount`
- `held_back_amount`
- `reversal_amount`
- `reason_note`
- `supporting_context`
- `decided_by`
- `reviewed_by`
- `decided_at`
- `reviewed_at`

Purpose:

- separate “what row exists” from “what filing decision was made”

## 3. Carry-forward tracker

Add a dedicated continuity model for unresolved or deferred ITC.

Suggested model:

`ITCCarryForwardTracker`

Fields:

- `workspace`
- `client`
- `gstin`
- `origin_period`
- `target_period`
- `source_reconciliation_item`
- `source_decision`
- `carry_forward_type`
  - `deferred_itc`
  - `vendor_follow_up`
  - `books_missing`
  - `portal_missing`
  - `excess_claim_reversal`
  - `partial_claim_balance`
- `open_amount`
- `resolved_amount`
- `remaining_amount`
- `status`
  - `open`
  - `partially_resolved`
  - `resolved`
  - `cancelled`
- `resolution_note`
- `resolved_in_period`
- `created_by`
- `resolved_by`
- `created_at`
- `resolved_at`

Purpose:

- reopen unresolved items next month
- track whether held-back ITC later became claimable
- track whether excess claim requires reversal or adjustment

## 4. Optional working snapshot

If needed for performance and review clarity:

`CorrectedTransactionSnapshot`

Fields:

- `transaction`
- `current_effective_snapshot`
- `derived_from_correction`
- `last_correction`

This is optional. The product can also derive working truth dynamically from the latest applied correction.

## Reconciliation Engine Changes

## 1. Books-side source must use corrected working values

Reconciliation should not compare portal rows to raw imported purchase values only.

It should compare against:

- corrected working version if present
- else original imported transaction

## 2. Reconciliation should continue to preserve raw-source visibility

Each reconciliation row should expose:

- imported books value
- corrected books value if any
- portal value
- effective working comparison

## 3. Decision-aware refresh

When a correction is applied:

- re-evaluate only the affected row when possible
- rerun full reconciliation when needed

Recommended v1:

- save correction
- queue full period rerun

Recommended v2:

- row-level targeted recompute

## 4. Reconciliation should emit decision-ready context

Each row should expose:

- current ITC status
- correction status
- decision status
- carry-forward status
- whether the row was already reviewed in a prior month

## GSTR-3B Preparation Changes

## 1. ITC summary must use decisioned truth

Current GSTR-3B logic reads from reconciliation item state.

Target logic should use:

- correction-adjusted reconciliation state
- decision layer where applicable

This means:

- `eligible_itc` comes from rows decisioned as claimable
- `pending_2b_itc` comes from rows intentionally deferred
- `blocked_itc` comes from rows marked blocked
- `itc_at_risk` reflects unresolved / follow-up / review items
- `recovery_required` should be visible for over-claims or reversals

## 2. Introduce explicit CA-facing outputs

Enhance GSTR-3B summary snapshot with:

- `decisioned_itc_summary`
- `carry_forward_summary`
- `reversal_summary`

Suggested keys:

- `claimed_this_month_itc`
- `held_back_this_month_itc`
- `carried_forward_opening_itc`
- `carried_forward_resolved_itc`
- `carried_forward_closing_itc`
- `reversal_due_this_month`
- `net_eligible_after_decisions`

## 3. Next-month continuity in preparation

When preparing next month’s GSTR-3B:

- surface carry-forward items from prior months
- show whether they are now reflected in 2B
- allow resolution into the current month claim

## Frontend UX Plan

## 1. Reconciliation row detail panel

Add a right-side drawer or modal from each reconciliation row.

Sections:

- `Books value`
- `GSTR-2B value`
- `Current effective comparison`
- `Recommended action`
- `Correction history`
- `ITC decision history`

## 2. Correction editor

Editable books-side fields for v1:

- invoice number
- invoice date
- supplier GSTIN
- supplier name
- taxable value
- CGST
- SGST
- IGST
- cess
- total amount
- place of supply
- reverse charge

Rules:

- portal-side rows remain read-only in v1
- every save requires:
  - reason code
  - short note

## 3. Decision actions

Each row should support action buttons such as:

- `Claim now`
- `Defer to next month`
- `Vendor follow-up`
- `Books correction required`
- `Mark blocked`
- `Claim with override`

Each action should record:

- amount
- reason
- notes
- next step owner if needed

## 4. Audit timeline in UI

Each row should show an activity timeline:

- imported
- reconciled
- corrected
- decided
- carried forward
- resolved

This is important for CA defensibility.

## 5. Reconciliation page summaries

Add top summary cards for:

- claim now
- held back
- blocked
- carry forward to next month
- reversal risk

## 6. GSTR-3B review modal / page

Enhance GSTR-3B review to show:

- claim-ready ITC
- deferred ITC
- blocked ITC
- vendor follow-up ITC
- pending review ITC
- next-month carry-forward count and amount
- reversal / recovery due

## Audit And Compliance Requirements

Every correction or decision must produce:

- entity history
- user attribution
- timestamp
- before/after snapshot
- reason code
- free-text note

Audit log actions to add:

- `transaction_correction.created`
- `transaction_correction.applied`
- `transaction_correction.reverted`
- `reconciliation_decision.recorded`
- `reconciliation_decision.reviewed`
- `itc_carry_forward.created`
- `itc_carry_forward.resolved`
- `itc_reversal.flagged`
- `itc_reversal.resolved`

## Next-Month Matching Rules

## 1. Deferred ITC

If a row was deferred in month `M`:

- next month should show it in a carry-forward panel
- if it appears cleanly in 2B and books are aligned, it can move to `claim_now`

## 2. Excess claim

If a user claimed ITC and later a discrepancy proves it excessive:

- create a `recovery_required` or `reversal_due` entry
- next month should surface that item prominently

## 3. Partial claim

If only part of the invoice is claimable:

- carry forward the balance
- do not lose the partial history

## 4. Books-missing portal item

If portal had a row but books did not:

- if later booked, connect the new booking to the prior carry-forward item
- resolve the original blocked item instead of creating disconnected history

## API And Backend Surface Changes

## New endpoints

Suggested additions:

- `POST /api/v1/reconciliation/items/{id}/correct/`
- `GET /api/v1/reconciliation/items/{id}/corrections/`
- `POST /api/v1/reconciliation/items/{id}/decide/`
- `GET /api/v1/reconciliation/items/{id}/decision-history/`
- `GET /api/v1/reconciliation/carry-forwards/`
- `POST /api/v1/reconciliation/carry-forwards/{id}/resolve/`

## Existing endpoint enhancements

- reconciliation item detail should include:
  - `original_books_snapshot`
  - `effective_books_snapshot`
  - `portal_snapshot`
  - `latest_correction`
  - `latest_decision`
  - `carry_forward_state`

## Phased Implementation Plan

## Phase 1: Books correction foundation

Goal:

- enable books-side correction directly from reconciliation

Deliverables:

- `TransactionCorrection` model
- correction apply service
- row detail panel
- edit books fields
- audit log entries
- full rerun after save

Definition of done:

- CA can correct purchase-side fields without editing source files
- original imported values remain visible

## Phase 2: ITC decisioning

Goal:

- enable explicit monthly ITC decisions

Deliverables:

- `ReconciliationDecision` model
- decision UI actions
- decision summary cards
- GSTR-3B prep reads decision state

Definition of done:

- CA can explicitly mark claim / defer / block / follow-up
- GSTR-3B reflects that decision

## Phase 3: Carry-forward continuity

Goal:

- carry unresolved and deferred ITC into next month

Deliverables:

- `ITCCarryForwardTracker` model
- next-month carry-forward list
- resolution flow
- prior-period linkage

Definition of done:

- held-back ITC does not disappear
- next month shows what remains open

## Phase 4: Reversal and recovery

Goal:

- support excess-claim correction and recovery trail

Deliverables:

- reversal/recovery flags
- next-month follow-up surfaces
- GSTR-3B reversal summary

Definition of done:

- the product can explain missed, deferred, and over-claimed ITC outcomes month to month

## Data Migration Strategy

For existing data:

- no destructive migration of raw imports
- existing transactions remain as imported truth
- corrections begin from rollout date
- reconciliation items without decision history default to `open`

Optional backfill:

- synthesize carry-forward records for unresolved old items if product wants legacy continuity

## Testing Plan

## Backend tests

- correction creates immutable before/after snapshots
- reconciliation uses corrected books-side values
- outward notes do not leak into purchase reconciliation
- decision layer changes GSTR-3B ITC summary
- deferred items appear next month
- blocked items remain non-claimable
- excess-claim reversal is surfaced next month

## Frontend tests

- row drawer loads correct before/after data
- edit form validates required reasons
- decision actions render correct summaries
- carry-forward widgets show opening and closing balances

## UAT scenarios

- fix a taxable value mismatch in-app and rerun
- defer an invoice not yet reflected in 2B
- resolve a prior-month deferred invoice next month
- mark blocked portal-only row
- simulate excess claim and next-month reversal

## Risks And Tradeoffs

### Risk 1: Silent truth mutation

Mitigation:

- keep imported truth immutable
- correction layer must be explicit

### Risk 2: Over-complex first release

Mitigation:

- v1 only edits books-side purchase rows
- no portal-row editing initially

### Risk 3: CA distrust

Mitigation:

- always show original value, corrected value, and decision reason together

### Risk 4: Next-month complexity

Mitigation:

- ship carry-forward as a separate phase after books correction and decisioning stabilize

## Recommended Delivery Order

1. exclude source-model leaks from reconciliation lanes
2. add books-side correction model and API
3. build reconciliation row correction UI
4. add decision layer and GSTR-3B integration
5. add carry-forward tracker
6. add reversal/recovery tracking

## Immediate Next Sprint Backlog

### RC-01

Create `TransactionCorrection` model and migration.

### RC-02

Build correction apply service and preserve before/after snapshots.

### RC-03

Expose reconciliation item detail endpoint with books and portal snapshots.

### RC-04

Build row detail drawer in reconciliation UI.

### RC-05

Add books-side correction form with required reason and notes.

### RC-06

Rerun reconciliation automatically after applied correction.

### RC-07

Add audit timeline UI to reconciliation row detail.

### RC-08

Create `ReconciliationDecision` model.

### RC-09

Wire GSTR-3B preparation to decision-aware ITC totals.

### RC-10

Draft carry-forward tracker schema and next-month surfacing plan.

## Success Criteria

This initiative is successful when a CA can:

- correct books-side mismatches in the product
- record why the correction was made
- decide whether ITC is claimable, deferred, blocked, or follow-up
- prepare GSTR-3B from that audited decision state
- reopen unresolved items next month without losing history

and when the system can later explain:

- why a claim was made
- why a claim was held back
- why a reversal was needed
- how the item moved from one month to the next
