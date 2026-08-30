# WhiteBooks API Implementation Plan

## Purpose

This document turns the reviewed WhiteBooks Postman collection into a practical implementation plan.

It answers three questions:

- which WhiteBooks APIs are already implemented
- which WhiteBooks APIs should be implemented next
- which WhiteBooks APIs can be safely deferred or discarded for the current product scope

Related references:

- [docs/whitebooks-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-implementation-plan.md:1)
- [docs/implementation-status-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/implementation-status-plan.md:1)
- [docs/api-review-next-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/api-review-next-plan.md:1)
- [docs/whitebooks-vertical-feature-roadmap-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-vertical-feature-roadmap-2026-08-30.md:1)
- [docs/whitebooks-vertical-phase-execution-plan-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-vertical-phase-execution-plan-2026-08-30.md:1)
- [docs/whitebooks-provider-confirmation-questions-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-provider-confirmation-questions-2026-08-30.md:1)

## Current status update: 2026-08-30

This document has been refreshed after comparing the current code with the supplied WhiteBooks API collections.

The implementation has moved beyond the older launch-only plan. The product now has code-level support or guarded hooks for:

- provider auth OTP request, auth-token exchange, and refresh
- taxpayer search
- GSTR-1 save, proceed, file, and status evidence
- GSTR-3B save, offset, file, and status evidence
- GSTR-2B generation and fetch into the import pipeline
- IMS save/reset/status/invoice reads
- ledger reads and payment/challan helpers
- guarded GSTR-7, GSTR-9, and GSTR-9C save/file hooks

Not all of these are generally available product features yet. Many remain feature-flagged, tenant-rollout controlled, or dependent on provider-ready payload evidence.

## Product scope we are optimizing for

Current product scope:

- client and GSTIN onboarding
- GSTIN taxpayer enrichment
- purchase and GSTR-2B reconciliation
- GSTR-1 preparation and filing
- GSTR-3B preparation and filing
- support, audit, recovery, and SaaS-safe rollout controls
- controlled IMS, ledger, challan, annual-return, and TDS/TCS expansion behind feature flags

This means WhiteBooks APIs should be evaluated against these priorities, not against the full GST product universe in the collection.

## Phase 0: Already implemented

These WhiteBooks APIs are already implemented in code and used by the product.

### Auth and public

- `GET /public/search`
- `GET /authentication/otprequest`
- `GET /authentication/authtoken`
- `GET /authentication/refreshtoken`
- `GET /public/rettrack`

Current usage:

- taxpayer lookup during onboarding
- OTP request and verification for filing auth
- refresh of verified provider auth sessions when needed
- public return tracking fallback during status sync

### GSTR-1

- `PUT /gstr1/retsave`
- `GET /all/newproceedfile`
- `POST /gstr1/retfile`

Current usage:

- live/sandbox filing orchestration
- provider-stage tracking
- filing attempts, events, support evidence, retry, and resync

### GSTR-3B

- `PUT /gstr3b/retsave`
- `PUT /gstr3b/retoffset`
- `POST /gstr3b/retfile`

Current usage:

- live/sandbox filing orchestration
- offset-aware GSTR-3B flow
- confirmation-pending and resync handling

### Status and tracking

- `GET /gstr/retstatus`
- `GET /all/newretstatus`
- `GET /gstr/rettrack`
- `GET /public/rettrack`

Current usage:

- ARN confirmation
- post-file status sync
- rejection handling
- support and recovery workflows

### GSTR-2B provider fetch

- `PUT /gstr2b/gen2b`
- `GET /gstr2b/get2b`
- `GET /gstr2b/all`

Current usage:

- provider-backed 2B import workflow
- normalization into the same import/reconciliation path used by manual upload
- provider evidence capture for generation, status, and fetched payload

Current hardening need:

- tune automatic polling/backoff timing after staging evidence
- staging UAT with WhiteBooks-approved GSTIN/period

Completed on 2026-08-30:

- delayed provider file numbers are treated as `waiting_for_provider` instead of hard failure
- repeat fetch requests reuse the existing waiting provider batch for the same GSTIN/period
- normalized provider rows stay parseable until import processing and are purged afterward
- reconciliation UI messaging distinguishes waiting from fetched
- waiting provider fetches schedule an automatic Celery poll on the imports queue
- polling uses configurable exponential backoff and stops after a configured attempt limit
- WhiteBooks `txn` is captured from HTTP response headers for OTP/auth workflows
- app periods stored as `YYYY-MM` are sent to WhiteBooks as `MMYYYY`

