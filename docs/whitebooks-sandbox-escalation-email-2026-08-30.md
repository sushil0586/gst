# WhiteBooks Sandbox Escalation Email

Date: 2026-08-30

Use this as the support email/ticket body for WhiteBooks. Do not include API secrets, passwords, OTP screenshots, JWTs, or provider transaction IDs unless WhiteBooks explicitly asks for them through a secure channel.

## Subject

WhiteBooks GST sandbox: GSTR-2B gen2b returns WB_ERR_9991 and three enabled test GSTINs return AUTH002

## Email Body

Hello WhiteBooks team,

We are integrating the GST API in our staging environment against the WhiteBooks sandbox and need confirmation on a few sandbox/provider contract items before production rollout.

Our staging public IP is:

```text
16.16.166.34
```

Sandbox evidence captured on 2026-08-30:

1. `GET /public/search` succeeded for sandbox GSTIN lookup.
2. `GET /authentication/otprequest` for GSTIN `33AAGCB1286Q1ZB` and GST username `TN_NT2.152383` returned `txn` in the HTTP response header.
3. `GET /authentication/authtoken` succeeded with the sandbox OTP when using that response-header `txn`.
4. `GET /authentication/logout` succeeded when called with the authenticated `txn`.
5. `PUT /gstr2b/gen2b` returned `WB_ERR_9991` for the tested return periods `012023`, `042024`, `072017`, and `082026`.
6. The other enabled sandbox test accounts shown in the developer portal returned `AUTH002` during OTP request:
   - `27AAGCB1286Q1Z4` / `MH_NT2.1641`
   - `33AAGCB1286Q2ZA` / `TN_NT2.152384`
   - `27AAGCB1286Q2Z3` / `MH_NT2.1642`

Please confirm:

1. Should `PUT /gstr2b/gen2b` work in the sandbox for these accounts?
2. Which exact sandbox GSTIN and return period should we use for a successful GSTR-2B generation/fetch test?
3. Why do three portal-enabled sandbox accounts return `AUTH002` during OTP request?
4. Is `txn` always returned in the HTTP response header for OTP/auth/logout flows?
5. For final filing, should our production integration use `retfile`, or should it use the EVC flow with `otpforevc` and `retevcfile`?
6. For GSTR-1, GSTR-3B, GSTR-7, GSTR-9, and GSTR-9C, which status endpoint should we poll after final filing: `/all/newretstatus`, `/gstr/retstatus`, `/gstr/rettrack`, or `/public/rettrack`?
7. Is logout mandatory or recommended after fetch/file operations to avoid maximum-session errors?

We can share request timestamps, sanitized response bodies, and transaction references through a secure support channel if needed.

Thanks.

## Internal Notes

- Stage currently has the app-side fixes for response-header `txn`, camelCase error fields, `MMYYYY` return periods, and logout support.
- Do not send sandbox/production secrets in email.
- Track WhiteBooks answers back in [whitebooks-provider-confirmation-questions-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-provider-confirmation-questions-2026-08-30.md:1).
