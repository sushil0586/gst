# Import Correction and Downstream Invalidation Plan

## Purpose

This document defines the operational workflow for correcting imported GST data after upload, including:

- row editing
- row discard
- batch discard
- replacement uploads
- downstream invalidation when reconciliation or return work already exists

The goal is to let operators fix real-world import mistakes without silently corrupting reconciliation or return-preparation trust.

This is a planning document only. It defines product rules, state transitions, and implementation expectations before code changes begin.

## Core product principle

Imported data should remain correctable until filing, but any correction made after downstream processes have used that data must visibly invalidate those downstream results.

In plain terms:

- users should be able to fix source data
- the system should never pretend old reconciliation or return outputs are still trustworthy after source changes
- filing must not proceed on stale source assumptions

## Non-hardcoded design rule

This feature should be policy-driven, not hardcoded into scattered view or UI conditions.

That means:

- action permissions should come from backend-computed flags
- lifecycle transitions should be handled by dedicated domain services
- warning messages should be derived from rule evaluation, not hand-written in multiple screens
- downstream invalidation behavior should be centrally configured and reused
- approval and post-approval restrictions should be role-aware and policy-aware

Recommended implementation shape:

- a correction policy service evaluates what is allowed for a batch in its current state
- the API returns normalized action flags plus impact summaries
- the frontend renders actions based on those flags only
- downstream invalidation is performed by a single shared service

This avoids rule drift and makes future business-policy changes safer.

## Why this is needed

In real operations, imported files often fail because of:

- missing or malformed invoice fields
- wrong transaction type
- duplicate invoice references
- wrong compliance-period context
- vendor data quality issues
- accidental upload of the wrong file

The product therefore needs a controlled correction loop, not just upload and reject behavior.

## Recommended business policy

### High-level rule

Before filing, imported data may be corrected.

After reconciliation, corrections are still allowed, but the system must:

- show a warning before saving
- mark reconciliation as stale
- require reconciliation rerun before return approval or filing

After filing, direct mutation of the original import should be blocked. Post-filing changes should move through corrective adjustment flows, not silent source edits.

## Lifecycle model

Treat imports as a governed workflow, not as passive files.

### Import batch lifecycle

- `uploaded`
  File received, not yet validated.

- `validated`
  File parsed and row-level validation completed.

- `processed`
  Valid rows converted into GST transactions.

- `corrected`
  Source rows were edited or discarded after initial validation or processing.

- `superseded`
  A replacement batch became the active version for the same operational context.

- `discarded`
  Batch intentionally abandoned before filing.

- `locked`
  Batch can no longer be directly changed because filing or post-filing controls now govern the data.

### Reconciliation lifecycle extension

- `not_run`
- `completed`
- `stale`
- `rerun_required`

`stale` means the underlying imported or committed source data changed after the last trustworthy run.

### Return-preparation lifecycle extension

- `draft`
- `blocked_by_stale_reconciliation`
- `ready`
- `approved`
- `filed`

The important addition is `blocked_by_stale_reconciliation`, which prevents approval or filing on data that is no longer trustworthy.

## Recommended correction model

Use a controlled mutable-plus-audit model now, with a versioned-batch path available for larger replacements.

### Row-level corrections

Allow:

- edit invalid rows
- discard invalid rows
- edit committed rows before filing

But when committed or reconciled data changes:

- recompute the affected committed transaction state
- mark dependent reconciliation state stale
- block return approval or filing until rerun

### Replacement uploads

When the operator wants to replace a whole file:

- keep the original batch for audit
- mark it `superseded`
- create a new active batch for the same workspace/client/GSTIN/period/import type

This is safer than silently mutating the old file metadata and gives better operational traceability.

## Decision matrix

### Stage 1: Before reconciliation

Allowed:

- edit row
- discard row
- discard batch
- replace file

System behavior:

- rerun validation after each row edit
- if batch was already processed, regenerate affected transactions
- no reconciliation invalidation needed yet

### Stage 2: After reconciliation completed, before return draft is approved

Allowed:

- edit row
- discard row
- discard batch
- replace file

Required warning:

- `This import has already been used in reconciliation. Saving changes will mark reconciliation as outdated and require a rerun before return processing can continue.`

System behavior:

- mark impacted reconciliation runs `stale`
- set operational next action to `re-run reconciliation`
- if a return draft exists, mark it `blocked_by_stale_reconciliation`

### Stage 3: After return draft exists, before approval

Allowed:

- edit row
- discard row
- replace file

Condition:

