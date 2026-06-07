# GSTR-9 Implementation Backlog

## Purpose

This document converts the Phase 2 roadmap for `GSTR-9` into a practical implementation backlog.

It is written for the current codebase, where:

- `GSTR-1` review, export, and filing flows exist
- `GSTR-3B` reconciliation, review, and filing flows exist
- review workspaces are now a first-class UI pattern
- audit and approval flows already exist

The goal is to start `GSTR-9` in a way that is:

- useful for market interest
- implementation-ready
- aligned with the current architecture
- not overengineered

## Product Goal

Build a usable annual GST return workflow where a CA or operator can:

- choose a financial year
- aggregate monthly GST return truth into an annual draft
- review annual sections in-app
- inspect annual warnings and exceptions
- export an annual workbook
- approve the annual draft
- track filing status and evidence even if provider automation is not part of v1

## Delivery Principle

`GSTR-9` should not be built as an isolated annual form engine.

It should reuse the same backbone already established in monthly GST:

`Prepared monthly truth -> annual aggregation -> annual validation -> review workspace -> approval -> export -> filing evidence`

That means the annual draft should be derived primarily from:

- prepared `GSTR-1`
- prepared `GSTR-3B`

and only secondarily from raw transactions for drilldown.

## Scope Boundary For V1

### In scope

- annual context selection
- financial-year aggregation from monthly prepared returns
- annual section-wise review
- annual warnings and exception signals
- annual export workbook
- annual approval workflow
- annual filing evidence / status record if needed

### Out of scope for v1

- deep provider-side live filing automation
- complete rare-edge legal coverage before pilot
- full books-vs-annual-return certification logic
- heavy audit workflow layers that belong more naturally to `GSTR-9C`

## Proposed Product Surface

### Backend

- new return type: `gstr9`
- annual preparation service
- annual readiness service
- annual workbook export mode
- annual prepared snapshot contract

### Frontend

- `Prepare GSTR-9` entry from returns workspace
- dedicated page: `/returns/gstr9-review`
- annual section tabs
- month drilldown and warnings
- export action

## Recommended Build Phases

## Phase 1: Domain and snapshot contract

### Goal

Define the annual return data contract before UI and export spread diverge.

### Tasks

#### G9-01: Add `GSTR-9` as a return type

Files likely affected:

- [apps/returns/models.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/models.py:1)
- [apps/returns/serializers.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/serializers.py:1)
- [apps/returns/views.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/views.py:1)
- frontend return-type unions in [api.ts](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/types/api.ts:1)

Done when:

- `gstr9` is a valid return type throughout API and UI type contracts

#### G9-02: Define annual snapshot contract

Goal:

- establish one canonical `summary_snapshot` shape for `GSTR-9`

Recommended top-level shape:

- `return_type`
- `financial_year`
- `source_months`
- `outward_summary`
- `itc_summary`
- `liability_summary`
- `annual_sections`
- `warnings_summary`
- `source_trace`

Recommended annual sections for v1:

- outward supplies annual summary
- note / amendment impact annual summary
- ITC annual summary
- tax paid summary
- source exception summary

Files likely affected:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:1)
- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:1)

Done when:

- annual snapshot format is frozen in tests before UI implementation expands

## Phase 2: Annual aggregation engine

### Goal

Prepare annual `GSTR-9` drafts from monthly prepared returns.

### Tasks

#### G9-03: Build financial-year helper utilities

Need helpers for:

- year-to-month resolution
- monthly prepared return lookup
- missing month detection
- annual source trace

Files likely affected:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:1)
- optionally a new helper module under `apps/returns/services/`

Done when:

- system can reliably determine which monthly periods belong to the requested annual context

#### G9-04: Implement `prepare_gstr9()`

Build a new annual preparation function that:

- pulls monthly `GSTR-1` prepared returns
- pulls monthly `GSTR-3B` prepared returns
- aggregates outward and ITC/liability facts
- records missing months
- records stale / blocked source returns
- outputs section-first annual snapshot

Files likely affected:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:1)

Done when:

- `prepare_return(..., return_type="gstr9")` produces a usable annual draft

#### G9-05: Add source trace and annual warnings

Track:

- missing monthly returns
- blocked monthly returns
- stale monthly reconciliation dependencies
- source period exception counts

