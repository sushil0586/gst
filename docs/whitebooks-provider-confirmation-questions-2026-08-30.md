# WhiteBooks Provider Confirmation Questions

Date: 2026-08-30

Purpose:

Use this checklist to confirm the remaining WhiteBooks contract items before broad public launch or before enabling automated final filing widely.

## Sandbox Evidence On 2026-08-30

Stage was configured against WhiteBooks sandbox credentials and tested with the sandbox OTP `575757`.

Observed:

- `GET /public/search` succeeded for sandbox GSTIN lookup.
- `GET /authentication/otprequest` for `33AAGCB1286Q1ZB` / `TN_NT2.152383` returned a `txn` in the HTTP response header.
- `GET /authentication/authtoken` succeeded with OTP `575757` when using the response-header `txn`.
- `GET /authentication/logout` succeeded when called with the authenticated `txn`.
- `PUT /gstr2b/gen2b` returned provider/upstream error `WB_ERR_9991` across tested periods `012023`, `042024`, `072017`, and `082026`.
- `27AAGCB1286Q1Z4`, `33AAGCB1286Q2ZA`, and `27AAGCB1286Q2Z3` returned `AUTH002` API-access or GSP/ASP-allowance errors during OTP request.

Implementation notes:

- The app must capture `txn` from WhiteBooks HTTP response headers, not only JSON body fields.
- WhiteBooks sandbox errors may use `error.errorCode` and `error.errorMessage`, not only `error.error_cd` and `error.message`.
- For stored `YYYY-MM` periods, WhiteBooks `ret_period` / `rtnprd` should be sent as `MMYYYY`.

Follow-up questions from this evidence:

- Should `gen2b` work in sandbox for these four accounts, or is GSTR-2B unavailable in the sandbox upstream?
- Which exact GSTIN/period should WhiteBooks recommend for a successful sandbox GSTR-2B fetch?
- Why do three enabled sandbox test accounts return `AUTH002` during OTP request?
- Is `txn` always returned in the HTTP response header for OTP/auth/logout flows?

## 1. Final Filing Flow

Please confirm which final filing flow our account should use for each return type.

| Return type | Current app path | Alternative in collection | WhiteBooks confirmation |
|---|---|---|---|
| GSTR-1 | `POST /gstr1/retfile` | `GET /authentication/otpforevc` + `POST /gstr1/retevcfile` | Pending |
| GSTR-3B | `POST /gstr3b/retfile` | `GET /authentication/otpforevc` + `POST /gstr3b/retevcfile` | Pending |
| GSTR-7 | `POST /gstr7/retfile` | `GET /authentication/otpforevc` + `POST /gstr7/retevcfile` | Pending |
| GSTR-9 | `POST /gstr9/retfile` | `GET /authentication/otpforevc` + `POST /gstr9/retevcfile` | Pending |
| GSTR-9C | `POST /gstr9c/retfile` | `GET /authentication/otpforevc` + `POST /gstr9c/retevcfile` | Pending |

Questions:

- Is `retfile` sufficient for final filing for our GSP account?
- If EVC is required, when should `otpforevc` be called?
- Does `otpforevc` need the same `txn` from `/authentication/authtoken`, or does it return a separate transaction reference?
- Is `retevcfile` required for all taxpayers or only some taxpayer classes?
- Are there return-specific differences for GSTR-1, GSTR-3B, GSTR-7, GSTR-9, and GSTR-9C?

## 2. Auth Session Lifecycle

Current app behavior:

- requests OTP with `GET /authentication/otprequest`
- verifies OTP with `GET /authentication/authtoken`
- can refresh with `GET /authentication/refreshtoken`
- supports `GET /authentication/logout`

Questions:

- Is logout mandatory after filing or fetch operations?
- If logout is not called, can this trigger `AUTH403` maximum-session errors?
- What is the actual validity duration of `txn` after successful auth-token exchange?
- Should refresh be called proactively before expiry, or only when a request fails?
- What are the recommended retry rules for auth/session errors?

## 3. Status And ARN Confirmation

Current app behavior:

- uses `/all/newretstatus` when `rettype` is supplied
- can use `/gstr/retstatus` without `rettype`
- uses `/gstr/rettrack`
- can fall back to `/public/rettrack`
- does not treat final-file request as fully filed until ARN/status confirms it

Questions:

- Which endpoint is recommended after final filing request for GSTR-1?
- Which endpoint is recommended after final filing request for GSTR-3B?
- Which endpoint is recommended after final filing request for GSTR-7?
- Which endpoint is recommended after final filing request for GSTR-9?
- Which endpoint is recommended after final filing request for GSTR-9C?
- What field names can contain ARN?
- What status values indicate:
  - filed
  - pending
  - rejected
  - retryable provider delay
- How soon after `retfile` should status polling start?
- What polling interval and maximum retry window does WhiteBooks recommend?

## 4. GSTR-2B Fetch

Current app behavior:

- calls `PUT /gstr2b/gen2b`
- expects an internal transaction reference such as `int_tran_id`
- calls `GET /gstr2b/get2b`
- expects a file reference such as `filenum`
- calls `GET /gstr2b/all`

Questions:

- Is `filenum` always returned by `get2b` when generation is complete?
- What are all possible generation statuses?
- What delay should we expect between `gen2b` and `get2b`?
- Can the same GSTIN/period be generated more than once safely?
- Is there a rate limit per GSTIN or per GSP account?

## 5. Ledger And Challan

Current app behavior:

- can read balance, tax payable, cash ledger, ITC ledger, liability ledger
- can validate challan reason
- can generate challan behind a feature flag

Questions:

- Which challan reason codes should be used for monthly GSTR-3B?
- Which challan reason codes apply to QRMP?
- Can duplicate challan generation happen for the same return if the first response times out?
- Which field should be treated as CPIN?
- Is CPIN generation final/non-reversible?

## 6. Response Contract And Errors

Questions:

- Please provide the common success response shapes for:
  - auth token
  - GSTR-1 save/file
  - GSTR-3B save/offset/file
  - GSTR-2B generation/fetch
  - ledger reads
  - challan generation
- Please provide the common error code catalog.
- Which errors are safe to retry?
- Which errors require user action?
- Which errors mean the provider state is uncertain and must be resynced before retry?

## Launch Decision Rule

Before enabling broad automated final filing:

- final filing path must be confirmed
- logout/session strategy must be confirmed
- status/ARN polling must be confirmed
- at least one controlled tenant must complete the flow in UAT or production pilot
- rollback/pause controls must remain enabled
