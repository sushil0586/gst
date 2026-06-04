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

## Product scope we are optimizing for

Current product scope:

- client and GSTIN onboarding
- GSTIN taxpayer enrichment
- purchase and GSTR-2B reconciliation
- GSTR-1 preparation and filing
- GSTR-3B preparation and filing
- support, audit, recovery, and SaaS-safe rollout controls

This means WhiteBooks APIs should be evaluated against these priorities, not against the full GST product universe in the collection.

## Phase 0: Already implemented

These WhiteBooks APIs are already implemented in code and used by the product.

### Auth and public

- `GET /public/search`
- `GET /authentication/otprequest`
- `GET /authentication/authtoken`

Current usage:

- taxpayer lookup during onboarding
- OTP request and verification for filing auth

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

Current usage:

- ARN confirmation
- post-file status sync
- rejection handling
- support and recovery workflows

## Phase 1: Implement next

These are the highest-value WhiteBooks APIs to add next.

### 1. GSTR-2B fetch automation

Implement:

- `PUT /gstr2b/gen2b`
- `GET /gstr2b/get2b`
- `GET /gstr2b/all`

Why this is next:

- 2B reconciliation is already implemented in the product
- current 2B flow depends on manual upload
- these APIs would allow optional provider-assisted 2B retrieval without changing the reconciliation engine

Expected product outcome:

1. user selects GSTIN and period
2. app requests generation of 2B if needed
3. app polls status
4. app fetches 2B payload
5. app converts it into the same normalized import path used by manual upload
6. reconciliation runs on top of that imported dataset

Implementation notes:

- keep manual upload as a fallback
- do not replace the current import/reconciliation pipeline
- store raw provider evidence and normalized imported rows separately
- make this feature-gated and tenant-rollout controlled just like filing

Definition of done:

- “Fetch 2B from WhiteBooks” exists as an optional path
- imported provider-fetched 2B can be reconciled with purchases using the current reconciliation engine
- operators can see generation status, fetch evidence, and failure reasons

### 2. Better provider-side pre-file summaries

Implement:

- `GET /gstr1/retsum`
- `GET /gstr3b/retsum`
- `GET /gstr3b/autoliab`

Why this matters:

- helps compare internal prepared return data against provider/GST-side summary
- improves operator confidence before final file
- gives support more evidence when return mismatch questions arise

Definition of done:

- summary endpoints can be called for a verified auth session
- responses are normalized and stored as support evidence
- UI can surface “internal vs provider summary” for review when needed

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

- `GET /authentication/refreshtoken`
- `GET /authentication/logout`

Why defer:

- useful only if live auth session expiry becomes an operational problem
- current flow can progress without first-class refresh/logout handling

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
- `gstr7/*`
- `gstr8/*`
- `gstr9/*`
- `gstr9a/*`
- `gstr9c/*`
- `gstr2x/*`
- `ims/*`
- `spike/*`

Why defer:

- the current SaaS product is focused on GSTR-1, GSTR-3B, reconciliation, returns, approvals, and filing operations
- implementing these now would add complexity without helping the current main path

### Peripheral operational APIs

Defer:

- `payment/*`
- `ledgers/*`
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

1. `gstr2b/gen2b`
2. `gstr2b/get2b`
3. `gstr2b/all`
4. normalize provider-fetched 2B into the existing import pipeline
5. add 2B fetch monitoring, evidence, and operator guidance in UI
6. add `gstr1/retsum`
7. add `gstr3b/retsum`
8. add `gstr3b/autoliab`
9. reassess whether deeper GSTR-3B validation helpers are actually needed

## Practical conclusion

For the current product, the WhiteBooks collection should be treated like this:

- implemented now:
  - auth
  - taxpayer search
  - GSTR-1 filing APIs
  - GSTR-3B filing APIs
  - status/tracking
- implement next:
  - GSTR-2B fetch automation
  - provider summary comparison endpoints
- defer:
  - all other return families
  - peripheral payment, ledger, e-invoice, and notice endpoints
  - username/password-style auth path

This keeps the integration focused on the actual SaaS product path instead of expanding into the full GST universe too early.
