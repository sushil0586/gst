# Filing Incident Runbook

## Purpose

Use this runbook when a live filing enters an uncertain, failed, or escalated state and support needs a repeatable response path.

## Before You Start

Confirm all of the following:

1. The filing context is correct:
   - workspace
   - client
   - GSTIN
   - compliance period
   - return type
2. You have a support-capable workspace role:
   - `reviewer`
   - `manager`
   - `admin`
   - `owner`
   - `senior_ca`
   This default set is controlled by `FILING_SUPPORT_RECOVERY_ROLES`.
3. Tenant rollout policy state is visible in Returns or Operations.
4. The latest provider evidence snapshot and intervention history are visible.

## Primary Triage Sequence

1. Open the filing from `Operations`.
2. Review:
   - support status summary
   - provider evidence snapshot
   - operational alerts
   - recent incident notes
   - tenant rollout summary
3. Identify whether the filing is:
   - confirmation-pending
   - retryable
   - provider-rejected
   - rollout-blocked
   - stale due to missing recent status sync

## Standard Responses

### Confirmation-Pending

Use when:
- provider stage is `file_requested`
- backend recommends `resync_status`
- ARN is not yet synced

Actions:
1. Add an incident note if no support note exists yet.
2. Use `Resync status`.
3. If uncertainty remains and escalation is needed, use `Escalate alerts`.
4. Do not mark the filing complete manually unless a verified ARN or terminal status exists.

### Retryable Failure

Use when:
- filing status is `needs_retry`
- backend recommends `retry_filing`

Actions:
1. Review latest provider failure details.
2. Add an incident note if the reason needs human context.
3. Use `Retry filing`.
4. If the same issue repeats, escalate instead of looping retries.

### Provider Rejection

Use when:
- filing status is `failed`
- backend recommends `review_provider_error`

Actions:
1. Review `latest_failure`, `status_response`, and `track_response`.
2. Record an incident note with the rejection reason.
3. If support confirms a replay is safe, use `Requeue after review`.
4. If the rejection needs broader ownership, use `Escalate alerts`.

### Rollout-Control Block

Use when:
- backend recommends `review_rollout_controls`

Actions:
1. Review tenant rollout summary.
2. Confirm whether submission or status sync is blocked.
3. Do not retry or requeue until rollout policy is corrected.
4. Add an incident note if the issue affects a live customer filing window.

## Escalation Workflow

Use `Escalate alerts` when:
- a filing is uncertain for too long
- provider rejection needs cross-functional review
- rollout-control mismatch needs admin action
- repeated retries/resyncs are not clearing the issue

Expected result:
- a new filing incident note is created
- routed recipients are captured in incident-note metadata
- audit/event trail records the escalation
- email delivery occurs if `FILING_ALERT_EMAIL_ENABLED=True`
- if no explicit routing rule matches, recipients fall back to `FILING_DEFAULT_ALERT_RECIPIENT_ROLES`

## Evidence Pack Export

Export a filing evidence pack when:
- a live incident needs audit handoff
- support needs to share a traceable package with operations/compliance
- a filing is escalated outside the product workflow

Endpoint:
- `GET /api/v1/exports/filing-evidence-pack/?workspace=...&client=...&filing=...`

Expected contents:
- filing summary
- support summary
- rollout policy
- latest attempt
- provider evidence
- support actions
- operational alerts
- incident notes
- interventions
- audit trail

## Incident Closure

Close an incident note only when:

1. ARN is confirmed, or
2. provider rejection has been reviewed and final action is complete, or
3. rollout or support follow-up has been resolved and documented

When closing:
- resolve the incident note
- ensure the final intervention is in the event trail
- export evidence if the case needed formal handoff

## Things Support Should Not Do

- do not mark a confirmation-pending filing as filed without verified terminal evidence
- do not use requeue-after-review without comments
- do not bypass rollout-control blocks with manual assumptions
- do not let a repeated provider failure loop indefinitely without escalation