- return draft must be invalidated or blocked

System behavior:

- reconciliation becomes `stale`
- return preparation becomes `blocked_by_stale_reconciliation`
- user must rerun reconciliation and refresh return preparation

Batch discard:

- allowed only if dependent draft state is rolled back cleanly

### Stage 4: After approval, before filing

Recommended policy:

- direct edit should be heavily restricted
- admin or elevated-role override may be required

Reason:

- maker-checker integrity should not be casually bypassed after approval

If allowed:

- approval must be invalidated
- reconciliation becomes stale
- return goes back to blocked or draft state

### Stage 5: After filing

Not allowed:

- direct edit of source import rows
- silent batch discard
- silent batch replacement

Required path:

- corrective adjustment workflow
- reversal or amendment batch
- explicit post-filing audit trail

## Policy registry recommendation

Define these decisions in one policy layer rather than encoding them ad hoc:

- whether processed batches can be discarded directly
- whether approved-but-not-filed returns can be invalidated by standard operators
- whether reconciliation rerun is required for every committed-row edit or only affected contexts
- whether replacement upload always creates a new batch version
- whether return draft is merely warned or fully blocked after stale reconciliation

Recommended policy keys:

- `allow_import_edit_after_reconciliation`
- `allow_import_discard_after_processing`
- `allow_import_mutation_after_return_approval`
- `allow_import_mutation_after_filing`
- `require_reconciliation_rerun_after_source_change`
- `block_return_approval_on_stale_reconciliation`
- `block_return_filing_on_stale_reconciliation`
- `replacement_upload_creates_new_batch_version`

These can live initially in a domain policy module and later move to workspace-level or tenant-level configuration if needed.

## Validation model

Validation should happen at multiple layers.

### 1. File-level validation

- allowed file type
- expected template or mapping
- duplicate upload detection
- workspace/client/GSTIN/period presence
- compliance period not locked for import

### 2. Row-level validation

- required fields
- invoice number rules
- GSTIN and PAN structure
- document date format
- tax value and amount consistency
- transaction type compatibility

### 3. Intra-batch validation

- duplicate invoice detection inside the same batch
- conflicting line-item context
- invalid credit-note or debit-note usage

### 4. Cross-system validation

- duplicate against already committed transactions
- wrong client or GSTIN context
- wrong compliance-period mapping
- locked downstream state conflicts

### 5. Pre-commit validation

Before valid rows become committed transactions:

- ensure no blocking validation issues remain
- ensure discarded rows are excluded

### 6. Pre-return validation

Before return approval or filing:

- confirm no source batch is marked corrected-without-rerun
- confirm reconciliation is not stale

## Downstream invalidation rules

When imported data changes after reconciliation has run, the system should never keep reconciliation as silently valid.

### Required invalidation actions

When a committed source row is edited, discarded, or replaced:

- mark related reconciliation runs `stale`
- mark affected reconciliation items as derived from stale source
- clear any “trusted latest reconciliation” signals on dashboards or summaries
- attach invalidation reason `source_import_modified`

If return preparation already exists:

- mark return state `blocked_by_stale_reconciliation`
- disable approve and file actions
- show clear CTA to rerun reconciliation and refresh the draft

## Computed action flags

The UI should not infer these rules ad hoc. The backend should provide explicit action flags.

Recommended computed flags on import batch detail:

- `can_edit_rows`
- `can_discard_rows`
- `can_discard_batch`
- `can_replace_file`
- `can_reprocess`
- `has_downstream_dependencies`
- `requires_reconciliation_rerun`
- `requires_return_refresh`
- `is_locked_by_filing`
- `warning_message`

These flags keep UI behavior centralized and prevent rule drift.

## Proposed backend changes

### Data model changes

Import batch:

- add lifecycle status extensions
- add `superseded_by`
- add `supersedes_batch`
- add `corrected_at`
- add `corrected_by`
- add `invalidation_reason`

Import row error or editable row layer:

- support corrected-row snapshots
- support discard markers
- preserve original parsed values for audit

Reconciliation:

- add stale/rerun-required indicators
- add `invalidated_at`
- add `invalidated_by`
- add `invalidation_reason`

Return preparation:

- add blocked/stale dependency state or equivalent flags

### Service-layer changes

Add dedicated operational services:

- `validate_import_batch`
- `evaluate_import_correction_policy`
- `edit_import_row`
- `discard_import_row`
- `discard_import_batch`
- `replace_import_batch`
- `invalidate_downstream_from_import_change`
- `rebuild_transactions_for_corrected_batch`

