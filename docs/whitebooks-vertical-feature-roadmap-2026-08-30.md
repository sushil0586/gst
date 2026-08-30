# WhiteBooks Vertical Feature Roadmap

Date: 2026-08-30

## Purpose

This roadmap defines the next vertical product features that can be added using the WhiteBooks API collections and the current GST Compliance workflow.

It is intentionally post-launch oriented. The Sep 1 controlled launch should stay focused on the already validated core workflow. These verticals should be added in controlled waves after the 10-customer pilot begins producing evidence.

Execution detail:

- [WhiteBooks vertical phase execution plan](whitebooks-vertical-phase-execution-plan-2026-08-30.md)

## Current Baseline

The current product already supports the core compliance path:

- client and GSTIN onboarding
- taxpayer lookup through WhiteBooks
- imports and reconciliation
- GSTR-1 preparation
- GSTR-3B preparation
- guarded WhiteBooks filing/auth workflow
- provider auth sessions, refresh, freshness checks, rollout policy, audit trail, recovery, and support evidence

The WhiteBooks client already has code hooks for more than the original launch scope:

- GSTR-2B generation and fetch
- IMS operations
- ledger reads
- challan generation and validation
- GSTR-7 draft/file hooks
- GSTR-9 draft/file hooks
- GSTR-9C draft/file hooks

The key product decision is not "can we call more APIs?" The right question is: which vertical creates customer value without increasing filing risk too early?

## Vertical Priority Order

| Priority | Vertical | Product Value | Launch Risk | Recommendation |
|---|---|---|---|---|
| 1 | Auto GSTR-2B Fetch | Removes manual 2B upload and strengthens reconciliation | Medium | Build first |
| 2 | Ledger And Challan Readiness | Improves GSTR-3B confidence before payment/filing | Medium | Build second |
| 3 | Provider Summary Compare | Compares internal return totals with provider/GST summary | Low/Medium | Build alongside ledger readiness |
| 4 | IMS Workbench | Gives users supplier invoice action workflow | Medium/High | Build after pilot feedback |
| 5 | Notice Tracking | Moves product toward continuous compliance monitoring | Medium | Build after core filing stabilizes |
| 6 | GSTR-1A Amendments | Handles correction/amendment lifecycle | Medium/High | Build after GSTR-1 pilot evidence |
| 7 | Annual Return Pack | GSTR-9/GSTR-9C preparation and guarded provider workflow | High | Build as premium vertical |
| 8 | TDS/TCS Vertical | GSTR-7, GSTR-8, GSTR-2X workflows | High | Build for customers who need it |
| 9 | E-Invoice Readback | Cross-check IRNs and e-invoice sales data | Medium | Build when sales reconciliation demand appears |

## Wave 0: Do Not Disturb Sep 1 Launch

Target window: now through first controlled launch week.

Do:

- keep the controlled 10-customer launch scope stable
- keep final live filing flags conservative
- capture customer issues and operator friction
- confirm WhiteBooks `retfile` vs `retevcfile`, logout, and status endpoint behavior

Do not:

- introduce new live-write features during the first launch week
- expose unproven WhiteBooks verticals as generally available
- market GSTR-9/GSTR-9C/IMS as broadly production-ready until UAT evidence exists

Exit criteria:

- 10-customer pilot starts cleanly
- staging and production launch checks are green
- no unresolved filing/auth incident blocks the core workflow

## Wave 1: Auto GSTR-2B Fetch

Target: first post-launch vertical.

WhiteBooks APIs:

- `PUT /gstr2b/gen2b`
- `GET /gstr2b/get2b`
- `GET /gstr2b/all`

Current code status:

- client methods exist
- provider fetch workflow exists
- fetched 2B rows are normalized into the import pipeline

Product workflow:

1. User opens imports or reconciliation for a GSTIN/period.
2. User selects `Fetch GSTR-2B`.
3. System checks verified WhiteBooks auth session freshness.
4. System calls WhiteBooks generation.
5. System checks generation status.
6. System fetches the 2B file/details.
7. System creates a provider-backed import batch.
8. Existing reconciliation engine runs without special casing.

Implementation work:

- tighten UI state for requested, waiting, fetched, failed, and retry
- add polling/backoff instead of assuming immediate `filenum`
- add operator evidence panel for `int_tran_id`, `filenum`, and fetch response
- add retry button with duplicate-request protection
- add staging UAT case with real or WhiteBooks-approved test GSTIN

Exit criteria:

- provider-fetched 2B reconciles through the same path as manual upload
- failed provider fetch leaves a clear audit trail and retry path
- manual upload remains available as fallback

## Wave 2: Ledger And Challan Readiness

Target: improve GSTR-3B confidence before payment and filing.

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

Current code status:

- ledger readiness service exists
- challan generation and validation service exists
- feature flags exist in settings

Product workflow:

1. User opens GSTR-3B review.
2. System shows computed liability, ITC, cash balance, tax payable, and ledger evidence.
3. User validates challan reason and amount.
4. User generates challan only after maker-checker or explicit confirmation.
5. System stores CPIN and provider evidence.

Implementation work:

- make readiness summary easier to scan in the UI
- expose captured ledger snapshots in support/evidence view
- add guardrails for zero/negative amounts and QRMP-specific reason codes
- add staging UAT cases for successful validation, rejection, and provider timeout

Exit criteria:

- operator can decide whether GSTR-3B payment is ready from one screen
- challan generation cannot happen accidentally
- CPIN and provider response are auditable

## Wave 3: Provider Summary Compare

Target: reduce mismatch risk before filing.

WhiteBooks APIs:

- `GET /gstr1/retsum`
- `GET /gstr3b/retsum`
- `GET /gstr3b/autoliab`

Current code status:

- not fully productized as a dedicated compare workflow

Product workflow:

1. User prepares GSTR-1 or GSTR-3B internally.
2. System fetches WhiteBooks/GST-side summary.
3. System compares taxable value, IGST, CGST, SGST, CESS, nil/exempt, reverse charge, and liability totals.
4. Differences are shown before final filing.

Implementation work:

- add client methods if missing
- normalize provider summary response
- store provider summary evidence
- add comparison model or summary snapshot section
- add UI diff table
- block or warn on material mismatches based on configurable thresholds

Exit criteria:

- user can see internal vs provider summary before final file
- mismatches create a clear correction/review path

## Wave 4: IMS Workbench

Target: make supplier invoice action management usable.

WhiteBooks APIs:

- `PUT /ims/save`
- `PUT /ims/reset`
- `GET /ims/status`
- `GET /ims/invoices`
- `GET /ims/invoicescount`
- `GET /ims/supplierInvoices`
- `GET /ims/rejectedInvoices`
- `GET /ims/getfile`

Current code status:

- backend service and serializers exist
- frontend/operator launch surface needs careful UAT

Product workflow:

1. User opens IMS for GSTIN/period.
2. System fetches invoice counts and lists.
3. User filters pending, accepted, rejected, no action.
4. User saves accept/reject/no-action decisions.
5. System tracks provider status and stores evidence.

Implementation work:

- complete operator-first UI
- add bulk action review and confirmation
- add async job handling for long-running IMS operations
- add audit trail per action batch
- add rollback/reset guidance

Exit criteria:

- IMS actions can be performed in a controlled, auditable manner
- provider failures do not leave unclear partial state

## Wave 5: Notice Tracking

Target: expand from filing tool to compliance monitoring.

WhiteBooks APIs:

- `GET /notices/noticelist`
- `GET /notices/noticedetails`

Current code status:

- local notices workflow exists
- WhiteBooks notice pull is not the primary launch path

Product workflow:

1. System fetches notice list for GSTIN.
2. System deduplicates and stores notices.
3. User assigns owner, due date, priority, and response status.
4. Follow-up reminders and escalation run through existing operational follow-up system.

Implementation work:

- add WhiteBooks notice client methods
- map provider notice response into existing Notice model
- add dedupe key strategy
- add scheduled fetch job
- add support evidence and audit events

Exit criteria:

- notices appear without manual creation
- duplicate notices are avoided
- owner and due-date tracking works end to end

## Wave 6: GSTR-1A Amendments

Target: support post-GSTR-1 correction workflow.

WhiteBooks APIs:

- `PUT /gstr1a/retsave`
- `POST /gstr1a/retsubmit`
- `POST /gstr1a/retfile`
- `GET /gstr1a/retsum`
- relevant section reads such as `b2b`, `b2ba`, `cdnr`, `cdnra`, `b2cs`, `hsnsum`

Current code status:

- not part of the controlled launch path

Product workflow:

1. User identifies correction after GSTR-1.
2. System creates amendment preparation.
3. User reviews affected invoices/notes.
4. System prepares GSTR-1A payload.
5. User saves/submits/files through guarded provider flow when enabled.

Implementation work:

- model amendment preparation separately from original GSTR-1
- add payload mapper for GSTR-1A sections
- confirm WhiteBooks flow order for save, submit, proceed, file
- add UAT pack for one B2B and one credit-note amendment

Exit criteria:

- amendment lifecycle is auditable and isolated from original return
- users cannot accidentally alter a locked original filing

## Wave 7: Annual Return Pack

Target: premium annual compliance vertical.

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

Current code status:

- guarded save/file hooks exist
- final payloads require explicit provider-ready attachments
- automatic full annual mapping is not complete

Product workflow:

1. Aggregate full-year monthly returns and books.
2. Compare GSTR-1, GSTR-3B, 2B, ITC, tax paid, and books.
3. Prepare GSTR-9 sections.
4. Prepare GSTR-9C reconciliation/certification package where applicable.
5. Save/file only through explicit provider-ready payloads until full mapping is proven.

Implementation work:

- complete annual data model and table-wise mapping
- add workbook/export pack for CA review
- confirm WhiteBooks GSTR-9/GSTR-9C status endpoint strategy
- confirm EVC/certification requirements
- add long-form UAT with real annual data

Exit criteria:

- annual pack can be reviewed without relying on hidden calculations
- final provider submission is gated behind verified payload evidence

## Wave 8: TDS/TCS Vertical

Target: customers with TDS/TCS GST obligations.

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

Current code status:

- GSTR-7 guarded hooks exist
- broader TDS/TCS workflow needs productization

Product workflow:

1. Import deductee/collector transaction data.
2. Validate GSTIN/PAN, tax amount, and section-level totals.
3. Prepare GSTR-7/GSTR-8.
4. Reconcile credits through GSTR-2X where relevant.
5. Submit through guarded WhiteBooks flow.

Implementation work:

- finish GSTR-7 product workflow first
- add GSTR-8 only after customer demand is confirmed
- add GSTR-2X credit acceptance workflow
- add specialized QA pack for TDS/TCS edge cases

Exit criteria:

- customer can run one complete TDS/TCS monthly cycle
- credits and filings have traceable evidence

## Wave 9: E-Invoice Readback

Target: sales and outward-supply verification.

WhiteBooks APIs:

- `GET /gst/einvoice/irnlist`
- `GET /gst/einvoice/irnjsons`
- `GET /gst/einvoice/irndtl`
- `GET /gst/einvoice/filedtl`
- `GET /gst/einvoice/hsnsum`
- `GET /gstr1/einvoice`

Current code status:

- not part of the launch workflow

Product workflow:

1. Fetch IRN/e-invoice evidence for GSTIN/period.
2. Compare with sales imports and GSTR-1 outward supply data.
3. Flag missing, duplicate, cancelled, or mismatched invoices.
4. Use findings before GSTR-1 save/file.

Implementation work:

- add client methods
- normalize IRN payloads
- connect to existing sales transaction model
- add reconciliation report

Exit criteria:

- sales/e-invoice mismatch report is actionable before GSTR-1 filing

## Cross-Cutting Requirements For Every Vertical

Every vertical must include:

- feature flag
- tenant rollout policy
- verified WhiteBooks auth session check
- state code and GST username resolved from GSTIN where possible
- provider response sanitization
- audit log events
- support evidence capture
- retry and partial-state handling
- staging UAT checklist
- no broad production enablement until at least one controlled tenant succeeds

## Suggested 90-Day Execution

### Days 1-10: Controlled Launch And Evidence

- launch 10-customer pilot
- keep scope stable
- collect support and workflow evidence
- confirm WhiteBooks open questions

### Days 11-25: GSTR-2B Fetch

- productize UI states
- add async/polling robustness
- complete staging UAT
- enable for 1-2 pilot tenants

### Days 26-45: Ledger, Challan, And Summary Compare

- improve readiness UI
- add provider summary diff
- enable ledger reads for pilot tenants
- enable challan validation before challan generation

### Days 46-65: IMS Workbench

- complete operator UI
- add bulk review and action audit
- run live UAT on one selected tenant

### Days 66-90: Pick One Expansion Vertical

Choose based on customer demand:

- Notices if customers want compliance monitoring
- GSTR-1A if customers need amendment workflows
- Annual Return Pack if CA/customer demand is high
- TDS/TCS if customers have deduction/collection obligations

## Decision Matrix

Use this to decide what to build after each pilot week:

| Signal | Build Next |
|---|---|
| Users complain about manual 2B upload | Auto GSTR-2B Fetch |
| Users are unsure about payment readiness | Ledger And Challan Readiness |
| Users fear filing mismatch | Provider Summary Compare |
| Users need supplier invoice actioning | IMS Workbench |
| Users receive notices and need tracking | Notice Tracking |
| Users need corrections after GSTR-1 | GSTR-1A |
| CA firms ask for annual compliance | GSTR-9/GSTR-9C |
| Customers have TDS/TCS obligations | GSTR-7/GSTR-8/GSTR-2X |

## Immediate Next Actions

1. Keep Sep 1 launch scope unchanged.
2. Update the stale WhiteBooks API implementation plan to reflect current code.
3. Update `.env.example` with all current WhiteBooks flags.
4. Get WhiteBooks confirmation for `retfile` vs `retevcfile`, logout, and status endpoint behavior.
5. Start Wave 1 after controlled launch begins: Auto GSTR-2B Fetch productization.
