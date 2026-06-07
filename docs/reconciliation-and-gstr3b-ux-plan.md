# Reconciliation And GSTR-3B UX Plan

## Purpose

This document defines how the product should evolve from:

- a mostly transaction-level reconciliation workspace
- and a workable GSTR-1 return preparation flow

into:

- an accountant-friendly reconciliation decision system
- and a GSTR-3B preparation experience that is operationally usable, legally cautious, and easy to resolve.

The immediate product goal is:

- keep GSTR-1 stable
- improve reconciliation usability
- then make GSTR-3B preparation and review materially better

This document is intentionally focused on:

- operator understanding
- issue resolution
- cross-period scenarios
- ITC decisioning
- clear UI behavior

It is not a provider-integration spec.

Related implementation detail:

- [reconciliation-correction-and-itc-audit-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/reconciliation-correction-and-itc-audit-implementation-plan.md:1)

## Core Principle

The system must not ask:

- "Which source always wins?"

Instead it must answer:

- "Which source is more relevant for this decision?"

### Source roles

`Purchase register / books`

- primary source for business/accounting reality
- answers whether the business booked or received the invoice

`GSTR-2B`

- primary source for ITC readiness and GST-system reflection
- answers whether the invoice is currently reflected on the tax side

`Source invoice / supporting document`

- final source of truth for dispute resolution
- used when books and 2B disagree materially

## Product Truth Layers

Reconciliation should maintain three distinct truths.

### 1. Books truth

- booked
- not booked
- booked in different period
- booked with different value

### 2. GST system truth

- reflected in 2B
- not reflected in 2B
- reflected in different period
- reflected with mismatch

### 3. ITC decision truth

- claim-ready
- timing difference
- pending vendor action
- pending internal review
- blocked
- risky

The UI should never collapse these into one raw `matched / mismatch` answer when the real issue is timing or ITC readiness.

## Decision Rules

### Accounting truth

Prefer:

1. source invoice/document
2. books
3. 2B

### ITC readiness

Prefer:

1. 2B
2. source invoice/document support
3. books

### Final mismatch resolution

Prefer:

1. source invoice/document
2. human review
3. corrected books / supplier follow-up / reconciliation status update

## Scenario Matrix

### Scenario 1: Books present, 2B missing

Example:

- purchase register contains invoice
- invoice is not present in 2B

Interpretation:

- business may have genuinely received/booked the invoice
- supplier may not have filed, may have filed late, or may have filed incorrectly

System treatment:

- keep books transaction valid
- classify as `books_only`
- ITC state should be `pending_2b`

UI message:

- "Invoice is booked in purchase register but not yet reflected in GSTR-2B."

Operator next step:

- vendor follow-up
- check filing cycle timing
- defer ITC conclusion until review

### Scenario 2: 2B present, books missing

Interpretation:

- supplier filed invoice
- buyer did not book it or import is incomplete

System treatment:

- classify as `portal_only`
- ITC state should be `review_required`

UI message:

- "Invoice is reflected in GSTR-2B but not found in purchase register."

Operator next step:

- verify receipt
- confirm missing booking
- update books or mark unsupported

### Scenario 3: Books and 2B both present, values differ

Interpretation:

- taxable value, tax value, or total amount mismatch

System treatment:

- classify as `amount_mismatch`
- do not auto-prefer either source

UI message:

- "Invoice exists in both books and GSTR-2B, but values do not match."

Operator next step:

- compare against source invoice
- identify whether books or supplier filing is wrong

### Scenario 4: Books period differs from 2B period

Example:

- seller invoice dated `30 Apr`
- buyer books receipt on `1 May`
- 2B reflects later depending on supplier filing window

Interpretation:

- timing difference, not necessarily a hard mismatch

System treatment:

- classify as `cross_period_match`
- do not show as normal mismatch

UI message:

- "Document matches, but books and GSTR-2B fall in different periods."

Operator next step:

- verify invoice date
- verify receipt date
- verify supplier filing timing
- decide ITC period treatment

### Scenario 5: 2B present but document identity differs

Examples:

- GSTIN mismatch
- invoice number mismatch
- date mismatch

Interpretation:

- likely filing error or wrong mapping

System treatment:

- classify as `document_mismatch`
- high-risk

UI message:

- "Invoice is reflected on the GST side, but the key identity fields do not match books."

Operator next step:

- compare source document
- raise supplier correction follow-up

### Scenario 6: Period-exception import

Interpretation:

- transaction was accepted outside the selected period using controlled override

System treatment:

- keep imported row
- show `period_exception`
- never silently treat as ordinary in reconciliation or return review

UI message:

- "This transaction was accepted using a period exception and should be reviewed before final ITC or filing decisions."

## Recommended Reconciliation Status Model

Current model is still too technical for operators.

Target business-facing categories:

