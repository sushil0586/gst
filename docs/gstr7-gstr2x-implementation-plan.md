# GSTR-7 and GSTR-2X End-to-End Implementation Plan

## Purpose

This document defines the market-driven implementation plan for:

- `GSTR-7`
- `GSTR-2X`

It intentionally reprioritizes Phase 2 based on current customer demand:

- customers are explicitly asking for GST-TDS support
- GST-TDS affects real monthly compliance operations
- `GSTR-2X` is useful, but must stay tightly scoped to avoid becoming a broad inward-control platform too early

This plan is written to be:

- implementation-ready
- end-to-end
- MVP-first
- low on overengineering

## Recommendation

Build in this order:

1. `GSTR-7`
2. `GSTR-2X`
3. deeper `GSTR-9C` workflow layers after annual MVP validation

Reason:

- `GSTR-7` has a clearer market ask and narrower scope
- `GSTR-7` creates immediate value for organizations dealing with GST-TDS deduction
- `GSTR-2X` should be built only after we freeze its exact product meaning

## Product Positioning

### GSTR-7

Treat `GSTR-7` as:

- GST-TDS return preparation and filing support for deductors

It should help users:

- import TDS-deduction records
- review deductee-wise deductions
- identify mismatches and missing metadata
- prepare monthly `GSTR-7`
- export and file the return

### GSTR-2X

Treat `GSTR-2X` as:

- an inward control and follow-up workspace
- not initially as a separate deep statutory engine

It should help users:

- see purchase vs 2B vs TDS/TCS-linked inward controls
- monitor deferred and at-risk credits
- review carry-forward and follow-up items
- operationalize inward tax controls beyond monthly `GSTR-3B`

## Current Reusable Foundations

Already available in the product:

- workspace / client / GSTIN / period context
- imports framework
- normalized transaction model
- reconciliation engine
- correction and audit trail foundation
- return preparation pattern
- review workspaces
- approvals / operations routing
- filing domain model and manual/live filing patterns

This means both modules should reuse the existing backbone:

`Import -> Validation -> Reconciliation / Controls -> Review -> Approval -> Filing / Export -> Audit`

## Phase 2A: GSTR-7

## Goal

Build a usable GST-TDS return workflow for deductors with a strong operational surface and a clean MVP filing path.

## MVP Scope

Users should be able to:

- import `TDS deducted` records for the month
- review deductee GSTIN / invoice / amount / tax-deducted values
- validate TDS return readiness
- prepare a monthly `GSTR-7` draft
- review deductee-wise summaries in-app
- export a workbook
- approve and track filing
- use manual filing first, with provider filing added only after contract certainty

## Must-Have Domain Model

Need support for a dedicated inward-or-admin tax deduction lane, not a sales/purchase overload.

Suggested minimum model approach:

- add `tds_deducted` import / transaction type
- preserve:
  - deductee GSTIN
  - deductee legal name
  - document number
  - document date
  - taxable amount / payment amount
  - TDS IGST
  - TDS CGST
  - TDS SGST
  - place of supply or state code where needed
  - section / deduction reason if supplied
  - source reference

## GSTR-7 Backend Deliverables

### 1. Return preparation

Add:

- `gstr7` return type
- `prepare_gstr7()`

Prepared snapshot should include:

- deductee count
- document count
- total payment amount
- total taxable amount
- total TDS deducted
- IGST / CGST / SGST split
- deductee-wise section rows
- warning summary

### 2. Readiness

Add GSTR-7-specific readiness checks for:

- missing deductee GSTIN
- invalid GSTIN format
- missing tax amounts
- zero-value deduction rows
- inconsistent tax split
- duplicate document numbers
- missing monthly source data

### 3. Export

Add workbook export with:

- summary sheet
- deductee-wise rows
- warning sheet
- source import summary

### 4. Filing behavior

MVP recommendation:

- support manual filing first
- use the same annual/manual filing pattern introduced for `GSTR-9` if live provider contract is not confirmed

Only add live provider filing after:

- WhiteBooks or chosen provider confirms `GSTR-7` contract support
- sample payloads are tested in sandbox/UAT

## GSTR-7 Frontend Deliverables

### 1. Imports

- add `TDS Deducted` as import type
- upload and map TDS rows
- show validation output

### 2. Returns workspace

- `Prepare GSTR-7`
- `Export GSTR-7 XLSX`
- readiness card
- prepared return status

### 3. Review page

Create:

- `/returns/gstr7-review`

Tabs should be lean:

- `Overview`
- `Deductees`
- `Tax Summary`
- `Warnings`
- `Source Imports`

### 4. Approvals and operations

- treat `GSTR-7` like other return types
- route `View return` into the dedicated review page

## GSTR-7 Suggested Build Order

1. add return type and snapshot contract
2. add import type and parser
3. implement `prepare_gstr7()`
4. implement readiness
5. build review page
6. build export
7. add approvals/operations routing
8. add manual filing behavior
9. only then evaluate provider live filing

