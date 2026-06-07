# GSTR-1 End-To-End Implementation Plan

## Purpose

This document defines the engineering plan to complete GSTR-1 as a fully usable end-to-end module in the current GST Compliance codebase.

Today, GSTR-1 is partially implemented:

- return preparation exists
- readiness checks exist
- workbook export exists
- approval and filing workflows exist

But major business sections are still missing or only partially wired.

This document turns that gap into an actionable implementation backlog.

It is intentionally focused on:

- domain coverage
- backend modeling
- workbook parity
- provider payload parity
- readiness and review behavior
- delivery order

It is not a legal opinion document. It is an execution plan for product and engineering.

## Current Reality

The codebase already supports a base GSTR-1 flow through:

- transaction imports
- return preparation
- readiness evaluation
- workbook export
- approval workflow
- WhiteBooks filing integration

However, current GSTR-1 support is still not fully production-closed.

### Implemented end to end in code

- B2B
- B2CL
- B2CS
- CDNR
- CDNUR
- advances received
- advance adjustments
- exports / SEZ / deemed exports
- amendments for core invoice and note flows
- e-commerce-linked sections
- section-first prepared summary snapshot
- readiness checks for the implemented sections
- workbook export coverage for the implemented sections
- approvals and review preview surfacing for the implemented sections
- WhiteBooks payload mapping for the implemented sections

### Implemented, but still needs provider or UAT confirmation

- WhiteBooks live `retsave` and `retfile` behavior for the newer implemented sections
  - advances
  - exports / SEZ / deemed exports
  - amendments
  - e-commerce-linked rows
- exact provider acceptance and downstream GSTN behavior for amendment payload variants
- production-grade validation that workbook totals, prepared summary totals, and provider-side totals remain aligned under real filing scenarios

### Still pending or intentionally shallow

- nil / exempt / non-GST provider payload parity depth
- HSN provider payload parity depth
- documents issued provider payload parity depth
- broader amendment edge cases beyond the currently modeled section buckets
- richer filing-grade UI drilldowns beyond the current section review cards and compact tables

## Core Delivery Principle

GSTR-1 should be implemented as one consistent pipeline:

`Import -> Normalize -> Classify -> Validate -> Prepare -> Review -> Export -> Approve -> File -> Audit`

If any section exists only in export, only in UI, or only in provider payload, the module will remain fragile.

The goal is:

- one transaction model
- one section classification model
- one prepared summary snapshot
- one workbook export model
- one provider payload model

All downstream surfaces should consume the same section truth.

## Target Scope

The target end state for GSTR-1 should support these section groups:

### Section group A: Current core outward supplies

- B2B
- B2CL
- B2CS
- CDNR
- CDNUR
- nil / exempt / non-GST
- HSN summary
- documents issued

### Section group B: Still missing but high priority

- advances received
- advance adjustments
- exports / SEZ / deemed exports

### Section group C: Important but later

- amendments for invoices and notes
- e-commerce operator sections

## Major Gaps In Current Code

### 1. Transaction modeling is too generic for full GSTR-1 coverage

`GSTTransaction` is flexible, but current GSTR-1 preparation only uses:

- `sales`
- `credit_note`
- `debit_note`

That is not enough for:

- advances
- export / SEZ / deemed export treatment
- amendment chains
- e-commerce sections

Relevant files:

- [apps/gst_transactions/models.py](/Users/ansh/Documents/Gst-Compliance/apps/gst_transactions/models.py:11)
- [apps/imports/services/parsers/sales.py](/Users/ansh/Documents/Gst-Compliance/apps/imports/services/parsers/sales.py:1)

### 2. GSTR-1 preparation is totals-based, not section-based

Current `prepare_gstr1()` produces broad aggregate totals.

It does not produce a structured section snapshot that can drive:

- workbook sections
- provider sections
- review UI sections
- section-level readiness checks

Relevant file:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)

### 3. Workbook coverage is broader than domain implementation

