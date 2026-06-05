# TDS & TCS Module Phased Architecture Plan

## 1. Purpose

This document converts the TDS/TCS architecture note into an internal delivery plan that fits the current Accerio codebase.

It should be read together with:

- [accerio-compliance-cloud-phased-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/accerio-compliance-cloud-phased-plan.md:1)
- [production-roadmap.md](/Users/ansh/Documents/Gst-Compliance/docs/production-roadmap.md:1)
- [detailed-delivery-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/detailed-delivery-plan.md:1)

It answers:

- what the TDS/TCS module should contain
- what should be built first
- what should be shared with GST
- how to phase delivery without overbuilding too early

## 2. Objective

Build a provider-independent TDS/TCS compliance module inside Accerio Compliance Cloud.

The long-term module scope includes:

- TDS computation
- TDS return preparation
- TDS return filing
- TCS computation
- TCS return filing
- Form 16 generation
- Form 16A generation
- challan management
- correction returns
- compliance monitoring
- compliance dashboard

Future provider integrations may include:

- ClearTax
- sandbox adapters
- TRACES
- direct government APIs

## 3. Non-Negotiable Design Rule

TDS/TCS must follow the same operating pattern already used in GST:

`Import -> Validation -> Review -> Approval -> Filing -> Audit Trail`

This is the most important design choice in the whole plan.

We should not build TDS/TCS as separate calculation utilities. They must behave like first-class operational modules inside the same compliance platform.

## 4. Architecture Direction

## 4.1 App Structure

Recommended new Django app family:

```text
apps/tds_tcs/
├── models/
├── services/
├── selectors/
├── api/
├── validators/
├── permissions/
├── exports/
├── integrations/
├── reports/
├── tasks/
├── tests/
└── management/
```

If needed, this can later split into:

- `apps/tds/`
- `apps/tcs/`

But the first implementation should stay combined if that keeps shared masters and quarterly return patterns simpler.

## 4.2 Relationship To Existing Platform

TDS/TCS should reuse platform services already proven in GST:

- organizations
- workspaces
- clients
- user management and roles
- approvals
- audit logs
- notifications
- document repository
- operational follow-ups
- reports and exports

This means TDS/TCS should not invent:

- a new approval framework
- a new audit framework
- a separate team/user system
- a separate dashboard shell

## 5. Domain Model Recommendation

The pasted note gives the right direction. Internally, we should structure it like this.

## 5.1 Deductor

Represents the entity responsible for tax deduction.

Recommended fields:

- `workspace`
- `client`
- `deductor_name`
- `pan`
- `tan`
- `email`
- `phone`
- `address`
- `state_code`
- `is_active`

Validations:

- PAN format
- TAN format
- duplicate TAN prevention within workspace

## 5.2 Deductee

Represents the party from whom tax is deducted.

Recommended fields:

- `workspace`
- `client`
- `name`
- `pan`
- `category`
- `residential_status`
- `email`
- `phone`
- `is_active`

Categories:

- individual
- company
- partnership
- HUF
- trust
- LLP
- government

Validations:

- PAN format
- duplicate PAN warning within workspace or deductor context

## 5.3 TDS Section Master

Examples:

- 192
- 194A
- 194C
- 194H
- 194I
- 194J
- 194Q

Recommended fields:

- `code`
- `description`
- `default_rate`
- `threshold_amount`
- `active`

## 5.4 TCS Section Master

Examples:

- 206C(1H)
- scrap
- timber
- minerals
- motor vehicle

Recommended fields:

- `code`
- `description`
- `default_rate`
- `active`

## 5.5 Challan Management

Model: `TDSChallan`

Recommended fields:

- `workspace`
- `client`
- `deductor`
- `challan_no`
- `bsr_code`
- `challan_date`
- `amount`
- `surcharge`
- `cess`
- `interest`
- `fee`
- `consumed_amount`
- `balance_amount`
- `status`

Statuses:

- available
- partially_utilized
- fully_utilized

Validations:

- duplicate challan prevention
- no negative balance
- controlled utilization tracking

## 5.6 TDS Transaction Engine

Model: `TDSTransaction`

Recommended fields:

- `workspace`
- `client`
- `deductor`
- `deductee`
- `section`
- `invoice_no`
- `invoice_date`
- `payment_date`
- `amount_paid`
- `taxable_amount`
- `tds_rate`
- `tds_amount`
- `challan`
- `status`
- `metadata`

Statuses:

- draft
- approved
- filed

Automatic computation should depend on:

- section
- threshold
- PAN availability
- residential status
- rule applicability

## 5.7 TCS Transaction Engine

Model: `TCSTransaction`

Recommended fields:

- `workspace`
- `client`
- `buyer`
- `section`
- `invoice_no`
- `invoice_date`
- `taxable_amount`
- `tcs_rate`
- `tcs_amount`
- `status`
- `metadata`

Statuses:

- draft
- approved
- filed

## 5.8 Quarterly Return Management

Model: `TDSReturn`

Recommended fields:

- `workspace`
- `client`
- `deductor`
- `financial_year`
- `quarter`
- `return_type`
- `status`
- `prepared_snapshot`
- `approval_request`
- `provider`
- `filed_at`
- `acknowledgement_no`

Return types:

- 24Q
- 26Q
- 27Q
- 27EQ

Statuses:

- draft
- under_review
- approved
- filed
- failed
- needs_retry

## 5.9 Certificate Generation

Models:

- `Form16Batch`
- `Form16ABatch`

Capabilities:

- employee Form 16 generation
- vendor / professional / contractor Form 16A generation
- bulk PDF generation
- ZIP download
- future email delivery