### IMS

- `PUT /ims/save`
- `PUT /ims/reset`
- `GET /ims/status`
- `GET /ims/invoices`
- `GET /ims/invoicescount`
- `GET /ims/supplierInvoices`
- `GET /ims/rejectedInvoices`
- `GET /ims/getfile`

Current usage:

- backend service and serializer support
- verified auth session and freshness checks
- sanitized provider response handling

Current hardening need:

- operator workbench UX
- async/bulk action handling
- staging UAT for full action cycle

### Ledger and payment helpers

- `GET /ledgers/bal`
- `GET /ledgers/taxpayable`
- `GET /ledgers/cashdtl`
- `GET /ledgers/itc`
- `GET /ledgers/tax`
- `GET /payment/chllnlst`
- `GET /payment/chllnsum`
- `POST /payment/validatechlnrsn`
- `POST /payment/generateChallan`

Current usage:

- portal filing readiness evidence
- challan validation/generation behind explicit feature flags
- audit and provider evidence capture

Current hardening need:

- duplicate challan protection
- production UAT for reason codes and CPIN extraction
- clearer operator UI for partial provider evidence

### GSTR-7, GSTR-9, and GSTR-9C guarded hooks

- `PUT /gstr7/retsave`
- `POST /gstr7/retfile`
- `PUT /gstr9/retsave`
- `POST /gstr9/retfile`
- `PUT /gstr9c/retsave`
- `POST /gstr9c/retfile`

Current usage:

- guarded live save/file hooks exist
- feature flags control live use
- final filing for GSTR-7, GSTR-9, and GSTR-9C requires explicit provider-ready payload evidence

Current hardening need:

- WhiteBooks confirmation for final filing path and status behavior
- live/UAT proof before broad enablement
- full annual/TDS product workflow before public positioning

## Phase 1: Productize next

These are the highest-value WhiteBooks-backed features to productize next. Some API client methods already exist; the remaining work is workflow hardening, UI, UAT, and rollout control.

### 1. GSTR-2B fetch automation

Already wired at code level:

- `PUT /gstr2b/gen2b`
- `GET /gstr2b/get2b`
- `GET /gstr2b/all`

Why this is next:

- 2B reconciliation is already implemented in the product
- manual upload remains the stable fallback
- provider-assisted 2B retrieval can now be hardened without changing the reconciliation engine

Expected product outcome:

1. user selects GSTIN and period
2. app requests generation of 2B if needed
3. app polls status with retry/backoff
4. app fetches 2B payload
5. app converts it into the same normalized import path used by manual upload
6. reconciliation runs on top of that imported dataset

Implementation notes:

- keep manual upload as a fallback
- do not replace the current import/reconciliation pipeline
- store raw provider evidence and normalized imported rows separately
- keep this feature-gated and tenant-rollout controlled just like filing
- make duplicate fetch requests idempotent per GSTIN/period
- surface waiting, fetched, failed, and retryable states clearly

Definition of done:

- “Fetch 2B from WhiteBooks” exists as an optional path
- imported provider-fetched 2B can be reconciled with purchases using the current reconciliation engine
- operators can see generation status, fetch evidence, and failure reasons

### 2. Ledger, challan, and provider-side pre-file evidence

Implement or productize:

- `GET /gstr1/retsum`
- `GET /gstr3b/retsum`
- `GET /gstr3b/autoliab`
- `GET /ledgers/bal`
- `GET /ledgers/taxpayable`
- `GET /ledgers/cashdtl`
- `GET /ledgers/itc`
- `GET /ledgers/tax`
- `POST /payment/validatechlnrsn`
- `POST /payment/generateChallan`

Why this matters:

- helps compare internal prepared return data against provider/GST-side summary
- improves operator confidence before final file
- gives support more evidence when return mismatch questions arise
- reduces GSTR-3B payment/challan mistakes

Definition of done:

- summary and ledger endpoints can be called for a verified auth session
- responses are normalized and stored as support evidence
- UI can surface “internal vs provider summary” for review when needed
- challan generation is protected by explicit confirmation and duplicate prevention

## Phase 2: Useful but not urgent

These APIs may add value later, but they are not the best next investment.

### Filing validation and detailed GSTR-3B helpers