The workbook has sheet scaffolding for many sections, but some are placeholders only.

Most notably:

- advances are placeholder-only
- exports / SEZ are placeholder-only
- some amendments are placeholder-only
- e-commerce sections are placeholder-only

Relevant file:

- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:19)

### 4. WhiteBooks payload parity is incomplete

Current save/file payload logic covers only:

- B2B
- B2CS
- CDNR
- CDNUR

This means workbook and filing behavior are not aligned.

Relevant file:

- [apps/integrations/whitebooks/mappers.py](/Users/ansh/Documents/Gst-Compliance/apps/integrations/whitebooks/mappers.py:171)

### 5. Readiness checks are not section-complete

Current readiness mainly checks:

- sales existence
- HSN/UQC/quantity/supply-category completeness

It does not validate missing logic for:

- advances
- exports / SEZ / deemed export
- amendments
- e-commerce requirements
- section-specific POS/rate expectations

Relevant file:

- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:73)

## Recommended Delivery Phases

## Phase 1: Refactor GSTR-1 Summary Model

### Goal

Create one canonical section-first GSTR-1 summary snapshot.

### Why first

Without this, workbook, UI, and provider payload logic will continue to diverge.

### Tasks

- Refactor `prepare_gstr1()` to return structured sections instead of only broad totals
- Preserve existing top-level totals for backward-compatible UI support
- Add explicit section summaries for:
  - `b2b`
  - `b2cl`
  - `b2cs`
  - `cdnr`
  - `cdnur`
  - `nil_exempt_non_gst`
  - `hsn_summary`
  - `documents_issued`
- Introduce an internal section-summary contract that future phases can extend

### Files likely affected

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:343)

### Acceptance criteria

- prepared GSTR-1 snapshots contain section-level structured data
- existing UI cards still render
- existing workbook exports continue to work
- tests are updated for new snapshot structure

### Phase 1 Engineering Checklist

Use this checklist as the execution order for implementation.

#### G1-P1-01: Freeze the section-first snapshot contract

Goal:

- define the exact JSON structure that `prepare_gstr1()` will return

Must include:

- backward-compatible totals already used by UI and export logic
- section-level containers for:
  - `b2b`
  - `b2cl`
  - `b2cs`
  - `cdnr`
  - `cdnur`
  - `nil_exempt_non_gst`
  - `hsn_summary`
  - `documents_issued`
- `period_exceptions`

Primary files:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [gst-compliance-frontend/src/types/api.ts](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/types/api.ts:752)

Done when:

- snapshot contract is documented in code comments or tests
- downstream readers can rely on stable keys

#### G1-P1-02: Extract reusable GSTR-1 classification helpers

Goal:

- move section classification out of ad hoc inline preparation logic

Tasks:

- add helpers for:
  - sales transaction partitioning
  - B2B / B2CL / B2CS determination
  - note classification
  - nil/exempt grouping
  - HSN summarization
  - document-summary rollups

Primary files:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- optionally a new helper module under `apps/returns/services/`

Done when:

- `prepare_gstr1()` becomes orchestration-oriented rather than one large inline block
- workbook and payload phases can reuse the same section logic

#### G1-P1-03: Refactor `prepare_gstr1()` to build section-first output

Goal:

- make `prepare_gstr1()` emit structured sections and preserved totals together

Tasks:

- preserve current totals:
  - `total_taxable_value`
  - `total_tax_amount`
  - `document_count`
  - existing top-level outward totals used by UI
- add structured per-section summaries
- ensure notes and B2C splits remain accurate after refactor

Primary file:

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)

Done when:

- old UI cards still render without breakage
- new section data is present in the stored `summary_snapshot`

#### G1-P1-04: Update workbook export to read from the new snapshot safely

Goal:

- keep workbook export stable after the summary refactor

Tasks:

- verify `export_gstr1_workbook()` still works if summary snapshot becomes richer
- update workbook helpers to prefer section-first snapshot data where helpful
- avoid breaking current sheet generation during the refactor phase

Primary file:

- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:19)

Done when:

- existing GSTR-1 workbook tests still pass
- current workbook sheets still export correctly

#### G1-P1-05: Update readiness metrics to use the new section structure where needed

Goal:

- keep GSTR-1 readiness consistent with the refactored summary model

Tasks:

- ensure readiness metrics still expose:
  - transaction count
  - sales count
  - line-item count
  - total taxable value
  - total tax amount
- confirm no warning logic regresses due to summary structure changes

Primary file:

- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:73)

Done when:

- readiness API response shape is unchanged unless intentionally improved
- existing readiness tests remain valid or are updated clearly

#### G1-P1-06: Add or update tests for the section-first snapshot

Goal:

- make the summary refactor safe to build on

Required tests:

- GSTR-1 preparation stores expected top-level totals
- GSTR-1 preparation stores expected section containers
- B2B / B2CS / notes remain correctly classified
- workbook export still succeeds from the new snapshot shape
- readiness still returns expected metrics and issue codes

Primary files:

- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:343)
- [apps/common/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/common/tests.py:736)

Done when:

- tests protect both backward compatibility and new structure

#### G1-P1-07: Add a small frontend compatibility pass

Goal:

- ensure the returns UI can tolerate the richer snapshot without requiring full redesign yet

Tasks:

- check current GSTR-1 summary rendering for assumptions about snapshot shape
- preserve current cards and detailed modal sections
- optionally surface section presence counts if trivial and low-risk

Primary file:

- [gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx:1113)

Done when:

- no UI regression appears after the backend refactor

#### G1-P1-08: Phase 1 completion checkpoint

Phase 1 should be considered complete only when:

- `prepare_gstr1()` emits a stable section-first summary snapshot
- current workbook export still works
- current readiness still works
- current UI still works
- tests cover the new snapshot contract
- Phase 2 can add B2CL payload parity without refactoring the summary again

## Phase 2: B2CL And Payload Parity

### Goal

Close the gap between workbook coverage and WhiteBooks payload support for B2CL.

### Tasks

- formalize B2CL classification logic in prepared summary
- expose B2CL explicitly in the GSTR-1 snapshot
- extend WhiteBooks save payload generation to include B2CL if supported by the provider contract
- extend section summary logic to include B2CL in filing metadata

### Files likely affected

- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:107)
- [apps/integrations/whitebooks/mappers.py](/Users/ansh/Documents/Gst-Compliance/apps/integrations/whitebooks/mappers.py:171)
- [apps/filings/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/filings/tests.py:1024)

### Acceptance criteria

- B2CL appears in prepared summary
- workbook and provider payload both use the same classification
- provider section summaries reflect B2CL totals where applicable

## Phase 3: Advances Received And Advance Adjustments

### Goal

Implement advances end to end.

### Scope

- advances received
- advance adjustments

### Tasks

- define how advances are represented in imported and normalized data
- extend transaction modeling using either:
  - new `transaction_type` values
  - or strongly typed `document_type` plus metadata rules
- capture advance-specific fields such as:
  - receipt voucher / adjustment reference
  - POS
  - tax rate
  - original advance linkage
  - taxable and tax values
- extend `prepare_gstr1()` to generate:
  - `advances_received`
  - `advances_adjusted`
- replace workbook placeholder table 11 / 11A / 11B with real rows
- extend WhiteBooks save/file payload if provider support exists
- add readiness validations for incomplete advance rows

### Files likely affected

- [apps/gst_transactions/models.py](/Users/ansh/Documents/Gst-Compliance/apps/gst_transactions/models.py:11)
- `apps/imports/services/parsers/*`
- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:73)
- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:239)
- [apps/integrations/whitebooks/mappers.py](/Users/ansh/Documents/Gst-Compliance/apps/integrations/whitebooks/mappers.py:171)