- `matched`
- `matched_with_timing_difference`
- `books_only`
- `portal_only`
- `amount_mismatch`
- `document_mismatch`
- `duplicate`
- `period_exception_review`
- `supplier_correction_needed`
- `internal_booking_correction_needed`

These can still map internally to existing engine outcomes, but UI language should use the business-facing model.

## Recommended ITC Status Model

Add a separate ITC decision layer:

- `itc_ready`
- `itc_pending_2b`
- `itc_pending_review`
- `itc_blocked`
- `itc_timing_difference`
- `itc_vendor_followup_required`

This should become visible in:

- reconciliation row detail
- reconciliation summary
- GSTR-3B preparation summary

## Reconciliation UI Direction

The reconciliation page should become an issue-resolution workspace, not just a mismatch register.

### 1. Add a decision-oriented summary band

Top summary should answer:

- how many rows are ready
- how many are timing differences
- how many are vendor follow-up cases
- how many are internal booking issues
- how many are blocked for ITC

### 2. Replace raw mismatch emphasis with resolution buckets

Instead of mainly showing:

- mismatch count
- partial match count

show:

- vendor follow-up needed
- books correction needed
- timing-only differences
- duplicates
- ITC at risk

### 3. Row detail should show three layers

Each reconciliation item detail should show:

- books view
- GST/2B view
- recommended action / ITC position

### 4. Primary CTA per row

Each item should have one obvious next action:

- `Mark timing difference`
- `Assign vendor follow-up`
- `Correct books`
- `Mark resolved`
- `Hold for ITC review`

### 5. Show latest explanation only

Avoid stacked warnings and repeated system messages.

For any row or top-level state:

- one latest business message
- one next action
- facts below

This is especially important for accountants and CAs.

## GSTR-3B Product Direction

GSTR-3B should become the consumer of reconciliation outcomes, not just a separate return-prep screen.

### GSTR-3B should explicitly consume:

- purchase register
- 2B reflection state
- reconciliation outcomes
- ITC decision states
- period exceptions

### GSTR-3B screen must answer:

- how much ITC is in books
- how much ITC is reflected in 2B
- how much ITC is claim-ready
- how much ITC is pending due to timing differences
- how much ITC is blocked or unresolved

### GSTR-3B must not look like a black-box summary

The user should be able to drill down from summary numbers into:

- ready ITC rows
- pending 2B rows
- mismatch rows
- period exception rows

## GSTR-3B UI Requirements

### 1. ITC decision summary

Top summary cards:

- books ITC
- 2B ITC
- claim-ready ITC
- pending ITC
- blocked ITC
- timing-difference ITC

### 2. Outward / inward separation

Keep GSTR-3B clear by splitting:

- outward tax summary
- inward/ITC summary
- net payable / offset readiness

### 3. Reconciliation impact panel

This panel should explain:

- unresolved purchase mismatches affecting ITC
- period differences affecting ITC timing
- blocked rows that need correction before confidence is high

### 4. Explain recommendation in plain language

Examples:

- "ITC is available in books but not reflected in GSTR-2B yet."
- "This ITC appears in GSTR-2B but books entry is missing."
- "This invoice matches across periods and needs timing review, not vendor correction."

### 5. Approval note support

Approval note for GSTR-3B should include:

- unresolved mismatch count
- timing-difference count
- blocked ITC count
- period exception count

## Implementation Phases

This work should be delivered in narrow, safe phases so GST remains stable while reconciliation and GSTR-3B improve.

### Phase 1: Reconciliation UX Cleanup

Objective:

- make the current reconciliation page understandable for accountants without changing engine behavior deeply

Scope:

- replace raw mismatch-heavy wording with business-facing labels
- show one latest guidance message, not multiple stacked system messages
- introduce issue buckets in the UI:
  - timing difference
  - vendor follow-up
  - books correction
  - ITC blocked / review
- add one recommended next action per row

Out of scope:

- engine rewrite
- ITC decision model
- cross-period auto-classification

Expected outcome:

- users can tell what the issue is and what they should do next

### Phase 2: Reconciliation Decision Model

Objective:

- move from generic mismatch handling to structured issue classification

Scope:

- add business-facing reconciliation categories:
  - `books_only`
  - `portal_only`
  - `amount_mismatch`
  - `document_mismatch`
  - `duplicate`
  - `period_exception_review`
- map current engine outcomes into these categories
- surface operator action ownership more clearly

Out of scope:

- cross-period matching window
- full ITC scoring

Expected outcome:

- reconciliation becomes a decision workspace, not only a comparison grid

### Phase 3: Cross-Period And Timing-Difference Handling

Objective:

- handle valid books-vs-2B period differences as timing cases, not hard mismatches

Scope:

- add `cross_period_match`
- define timing relationship fields:
  - books period
  - invoice period
  - 2B reflected period
  - period relationship