- `PUT /gstr3b/liabilitybreakup`
- `POST /gstr3b/validateautocalculatedata`
- `POST /gstr3b/cmpint`
- `GET /gstr3b/syscalcintrst`
- `GET /gstr3b/closingbal`
- `GET /gstr3b/openingbal`
- `GET /gstr3b/rcmclosingbal`
- `GET /gstr3b/rcmopeningbal`
- `POST /gstr3b/savercmopnbal`

Why defer:

- core GSTR-3B save, offset, file, and status handling already exist
- these improve validation depth and liability workflows, but are not required for the current product baseline

### WhiteBooks session lifecycle helpers

- `GET /authentication/logout`

Current status:

- refresh token is already implemented
- logout client/service/API support exists
- logout clears the local provider session from live reuse and stores sanitized logout evidence

Current need:

- confirm when logout should be called automatically after fetch/filing operations
- confirm whether logout can clear a session when the app does not have the original `txn`

### GSTR-1 detailed readback endpoints

Examples:

- `GET /gstr1/b2b`
- `GET /gstr1/b2cl`
- `GET /gstr1/b2cs`
- `GET /gstr1/cdnr`
- `GET /gstr1/cdnur`
- `GET /gstr1/exp`
- `GET /gstr1/hsnsum`
- amendment variants

Why defer:

- current product already prepares and files from internal transaction data
- these are useful for draft comparison and provider readback, not for the core current workflow

## Phase 3: Defer outside current product scope

These APIs are in the Postman collection but do not align with the current product scope.

### Other return families

Defer:

- `itc03/*`
- `itc04/*`
- `cmp/*`
- `gstr4/*`
- `gstr4a/*`
- `gstr4annual/*`
- `gstr5/*`
- `gstr6/*`
- `gstr6a/*`
- `gstr8/*`
- `gstr9a/*`
- `gstr2x/*`
- `spike/*`

Why defer:

- the current launch path is focused on GSTR-1, GSTR-3B, reconciliation, returns, approvals, and filing operations
- implementing these now would add complexity without helping the current main path
- GSTR-7, GSTR-9, GSTR-9C, and IMS are no longer pure deferrals, but they remain controlled expansion verticals rather than broad launch promises

### Peripheral operational APIs

Defer:

- `notices/*` from WhiteBooks side
- `all/filedet`
- `all/largefile`
- `all/docdwld`
- `all/savemasters`
- `all/getmasters`
- `all/savepref`
- `all/getpref`
- `public/unregistered-applicants*`
- `gst/einvoice/*`

Why defer:

- these may become useful later for expanded product lines
- they are not needed for the current onboarding, reconciliation, returns, and filing workflow
- ledger and payment helpers are already partially wired, but broader productization still belongs in the post-launch vertical roadmap

## APIs not needed right now

These are not part of the active integration strategy today.

- `WHITEBOOKS_USERNAME`
- `WHITEBOOKS_PASSWORD`

Reason:

- the current confirmed WhiteBooks flow is OTP-based
- these are not part of the working product path

Also not needed as primary design:

- global env-only taxpayer identity for all clients

Reason:

- GST username and state context should be GSTIN-scoped in a SaaS product
- the system has already started moving in that direction

## Recommended execution order

1. keep Sep 1 controlled launch scope unchanged
2. confirm WhiteBooks `retfile` vs `retevcfile`, logout, and status endpoint behavior
3. productize GSTR-2B fetch polling, idempotency, retry, and UI states
4. productize ledger and challan readiness
5. add provider summary comparison with `gstr1/retsum`, `gstr3b/retsum`, and `gstr3b/autoliab`
6. harden IMS workbench only after pilot feedback
7. choose Notices, GSTR-1A, Annual Return Pack, TDS/TCS, or E-Invoice Readback based on customer demand

## Practical conclusion

For the current product, the WhiteBooks collection should be treated like this:

- implemented now:
  - auth
  - taxpayer search
  - GSTR-1 filing APIs
  - GSTR-3B filing APIs
  - status/tracking
- wired or partially productized now:
  - GSTR-2B fetch automation
  - IMS backend operations
  - ledger and payment/challan helpers
  - guarded GSTR-7, GSTR-9, and GSTR-9C save/file hooks
- productize next:
  - GSTR-2B fetch UX, polling, retry, and UAT
  - ledger/challan readiness UX and duplicate protection
  - provider summary comparison endpoints
- defer or keep as future verticals:
  - notices
  - GSTR-1A amendments
  - e-invoice readback
  - unsupported return families until customer demand and provider evidence justify them
  - username/password-style auth path

This keeps the integration focused on the actual SaaS product path instead of expanding into the full GST universe too early.