### Acceptance criteria

- advance rows can be imported and normalized
- prepared return snapshot contains advance sections
- workbook sheets 11A and 11B are populated
- provider payload contains advance sections if supported
- readiness flags incomplete advance data correctly

## Phase 4: Exports / SEZ / Deemed Exports

### Goal

Support outward supplies that need special GSTR-1 treatment beyond domestic B2B/B2C.

### Tasks

- define classification fields for:
  - exports
  - SEZ with payment
  - SEZ without payment
  - deemed exports
- capture or derive:
  - supply subtype
  - shipping / destination indicators if needed
  - taxability mode
- add export section logic to prepared summary
- replace workbook placeholder export sheets with real rows
- extend provider payload generation if supported
- add readiness checks for missing classification fields

### Files likely affected

- [apps/imports/services/parsers/sales.py](/Users/ansh/Documents/Gst-Compliance/apps/imports/services/parsers/sales.py:1)
- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:73)
- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:154)
- [apps/integrations/whitebooks/mappers.py](/Users/ansh/Documents/Gst-Compliance/apps/integrations/whitebooks/mappers.py:171)

### Acceptance criteria

- export / SEZ / deemed-export rows can be prepared
- workbook export section is real, not placeholder-only
- readiness catches missing export classifications

## Phase 5: Amendments

### Goal

Support amendment logic for invoices, notes, and other relevant GSTR-1 sections.

### Tasks

- define amendment data model:
  - original document linkage
  - amended values
  - amendment period
- determine whether amendments come from:
  - import rows
  - manual corrections
  - derived workflow state
- expose amendment sections in prepared summary
- replace amendment workbook placeholders with real rows
- extend provider payload logic as applicable
- add readiness checks for orphaned or invalid amendment references

### Files likely affected

- [apps/gst_transactions/models.py](/Users/ansh/Documents/Gst-Compliance/apps/gst_transactions/models.py:11)
- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:193)
- [apps/integrations/whitebooks/mappers.py](/Users/ansh/Documents/Gst-Compliance/apps/integrations/whitebooks/mappers.py:247)

### Acceptance criteria

- amendment rows are traceable to original documents
- workbook amendment sections contain real rows
- filing payload parity is maintained

## Phase 6: E-Commerce Sections

### Goal

Implement sections that depend on e-commerce operator classification and GSTIN tagging.

### Tasks

- define when a transaction belongs to e-commerce sections
- use existing metadata fields such as `ecommerce_gstin` where possible
- prepare section-level summaries and workbook rows
- replace placeholder sheets for tables 14 / 15
- add readiness checks for missing operator identifiers

### Files likely affected

- [apps/returns/services/readiness.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/readiness.py:73)
- [apps/returns/services/returns.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/services/returns.py:111)
- [apps/common/services/return_workbooks.py](/Users/ansh/Documents/Gst-Compliance/apps/common/services/return_workbooks.py:284)

### Acceptance criteria

- e-commerce classified rows populate the correct sections
- placeholder sheets are removed for supported scope
- missing operator data is surfaced in readiness

## Cross-Cutting UI Work

These changes should follow the backend section-model refactor, not lead it.

### Required UI updates

- extend returns review modal to show section-level GSTR-1 summaries
- surface advance/export/amendment warnings in the readiness view
- ensure approvals and operations return-preview modals can display new summary sections if useful
- keep exports and filing actions aligned with the actual prepared section coverage

### Files likely affected

- [gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx:1118)
- [gst-compliance-frontend/src/app/(dashboard)/approvals/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/approvals/page.tsx:430)
- [gst-compliance-frontend/src/app/(dashboard)/operations/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/operations/page.tsx:650)

## Testing Strategy

Every phase should extend tests in four layers:

### 1. Preparation tests

- summary snapshot structure
- section classification
- totals and counts

Primary file:

- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:343)

### 2. Workbook export tests

- sheet presence
- section row rendering
- placeholder removal

