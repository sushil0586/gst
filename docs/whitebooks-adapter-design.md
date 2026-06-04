# WhiteBooks Adapter Design

## 1. Purpose

This document defines how WhiteBooks should be integrated into GST Compliance without coupling provider behavior directly into views or return services.

## 2. Design goals

- isolate WhiteBooks-specific behavior
- normalize request and response handling
- support sandbox and production environments
- capture provider failures safely
- keep filing orchestration provider-agnostic

## 3. Proposed package structure

```text
apps/integrations/
  whitebooks/
    __init__.py
    client.py
    provider.py
    serializers.py
    mappers.py
    exceptions.py
    types.py
```

## 4. Responsibility split

### `client.py`

Owns:

- HTTP communication
- base URL selection
- authentication header handling
- timeout behavior
- retry policy for safe network errors

Should not own:

- business filing decisions
- return readiness rules

### `provider.py`

Owns:

- `FilingProvider` implementation
- payload assembly orchestration
- response normalization
- error normalization

### `serializers.py`

Owns:

- strict validation of outbound payload contracts
- parsing/validation of inbound provider response shapes when practical

### `mappers.py`

Owns:

- mapping internal return snapshot data into WhiteBooks payload schema
- mapping provider statuses into internal filing statuses

### `exceptions.py`

Owns normalized provider exception classes such as:

- `ProviderAuthenticationError`
- `ProviderValidationError`
- `ProviderSubmissionError`
- `ProviderTemporaryError`
- `ProviderStatusSyncError`

## 5. Recommended provider interface

Suggested interface:

```python
class FilingProvider:
    def authenticate(self): ...
    def prepare_payload(self, filing): ...
    def submit_return(self, filing, payload): ...
    def get_status(self, filing): ...
    def get_acknowledgement(self, filing): ...
    def normalize_error(self, exc): ...
```

WhiteBooks implementation:

```python
class WhiteBooksProvider(FilingProvider):
    ...
```

## 6. Suggested client design

`WhiteBooksClient` should encapsulate:

- environment-specific base URL
- provider credentials
- default headers
- request IDs
- correlation IDs for logs

Suggested methods:

- `authenticate()`
- `submit_gstr1(payload)`
- `submit_gstr3b(payload)`
- `fetch_status(reference_id)`
- `fetch_arn(reference_id)`

If WhiteBooks exposes different endpoints for draft upload vs final submit, model those separately rather than overloading a single call.

## 7. Request flow

Recommended flow:

1. filing service loads approved prepared snapshot
2. provider prepares outbound payload from snapshot
3. provider serializer validates outbound payload
4. client submits payload to WhiteBooks
5. provider maps response into normalized internal result
6. filing service updates attempt and filing status

## 8. Response normalization

Internal orchestration should not depend on raw WhiteBooks statuses.

Map provider responses into internal concepts:

- submission accepted
- submission pending
- ARN available
- filing complete
- validation failed
- temporary provider failure
- terminal provider failure

## 9. Error handling strategy

### Validation errors

Examples:

- missing required return sections
- invalid totals
- schema mismatch

Internal behavior:

- mark attempt failed
- mark filing `failed` or `needs_retry` depending on class
- surface actionable UI message

### Temporary errors

Examples:

- timeout
- network error
- provider unavailable
- transient 5xx

Internal behavior:

- mark attempt failed
- usually mark filing `needs_retry`
- allow controlled retry/resync

### Authentication errors

Examples:

- invalid credentials
- expired token/session
- OTP/session not available

Internal behavior:

- fail attempt
- alert operator/admin
- do not auto-retry blindly

## 10. Sensitive data handling

Do not persist raw secrets in filing records.

Recommended handling:

- store credentials in env vars first, then move to a secret manager for production
- redact auth tokens and sensitive fields from logs
- persist only request hashes and safe summaries in filing attempt models

## 11. Status synchronization

WhiteBooks status retrieval should support:

- immediate post-submit check
- scheduled polling
- manual resync

Recommended sync sources:

- `provider_reference_id`
- `provider_acknowledgement_id`
- ARN if the provider allows lookup by ARN

## 12. Sandbox-first implementation

The first implementation should target sandbox only.

Definition of done for sandbox:

- authenticate successfully
- submit at least one supported filing payload
- retrieve normalized status
- store filing attempt and event history locally

## 13. Open questions to resolve

Before implementation, document:

- exact WhiteBooks auth mechanism
- whether OTP is required and when
- endpoint list for GSTR-1 and GSTR-3B
- ARN retrieval timing
- provider rate limits
- error code catalog
- sync polling recommendations
- production credential onboarding steps

## 13.1 Known auth contract from sandbox validation

The project now has one confirmed sandbox auth touchpoint from user-supplied integration evidence:

- method: `GET`
- path: `/authentication/otprequest`
- query parameter:
  - `email`
- required headers observed:
  - `gst_username`
  - `state_cd`
  - `ip_address`
  - `client_id`
  - `client_secret`

Observed sandbox error example:

- `status_cd: "0"`
- `error.error_cd: "AUTH403"`
- `error.message: "Maximum session allowed for user with this GSP account exceeded."`

Observed sandbox OTP-request success example:

- `status_cd: "1"`
- `status_desc: "user name exists"`
- `header.txn` is returned during OTP request and can be reused in the subsequent `/authentication/authtoken` call

Current implementation impact:

- `WhiteBooksClient.authenticate()` now models OTP request as the first live authentication step
- live auth is represented internally as an OTP challenge first, not a ready-to-submit session
- `WhiteBooksClient.exchange_otp_for_session()` preserves the raw auth-token payload without assuming token field names
- live submission remains intentionally blocked until a confirmed auth-token success payload is available
- `AUTH403` is mapped to a dedicated session-limit authentication exception

Additional sandbox auth contract now confirmed:

- method: `GET`
- path: `/authentication/authtoken`
- query parameters:
  - `email`
  - `otp`
- required headers observed:
  - `gst_username`
  - `state_cd`
  - `ip_address`
  - `txn`
  - `client_id`
  - `client_secret`

Observed sandbox auth-token success example:

- `status_cd: "1"`
- `status_desc: "If authentication succeeds"`
- `header.txn` echoes the submitted transaction identifier
- the sample does not yet expose a reusable submission credential such as `token`, `auth_token`, `sek`, or `session_key`

Still unresolved:

- session/token reuse rules
- session termination or logout endpoint
- whether filing submit APIs require a verified OTP session or another credential exchange
- what exact credential, if any, must be forwarded to filing submit/status APIs after successful OTP verification

Current safe posture:

- sandbox submission continues to use the local stub flow for filing lifecycle development
- live mode can request OTP and exchange OTP for a confirmed auth-token success envelope
- live mode stores the echoed `txn` from both OTP request and auth-token responses, plus the raw auth payloads, for audit/support purposes
- live mode will not attempt final submission until WhiteBooks confirms what session credential must be read and forwarded

## 13.2 Confirmed filing and tracking endpoints from the Postman collection

The attached WhiteBooks Postman collection confirms the following request contracts for the current GST filing flow.

Common headers across filing and tracking calls:

- `gst_username`
- `state_cd`
- `ip_address`
- `txn`
- `client_id`
- `client_secret`

Additional headers for save/file calls:

- `gstin`
- `ret_period`
- `Content-Type: application/json`

Confirmed GSTR-1 sequence:

1. `PUT /gstr1/retsave?email=...`
2. `GET /all/newproceedfile?gstin=...&retperiod=...&type=GSTR1&isNil=...&email=...`
3. `POST /gstr1/retfile?email=...&pan=...`
4. `GET /all/newretstatus?gstin=...&returnperiod=...&refid=...&rettype=GSTR1&email=...`
5. `GET /gstr/rettrack?gstin=...&returnperiod=...&type=GSTR1&email=...`

Confirmed GSTR-3B sequence:

1. `PUT /gstr3b/retsave?email=...`
2. `PUT /gstr3b/retoffset?email=...`
3. `POST /gstr3b/retfile?email=...&pan=...`
4. `GET /all/newretstatus?gstin=...&returnperiod=...&refid=...&rettype=GSTR3B&email=...`
5. `GET /gstr/rettrack?gstin=...&returnperiod=...&type=GSTR3B&email=...`

Confirmed legacy status endpoint:

- `GET /gstr/retstatus?gstin=...&returnperiod=...&refid=...&email=...`

Confirmed payload evidence:

- the Postman collection contains full sample request bodies for `gstr1/retsave`, `gstr1/retfile`, `gstr3b/retsave`, `gstr3b/retoffset`, and `gstr3b/retfile`
- those bodies are enough to scaffold transport and payload mappers
- they are not yet enough to guarantee our internal return snapshots map one-to-one to WhiteBooks without explicit field mapping work

Current implementation status:

- the filing core now resolves providers through a registry in `apps/filings/providers/registry.py`
- provider-stage semantics now live on the provider implementation instead of being hardcoded in the filing service
- generic provider exceptions now exist under `apps/filings/providers/exceptions.py`, and WhiteBooks maps onto that contract
- provider OTP/auth-token session orchestration now runs through `apps/filings/services/provider_auth.py`, with `whitebooks_auth.py` retained only as a compatibility wrapper
- `apps/integrations/whitebooks/mappers.py` now builds executable draft payloads for:
  - GSTR-1 `retsave`
  - GSTR-1 `newproceedfile` request context
  - GSTR-1 `retfile` checksum/section-summary payload
  - GSTR-3B `retsave`
  - GSTR-3B status/track request context
- the mapper uses internal GST transactions as the source of truth for detailed save payloads
- GSTR-1 `retfile` payload generation now exists with deterministic internal checksum + `sec_sum` generation for B2B, B2CS, CDNR, and CDNUR sections
- live GSTR-1 `retfile` transport still remains gated until the final filing response contract and ARN/status synchronization are validated end to end
- GSTR-3B `retoffset` remains blocked because the current domain model does not store liability-ledger identifiers or offset breakup inputs
- GSTR-3B `retfile` remains blocked until the offset stage is implemented and validated
- a guarded live path now exists for `GSTR-1 retsave`
- an optional guarded follow-up path now exists for `GSTR-1 newproceedfile`
- that path requires:
  - `WHITEBOOKS_SANDBOX_MODE=False`
  - `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE=True`
- to enable the proceed step after draft-save, it additionally requires:
  - `WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE=True`
  - a verified `WhiteBooksAuthSession` with a valid `txn`
- even in live mode, the system currently stops after WhiteBooks draft-save or proceed-to-file and does not attempt final filing

## 14. Recommended first implementation cut

Build first:

- `FilingProvider`
- `WhiteBooksProvider`
- `WhiteBooksClient`
- payload mapper for one return type
- status mapper
- exception normalization

Then extend return-type coverage and edge-case handling.
