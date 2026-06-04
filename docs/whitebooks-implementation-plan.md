# WhiteBooks Implementation Plan

## 1. Purpose

This document turns the current WhiteBooks integration work into a concrete implementation plan for production-grade GST filing.

It is intentionally more execution-oriented than:

- [production-roadmap.md](/Users/ansh/Documents/Gst-Compliance/docs/production-roadmap.md:1)
- [whitebooks-adapter-design.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-adapter-design.md:1)
- [engineering-backlog-90-days.md](/Users/ansh/Documents/Gst-Compliance/docs/engineering-backlog-90-days.md:1)

This plan answers:

- what is already implemented
- what is partially implemented but still guarded
- what must be built next
- what dependencies still exist on WhiteBooks / GSTN contract details
- what sequence should be followed to reach production safely

## 2. Current state

### 2.1 Already implemented

Backend:

- filings domain exists with:
  - `ReturnFiling`
  - `ReturnFilingAttempt`
  - `ReturnFilingEvent`
- auth-session domain exists with:
  - `WhiteBooksAuthSession`
- WhiteBooks client exists with confirmed contracts for:
  - OTP request
  - OTP auth-token exchange
  - GSTR-1 save
  - GSTR-1 proceed-to-file
  - GSTR-1 file
  - GSTR-3B save
  - GSTR-3B offset
  - GSTR-3B file
  - return status and tracking endpoints
- provider abstraction exists under `apps/integrations/whitebooks/`
- filing orchestration now uses a provider registry plus generic provider exceptions/stage contracts under `apps/filings/providers/`
- filings API exists for:
  - list/detail
  - start
  - retry
  - resync
- WhiteBooks auth-session API exists for:
  - request OTP
  - verify OTP
  - list/detail auth sessions
- payload mapper exists for:
  - GSTR-1 `retsave`
  - GSTR-1 proceed context
  - GSTR-3B `retsave`
  - GSTR-1/GSTR-3B status and tracking context
- a guarded live `GSTR-1 retsave` path exists

Frontend:

- returns workflow can:
  - request WhiteBooks OTP
  - verify OTP
  - display WhiteBooks auth-session state
  - show filings lifecycle and attempts/events

Testing:

- backend integration and mapper tests are present
- current WhiteBooks and filings test suite is green

### 2.2 Partially implemented

- live WhiteBooks `GSTR-1 retsave` is implemented behind config
- live filing does not proceed beyond draft save
- live status sync does not yet call WhiteBooks tracking/status endpoints
- internal filing orchestration still treats non-sandbox completion conservatively

### 2.3 Not yet implemented

- GSTR-1 `newproceedfile`
- GSTR-1 final `retfile`
- GSTR-1 status polling using real WhiteBooks status responses
- GSTR-3B `retoffset`
- GSTR-3B final `retfile`
- EVC-based flows
- normalized provider response mapping for real filing success/failure outcomes
- production operational tooling for requeue/resync/manual intervention

## 3. Target end state

The production WhiteBooks integration should support the following user journey:

1. user prepares return
2. user or system verifies filing readiness
3. user completes maker-checker / approval
4. user requests WhiteBooks OTP
5. user verifies OTP and establishes filing session context
6. system saves return to WhiteBooks
7. system runs proceed-to-file where required
8. system files return through WhiteBooks
9. system polls or refreshes status until a terminal state
10. ARN / ref ID / audit evidence is stored and shown in UI

For v1, the integration should aim to support:

- GSTR-1 first
- GSTR-3B next
- sandbox before production
- non-EVC filing first unless business requires EVC earlier

## 4. Design principles for implementation

- preserve the current sandbox stub until live behavior is proven stable
- gate every live WhiteBooks step with explicit feature flags
- do not assume missing response fields or hidden provider behavior
- keep request builders, provider orchestration, and business workflow separate
- favor additive rollout over replacing stable sandbox behavior abruptly
- record enough local evidence for support and audit without storing secrets unsafely

## 5. Confirmed integration facts

### 5.1 Confirmed auth flow

- `GET /authentication/otprequest?email=...`
- `GET /authentication/authtoken?email=...&otp=...`
- both rely on:
  - `gst_username`
  - `state_cd`
  - `ip_address`
  - `client_id`
  - `client_secret`
  - `txn` for auth-token exchange
- OTP request success returns `header.txn`
- auth-token success returns `header.txn`
- current observed auth-token success does not expose:
  - `token`
  - `auth_token`
  - `sek`
  - `session_key`
  - `access_token`