Primary file:

- [apps/common/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/common/tests.py:736)

### 3. Filing payload tests

- provider payload content
- section summary parity
- stage-specific filing metadata

Primary file:

- [apps/filings/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/filings/tests.py:1024)

### 4. Readiness tests

- new warnings and blockers
- transaction-level references for remediation
- issue codes for missing fields

Primary file:

- [apps/returns/tests.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/tests.py:343)

## Delivery Order Recommendation

Use this order:

1. section-first summary refactor
2. B2CL payload parity
3. advances
4. exports / SEZ / deemed exports
5. amendments
6. e-commerce sections
7. UI deepening and polish

This order is recommended because:

- it stabilizes the shared summary contract first
- it fixes a real parity gap early
- it addresses advances next, which are explicitly missing today
- it leaves more complex amendment and operator workflows until the foundation is stable

## Sprint-Ready Backlog

### Sprint 1

- refactor GSTR-1 summary snapshot into section-first structure
- preserve existing totals used by UI and exports
- update preparation tests

### Sprint 2

- implement B2CL summary and filing payload parity
- add workbook and filing tests

### Sprint 3

- implement advances received and adjustments
- replace workbook placeholders for table 11
- add readiness validations

### Sprint 4

- implement exports / SEZ / deemed exports
- update workbook and provider payload coverage

### Sprint 5

- implement amendments
- add reference-linkage validations

### Sprint 6

- implement e-commerce sections
- finalize UI surfacing
- complete regression coverage

## Open Product Decisions

These decisions should be finalized before Phase 3 begins:

### 1. How advances will be sourced

Choose one:

- imported as dedicated rows
- inferred from another source format
- manually maintained in workflow

Recommended:

- imported as dedicated normalized rows

### 2. How amendments will be represented

Choose one:

- separate amendment transactions
- metadata on base transactions
- workflow-derived corrections

Recommended:

- separate normalized amendment records or strongly typed amendment transactions

### 3. Provider contract coverage

Before implementation, verify exact WhiteBooks support for:

- advances
- B2CL
- export / SEZ / deemed export sections
- amendments
- e-commerce sections

If provider support is partial, workbook and filing phases may need different scope dates.

## Definition Of Done

### Implemented now

The following should be treated as implemented in the codebase:

- section-first GSTR-1 preparation snapshot
- B2CL classification and filing-payload parity
- advance receipt and adjustment support
- export / SEZ / deemed-export support
- amendment support for the currently modeled invoice and note paths
- e-commerce-linked section support
- workbook export alignment for those sections
- approvals / operations / returns preview visibility for those sections

### Implemented, but not yet fully provider-validated

The following are wired and tested internally, but should still be treated as needing live provider or UAT confirmation:

- WhiteBooks acceptance of the expanded GSTR-1 save payload for the implemented new sections
- WhiteBooks acceptance of amendment-specific section buckets such as:
  - `b2ba`
  - `b2cla`
  - `b2csa`
  - `cdnra`
  - `cdnura`
  - `expa`
- end-to-end live filing proof that these newer sections behave correctly through final provider lifecycle stages

### Still pending before GSTR-1 can be called fully complete

GSTR-1 should be treated as fully complete only when:

- source transactions can represent all targeted sections
- readiness validates those sections correctly
- prepared summary snapshot is section-first and reusable
- workbook export uses real section data
- provider filing payload covers the same implemented sections
- approval and filing flows use the same prepared truth
- tests cover preparation, readiness, export, and provider payload behavior
- live provider or UAT evidence confirms the newer implemented sections behave correctly in actual filing flows
- any intentionally shallow sections such as nil / exempt / non-GST, HSN, and document-summary provider parity are either completed or explicitly scoped out of the product claim

Until then, GSTR-1 should be treated as:

- functionally strong and mostly end-to-end in code
- suitable for continued UAT and controlled rollout work
- not yet fully production-closed across all provider edge cases