## 5.10 Correction Return Engine

This should be modeled explicitly, not hidden as simple edits.

Recommended approach:

- original return
- amended data set
- correction return entity
- linked filing history
- full audit chain

Supported eventually:

- 24Q correction
- 26Q correction
- 27Q correction
- 27EQ correction

## 6. Provider Architecture

This module must remain provider-independent.

Recommended abstraction:

```python
class TDSProvider:
    validate_return()
    generate_fvu()
    file_return()
    get_filing_status()
    download_acknowledgement()
```

Recommended implementations:

- `ClearTaxProvider`
- `SandboxProvider`
- `TRACESProvider`
- future provider adapters

Rule:

- application services must not call provider APIs directly
- all external integration must stay behind the adapter layer

## 7. Reuse From GST

The biggest mistake would be treating TDS/TCS as a greenfield product.

Instead, we should reuse what already works:

## 7.1 Reuse directly

- approvals
- audit logs
- workspace/client hierarchy
- reporting patterns
- exports
- operational follow-up engine
- notices approach where relevant
- dashboard card patterns

## 7.2 Reuse with adaptation

- import framework
- validation and correction workflow
- return lifecycle concepts
- filing attempts and filing events
- support/operations queue pattern

## 7.3 Do not copy blindly

Avoid direct GST terminology in TDS/TCS such as:

- GSTIN-based assumptions
- period model tied to month-only semantics
- GSTR-specific filing states
- reconciliation concepts that only make sense for GST portal matching

## 8. Phased Delivery Recommendation

This is the recommended practical build order.

## Phase 1: Foundation And Masters

Goal:

- create the base domain model without filing complexity yet

Scope:

- deductor master
- deductee master
- TDS section master
- TCS section master
- challan model
- quarter model
- basic admin and APIs
- basic UI registers

Definition of done:

- a workspace can maintain TDS/TCS master data cleanly

## Phase 2: TDS Transaction MVP

Goal:

- capture and validate TDS transactions reliably

Scope:

- CSV/Excel import
- validation rules
- correction flow
- TDS amount computation
- challan linkage
- status handling
- audit trail

Definition of done:

- a CA team can import and review TDS transaction data for a quarter

## Phase 3: TDS Return Preparation MVP

Goal:

- generate quarter-level return preparation using imported transactions

Scope:

- 24Q
- 26Q
- 27Q
- return preparation engine
- validation summary
- review state
- approval workflow

Do not include yet:

- provider filing
- FVU generation
- correction returns

Definition of done:

- return preparation and approval can be completed inside the platform

## Phase 4: TDS Filing Architecture

Goal:

- add provider-neutral filing lifecycle for TDS

Scope:

- TDS provider adapter contract
- filing entity and attempts
- status sync
- acknowledgement tracking
- sandbox implementation first

Definition of done:

- TDS filing can be tested end to end in a controlled provider or sandbox flow

## Phase 5: TCS MVP

Goal:

- launch TCS using the same module architecture with lighter complexity

Scope:

- buyer / collection data
- section mapping
- 27EQ preparation
- approvals
- reports
- later filing support

Definition of done:

- TCS is operational for collection capture and return preparation

## Phase 6: Certificates

Goal:

- add Form 16 and Form 16A generation after transaction and return correctness is stable

Scope:

- Form 16 batch generation
- Form 16A batch generation
- PDF output
- ZIP output
- audit trail

## Phase 7: Corrections And Advanced Controls

Goal:

- move from basic filing workflows to lifecycle completeness

Scope:

- correction returns
- FVU generation
- challan mismatch recovery
- default analysis
- interest/fee logic refinement

## 9. Reporting And Dashboard Plan

The note asks for dashboards, but we should phase them.

### First reports to build

- TDS transaction register
- challan utilization register
- quarter return status register
- deductee exception report
- missing PAN / invalid PAN report

### First dashboard widgets

- pending deductions
- unlinked challans
- filing due
- overdue filings
- section-wise liability
- pending collections
- certificate generation pending

## 10. Approval And Audit Model

TDS/TCS should plug into the same maker-reviewer-approver model already present in the product.

Suggested approval levels:

- maker
- reviewer
- approver

Everything must be auditable:

- create
- edit
- delete
- approve
- reject
- file
- generate certificate
- download certificate

## 11. What Should Wait

The pasted note is intentionally broad. For the first implementation, these should wait:

- direct government API complexity
- final TRACES integration
- advanced correction workflows
- email delivery of certificates
- compliance scoring
- heavy analytics
- AI support

These are important later, but they should not delay the first usable TDS/TCS release.

## 12. Immediate Internal Next Steps

Recommended next execution docs after this one:

1. `tds-module-schema-plan.md`
2. `tds-import-and-validation-plan.md`
3. `tds-quarterly-return-workflow-plan.md`
4. `tds-provider-adapter-design.md`
5. `tcs-module-mvp-plan.md`

## 13. Recommended Build Order Summary

If we compress this into one clear sequence:

1. masters and challans
2. TDS transaction import and validation
3. TDS quarterly return preparation
4. TDS approvals
5. TDS filing architecture
6. TCS MVP
7. certificates
8. corrections and advanced controls

## 14. Working Conclusion

The TDS/TCS note is directionally strong and should be kept.

But the correct delivery strategy is:

- build TDS first
- treat TDS as the second serious compliance module after GST
- keep provider independence from day one
- reuse shared platform services wherever possible
- phase advanced items like FVU, corrections, and certificates after the core workflow is stable

That gives Accerio a realistic path from GST-first product to a true multi-compliance platform.
