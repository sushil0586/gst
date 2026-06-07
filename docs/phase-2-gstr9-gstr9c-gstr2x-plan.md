# Phase 2 Plan: GSTR-9, GSTR-9C, GSTR-2X

## Status note

This document captures the original Phase 2 sequencing for annual returns.

Because market demand has shifted toward GST-TDS support, the active near-term Phase 2 implementation order is now:

1. `GSTR-7`
2. `GSTR-2X`
3. deeper `GSTR-9C` workflow layers after annual MVP validation

See:

- [gstr7-gstr2x-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-gstr2x-implementation-plan.md:1)

## Purpose

This document defines the lean but implementation-ready Phase 2 plan for:

- `GSTR-9`
- `GSTR-9C`
- `GSTR-2X`

It is written for the current product reality:

- `GSTR-1` and `GSTR-3B` are becoming pilot-ready
- reconciliation and correction workflows now exist
- the product is new to market, so breadth matters for customer interest
- we should still avoid overengineering

This is not a promise to build all 3 modules at once.
This is the implementation order and boundary plan so Phase 2 can start in a controlled way.

## Why Phase 2 Matters

From a market-entry point of view, monthly returns alone are not always enough to create strong customer pull.

Customers and CAs often ask:

- can you help with annual return closure?
- can you support audit-style reconciliation?
- can you support additional inward review workflows beyond standard 2B matching?

So Phase 2 matters for:

- customer interest
- product positioning
- deeper CA workflow ownership
- annual and review-heavy compliance use cases

But the wrong way to do Phase 2 is:

- building all modules in parallel
- copying the monthly-return workflow blindly
- adding broad domain scope before we validate the first annual-return journey

## Current Readiness

Strong foundations already exist:

- workspace, client, GSTIN, and period context
- imports and normalized transactions
- reconciliation engine
- correction and audit trail foundation
- returns preparation
- approval workflow
- filing workflow
- in-app review workspaces
- provider integration pattern

This means Phase 2 should reuse the same product backbone:

`Input -> Validation -> Reconciliation -> Review -> Approval -> Filing / Export -> Audit Trail`

## Recommended Build Order

Do Phase 2 in this order:

1. `GSTR-9`
2. `GSTR-9C`
3. `GSTR-2X`

Reason:

- `GSTR-9` is the most natural extension of existing monthly return data
- `GSTR-9C` depends on annual return logic plus financial reconciliation
- `GSTR-2X` needs precise scope definition and should not outrun the stronger annual-return lanes

## Phase 2A: GSTR-9

### Goal

Build a usable annual return preparation and review workflow using existing monthly GST data.

### Why first

`GSTR-9` is the easiest Phase 2 expansion because it can reuse:

- `GSTR-1` outward data
- `GSTR-3B` liability and ITC data
- existing imports
- existing annual aggregation concepts
- approvals and audit trail

### Minimum product outcome

Users should be able to:

- select a financial year
- aggregate monthly GST activity into annual buckets
- review annual section totals in-app
- inspect exceptions and mismatches
- export a working workbook
- approve the annual draft
- mark filing status and evidence, even if provider automation is deferred initially

### Must-have scope

- annual context selection
- financial-year aggregation layer
- outward turnover rollups
- tax liability rollups
- ITC rollups
- amendment impact carry-through
- annual review workspace
- annual readiness checks
- annual export
- approval + audit trail

### Not required in v1

- deep filing automation on day one
- every rare annual edge case before first pilot
- fully automated annual-to-financial-statement reconciliation

### Data dependencies

Need to aggregate from:

- monthly `GSTR-1` prepared returns
- monthly `GSTR-3B` prepared returns
- optionally direct source transaction evidence for drilldown

### UI deliverables

- `/returns/gstr9-review`
- overview cards
- annual section tabs
- warning and exception panels
- month drilldown
- annual export button

### Backend deliverables

- `GSTR-9` return preparation service
- financial-year aggregation helpers
- annual readiness service
- annual workbook/export service
- annual review snapshot contract

## Phase 2B: GSTR-9C

### Goal

Build a CA-grade annual reconciliation and certification workspace after `GSTR-9` is stable.

### Why second

`GSTR-9C` is not just another return.
It is an audit-style reconciliation layer between:

- annual GST return values
- books / financial statements
- adjustment decisions

It should come only after `GSTR-9` produces a stable annual base.

### Minimum product outcome

Users should be able to:

- load annual books figures
- compare those against annual GST return figures
- record adjustment explanations
- document certification notes
- export a working review pack
- preserve audit evidence

### Must-have scope

- annual books summary import or input
- comparison against `GSTR-9` base
- adjustment rows
- explanation / note capture
- audit trail for overrides
- reviewer signoff workflow
- working paper export

### Not required in v1

- final statutory certification automation
- partner-review hierarchy engine
- heavy multi-stage approval workflow
- advanced document-room orchestration

### Data dependencies

Need:

- completed `GSTR-9` draft
- annual books summary
- adjustment ledger

### UI deliverables