## GSTR-7 Acceptance Criteria

- TDS rows can be imported and validated
- GSTR-7 can be prepared from imported data
- users can review deductee and tax totals in-app
- warnings are visible and actionable
- export matches in-app summary
- approval and filing state are tracked
- auditability is preserved

## Phase 2B: GSTR-2X

## Goal

Build a tightly scoped inward control workspace that extends the current reconciliation and ITC follow-up journey.

## Scope Boundary

Do not treat `GSTR-2X` as a giant undefined compliance module.

For MVP, define it as:

- an inward review and carry-forward control workspace

It should answer:

- what inward items are matched
- what is deferred
- what is blocked
- what needs supplier follow-up
- what came forward from prior month
- what TDS/TCS-linked inward controls exist

## MVP Scope

Users should be able to:

- review unmatched and deferred inward items
- view carry-forward decisions from prior month
- separate books corrections from supplier-side issues
- review TDS/TCS-linked inward controls if present
- export the control set
- maintain audit trail on review decisions

## GSTR-2X Backend Deliverables

### 1. Scope definition in data

Reuse existing reconciliation and decision models where possible.

Needed additions:

- a `gstr2x` return or workspace type only if necessary
- otherwise a dedicated review artifact built from reconciliation data
- prior-period carry-forward summarization
- blocked / deferred / claim-now / vendor-follow-up rollups
- optional TDS/TCS-linked inward control aggregations

### 2. Preparation or snapshot

If modeled as a prepared return:

- add `gstr2x` return type
- add `prepare_gstr2x()`

If modeled as a workspace-only artifact:

- add a review snapshot service without full filing semantics

Recommendation:

- start as a review artifact first
- only promote to full return type if the market need proves it

### 3. Readiness or control status

Need control-state signals for:

- unresolved deferred items
- blocked items still open
- supplier follow-up pending
- prior-period items not reviewed
- source data missing

### 4. Export

Export should include:

- matched items
- deferred items
- blocked items
- vendor follow-up items
- prior-period carry-forward items
- decision history summary

## GSTR-2X Frontend Deliverables

### 1. Dedicated workspace

Create:

- `/reconciliation/gstr2x-review`
  or
- `/returns/gstr2x-review`

Recommendation:

- place it near reconciliation, not annual returns

### 2. Tabs

Keep it lean:

- `Overview`
- `Deferred`
- `Blocked`
- `Vendor Follow-up`
- `Prior Period`
- `Decision Audit`

### 3. Decision surface

Reuse current CA decision model:

- `claim_now`
- `defer`
- `blocked`
- `vendor_follow_up`

### 4. Audit visibility

Show:

- original state
- current decision
- who changed it
- when
- notes

## GSTR-2X Suggested Build Order

1. freeze product meaning and page placement
2. design snapshot from reconciliation data
3. create review page
4. add prior-period carry-forward rollups
5. add export
6. add approvals only if product needs maker-checker workflow

## GSTR-2X Acceptance Criteria

- users can review deferred and blocked inward items in one place
- prior-period carry-forward is visible
- decisions remain auditable
- export matches on-screen state
- no unnecessary filing behavior is introduced unless required

## What Not To Build Yet

To avoid overengineering, do not build these upfront:

- full provider live filing for `GSTR-7` before contract confirmation
- generalized tax-deduction platform beyond `GSTR-7` MVP
- complex approval hierarchy for inward decisions
- giant cross-module decision engine
- full statutory automation for `GSTR-2X` before its product meaning is proven

## Recommended Delivery Order

### Sprint A

- GSTR-7 return type
- GSTR-7 import type and parser
- GSTR-7 preparation service
- basic tests

### Sprint B

- GSTR-7 readiness
- GSTR-7 review page
- GSTR-7 export
- approvals / operations routing

### Sprint C

- GSTR-7 manual filing flow
- GSTR-7 UAT pack
- provider contract assessment

### Sprint D

- freeze GSTR-2X scope
- implement GSTR-2X review snapshot
- build GSTR-2X workspace

### Sprint E

- prior-period carry-forward visibility
- export
- UAT pack

## Definition of Done

### GSTR-7 MVP is done when:

- monthly TDS data can be imported
- draft return can be prepared
- in-app review works
- warnings are surfaced
- export works
- approval and manual filing tracking work
- QA/UAT pack exists

### GSTR-2X MVP is done when:

- inward control workspace exists
- deferred/blocked/follow-up items are visible
- prior-period carry-forward is visible
- decisions are auditable
- export works
- QA/UAT pack exists

## Immediate Next Step

Start with `GSTR-7`, not `GSTR-2X`.

The first coding slice should be:

1. add `gstr7` return type
2. define `GSTR-7` snapshot contract
3. add `TDS Deducted` import type
4. implement `prepare_gstr7()`

Once that is stable, move into the first review page and export path.
