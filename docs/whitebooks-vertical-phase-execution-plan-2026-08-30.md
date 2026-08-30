# WhiteBooks Vertical Phase Execution Plan

Date: 2026-08-30

Related:

- [WhiteBooks vertical feature roadmap](whitebooks-vertical-feature-roadmap-2026-08-30.md)
- [WhiteBooks API implementation plan](whitebooks-api-implementation-plan.md)
- [WhiteBooks provider confirmation questions](whitebooks-provider-confirmation-questions-2026-08-30.md)
- [Sep 1 controlled launch plan](sep-1-10-customer-controlled-launch-plan-2026-09-01.md)

## Goal

Build the WhiteBooks-backed vertical features in controlled phases after the Sep 1 pilot starts, without destabilizing the launch path.

The guiding rule is:

- read/fetch features first
- evidence and comparison next
- live-write features only after provider contract and UAT evidence are clear

## Phase 0: Launch Freeze And Contract Confirmation

Target window: before and during Sep 1 launch week.

Purpose:

- protect the 10-customer launch from new feature risk
- confirm open WhiteBooks contract questions
- prepare the backlog for the first post-launch vertical

Scope:

- no new broad live-write enablement
- no public marketing of unproven verticals
- keep final filing flags conservative

WhiteBooks confirmations needed:

- whether final filing should use `retfile` or `otpforevc + retevcfile`
- whether `/authentication/logout` is required to avoid session-limit issues
- which status endpoint should be used per return type:
  - `/gstr/retstatus`
  - `/all/newretstatus`
  - `/gstr/rettrack`
  - `/public/rettrack`
- whether GSTR-9/GSTR-9C status and ARN behavior differs from GSTR-1/GSTR-3B

Engineering tasks:

- update stale WhiteBooks docs to match current implementation
- update `.env.example` with all current WhiteBooks flags
- keep staging validation and production readiness scripts current
- record known provider assumptions in the release checklist

Exit criteria:

- Sep 1 launch scope remains unchanged
- docs and env templates do not mislead deployment
- WhiteBooks open questions are sent and tracked

## Phase 1: Auto GSTR-2B Fetch

Priority: highest.

Target window: days 11-25 after controlled launch start.

Purpose:

- remove manual GSTR-2B upload dependency
- improve reconciliation speed and accuracy

WhiteBooks APIs:

- `PUT /gstr2b/gen2b`
- `GET /gstr2b/get2b`
- `GET /gstr2b/all`

Current foundation:

- client methods exist
- provider import workflow exists
- provider-fetched data is normalized into the import pipeline

Completed first hardening slice on 2026-08-30:

- delayed WhiteBooks `filenum` no longer fails the import batch
- provider fetch is marked `waiting_for_provider` and kept retryable
- repeat fetch clicks reuse the existing waiting batch for the same GSTIN/period
- normalized provider rows remain parseable until processing, then are purged from metadata
- reconciliation UI messaging distinguishes waiting from fetched
- waiting provider fetches schedule an automatic Celery poll on the imports queue
- polling uses configurable exponential backoff and stops after a configured attempt limit

Completed import-center product slice on 2026-08-30:

- import center now exposes a `Provider GSTR-2B fetch` panel next to manual upload
- users can fetch GSTR-2B directly from the selected workspace, client, GSTIN, and period
- manual upload remains available as the fallback path
- provider-fetched GSTR-2B batches open in the normal import batch detail workflow
- import center supports OTP request/verify when a usable provider auth session is missing
- frontend provider-auth readiness now accepts a fresh authenticated `txn` even when WhiteBooks does not return the richer auth-token response body
- reconciliation uses the same fresh-`txn` readiness rule for GSTR-2B fetch continuation

Backend work:

- tune automatic polling/backoff timing after staging evidence
- keep duplicate fetch requests idempotent per GSTIN/period
- store provider evidence for generation, status, and fetch response
- improve failure states:
  - requested
  - waiting
  - fetched
  - failed
  - retryable
- make retry preserve previous evidence

Frontend work:

- refine provider reference/detail display after WhiteBooks confirms final response fields
- add live UAT screenshots/evidence after WhiteBooks provides a successful sandbox GSTIN/period

QA/UAT:

- mocked backend tests for generation, delayed status, failure, retry
- mocked frontend browser coverage for import-center provider fetch
- staging test with WhiteBooks-approved GSTIN/period
- reconciliation comparison between manual 2B and provider-fetched 2B

Exit criteria:

- provider-fetched 2B creates a valid import batch
- reconciliation runs through the existing engine
- manual upload remains available
- no provider response leaks secrets

## Phase 2: Ledger And Challan Readiness

Priority: high.

Target window: days 26-40.

Purpose:

- help operators confirm GSTR-3B payment readiness before final action
- reduce payment and liability mistakes

WhiteBooks APIs:

- `GET /ledgers/bal`
- `GET /ledgers/taxpayable`
- `GET /ledgers/cashdtl`
- `GET /ledgers/itc`
- `GET /ledgers/tax`
- `GET /payment/chllnlst`
- `GET /payment/chllnsum`
- `POST /payment/validatechlnrsn`
- `POST /payment/generateChallan`

Current foundation:

- ledger readiness service exists
- challan validation/generation service exists
- feature flags exist
- duplicate submitted challan guard completed on 2026-08-30; backend blocks repeat generation unless `allow_duplicate_generation` is explicitly supplied
- returns UI now shows the existing submitted CPIN and requires duplicate-generation confirmation before enabling the generate action
- returns UI now compares computed GSTR-3B payable, ITC, and liability values against captured WhiteBooks cash, ITC, and liability ledger evidence
- QRMP reason-code guardrail completed on 2026-08-30 for the safe known case: `QRMP*` challan reasons are rejected unless the taxpayer profile indicates QRMP
- provider evidence support summary completed on 2026-08-30; readiness payload and UI now identify complete live, partial live, saved fallback, blocked, or missing evidence states

Backend work:

- harden readiness snapshot storage
- done: add provider evidence summaries for support
- done: add validations for challan amount, reason, return type, and the known QRMP reason-code misuse case
- pending WhiteBooks confirmation: exact monthly vs QRMP challan reason-code matrix
- done: prevent duplicate challan generation for same return unless explicitly allowed
- done: add audit event for validation separate from generation
- done: add audit event when duplicate challan generation is blocked

Frontend work:

- done: improve GSTR-3B readiness panel with balance comparison signals
- done: show computed liability vs portal balances
- show challan validation before generation
- done: require explicit confirmation before duplicate generate
- show CPIN and provider evidence after generation

QA/UAT:

- balance fetch success and partial failure
- challan reason accepted/rejected
- duplicate challan guard
- provider timeout behavior

Exit criteria:

- user can determine payment readiness from one screen
- challan generation is protected by confirmation and audit
- CPIN is captured when provider returns it

## Phase 3: Provider Summary Compare

Priority: high.

Target window: days 35-50, can overlap Phase 2.

Purpose:

- compare internal prepared returns with WhiteBooks/GST-side summaries
- catch mismatches before filing

WhiteBooks APIs:

- `GET /gstr1/retsum`
- `GET /gstr3b/retsum`
- `GET /gstr3b/autoliab`

Backend work:

- add missing WhiteBooks client methods if needed
- normalize provider summary payloads
- store provider summary snapshots
- create comparison service:
  - internal taxable value
  - IGST
  - CGST
  - SGST
  - CESS
  - nil/exempt/non-GST
  - liability and ITC buckets
- add configurable mismatch thresholds

Frontend work:

- add `Internal vs Portal` comparison view
- highlight material differences
- link mismatch rows back to source transactions/imports
- show when provider summary was last fetched

QA/UAT:

- exact match
- small rounding difference
- material mismatch
- provider unavailable

Exit criteria:

- operator sees mismatch risk before filing
- mismatch handling is explainable and auditable

## Phase 4: IMS Workbench

Priority: high, but only after pilot feedback.

Target window: days 46-65.

Purpose:

- manage supplier invoice actions through IMS

WhiteBooks APIs:

- `PUT /ims/save`
- `PUT /ims/reset`
- `GET /ims/status`
- `GET /ims/invoices`
- `GET /ims/invoicescount`
- `GET /ims/supplierInvoices`
- `GET /ims/rejectedInvoices`
- `GET /ims/getfile`

Current foundation:

- backend service and serializers exist
- frontend/operator experience needs launch-level hardening

Backend work:

- add async job handling for long IMS operations
- store action batch records
- add per-batch audit trail
- normalize invoice count/list responses
- add partial-state recovery for save/reset

Frontend work:

- build operator workbench:
  - counts
  - filters
  - invoice table
  - action selection
  - bulk confirmation
  - status tracking
- add evidence drawer for provider response
- prevent accidental bulk actions

QA/UAT:

- fetch counts
- fetch invoice list
- save accept/reject/no-action batch
- reset batch
- provider timeout and retry

Exit criteria:

- IMS actions are controlled, auditable, and recoverable
- pilot tenant validates one full IMS cycle

## Phase 5: Notice Tracking

Priority: medium/high.

Target window: days 66-80 if customer demand appears.

Purpose:

- turn GST Compliance into a monitoring and response product, not only a filing product

WhiteBooks APIs:

- `GET /notices/noticelist`
- `GET /notices/noticedetails`

Backend work:

- add WhiteBooks notice client methods
- map provider notice payload into existing Notice model
- add dedupe key strategy
- add scheduled sync job
- connect notices to follow-up/escalation system

Frontend work:

- show provider-synced notices
- show notice detail, due date, owner, priority, status
- support manual note and attachment
- show sync history

QA/UAT:

- first notice sync
- duplicate notice sync
- notice detail fetch failure
- owner assignment and escalation

Exit criteria:

- notices can be fetched, deduped, assigned, and tracked
- customer can use the workflow without manual spreadsheet tracking

## Phase 6: GSTR-1A Amendments

Priority: medium/high.

Target window: pick after GSTR-1 pilot evidence.

Purpose:

- support correction/amendment lifecycle after GSTR-1

WhiteBooks APIs:

- `PUT /gstr1a/retsave`
- `POST /gstr1a/retsubmit`
- `POST /gstr1a/retfile`
- `GET /gstr1a/retsum`
- relevant GSTR-1A section reads

Backend work:

- create amendment preparation model or extend return preparation safely
- isolate original filed return from amendment edits
- build GSTR-1A payload mapper
- confirm save/submit/file order with WhiteBooks
- add status sync strategy

Frontend work:

- create amendment workbench
- show original vs amended invoice/note
- require review and approval before provider save/file

QA/UAT:

- B2B amendment
- credit/debit note amendment
- HSN amendment
- rejected provider payload

Exit criteria:

- amendment flow is auditable
- locked original returns cannot be silently changed

## Phase 7: Annual Return Pack

Priority: premium vertical.

Target window: depends on CA/customer demand.

Purpose:

- support GSTR-9 and GSTR-9C annual compliance

WhiteBooks APIs:

- `PUT /gstr9/retsave`
- `POST /gstr9/retfile`
- `GET /gstr9/getdet`
- `GET /gstr9/getautocal`
- `PUT /gstr9/create8adetails`
- `GET /gstr9/get8adetails`
- `GET /gstr9/getHsndetails`
- `PUT /gstr9c/retsave`
- `POST /gstr9c/retfile`
- `GET /gstr9c/retsum`
- `POST /gstr9c/genhash`
- `POST /gstr9c/gencert`
- `GET /gstr9c/getrecds`

Current foundation:

- guarded GSTR-9/GSTR-9C save/file hooks exist
- final provider payloads require explicit provider-ready attachment

Backend work:

- complete annual aggregation from monthly returns/imports/books
- build table-wise annual mapper
- build 9C reconciliation/certification payload strategy
- confirm cert/hash workflow with WhiteBooks
- confirm ARN/status behavior

Frontend work:

- annual review pack
- GSTR-9 table-wise review
- GSTR-9C reconciliation review
- CA approval and evidence export

QA/UAT:

- full-year data aggregation
- mismatch cases
- provider save with explicit payload
- final filing only after UAT evidence

Exit criteria:

- annual pack is usable for CA review
- provider submission remains guarded until payload contract is proven

## Phase 8: TDS/TCS Vertical

Priority: customer-demand led.

Target window: after one TDS/TCS customer is identified.

Purpose:

- support GSTR-7, GSTR-8, and GSTR-2X workflows

WhiteBooks APIs:

- `PUT /gstr7/retsave`
- `POST /gstr7/retfile`
- `GET /gstr7/retsum`
- `GET /gstr7/tds`
- `GET /gstr7/tdschecksum`
- `PUT /gstr8/retsave`
- `POST /gstr8/retfile`
- `GET /gstr8/retsum`
- `GET /gstr8/tcs`
- `PUT /gstr2x/retsave`
- `POST /gstr2x/retfile`
- `GET /gstr2x/tdstcs`

Backend work:

- finish GSTR-7 end-to-end product workflow first
- add GSTR-8 only with clear demand
- connect GSTR-2X credit handling
- add specialized validation rules

Frontend work:

- TDS/TCS workbench
- deductee/collector import review
- summary, filing, and credit tracking

QA/UAT:

- one complete GSTR-7 cycle
- one GSTR-8 scenario if needed
- one GSTR-2X credit scenario

Exit criteria:

- a customer with TDS/TCS obligations can complete one monthly cycle

## Phase 9: E-Invoice Readback

Priority: medium.

Target window: after GSTR-1 filing path stabilizes.

Purpose:

- compare e-invoice/IRN data against sales and GSTR-1

WhiteBooks APIs:

- `GET /gst/einvoice/irnlist`
- `GET /gst/einvoice/irnjsons`
- `GET /gst/einvoice/irndtl`
- `GET /gst/einvoice/filedtl`
- `GET /gst/einvoice/hsnsum`
- `GET /gstr1/einvoice`

Backend work:

- add client methods
- normalize IRN/e-invoice payloads
- store evidence snapshots
- compare against sales transactions and GSTR-1 prepared data

Frontend work:

- e-invoice reconciliation report
- mismatch detail view
- export evidence for operator review

QA/UAT:

- matching sales and IRN data
- missing IRN
- extra IRN
- cancelled or amended invoice behavior

Exit criteria:

- user can identify sales/e-invoice mismatches before GSTR-1 filing

## Suggested Execution Calendar

| Timeframe | Phase | Outcome |
|---|---|---|
| Sep 1-10 | Phase 0 | Controlled launch stable, provider questions tracked |
| Sep 11-25 | Phase 1 | Auto GSTR-2B fetch pilot-ready |
| Sep 26-Oct 10 | Phase 2 | Ledger/challan readiness pilot-ready |
| Oct 1-Oct 15 | Phase 3 | Provider summary compare available |
| Oct 16-Nov 5 | Phase 4 | IMS workbench pilot-ready |
| Nov 6-Nov 20 | Phase 5 or 6 | Notice tracking or GSTR-1A based on demand |
| Nov 21-Dec 31 | Phase 7, 8, or 9 | Annual, TDS/TCS, or e-invoice based on customer demand |

## Workstream Checklist Per Phase

Each phase should have these workstreams:

- Product: user story, scope, edge cases, rollout audience
- Backend: client method, service workflow, persistence, audit, errors
- Frontend: primary workflow, loading/error states, evidence view
- QA: unit tests, API tests, E2E/UAT checklist
- Ops: feature flags, tenant rollout, monitoring, rollback
- Support: runbook, known errors, customer-facing explanation

## Go/No-Go Rule Per Vertical

A vertical can move from internal to pilot only when:

- local tests pass
- staging UAT passes
- feature flag defaults to off
- tenant rollout is explicit
- provider failures are recoverable
- support evidence is captured
- docs and env flags are updated

A vertical can move from pilot to public only when:

- at least one controlled tenant has completed the workflow
- no unresolved P0/P1 defects remain
- runbook exists
- rollback/pause is tested
- production capacity impact is understood

## Recommended Immediate Backlog

1. Fix docs/env drift:
   - update WhiteBooks API implementation status
   - update `.env.example` with current flags
2. Confirm provider contract:
   - `retfile` vs `retevcfile`
   - logout requirement
   - status endpoint behavior
3. Productize Auto GSTR-2B Fetch:
   - polling/backoff
   - retry/idempotency
   - UI states
   - staging UAT
4. Productize Ledger/Challan Readiness:
   - readiness UI
   - duplicate challan protection
   - CPIN evidence
5. Add Provider Summary Compare:
   - client methods
   - normalization
   - diff UI
