# GSTR-7, GSTR-9, And GSTR-9C WhiteBooks Integration Readiness

## Purpose

This document is the factual readiness checkpoint before starting WhiteBooks integration work for:

- `GSTR-7`
- `GSTR-9`
- `GSTR-9C`

It is intentionally strict:

- no assumptions
- no inferred provider support
- no “probably similar to GSTR-1” shortcuts

We will only proceed on:

- confirmed WhiteBooks contract evidence
- confirmed product scope
- confirmed filing mode

## Provider Evidence Now Available

The WhiteBooks Postman collection you provided is now the primary contract evidence source:

- [WB-GST-API.postman_collection.json](</Users/ansh/Downloads/GST API.postman_collection/WB-GST-API.postman_collection.json>)

This changes the status materially:

- WhiteBooks support is no longer an assumption for `GSTR-7`, `GSTR-9`, and `GSTR-9C`
- provider-backed integration is now evidence-backed at the endpoint-discovery level
- what remains is contract extraction, payload mapping, response normalization, and tenant/UAT validation

## Confirmed From The Postman Collection

## GSTR-7

The collection contains these provider endpoints:

- `PUT /gstr7/retsave`
- `POST /gstr7/retfile`
- `POST /gstr7/retevcfile`
- `GET /gstr7/retsum`
- `GET /gstr7/tds`
- `GET /gstr7/tdschecksum`

Practical implication:

- `GSTR-7` is explicitly supported by WhiteBooks
- this should now move from “pre-filing MVP only” toward provider-backed filing implementation

## GSTR-9

The collection contains these provider endpoints:

- `PUT /gstr9/retsave`
- `POST /gstr9/retfile`
- `POST /gstr9/retevcfile`
- `GET /gstr9/getdet`
- `GET /gstr9/getautocal`
- `POST /gstr9/create8adetails`
- `GET /gstr9/get8adetails`
- `GET /gstr9/getHsndetails`

Practical implication:

- `GSTR-9` is explicitly supported by WhiteBooks
- provider-backed annual filing is feasible in principle
- but the product can still choose to keep initial rollout manual if that is commercially safer

## GSTR-9C

The collection contains these provider endpoints:

- `POST /gstr9c/retfile`
- `POST /gstr9c/genhash`
- `POST /gstr9c/gencert`

Practical implication:

- `GSTR-9C` is explicitly supported by WhiteBooks
- the contract appears certification-oriented and materially heavier than `GSTR-7` or `GSTR-9`
- this should not be implemented by analogy; it needs exact payload mapping from the provider samples

## Current Truth

## GSTR-7

Current product status:

- import is implemented
- readiness is implemented
- prepare is implemented
- review page is implemented
- export is implemented
- approvals and operations review routing is implemented

Current filing status:

- first WhiteBooks live draft-save slice is implemented
- provider auth is now required for WhiteBooks-backed `GSTR-7` filing start
- final WhiteBooks filing request is implemented only when an explicit provider-ready file payload is attached and the live file flag is enabled

Current safe statement:

- `GSTR-7` is ready for internal review/export workflow testing
- `GSTR-7` now supports a guarded WhiteBooks live draft-save slice
- `GSTR-7` now supports a guarded WhiteBooks final file request only when an explicit provider-ready file payload is attached
- `GSTR-7` is still **not** fully auto-mapped end to end from the native TDS snapshot alone

## GSTR-9

Current product status:

- prepare is implemented
- annual readiness is implemented
- review page is implemented
- export is implemented
- approvals and operations review routing is implemented
- manual filing tracking is implemented

Current filing status:

- operational/manual filing flow exists
- first WhiteBooks live draft-save slice is now implemented behind explicit enablement and explicit provider-ready save payload attachment
- final WhiteBooks filing request is now implemented only when an explicit provider-ready annual retfile payload is attached and the live file flag is enabled

Current safe statement:

- `GSTR-9` is near MVP completion for internal annual workflow
- `GSTR-9` now supports a guarded WhiteBooks live draft-save slice when an explicit provider-ready annual save payload is attached
- `GSTR-9` also supports a guarded final WhiteBooks filing request when an explicit provider-ready annual retfile payload is attached
- `GSTR-9` is still **not** fully auto-mapped end to end from the native annual snapshot alone

## GSTR-9C

Current product status:

- prepare is implemented
- dependency on `GSTR-9` is implemented
- readiness is implemented
- review page is implemented
- approvals and operations review routing is implemented
- manual filing tracking is implemented

Current filing status:

- operational/manual filing flow exists
- first WhiteBooks live draft-save slice is now implemented behind explicit enablement and explicit provider-ready save payload attachment
- final WhiteBooks filing request is now implemented only when an explicit provider-ready certification retfile payload is attached and the live file flag is enabled

Current safe statement:

- `GSTR-9C` has a usable MVP annual comparison workflow
- `GSTR-9C` now supports a guarded WhiteBooks live draft-save slice when an explicit provider-ready certification save payload is attached
- `GSTR-9C` also supports a guarded final WhiteBooks filing request when an explicit provider-ready certification retfile payload is attached
- `GSTR-9C` is still **not** fully auto-mapped end to end from the native comparison snapshot alone, and `genhash` / `gencert` are not yet automated

## Implementation Matrix

