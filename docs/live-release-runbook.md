# Live Release Runbook

## Purpose

Use this runbook before enabling or expanding live provider filing for a tenant.

## Pre-Release Checks

1. Environment flags are correct:
   - `WHITEBOOKS_SANDBOX_MODE`
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
2. Provider credentials are present for the target environment.
3. A valid provider auth session exists for the target GSTIN.
4. A rollout policy exists for the exact target scope:
   - workspace
   - optional client
   - optional GSTIN
   - provider
   - return type
5. Alert routing policy is understood:
   - either explicit `OperationalAlertRoutingRule` entries exist
   - or the environment default recipient roles are intentionally accepted

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