### 5.2 Confirmed filing endpoints

GSTR-1:

- `PUT /gstr1/retsave?email=...`
- `GET /all/newproceedfile?gstin=...&retperiod=...&type=GSTR1&isNil=...&email=...`
- `POST /gstr1/retfile?email=...&pan=...`
- `GET /all/newretstatus?...&rettype=GSTR1&...`
- `GET /gstr/rettrack?...&type=GSTR1&...`

GSTR-3B:

- `PUT /gstr3b/retsave?email=...`
- `PUT /gstr3b/retoffset?email=...`
- `POST /gstr3b/retfile?email=...&pan=...`
- `GET /all/newretstatus?...&rettype=GSTR3B&...`
- `GET /gstr/rettrack?...&type=GSTR3B&...`

## 6. Known gaps that block full production filing

### 6.1 GSTR-1 gaps

- current `retfile` payload requires checksum-based section summaries
- the current return preparation pipeline now computes deterministic internal section summaries for GSTR-1 `retfile`
- live final filing still remains gated until the provider success response and ARN/status behavior are validated in sandbox
- proceed-to-file response shape is not yet modeled in code
- final file response and status transitions are not yet normalized

### 6.2 GSTR-3B gaps

- current domain model does not store liability ledger IDs needed for `retoffset`
- current domain model does not store payment allocation breakup needed for offset
- current `retfile` step should only happen after validated save + offset flow
- current internal summaries are sufficient for high-level display, not yet full WhiteBooks `retfile` parity

### 6.3 Provider response gaps

- no confirmed live success payloads yet for:
  - `gstr1/retsave`
  - `all/newproceedfile`
  - `gstr1/retfile`
  - `gstr3b/retsave`
  - `gstr3b/retoffset`
  - `gstr3b/retfile`
  - status / tracking responses

### 6.4 Operational gaps

- no production retry policy yet for live provider transport failures
- no admin action surface yet for resending save / proceed / file
- no support evidence pack yet for live filing incidents

## 7. Implementation phases

### Phase summary

| Phase | Focus | Outcome |
| --- | --- | --- |
| 1 | Stabilize live GSTR-1 save | WhiteBooks draft-save works reliably and is visible in UI |
| 2 | Implement GSTR-1 proceed-to-file | Saved GSTR-1 drafts can move to provider proceed stage |
| 3 | Implement GSTR-1 final filing | GSTR-1 can be filed through WhiteBooks |
| 4 | Normalize GSTR-1 statuses and evidence | Real filing states, support visibility, and resync are operational |
| 5 | Build GSTR-3B save | GSTR-3B draft-save works live in controlled mode |
| 6 | Add GSTR-3B liability offset support | Liability offset is modeled and executable |
| 7 | Implement GSTR-3B final filing and status sync | GSTR-3B can complete end to end |
| 8 | Production hardening | Feature flags, support tooling, observability, and rollout controls are production ready |

## 8. Current checkpoint and next pending phases

This section is the practical checkpoint for the WhiteBooks API list already shared and confirmed.

### Already implemented from the shared API list

Auth:

- `GET /authentication/otprequest`
- `GET /authentication/authtoken`

GSTR-1:

- `PUT /gstr1/retsave`
- `GET /all/newproceedfile`
- `POST /gstr1/retfile`
- status and tracking sync flow for filing confirmation and ARN handling

Operationally, the above are no longer just client methods. They are wired into:

- provider orchestration
- filing attempts and events
- audit logging
- support/recovery tooling
- Returns and Operations frontend flows

### Implemented in code, but still pending live rollout completion

GSTR-3B:

- `PUT /gstr3b/retsave`
- `PUT /gstr3b/retoffset`
- `POST /gstr3b/retfile`
- status and tracking request context

These exist at the client and mapping layer, but they are not yet fully enabled as live operational workflow.

### Remaining phases from the current build

The next execution stream should now move in this order:

1. enable live `GSTR-3B retsave`
2. add GSTR-3B liability offset domain support and `retoffset`
3. enable guarded live `GSTR-3B retfile`
4. normalize GSTR-3B status, ARN, rejection, and recovery states
5. harden cross-endpoint provider error handling
6. finish SaaS rollout, controls, and production operations

## 9. Pending implementation phases and checklists

## Phase 9.1: GSTR-3B live save