The invalidation service should be the single authority for changing reconciliation and return states after source edits.

### API changes

Recommended endpoints:

- `GET /imports/batches/{id}/correction-policy/`
- `POST /imports/batches/{id}/validate/`
- `POST /imports/batches/{id}/rows/{row_id}/edit/`
- `POST /imports/batches/{id}/rows/{row_id}/discard/`
- `POST /imports/batches/{id}/discard/`
- `POST /imports/batches/{id}/replace/`
- `POST /imports/batches/{id}/reprocess/`
- `GET /imports/batches/{id}/impact-summary/`

`impact-summary` should return the downstream consequence before the user confirms destructive or invalidating changes.

`correction-policy` should return:

- lifecycle state
- action flags
- warning text
- affected downstream objects summary
- next required actions

## Proposed UI changes

### Imports page

Add actions:

- `Edit row`
- `Discard row`
- `Discard batch`
- `Replace file`
- `Reprocess`

Add visible indicators:

- batch status chip
- downstream dependency chip
- warning banner when reconciliation or return state will be invalidated

### Reconciliation page

If source data changed after the last run:

- show `Reconciliation is outdated`
- show reason `Source import modified`
- primary action `Re-run reconciliation`

### Returns page

If stale reconciliation exists:

- show blocking banner
- disable approve/file buttons
- explain that source data changed after prior reconciliation

### Dashboard

Show action-oriented warnings:

- `Import corrected after reconciliation`
- `Return blocked pending reconciliation rerun`

## Audit requirements

Every correction step must be audit-traceable.

Required events:

- import uploaded
- import validated
- import row edited
- import row discarded
- import batch discarded
- import batch replaced
- transactions regenerated
- reconciliation invalidated
- return blocked because of stale reconciliation
- approval invalidated due to source correction

Each audit record should include:

- actor
- timestamp
- batch ID
- row ID if applicable
- old value and new value summary
- impacted reconciliation run IDs
- impacted return preparation IDs

## Permission model

Recommended roles:

- standard operator can edit and discard before filing
- elevated reviewer or manager may be needed after approval
- no one should directly mutate filed source data through the normal correction flow

The permission model should align with workspace RBAC and maker-checker policy.

## Testing plan

### Backend tests

- edit invalid row before processing
- discard invalid row before processing
- edit processed row before reconciliation
- edit row after reconciliation and assert stale invalidation
- replace batch after reconciliation and assert rerun-required state
- block approval and filing when stale reconciliation exists
- block direct mutation after filing

### Frontend tests

- warning modal before invalidating edits
- action buttons disabled when batch is locked
- reconciliation stale banner appears after source change
- returns page disables approve/file when stale

### UAT scenarios

- upload wrong file and discard it
- upload file with fixable row errors and correct them inline
- reconcile, then edit source, then rerun reconciliation
- prepare return, then change import, then confirm return becomes blocked

## Suggested implementation phases

### Phase 1

- finalize decision matrix
- add lifecycle fields and computed action flags
- add downstream invalidation service

### Phase 2

- row edit and row discard APIs
- impact-summary API
- reprocess flow

### Phase 3

- batch discard
- replacement upload and supersede logic
- reconciliation stale UX

### Phase 4

- return blocking UX
- approval invalidation policy
- stronger audit coverage

### Phase 5

- post-filing corrective-adjustment workflow

## Recommended default policy for this project

Use this as the default unless product/compliance explicitly chooses otherwise:

- allow corrections before filing
- allow corrections after reconciliation with strong warning
- automatically mark reconciliation stale after source changes
- allow return draft visibility but block approval and filing until rerun
- block direct source mutation after filing

This policy gives operators flexibility while still preserving compliance trust.

## Open decisions to freeze before coding

- whether approved-but-not-filed returns can be edited by normal operators or only elevated roles
- whether batch discard after processed state is allowed directly or only through rollback
- whether large file replacements should always create a new batch version
- whether row editing should operate on parsed row objects, committed transactions, or both
- exact wording of operator-facing warning banners

These should be frozen once, then implemented consistently across backend and UI.

## Recommended default freeze points

Unless product/compliance decides otherwise, use these defaults:

- processed batches may be corrected before filing
- reconciliation becomes stale after committed source changes
- return approval and filing are blocked while reconciliation is stale
- approved-but-not-filed corrections require elevated role confirmation
- post-filing direct source mutation is not allowed
- replacement upload creates a new batch version instead of mutating the old batch in place