Files likely affected:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:1)
- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:1)

Done when:

- annual draft can explain where its numbers came from and what is incomplete

## Phase 3: Annual readiness

### Goal

Give users a clean “can review / can export / blocked” posture for annual return work.

### Tasks

#### G9-06: Implement `GSTR-9` readiness rules

Base rules for v1:

- at least one monthly source return exists
- all required monthly periods are either present or clearly warned
- no required monthly source is in a hard failed state
- blocked source returns surface as blockers or warnings

Files likely affected:

- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:1)
- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:1)

Done when:

- annual draft gets a readiness result similar to monthly flows

## Phase 4: Annual export

### Goal

Let users export a workbook from the annual draft.

### Tasks

#### G9-07: Add annual workbook/export mode

Implement `GSTR-9` export using the annual snapshot, not raw monthly sources directly.

Files likely affected:

- [apps/common/services/exports.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/exports.py:1)
- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:1)
- [apps/common/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/common/tests.py:1)

Done when:

- `/exports/return-summary/` can produce a `GSTR-9` workbook

## Phase 5: Review workspace

### Goal

Create the annual in-app review surface before approvals.

### Tasks

#### G9-08: Add `Prepare GSTR-9` to returns workspace

Files likely affected:

- [returns/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx:1)

Done when:

- users can prepare `GSTR-9` from the main returns page

#### G9-09: Build `/returns/gstr9-review`

Recommended tabs:

- `Overview`
- `Outward Summary`
- `ITC & Liability`
- `Month Coverage`
- `Warnings`
- `Source Trace`

Use:

- annual snapshot as primary source
- monthly prepared returns as drilldown support

Files likely affected:

- new page under [gst-compliance-frontend/src/app/(dashboard)/returns/](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns)
- possibly shared review helpers/components

Done when:

- annual review becomes an in-app workflow, not just an export workflow

#### G9-10: Add annual direct-review entry points

Files likely affected:

- [approvals/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/approvals/page.tsx:1)
- [operations/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/operations/page.tsx:1)

Done when:

- `GSTR-9` rows route into the annual review page directly

## Phase 6: Approval and status flow

### Goal

Make annual return drafts behave like first-class return entities.

### Tasks

#### G9-11: Reuse approval flow for `GSTR-9`

Files likely affected:

- approvals already likely work once `return_type="gstr9"` is valid
- need targeted UI and test confirmation

Done when:

- annual draft can be sent for approval and reviewed like monthly returns

#### G9-12: Add annual filing/evidence placeholder flow

For v1, this can be minimal:

- mark filing initiated
- attach evidence
- record ARN/reference if manual

Do not overbuild provider automation here yet.

Files likely affected:

- [apps/filings/](/Users/ansh/Documents/Gst-Compliance/apps/filings)
- [returns/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx:1)

Done when:

- annual return can move through operational status without pretending full provider automation exists

## Test Plan

### Backend tests

Add:

- annual preparation happy path
- missing monthly source return
- blocked source month
- readiness with warnings
- export workbook generation

Likely files:

- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:1)
- [apps/common/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/common/tests.py:1)

### Frontend tests / QA

Validate:

- prepare annual draft
- open annual review page
- warnings by missing month
- export workbook
- approval flow

## Suggested Execution Order

Start in this order:

1. `G9-01` return type support
2. `G9-02` annual snapshot contract
3. `G9-03` financial-year helpers
4. `G9-04` `prepare_gstr9()`
5. `G9-06` annual readiness
6. `G9-07` annual export
7. `G9-08` returns entry
8. `G9-09` annual review page
9. `G9-10` approvals/operations review links
10. `G9-11` approval validation
11. `G9-12` minimal annual status/evidence flow

## Definition of Done

`GSTR-9` Phase 2A is complete when:

- annual draft can be prepared from monthly return history
- annual warnings and source gaps are visible
- annual review can happen in-app
- annual workbook export exists
- annual approval flow works
- annual status can be managed operationally

## What To Avoid

Do not do these in the first GSTR-9 slice:

- provider live filing automation first
- full books certification logic
- giant generic annual engine
- deep cross-year correction engine

The right first release is:

- annual draft
- annual review
- annual export
- annual approval