Goal:

- make `PUT /gstr3b/retsave` production-usable in the same controlled way as live GSTR-1 save

Implementation:

- wire guarded live `GSTR-3B retsave` into the provider workflow
- validate mapped request payloads against real provider behavior
- persist sanitized `retsave` evidence on the latest filing attempt
- expose GSTR-3B draft-save stage in Returns and Operations
- keep provider capabilities and feature flags provider-owned rather than hardcoded in shared services

Checklist:

- live save works only when the provider capability and feature flag are enabled
- filing attempts record provider stage, response evidence, and next action
- audit and event trail exists for request, success, and failure
- UI clearly shows `draft saved to provider`, not `filed`

## Phase 9.2: GSTR-3B liability offset and `retoffset`

Goal:

- make `PUT /gstr3b/retoffset` executable with traceable business inputs

Implementation:

- add the liability-ledger and settlement-allocation model required by WhiteBooks
- version offset inputs alongside filing attempts
- build guarded live `retoffset` transport
- persist sanitized offset evidence and failure details
- surface offset-specific readiness blockers and retry/review states

Checklist:

- domain model stores all provider-required offset inputs
- offset request is reproducible from stored data
- retryable vs terminal offset failures are classified by backend policy
- support can inspect offset evidence without database access

## Phase 9.3: GSTR-3B final filing

Goal:

- enable guarded live `POST /gstr3b/retfile` without assuming immediate success

Implementation:

- wire final GSTR-3B filing through the provider contract
- persist sanitized request and response evidence for the file step
- move filing into confirmation-pending state after final file request
- add duplicate-submit and replay protection for GSTR-3B final filing
- surface file-requested state in the support and returns workflows

Checklist:

- final file transport is independently feature-gated
- system never marks a filing complete from transport response alone
- attempt, event, and audit state remain consistent after file request
- support sees whether next action is resync, retry, or review

## Phase 9.4: GSTR-3B status, ARN, and recovery

Goal:

- make GSTR-3B operationally supportable after final filing

Current status:

- implemented in code
- active UAT coverage is still required for delayed ARN, rejection, and mismatch scenarios

Implementation:

- normalize `retstatus` and `rettrack` responses for GSTR-3B
- extract ARN conservatively and persist provider evidence
- map confirmed rejection/failure into internal failed states
- preserve ambiguous provider responses as confirmation-pending rather than forcing incorrect terminal states
- extend recovery guidance, reviewed requeue, and resync flows to GSTR-3B

Checklist:

- ARN can move the filing to final filed state
- provider rejection moves the filing into failed state with preserved reason codes
- ambiguous status leaves the filing safely resyncable
- support workflows work for GSTR-3B the same way they do for GSTR-1

## Phase 9.5: Cross-endpoint provider hardening

Goal:

- reduce operational risk across both GSTR-1 and GSTR-3B

Implementation:

- standardize provider result envelopes for save, proceed, file, status, and track
- normalize retryable transport failures separately from provider-side business rejections
- tighten timeout behavior and safe retry rules
- ensure secrets and sensitive headers are consistently redacted from stored evidence
- confirm auth-session expiry and mismatch handling across all live steps

Checklist:

- every provider step returns a stable internal result contract
- retry policy is backend-owned and not guessed by the UI
- sensitive values are never surfaced in stored evidence
- auth-session mismatch and expiry are visible and actionable

## Phase 9.6: SaaS production hardening

Goal:

- make the WhiteBooks execution layer safe to run as a multi-tenant SaaS capability

Implementation:

- rollout controls by environment, workspace, client, GSTIN, return type, and provider
- stronger filing-role separation and maker-checker enforcement
- operational dashboards, alerts, and incident runbooks
- support evidence pack export for filing incidents
- UAT and release checklists for live customer enablement

Checklist:

- rollout can be constrained to specific tenants and return types
- every filing action is audit-traceable
- support can diagnose unresolved filings from product tooling
- release readiness and rollback steps are documented and executable

Current implementation progress:

- tenant rollout policies now exist in the backend and can gate live submission and live status sync by workspace, client, GSTIN, provider, and return type
- Returns and Operations now surface rollout-policy summaries directly to support users
- backend-generated operational alerts now flag:
  - confirmation-pending filings
  - rollout-control blocks
  - retry-required states
  - stale status sync conditions