- allow controlled previous/current/next period matching for purchase vs 2B review

Out of scope:

- full legal advisory engine
- automated ITC booking recommendation

Expected outcome:

- valid timing cases stop appearing as ordinary mismatch noise

### Phase 4: ITC Decision Layer

Objective:

- turn reconciliation output into ITC-ready operator decisions

Scope:

- add ITC states:
  - `itc_ready`
  - `itc_pending_2b`
  - `itc_pending_review`
  - `itc_blocked`
  - `itc_timing_difference`
  - `itc_vendor_followup_required`
- show ITC decision status in row detail and summaries
- add ITC-oriented queue summaries and filters

Out of scope:

- final GSTR-3B redesign
- filing automation changes

Expected outcome:

- reconciliation clearly tells the operator whether the issue affects ITC and how

### Phase 5: GSTR-3B Preparation Redesign

Objective:

- make GSTR-3B preparation consume reconciliation and ITC decisions in a usable way

Scope:

- redesign GSTR-3B summary around:
  - books ITC
  - 2B ITC
  - claim-ready ITC
  - pending ITC
  - blocked ITC
  - timing-difference ITC
- add reconciliation impact panels
- allow drill-down from summary to issue rows

Out of scope:

- final filing workflow changes
- provider contract changes

Expected outcome:

- GSTR-3B becomes understandable as a reviewable decision product, not just totals

### Phase 6: GSTR-3B Operational Control

Objective:

- make GSTR-3B review, approval, and follow-up operationally supportable

Scope:

- approval note enrichment
- unresolved issue summaries in approval flow
- follow-up linkage from GSTR-3B blockers
- audit/export visibility for:
  - timing differences
  - blocked ITC
  - period exceptions
  - vendor follow-up items

Out of scope:

- new provider integration behavior
- non-GST module work

Expected outcome:

- reviewers and support users can see and act on GSTR-3B blockers without backend-style investigation

## Backend Design Direction

The engine should gradually separate:

- match result
- period relationship
- ITC decision status
- operator action status

Recommended additions over time:

- `period_relationship`
  - `same_period`
  - `prior_period`
  - `next_period`
  - `unknown`

- `issue_bucket`
  - `timing_difference`
  - `vendor_followup`
  - `books_correction`
  - `document_conflict`
  - `duplicate`

- `itc_status`
  - `ready`
  - `pending_2b`
  - `pending_review`
  - `blocked`
  - `timing_difference`

These do not all need to be implemented at once.

## Frontend Design Direction

### Reconciliation page

Prioritize:

- high-signal summaries
- one-message guidance
- issue-bucket filters
- easier row resolution

### Returns page

For GSTR-3B, add:

- ITC decision summary
- reconciliation dependency summary
- risk explanation in plain language

### Reports page

Add business-facing MIS:

- ITC pending due to 2B mismatch
- cross-period timing cases
- vendor follow-up queue
- blocked GSTR-3B cases

## What To Avoid

Do not:

- force books and 2B into one “winner”
- treat timing differences as normal mismatches
- bury ITC decisions inside technical row metadata
- show multiple duplicate warnings for the same condition
- make users infer next action from raw mismatch reason codes

## Recommended Build Sequence

1. Phase 1: Reconciliation UX Cleanup
2. Phase 2: Reconciliation Decision Model
3. Phase 3: Cross-Period And Timing-Difference Handling
4. Phase 4: ITC Decision Layer
5. Phase 5: GSTR-3B Preparation Redesign
6. Phase 6: GSTR-3B Operational Control

## Immediate Next Ticket Set

### Ticket Group A: Phase 1 Reconciliation UX Cleanup

- replace raw mismatch-centric labels with business-facing issue buckets
- show one latest top guidance message
- add row-level recommended action label

### Ticket Group B: Phase 2 Reconciliation Decision Model

- define final business-facing reconciliation categories
- map current mismatch outputs into those categories
- revise filters and summaries around those categories

### Ticket Group C: Phase 3 Cross-Period Handling

- define purchase-vs-2B timing-difference rules
- add `cross_period_match`
- expose period relationship in row detail

### Ticket Group D: Phase 4 ITC Status

- add ITC decision summary to reconciliation output
- show ready / pending / blocked counts

### Ticket Group E: Phase 5 GSTR-3B

- redesign GSTR-3B review summary around ITC decisions
- link unresolved reconciliation issues into GSTR-3B explanation

## Success Criteria

The redesign is successful when:

1. an accountant can tell whether the issue is:
   - timing
   - vendor filing
   - books correction
   - ITC block

2. a CA can explain why a purchase row is:
   - acceptable
   - pending
   - risky

3. GSTR-3B does not feel like a static total sheet

4. the user can move from:
   - issue
   - to owner
   - to resolution
   - to ITC decision
   - to return preparation

without reading backend-style diagnostics
