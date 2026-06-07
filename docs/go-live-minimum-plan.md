# Go-Live Minimum Plan

## Purpose

This document defines the minimum work required before we treat the current GST filing product as ready for controlled live rollout.

It is intentionally lean.

This is not a full roadmap.
This is the minimum launch boundary for:

- controlled pilots
- CA-led beta usage
- limited WhiteBooks-backed live rollout

## Current position

Ready now for controlled pilot:

- GSTR-1 import, preparation, review, approval, sandbox filing
- GSTR-3B purchase and 2B import, reconciliation, correction workflow, review decisions, preparation, sandbox filing
- audit trail for books corrections and reconciliation-driven decisions
- WhiteBooks provider integration for OTP, draft save, proceed, offset, file, status evidence capture

Not yet ready to market as broad production-grade live filing for all tenants:

- WhiteBooks live contract still needs a few final confirmations
- live session lifecycle is not fully hardened
- a few WhiteBooks APIs are intentionally unimplemented

## Launch recommendation

Recommended launch position:

- yes for controlled pilot / beta
- yes for sandbox and tenant-limited live rollout
- no for broad “fully production-ready for all filing cases” positioning yet

## Mandatory before wider live rollout

### 1. WhiteBooks contract confirmation

Confirm these exact items with WhiteBooks:

- whether `/all/newproceedfile` is the correct current endpoint
- whether `retsubmit` is still mandatory before `retfile` for GSTR-1
- whether return status should use `/gstr/retstatus` or `/all/newretstatus`
- whether tracking should use `/public/rettrack` or `/gstr/rettrack`
- whether `txn` alone is enough for the 6-hour session window
- whether `/authentication/refreshtoken` is required in practice

Why this is mandatory:

- these decisions directly affect whether live filing is contract-correct
- sandbox success alone is not enough if production contract differs

Current evidence from WhiteBooks materials:

- the WhiteBooks Postman collection includes both `/all/proceedfile` and `/all/newproceedfile`
- the WhiteBooks Postman collection includes both `/gstr/retstatus` and `/all/newretstatus`
- the WhiteBooks Postman collection includes both `/public/rettrack` and `/gstr/rettrack`
- the WhiteBooks Postman collection includes `/authentication/refreshtoken`
- the WhiteBooks Postman collection does not show `gstr1/retsubmit`

Practical interpretation:

- `newproceedfile` and `newretstatus` are now more credible as current endpoints
- `gstr1/retsubmit` is less likely to be mandatory for the current WhiteBooks path
- tracking endpoint choice still needs confirmation because both public and authenticated variants are present

### 2. One real live/UAT evidence pack

Capture evidence for at least one real tenant or WhiteBooks-supported UAT tenant for:

- GSTR-1 save
- GSTR-1 proceed/submit step
- GSTR-1 final file step
- GSTR-1 status/track and ARN confirmation
- GSTR-3B save
- GSTR-3B offset
- GSTR-3B file
- GSTR-3B status/track and ARN confirmation

Why this is mandatory:

- we need actual provider responses, not just mocked or sandbox assumptions

### 3. Session lifecycle hardening if vendor requires it

Implement only if WhiteBooks confirms it is required:

- `/authentication/refreshtoken`

Optional follow-up if vendor insists:

- `/authentication/logout`

Why this is mandatory only conditionally:

- current product already stores verified sessions and enforces freshness
- if WhiteBooks accepts `txn` for the whole 6-hour window without refresh, no extra work is needed

### 4. Honest launch boundary in product and ops

Before wider rollout:

- enable only the return types and stages already proven
- keep feature flags and rollout controls active
- do not market unsupported WhiteBooks capabilities as available

## APIs that are mandatory vs optional

### Mandatory or near-mandatory

#### `GET /gstr/retstatus`

Use:

- confirms whether saved return data was accepted, rejected, or still processing

Why it matters:

- this is important immediately after `retsave`
- if save acceptance is uncertain, later proceed/file steps become unsafe

Launch view:

- mandatory for trustworthy automated filing workflows
- less critical only if the team is prepared to do manual provider-side verification during pilot

Current state:

- implemented in client
- endpoint contract still needs WhiteBooks confirmation because the collection exposes both `/gstr/retstatus` and `/all/newretstatus`

#### `GET /gstr/rettrack`

Use:

- confirms final return lifecycle and ARN/filed status

Why it matters:

- this is what lets the product say “filed” with confidence
- without track/status confirmation, the system is relying on submit-step evidence rather than actual terminal confirmation

Launch view:

- mandatory for broad live rollout
- for limited pilot, you can temporarily operate with manual confirmation if needed, but that should be treated as an operational compromise

Current state:

- tracking exists in code
- exact endpoint contract needs WhiteBooks confirmation because the collection exposes both `/public/rettrack` and `/gstr/rettrack`

### Optional for current launch boundary

Not mandatory for controlled pilot right now:

- `/authentication/logout`
- `/gstr1/retevcfile`
- `/gstr1/reset`
- `/all/filedet`
- `/all/largefile`
- `/all/latefee`
- `/all/docdwld`
- `/all/savepref`
- `/all/getpref`
- `/public/pref`

These can be deferred until product scope explicitly needs them.

## Minimum implementation plan

### Phase 1: Contract closure

Do now:

- send WhiteBooks a concise endpoint and sequencing questionnaire
- confirm the correct live filing path for GSTR-1 and status tracking

Done when:

- each live endpoint is explicitly confirmed by vendor or UAT evidence

### Phase 2: Conditional code closure

Do only if WhiteBooks requires it:

- add `refreshtoken`
- add `retsubmit` before `retfile`
- align status/track endpoints if current code uses older or newer aliases incorrectly

Done when:

- current provider code matches the confirmed WhiteBooks contract

### Phase 3: Controlled live pilot

Run:

- one or more tenant-limited live pilots
- operator-led filing with evidence capture
- CA validation of outcome and status transitions

Done when:

- filing evidence, status updates, and ARN confirmation are all consistent in backend and UI

## Defer for later

To avoid overengineering, do not make these mandatory before pilot:

- full session orchestration engine
- generic provider contract engine
- large file upload support
- preference APIs
- reset/EVC flows unless a live customer specifically needs them
- broader reconciliation automation beyond the lean workflow already built

## Market recommendation

Current recommendation:

- go to market for controlled pilots and beta
- do not yet position as unrestricted production-grade live filing for all tenants

If WhiteBooks confirms the endpoint and sequencing questions cleanly, and live/UAT evidence passes, this can move from:

- controlled pilot

to:

- limited production rollout