- filing-scoped incident notes now exist through API and admin tooling for support-led follow-up and resolution history
- filing evidence pack export now exists for support/audit handoff through `exports/filing-evidence-pack`
- maker-checker enforcement now exists at approval and filing start behind `FILING_ENFORCE_MAKER_CHECKER`
- routed alert escalation now exists through operational alert routing rules plus `filings/{id}/escalate-alerts/`
- support recovery roles and default alert-recipient roles are configurable through environment policy
- filing incident and live release runbooks now exist for support and rollout execution

Operating checklist for live tenant enablement:

1. Confirm the global provider feature flags for the intended live path are enabled only in the target environment.
2. Create a tenant rollout policy for the exact workspace, client/GSTIN, provider, and return type being enabled.
3. Verify a confirmed provider auth session exists for the enabled GSTIN before attempting live filing.
4. Check Returns or Operations for rollout-policy summary and ensure live submission/status sync are both allowed where required.
5. If a filing becomes uncertain, record an incident note before retry, resync, or reviewed requeue.
6. Export a filing evidence pack for any unresolved or escalated live-filing incident that needs audit/support handoff.
7. Before expanding rollout to additional tenants, confirm unresolved operational alerts are cleared or explicitly accepted.

## Phase 1: Stabilize live GSTR-1 save

Goal:
- move from “guarded experimental live save” to “repeatable controlled draft-save”

Scope:

- keep `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE` feature flag
- capture and persist actual WhiteBooks `retsave` responses
- enrich filing attempt `response_summary`
- expose “saved to WhiteBooks draft” explicitly in UI
- differentiate:
  - draft saved
  - ready to proceed
  - fully filed

Code areas:

- `apps/integrations/whitebooks/client.py`
- `apps/integrations/whitebooks/provider.py`
- `apps/filings/services/filings.py`
- `gst-compliance-frontend/src/app/(dashboard)/returns/page.tsx`

Acceptance criteria:

- a verified auth session can trigger live `GSTR-1 retsave`
- WhiteBooks response is stored on the latest filing attempt
- frontend shows that the return is saved remotely but not filed
- failures are visible as filing/auth/provider errors

### Phase 1 task breakdown

Phase 1 must make the product safer as a multi-tenant SaaS, not only “technically able” to call WhiteBooks.

#### 1. Product and UX

- define the exact user-facing state label for this stage:
  - `draft saved to WhiteBooks`
  - not `filed`
  - not `submitted to GSTN`
- add clear UI messaging that this phase only saves a draft remotely
- add tenant-safe operator guidance in the Returns flow:
  - what happened
  - what did not happen
  - what the next step is
- add empty/error states for:
  - no verified auth session
  - live filing disabled by config
  - WhiteBooks provider failure

#### 2. SaaS tenancy and authorization

- verify every live WhiteBooks action stays scoped to:
  - workspace
  - client
  - GSTIN
  - compliance period
- ensure the latest `WhiteBooksAuthSession` lookup cannot cross tenant boundaries
- confirm only users with `file_return` permission can trigger live save
- verify read-only users cannot see or trigger filing actions beyond allowed visibility

#### 3. Backend service work

- persist the real WhiteBooks `retsave` response into filing attempt summaries
- distinguish local filing states from provider stage:
  - queued locally
  - submitted to provider
  - draft saved remotely
- add explicit provider-stage metadata to `ReturnFilingEvent`
- ensure live mode never auto-transitions to `filed`
- normalize provider-side draft-save success and failure handling

#### 4. Frontend work

- show a visible provider-stage card in the Returns modal
- display:
  - auth session used
  - `txn`
  - WhiteBooks draft-save result
  - last provider response message
- show a warning banner that final filing is not yet complete
- disable follow-up actions that should not be available yet
- ensure mock/demo wording is not shown in live-provider states

#### 5. Configuration and environment safety

- keep live save behind:
  - `WHITEBOOKS_SANDBOX_MODE=False`
  - `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE=True`
- keep live proceed-to-file behind:
  - `WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE=True`
- document exact environment setup for:
  - local sandbox testing
  - staging sandbox testing
- add validation so missing critical WhiteBooks env vars fail fast
- confirm secrets are not echoed into logs or API responses

#### 6. Audit and supportability

- store enough safe evidence for support:
  - auth session id
  - filing id
  - attempt number
  - `txn`
  - provider response summary
- add explicit audit events for:
  - WhiteBooks draft-save attempted
  - WhiteBooks draft-save succeeded
  - WhiteBooks draft-save failed