- `/returns/gstr9c-review`
- annual comparison dashboard
- adjustment table
- certification note panel
- evidence summary

### Backend deliverables

- `GSTR-9C` preparation service
- books-vs-return comparison engine
- adjustment model
- reviewer notes model
- export payload builder

## Phase 2C: GSTR-2X

## Important note

Before building this, we must freeze what `GSTR-2X` means in product terms.

Right now, this name can be interpreted in multiple ways:

- enhanced inward review workflow
- supplementary inward statement workflow
- a customer-facing branded 2B/2A/ITC review module
- a product shorthand for extended inward compliance

So this phase should begin only after product scope is explicit.

### Recommended framing

Treat `GSTR-2X` as:

- an enhanced inward compliance and ITC-control workspace
- not just a new form screen

### Minimum product outcome

Users should be able to:

- track unresolved inward tax credit items across periods
- review deferred claims
- follow up on portal-only or books-only items
- carry forward reviewer decisions cleanly
- generate an inward control summary

### Must-have scope

- deferred ITC carry-forward view
- prior-period unresolved tracker
- blocked vs deferred vs claim-now posture
- CA decision continuity
- audit trail continuity

### Not required in v1

- full reversal engine
- predictive reminders
- deep vendor performance analytics

### Data dependencies

Need:

- reconciliation decisions
- correction history
- monthly ITC posture snapshots

### UI deliverables

- `/reconciliation/itc-control` or equivalent
- deferred items tab
- prior-period carry-forward tab
- claim-risk summary

### Backend deliverables

- carry-forward summary service
- prior-period unresolved retrieval
- ITC control snapshot model or derived view

## Prerequisites Before Starting

Do not start core implementation until these are true:

1. `GSTR-1` and `GSTR-3B` pilot flows are stable
- review pages are accepted by users
- filing state transitions are reliable
- reconciliation correction flow is usable

2. WhiteBooks live contract risk is contained
- at least pilot confidence exists for monthly returns
- annual planning should not block on perfect provider breadth, but monthly instability should not carry forward

3. Snapshot contracts are reasonably stable
- monthly return snapshots should not still be changing every week

4. Team capacity is real
- monthly return stabilization should not be starved by annual-return work

## Lean Delivery Strategy

### Stage 1: Design and contract freeze

Start with:

- section mapping
- annual snapshot contract
- financial year context rules
- GSTR-9 to GSTR-9C dependency map
- GSTR-2X scope freeze

Output:

- stable implementation contracts before code spread begins

### Stage 2: GSTR-9 MVP

Build:

- aggregation
- review UI
- export
- approval

Do not build:

- large provider automation scope yet

### Stage 3: GSTR-9C MVP

Build:

- books-vs-return comparison
- adjustment log
- export pack

Do not build:

- heavy certification workflow engine

### Stage 4: GSTR-2X MVP

Build:

- deferred ITC continuity
- prior-period item review
- inward control view

Do not build:

- broad analytical platform features

## Suggested Sprint Sequence

### Sprint P2-1

Focus:

- freeze `GSTR-9` scope and annual snapshot contract
- define annual data aggregation rules
- create UI skeleton for GSTR-9 review workspace

### Sprint P2-2

Focus:

- implement `GSTR-9` aggregation service
- add annual readiness
- add annual export

### Sprint P2-3

Focus:

- finish `GSTR-9` review UX
- add annual approval workflow
- run first annual UAT

### Sprint P2-4

Focus:

- freeze `GSTR-9C` comparison contract
- implement books summary input
- build adjustment model and table

### Sprint P2-5

Focus:

- finish `GSTR-9C` review workspace
- add working-paper export
- run first CA-focused UAT

### Sprint P2-6

Focus:

- freeze `GSTR-2X` product scope
- implement deferred ITC continuity view
- add prior-period unresolved carry-forward UX

## Definition of Done

### GSTR-9 done when

- annual draft can be prepared from monthly return history
- annual sections can be reviewed in-app
- warnings and exceptions are visible
- workbook/export exists
- approval flow works

### GSTR-9C done when

- annual GST vs books comparison is visible
- adjustments are captured with audit
- notes and evidence are retained
- export pack exists

### GSTR-2X done when

- deferred and unresolved ITC items can be reviewed across periods
- CA decisions persist meaningfully from prior months
- review outcome is visible in the product without returning to raw import files

## What To Avoid

To keep Phase 2 practical, avoid:

- building all three modules together
- building live provider filing for annual returns before review flows are stable
- designing a giant generic annual compliance engine first
- adding enterprise workflow complexity before the first customer use

## Recommendation

The right move is:

1. stabilize current monthly GST product
2. start `GSTR-9` immediately after that
3. use `GSTR-9` as the bridge into annual compliance
4. follow with `GSTR-9C`
5. only then build `GSTR-2X` once the exact product meaning is frozen

This gives you:

- stronger customer interest
- credible roadmap depth
- controlled implementation
- no unnecessary overengineering

Related implementation backlog:

- [gstr9-implementation-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-implementation-backlog.md:1)
