# Ledger And Payment MVP Plan

## Purpose

This document defines how GST ledger and payment APIs should be integrated into the product so that:

- CAs get better filing confidence
- clients get clearer cash and liability visibility
- the product becomes stronger than a return-preparation-only tool

This is intentionally MVP-first:

- maximize customer value
- avoid risky overautomation
- keep write operations tightly controlled

## Product Goal

The product should not stop at:

- “return is prepared”

It should move toward:

- “we know whether the client can actually file”
- “we know what balance is available”
- “we know whether payment is still needed”
- “we can explain portal truth versus computed truth”

For a CA or tax-practitioner workflow, this matters because the real filing process is usually:

1. compute return
2. validate portal position
3. confirm liability and balance
4. create or verify challan if needed
5. file with evidence

## APIs In Scope

## Ledger Read APIs

- `GET /ledgers/bal`
- `GET /ledgers/taxpayable`
- `GET /ledgers/itc`
- `GET /ledgers/cashdtl`
- `GET /ledgers/tax`

## Ledger Read APIs: Second Wave

- `GET /ledgers/revrclmdtl`
- `GET /ledgers/itcblocktrandetls`
- `GET /ledgers/negliabstmt`
- `GET /ledgers/rcmldg`

## Payment APIs

- `POST /payment/generateChallan`
- `GET /payment/chllnlst`
- `GET /payment/chllnsum`
- `POST /payment/validatechlnrsn`

## Deferred Write APIs

- `POST /ledgers/utlcsh`
- `POST /ledgers/utlitc`

These should stay out of MVP because they directly affect portal utilization state and need stronger controls.

## Why This Matters In The Product

## For CAs

Ledger and payment data helps answer the real questions CAs face before filing:

- is portal liability aligned with our computation?
- is enough cash available?
- is enough ITC available?
- is any ITC blocked or reversed?
- do we need to create a challan before filing?
- was challan already generated?

This reduces:

- manual portal checks
- client back-and-forth
- last-minute filing surprises

## For Clients

Clients usually care about:

- how much tax is payable
- whether payment has been made
- whether cash balance is available
- whether CA advice matches portal reality

This improves:

- trust
- visibility
- payment readiness

## For The Product

These APIs help the product evolve from:

- return prep software

to:

- compliance operations software

That increases:

- stickiness
- perceived intelligence
- operational usefulness

## Recommended MVP Scope

## Phase 1: Read-Only Ledger Visibility

Implement first:

1. `GET /ledgers/bal`
2. `GET /ledgers/taxpayable`
3. `GET /ledgers/itc`
4. `GET /ledgers/cashdtl`
5. `GET /ledgers/tax`

Why first:

- highest filing confidence value
- lowest operational risk
- no portal state mutation

Expected user outcome:

- before filing, the CA can see:
  - tax payable
  - available cash balance
  - available ITC
  - ledger mismatch indicators

## Phase 2: Challan Visibility And Creation

Implement next:

1. `GET /payment/chllnsum`
2. `GET /payment/chllnlst`
3. `POST /payment/generateChallan`
4. `POST /payment/validatechlnrsn`

Why second:

- once liability and balance are visible, the next operational step is payment readiness
- challan creation provides strong practical value without jumping into ledger utilization writes

Expected user outcome:

- the CA can see whether payment is still pending
- the CA can generate challan from the product
- the client can track challan history without leaving the app

## Phase 3: Advanced Ledger Insight

Implement after Phase 1 and 2 are stable:

1. `GET /ledgers/revrclmdtl`
2. `GET /ledgers/itcblocktrandetls`
3. `GET /ledgers/negliabstmt`
4. `GET /ledgers/rcmldg`

Why later:

- valuable for complex cases
- not required for basic filing readiness
- best introduced after core ledger/payability views are working

Expected user outcome:

- better notice support
- better audit explanation
- better advanced ITC handling

## Phase 4: Utilization Writes

Defer until strong controls exist:

- `POST /ledgers/utlcsh`
- `POST /ledgers/utlitc`

Why defer:

- these are portal-mutating actions
- they need:
  - maker-checker rules
  - audit evidence
  - retry/reconciliation safety
  - explicit approval boundaries

## Product Architecture

## 1. Provider Layer

Add provider client support for:

- ledger read endpoints
- challan read endpoints
- challan create endpoint

Requirements:

- normalized request builders
- normalized response parsing
- raw provider evidence persistence
- feature flags for tenant-safe rollout

## 2. Domain Layer

Introduce provider-neutral domain services:

- `fetch_ledger_balances(...)`
- `fetch_tax_payable(...)`
- `fetch_itc_ledger(...)`
- `fetch_cash_ledger(...)`
- `fetch_liability_ledger(...)`
- `fetch_challan_summary(...)`
- `fetch_challan_history(...)`
- `generate_challan(...)`

These should not be tied directly to page components.

## 3. Storage Strategy

Do not treat this as one-time request-only data.

Store snapshots so users can compare:

- current portal truth
- last synced portal truth
- computed return truth

Recommended persisted objects:

- `LedgerSnapshot`
- `PaymentSnapshot`
- `ChallanRecord`

Minimum fields:

- workspace
- client
- GSTIN
- period
- provider
- fetched_at
- source endpoint
- normalized summary
- raw response
- sync status

## 4. UI Usage Model

These APIs should not appear as “technical fetch buttons only.”

They should power product surfaces.

### Returns Page

Add a `Portal Balances` strip for filing-ready returns:

- cash available
- ITC available
- tax payable
- challan status

### GSTR-3B Review

Add a `Payment Readiness` tab or card:

- computed liability
- portal liability
- cash balance
- ITC balance
- challan needed or not

### Client Dashboard

Add a compact portal-health summary:

- pending liability
- recent challans
- balance snapshot freshness

### Operations / Support

Add evidence visibility:

- last ledger sync
- last challan sync
- raw provider status
- mismatch notes

## Key Product Use Cases

## Use Case 1: CA Checks If Client Can File GSTR-3B

Flow:

1. prepare GSTR-3B
2. product shows computed net payable
3. product fetches portal cash and ITC balances
4. product compares payable versus balances
5. CA knows whether challan is needed

Benefit:

- fewer filing-time surprises

## Use Case 2: CA Creates Challan For Client

Flow:

1. payable exists
2. available balance is insufficient
3. CA generates challan from product
4. challan history and summary appear in client context

Benefit:

- cleaner CA-to-client payment workflow

## Use Case 3: CA Explains Portal Mismatch

Flow:

1. product computed liability differs from portal tax payable
2. liability ledger and return status are shown together
3. CA investigates before filing

Benefit:

- stronger trust and advisory value

## Use Case 4: Support Reviews Filing Failure

Flow:

1. filing is blocked or unclear
2. support checks:
   - status
   - liability
   - balance
   - challan presence
3. support can guide user without asking for portal screenshots first

Benefit:

- better serviceability

## Data Model Recommendation

Lean MVP models:

- `PortalLedgerSnapshot`
- `PortalPaymentSnapshot`
- `PortalChallanRecord`

Optional later:

- `PortalSyncJob`
- `PortalDataRefreshPolicy`

Do not start with a large generic “everything sync engine.”

## Rollout Plan

## Sprint 1

- provider client support for:
  - `bal`
  - `taxpayable`
  - `itc`
- normalized storage and service layer
- backend APIs for returns page and GSTR-3B review

## Sprint 2

- `cashdtl`
- `tax`
- returns-page and GSTR-3B payment-readiness UI
- evidence visibility for support

## Sprint 3

- `chllnsum`
- `chllnlst`
- challan summary UI
- challan history UI

## Sprint 4

- `generateChallan`
- `validatechlnrsn`
- guarded challan-create UX
- audit logging and operator proof

## Explicit Non-Goals For MVP

Do not build yet:

- automatic cash utilization
- automatic ITC utilization
- full finance workflow engine
- bank/payment gateway orchestration
- large generic sync policy engine

## Success Criteria

We should consider this MVP successful when:

- CAs can see portal balance truth in-product before filing
- GSTR-3B payment readiness is visible without portal hopping
- challan history is visible inside the client workspace
- challan creation is available with audit trace
- support can diagnose payment-readiness blockers from product data

## Recommended Priority

If we keep this practical, implement in this order:

1. ledger read APIs
2. challan read APIs
3. challan create API
4. advanced ledger insight APIs
5. utilization write APIs last