- confirm support/admin can inspect these records without raw secrets

#### 7. Data model and status semantics

- decide whether provider stage should remain in:
  - attempt `response_summary`
  - event metadata
  - or a dedicated normalized field
- introduce a normalized provider-stage convention for Phase 1:
  - `draft_save_requested`
  - `draft_saved`
  - `draft_save_failed`
- keep these distinct from final return statuses like `filed`

#### 8. Testing

- add backend tests for:
  - live save with verified auth session
  - failure when no auth session exists
  - failure when feature flag is off
  - failure when return type is not GSTR-1
  - tenant scoping of auth-session lookup
- add frontend tests or manual QA coverage for:
  - correct provider-stage messaging
  - disabled actions when live save is unavailable
  - visible error states
- run full build/test sanity after Phase 1 changes

#### 9. Documentation

- update the operator runbook with the exact Phase 1 live-save flow
- document expected WhiteBooks sandbox test steps
- document what “success” means in this phase:
  - remote draft save only
- document known limitations so pilot users do not confuse save with filing

#### 10. Phase 1 deliverable definition

Phase 1 is complete when:

- a tenant-scoped authorized user can save an approved GSTR-1 draft to WhiteBooks
- the app clearly shows that the draft is saved remotely but not filed
- the response is auditable and supportable
- live behavior is gated and environment-safe
- no tenant leakage or misleading filing status is possible in this flow

### Phase 1 execution breakdown

#### A. Backend tickets

1. Add normalized provider-stage metadata for live draft-save
   Deliverables:
   - provider-stage convention in filing attempt/event metadata
   - explicit values for:
     - `draft_save_requested`
     - `draft_saved`
     - `draft_save_failed`

2. Persist WhiteBooks live `retsave` response safely
   Deliverables:
   - sanitized response storage in attempt `response_summary`
   - no raw secrets persisted
   - audit event on success and failure

3. Tighten tenant-scoped auth-session lookup
   Deliverables:
   - workspace/client/GSTIN scoped lookup remains enforced
   - tests for cross-tenant denial behavior

4. Add fail-fast config validation for live WhiteBooks save
   Deliverables:
   - clear failure when required env vars are missing
   - actionable operator-facing error message

5. Distinguish live draft-save from final provider filing state
   Deliverables:
   - local filing stays `submitted`
   - provider-stage metadata clarifies draft-save only
   - no automatic transition to `filed`

6. Add admin/support inspection improvements
   Deliverables:
   - auth session, `txn`, latest provider message visible in admin
   - attempt metadata easier to inspect for support

#### B. Frontend tickets

1. Show provider-stage summary in Returns modal
   Deliverables:
   - current WhiteBooks auth session
   - `txn`
   - save result message
   - explicit “not yet filed” state

2. Add live-save specific status label and banner
   Deliverables:
   - display “Draft saved to WhiteBooks”
   - warning banner: GST filing is not complete yet

3. Improve action gating
   Deliverables:
   - disable actions that should not proceed yet
   - show why an action is unavailable
   - reflect feature-flag-disabled state cleanly

4. Improve provider error presentation
   Deliverables:
   - auth failure message
   - missing auth-session message
   - provider save failure message
   - no misleading generic success states

5. Remove ambiguity between sandbox and live-provider states
   Deliverables:
   - sandbox path clearly labeled
   - live draft-save path clearly labeled

#### C. QA and UAT checklist

1. Authorization and tenancy
   Checks:
   - filer role can trigger live save
   - viewer cannot trigger live save
   - another workspace cannot reuse auth session from a different tenant

2. Auth-session flow
   Checks:
   - request OTP works
   - verify OTP works
   - verified auth session is visible in UI
   - missing `txn` is handled correctly

3. Live GSTR-1 save flow
   Checks:
   - approved GSTR-1 can trigger live `retsave`
   - response is captured
   - UI shows “draft saved”
   - UI does not show “filed”

4. Failure handling
   Checks:
   - feature flag off -> action blocked clearly
   - missing env vars -> failure is understandable
   - provider save failure -> recorded in attempt and shown in UI
   - auth failure -> recorded and shown in UI

5. Regression checks
   Checks:
   - sandbox flow still works
   - retry/resync still work in existing non-live paths
   - frontend build and backend tests remain green

#### D. Deployment checklist