| Area | GSTR-7 | GSTR-9 | GSTR-9C |
|---|---|---|---|
| Import | Implemented | Not applicable as direct monthly import flow | Not applicable as direct monthly import flow |
| Prepare | Implemented | Implemented | Implemented |
| Readiness | Implemented | Implemented | Implemented |
| Review UI | Implemented | Implemented | Implemented |
| Export | Implemented | Implemented | Not implemented as a dedicated export path |
| Approvals / Operations review routing | Implemented | Implemented | Implemented |
| Manual filing tracking | Not implemented | Implemented | Implemented |
| WhiteBooks support evidenced by Postman collection | Yes | Yes | Yes |
| WhiteBooks filing contract implemented in product | Partial: live draft save plus explicit-payload final file request | Partial: live draft save plus explicit-payload final file request | Partial: live draft save plus explicit-payload final file request |
| Sandbox/UAT proof with WhiteBooks | Not available | Not available | Not available |

## What Is Missing Before WhiteBooks Integration Starts

We no longer need support confirmation. We now need exact implementation-scoping inputs and usable validation context.

## Mandatory Inputs Needed From Your Side Before We Start

### 1. Priority order

Please confirm the build order you want.

Recommended order:

- `GSTR-7` first
- `GSTR-9` second
- `GSTR-9C` third

Reason:

- `GSTR-7` has a clearer monthly operational demand
- `GSTR-9` is simpler than `GSTR-9C`
- `GSTR-9C` appears much heavier and certification-oriented

### 2. Product decision for each return type

For each return type, confirm whether you want:

- `manual filing only`
- `provider-backed filing`

Current recommendation:

- `GSTR-7`: provider-backed filing
- `GSTR-9`: manual first, provider-backed later unless you want to push now
- `GSTR-9C`: manual first unless there is a strong customer/partner requirement now

### 3. UAT / tenant validation context

If provider-backed filing is desired, I need:

- base URL confirmation for the target environment
- usable WhiteBooks UAT or sandbox context
- test GSTIN(s)
- credentials / auth-flow access if applicable
- confirmation whether OTP/auth applies to these returns the same way as monthly filings

### 4. EVC scope decision

Please confirm whether `retevcfile` is:

- in scope now
- or deferred for a later filing phase

Recommendation:

- defer EVC initially
- implement the standard file path first
- add EVC only after the base filing flow is stable

### 5. Tenant-specific deviations, if any

Please share them only if they exist:

- any tenant-specific instructions from WhiteBooks
- any note that certain endpoints are disabled for your tenant
- any note that annual returns use a different sequence than the samples imply

## What We No Longer Need Before Starting

- generic provider support confirmation for `GSTR-7`, `GSTR-9`, or `GSTR-9C`
- inferred endpoint discovery for these return types
- guessed filing sequences by analogy with `GSTR-1`

## Related Contract Document

For the exact runtime payload keys and feature-flag behavior now used by the product, see:

- [gstr7-gstr9-gstr9c-whitebooks-payload-attachment-contract.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-gstr9-gstr9c-whitebooks-payload-attachment-contract.md:1)

We do **not** need any more generic support confirmation for:

- `GSTR-7`
- `GSTR-9`
- `GSTR-9C`

The Postman collection already establishes that those return families exist in WhiteBooks.

## Safe Start Recommendation

If you want the lowest-risk actual path, we should start like this:

1. Implement `GSTR-7` WhiteBooks integration first
2. Keep `GSTR-9` and `GSTR-9C` manual until `GSTR-7` proves out
3. Then integrate `GSTR-9`
4. Then integrate `GSTR-9C` only after we review the heavier payload/certificate requirements carefully

Why this is the safest route:

- it follows real customer pull
- it keeps first provider expansion monthly and narrower
- it avoids jumping straight into the heaviest annual certification contract

## What I Need From You Right Now

Please give me these exact answers before I start integration work:

1. Confirm priority order:
   - do we start with `GSTR-7` first?

2. Confirm product mode for each:
   - `GSTR-7`: manual or provider-backed?
   - `GSTR-9`: manual or provider-backed?
   - `GSTR-9C`: manual or provider-backed?

3. Share usable environment details if provider-backed work should start now:
   - base URL
   - UAT/sandbox GSTIN
   - auth access details if needed

4. Confirm EVC scope:
   - include now
   - or defer

Once you confirm those, I can start the first actual WhiteBooks integration slice without assuming anything.

4. If provider-backed:
   - UAT/Postman collection or official docs for those exact return types
   - test access details if available

## Recommended Next Order

To stay practical and avoid waste:

1. confirm WhiteBooks support for `GSTR-7`
2. if supported, start `GSTR-7` WhiteBooks integration first
3. keep `GSTR-9` and `GSTR-9C` manual unless WhiteBooks explicitly supports and customers truly need provider-backed filing

Reason:

- `GSTR-7` has stronger monthly customer demand
- `GSTR-9` and `GSTR-9C` already have usable manual workflows
- annual provider integration should not be built on guesswork

## Safe Conclusion Today

Today we can say:

- `GSTR-7`, `GSTR-9`, and `GSTR-9C` have meaningful in-product workflow coverage
- none of them has confirmed end-to-end WhiteBooks filing integration yet
- we should not start WhiteBooks integration for these returns until actual provider evidence is provided

## Trigger To Start WhiteBooks Work

We should start only after:

- provider support is confirmed
- exact contract samples are available
- you confirm which return type to prioritize first

Until then, the correct next state is:

- `ready for contract intake`
- not `ready for provider implementation`
