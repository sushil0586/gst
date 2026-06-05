# Live Release Runbook

## Purpose

Use this runbook before enabling or expanding live provider filing for a tenant.

## Pre-Release Checks

1. Environment flags are correct:
   - `WHITEBOOKS_SANDBOX_MODE`
   - `WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES`
   - `WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE`
   - `WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE`
   - `WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE`
   - `WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE`
   - `WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE`
   - `WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE`
   - `FILING_ENFORCE_TENANT_ROLLOUT`
   - `FILING_ENFORCE_MAKER_CHECKER`
   - `FILING_ALERT_EMAIL_ENABLED`
   - `FILING_SUPPORT_RECOVERY_ROLES`
   - `FILING_DEFAULT_ALERT_RECIPIENT_ROLES`
   - `EMAIL_BACKEND`
   - `DEFAULT_FROM_EMAIL`
   - `APP_FRONTEND_URL`
   Production expectation:
   - `FILING_ENFORCE_TENANT_ROLLOUT=True`
   - `FILING_ENFORCE_MAKER_CHECKER=True`
   - `FILING_ALERT_EMAIL_ENABLED=True` once routing is configured
   - live filing flags enabled only for the exact operations being released
   - `WHITEBOOKS_SANDBOX_MODE=False` only in the intended live environment
   - `APP_FRONTEND_URL` points to the live browser URL used in password-reset emails
2. Provider credentials are present for the target environment.
3. A valid, non-stale provider auth session exists for the target GSTIN.
4. A rollout policy exists for the exact target scope:
   - workspace
   - optional client
   - optional GSTIN
   - provider
   - return type
5. Alert routing policy is understood:
   - either explicit `OperationalAlertRoutingRule` entries exist
   - or the environment default recipient roles are intentionally accepted
6. Password recovery is operational:
   - forgot-password email is delivered
   - reset link lands on the correct frontend URL
   - a changed password can be used immediately to sign in

## Tenant Enablement Checklist

1. Create or confirm workspace members with the right roles:
   - preparer
   - reviewer
   - filer
   - support/recovery operator
2. Confirm maker-checker is enabled if this is a production-like rollout.
3. Confirm the selected tenant appears as `Allowed` for:
   - live submission
   - live status sync
4. Confirm support can see:
   - rollout summary
   - provider evidence
   - operational alerts
   - incident notes
5. Confirm support-role defaults are appropriate for this tenant operating model.

## Dry Run Checklist

1. Prepare the return.
2. Approve the return with a different user if maker-checker is enabled.
3. Start provider filing.
4. Confirm the lifecycle moves through the expected stages for that return type.
5. Resync status until:
   - ARN is captured, or
   - a provider rejection is normalized
6. Confirm audit logs and filing events were recorded.

## Staging UAT Checklist

Run this before any first production release decision:

1. Apply backend migrations on staging:
   - `./venv/bin/python manage.py migrate`
2. Confirm backend configuration is production-safe:
   - `WHITEBOOKS_SSL_VERIFY=True`
   - `FILING_ENFORCE_TENANT_ROLLOUT=True`
   - `FILING_ENFORCE_MAKER_CHECKER=True`
   - `APP_FRONTEND_URL` matches the real staging browser URL
   - `EMAIL_*` values are real and working
3. Run the auth smoke path:
   - login
   - logout
   - change password
   - forgot-password
   - reset-password from the received email
4. Run the customer user-management path:
   - add a workspace member
   - assign the intended role
   - sign in as that member
   - confirm access is limited to the expected workflow
5. Run the notices path:
   - create a notice
   - assign owner
   - set due date
   - update status
6. Run the live-data path:
   - create client
   - create GSTIN
   - create compliance period
   - confirm registers load live data with no mock fallback
7. Run the filing control path:
   - create or verify provider auth session
   - confirm the auth session is fresh
   - prepare return
   - approve return
   - attempt filing only if rollout policy allows it
8. Capture evidence for signoff:
   - screenshots of auth reset flow
   - screenshot of workspace team role assignment
   - screenshot of notice update flow
   - screenshot of filing status and support evidence

## Deploy Check Notes

Before production, run:

1. `./venv/bin/python manage.py check`
2. `./venv/bin/python manage.py check --deploy`

Expected interpretation:

- `SECRET_KEY` warnings during local verification are not relevant if staging/production use strong real secrets
- `drf_spectacular` warnings are schema/documentation quality issues, not known release blockers for runtime behavior
- `WHITEBOOKS_SSL_VERIFY` must stay enabled outside local debugging

## Release Decision

Proceed only if:

1. The filing reached the expected provider stage.
2. Support evidence is visible in the product.
3. Recovery actions are backend-guided.
4. No unresolved critical operational alerts remain for the rollout scope.

## Rollback Procedure

If a live rollout must be stopped:

1. Disable the relevant tenant rollout policy, or
2. disable the environment feature flag for the affected operation
3. stop further live filing starts for the target scope
4. review unresolved confirmation-pending filings
5. create incident notes for any in-flight items that need follow-up

## Post-Release Monitoring

For the first live cycles, review:

1. Operations queue for unresolved filings
2. confirmation-pending filings older than one hour
3. provider failures needing review
4. rollout-control mismatch alerts
5. recent escalated incident notes

## Release Signoff Record

Capture:

- environment
- tenant scope
- enabled return types
- who approved release
- who monitored the first cycle
- any incident notes or evidence packs created during rollout