1. Environment readiness
   - set `WHITEBOOKS_SANDBOX_MODE=False` only in the intended environment
   - set `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE=True` only where approved
   - verify:
     - `WHITEBOOKS_BASE_URL`
     - `WHITEBOOKS_API_KEY`
     - `WHITEBOOKS_API_SECRET`
     - `WHITEBOOKS_CONTACT_EMAIL`
     - `WHITEBOOKS_GST_USERNAME`
     - `WHITEBOOKS_STATE_CODE`
     - `WHITEBOOKS_IP_ADDRESS`

2. Secret handling
   - rotate previously exposed `client_secret`
   - verify secrets are injected securely
   - verify secrets are not rendered in logs/admin/API responses

3. Release gating
   - deploy backend first
   - verify migrations are not required for this slice unless new schema changes are added later
   - enable live-save flag only after post-deploy validation

4. Smoke tests after deploy
   - create/verify auth session
   - trigger live save for one test GSTIN
   - inspect filing attempt response summary
   - confirm UI shows draft saved but not filed

5. Rollback plan
   - disable `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE`
   - keep sandbox/default filing path available
   - preserve auth-session and filing audit history for diagnosis

## Phase 2: Implement GSTR-1 proceed-to-file

Goal:
- add the next confirmed step after save

Scope:

- implement provider method for `all/newproceedfile`
- map proceed response into internal filing event(s)
- add feature flag:
  - `WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE`
- persist raw proceed response
- add UI state:
  - draft saved
  - proceed complete

Open dependencies:

- real proceed response sample
- expected failure response sample

Acceptance criteria:

- after successful save, system can optionally call proceed-to-file
- raw proceed response is captured
- internal event timeline records save and proceed separately

## Phase 3: Implement GSTR-1 final filing

Goal:
- complete GSTR-1 live filing flow

Scope:

- compute or derive the checksum-based section summaries required for `gstr1/retfile`
- validate our generated payload against Postman contract and any WhiteBooks examples
- implement provider method for `gstr1/retfile`
- persist provider ref / submission reference from actual response
- support status refresh via:
  - `all/newretstatus`
  - `gstr/rettrack`

Required design work:

- checksum computation strategy
- mapping from internal transaction groups to WhiteBooks `sec_sum`
- post-submit state machine

Acceptance criteria:

- approved GSTR-1 return can move through:
  - save
  - proceed
  - file
  - status refresh
- filing lifecycle shows real provider response stages
- final filed state is reached only from actual provider confirmation

## Phase 4: Normalize GSTR-1 statuses and evidence

Goal:
- make GSTR-1 operationally supportable

Scope:

- introduce normalized provider states:
  - `draft_saved`
  - `proceed_completed`
  - `file_requested`
  - `provider_processing`
  - `provider_rejected`
  - `provider_filed`
- add a support evidence summary per attempt
- expose provider response metadata in admin and frontend
- support manual resync of:
  - status
  - ARN
  - reference ID

Acceptance criteria:

- operations team can understand where a filing stopped
- status mismatches can be resynced without DB edits

## Phase 5: Build GSTR-3B save

Goal:
- make GSTR-3B live draft-save reliable

Scope:

- strengthen current mapper for `gstr3b/retsave`
- validate field-level expectations using real samples
- add live feature flag:
  - `WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE`
- persist and display save response

Acceptance criteria:

- approved GSTR-3B can be saved to WhiteBooks live in controlled mode
- responses are auditable and visible

## Phase 6: Add GSTR-3B liability offset support

Goal:
- support the required pre-file offset stage

Scope:

- extend domain model to store:
  - liability ledger ids
  - offset selection/breakup
  - tax head allocation details
- design UI/API for operator-confirmed offset inputs if not fully auto-derived
- implement `gstr3b/retoffset`

Likely schema additions:

- `ReturnFilingOffset`
- `ReturnFilingOffsetLine`
- cached provider ledger snapshots or references

Acceptance criteria:

- system can build a valid offset payload for GSTR-3B
- offset response is persisted and visible

## Phase 7: Implement GSTR-3B final filing and status sync

Goal:
- complete the GSTR-3B live flow

Scope:

- implement `gstr3b/retfile`
- implement `newretstatus` and `rettrack` consumption for GSTR-3B
- normalize ARN / file ref / terminal status handling

Acceptance criteria:

- approved GSTR-3B return can move through save, offset, file, and status sync

## Phase 8: Production hardening

Goal:
- make the WhiteBooks integration operationally safe

Scope:

- feature-flag control per environment
- alerting on auth failures, session limits, and provider submission failures
- background retries only for safe retry classes
- log redaction and secret handling review
- admin support operations:
  - requeue
  - resync
  - inspect auth session
  - inspect provider request/response summaries

Acceptance criteria:

- staging and production have clear operational controls
- no secret material is leaked in audit or response summaries

## 8. Suggested execution order

1. finish GSTR-1 save UX and response handling
2. implement GSTR-1 proceed-to-file
3. model and implement GSTR-1 final file payload
4. add GSTR-1 status sync
5. stabilize support/admin tooling
6. implement GSTR-3B save
7. add GSTR-3B offset data model and flow
8. implement GSTR-3B final file
9. complete production hardening and rollout controls

## 9. Concrete engineering backlog

### Backend

- add provider response serializers for:
  - save
  - proceed
  - file
  - status
  - track
- add normalized status mapper helpers
- add live filing feature flags for each step
- store WhiteBooks operation stage in attempt response summary
- add provider response parsing tests from real samples
- add checksum strategy for GSTR-1 `sec_sum`
- add GSTR-3B offset models and services

### Frontend

- show WhiteBooks auth-session status inline with filing lifecycle
- show:
  - remote draft saved
  - proceed completed
  - final filing requested
  - provider tracking status
- disable actions based on true provider stage, not only local filing status
- expose response messages and support hints for provider failures

### Documentation

- add sample payload catalog for real WhiteBooks success/failure responses
- add runbook for live GSTR-1 sandbox verification
- add production support runbook for stuck filings

## 10. Test plan

### Unit tests

- mapper tests for save payload generation
- client contract tests for path/method/query/header usage
- provider tests for feature-flag behavior
- service tests for state transitions

### Integration tests

- auth-session request + verify flow
- filing start with live GSTR-1 save enabled
- filing failure when auth session is missing
- filing failure when feature flag is disabled
- status resync remains conservative for live mode

### UAT tests

- request OTP from UI
- verify OTP from UI
- save GSTR-1 draft to WhiteBooks
- inspect WhiteBooks draft-save response in UI/admin
- retry after provider failure
- confirm local filing does not falsely move to filed without provider confirmation

## 11. Configuration and rollout controls

Current relevant settings:

- `WHITEBOOKS_SANDBOX_MODE`
- `WHITEBOOKS_BASE_URL`
- `WHITEBOOKS_API_KEY`
- `WHITEBOOKS_API_SECRET`
- `WHITEBOOKS_CONTACT_EMAIL`
- `WHITEBOOKS_GST_USERNAME`
- `WHITEBOOKS_STATE_CODE`
- `WHITEBOOKS_IP_ADDRESS`
- `WHITEBOOKS_TIMEOUT_SECONDS`
- `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE`

Recommended next flags:

- `WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE`
- `WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE`
- `WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE`
- `WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE`
- `WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE`

Recommended rollout:

1. local dev with sandbox credentials
2. staging with sandbox credentials
3. single internal GSTIN for GSTR-1 save only
4. controlled proceed/file pilot
5. GSTR-3B save pilot
6. broader rollout

## 12. Remaining external inputs needed

To complete the full WhiteBooks implementation, the following real samples are still needed:

- `gstr1/retsave` success response
- `all/newproceedfile` success response
- `gstr1/retfile` success response
- `all/newretstatus` success response for GSTR-1
- `gstr/rettrack` success response for GSTR-1
- `gstr3b/retsave` success response
- `gstr3b/retoffset` success response
- `gstr3b/retfile` success response
- status and tracking error responses for both GSTR-1 and GSTR-3B

## 13. Recommended immediate next sprint

The strongest next sprint is:

1. finish frontend visibility for live GSTR-1 save result
2. implement `all/newproceedfile`
3. capture and model the real proceed response
4. design GSTR-1 checksum summary generation for `retfile`
5. add provider-stage aware status display in the Returns UI

## 14. Definition of done for production filing

This integration should be considered production-ready only when:

- WhiteBooks auth flow works reliably in staging and production
- GSTR-1 save, proceed, file, and status sync are complete
- GSTR-3B save, offset, file, and status sync are complete
- each step is audited and observable
- support staff can recover stuck filings without DB intervention
- provider errors are actionable in UI/admin
- filing completion is based on provider confirmation, not local assumptions
- security review confirms no leaked secrets or unsafe persistence
