# Filings Schema Plan

## 1. Purpose

This document defines the proposed database design for production-grade return filing, building on the current `ReturnPreparation` model in [apps/returns/models.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/models.py:1).

The schema goal is to separate:

- return preparation
- filing lifecycle
- provider submission attempts
- append-only filing event history

## 2. Current model baseline

Current return preparation already stores:

- `compliance_period`
- `return_type`
- `status`
- `summary_snapshot`
- `prepared_by`
- `approved_by`
- `filed_by`
- `filed_at`
- `arn`

This is sufficient for pilot workflows, but too compressed for production filing because it mixes:

- business preparation state
- provider execution state
- final filing evidence

## 3. Design principles

- keep `ReturnPreparation` focused on preparation and business review
- store external submission lifecycle separately
- support multiple filing attempts for one prepared return snapshot
- preserve an immutable audit trail
- make provider retries and status resync possible without mutating history away

## 4. Proposed new app

Recommended app:

- `apps/filings`

Recommended models:

- `ReturnFiling`
- `ReturnFilingAttempt`
- `ReturnFilingEvent`

Optional later:

- `FilingProviderCredential`
- `FilingStatusSyncJob`
- `FilingEvidenceArtifact`

## 5. ReturnFiling

### Purpose

Represents one filing lifecycle for one approved prepared return snapshot.

### Proposed fields

- `id`
- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `prepared_return`
- `prepared_snapshot_version`
- `return_type`
- `provider`
- `status`
- `approval_request`
- `arn`
- `provider_reference_id`
- `provider_acknowledgement_id`
- `readiness_snapshot`
- `error_summary`
- `submitted_at`
- `arn_received_at`
- `filed_at`
- `last_status_sync_at`
- `created_by`
- `updated_by`
- `approved_by`
- `filed_by`
- `is_active`

### Notes

- `prepared_snapshot_version` should point to an immutable return payload basis. If versioning is not yet present in `returns`, this field should still be reserved now.
- `approval_request` should optionally reference the approval used to authorize filing.
- `readiness_snapshot` should capture the exact checks that passed when filing was allowed.

### Suggested enums

`provider`

- `whitebooks`

`status`

- `draft`
- `ready_for_review`
- `approved`
- `queued_for_filing`
- `submitted`
- `arn_received`
- `filed`
- `failed`
- `needs_retry`
- `cancelled`

### Suggested constraints

- unique active filing per `prepared_return` and `prepared_snapshot_version`
- optional unique ARN when present

### Suggested indexes

- `workspace`, `status`
- `client`, `status`
- `gstin`, `status`
- `compliance_period`, `status`
- `provider`, `status`
- `arn`
- `provider_reference_id`

## 6. ReturnFilingAttempt

### Purpose

Represents one concrete provider interaction attempt for a filing.

### Proposed fields

- `id`
- `return_filing`
- `attempt_number`
- `status`
- `provider_request_id`
- `idempotency_key`
- `request_payload_hash`
- `request_summary`
- `response_summary`
- `failure_code`
- `failure_message`
- `provider_status_raw`
- `started_at`
- `submitted_at`
- `completed_at`
- `triggered_by`
- `created_by`
- `updated_by`
- `is_active`

### Suggested enums

- `created`
- `queued`
- `in_progress`
- `submitted_to_provider`
- `awaiting_status`
- `completed`
- `failed`
- `cancelled`

### Notes

- `request_payload_hash` helps identify duplicate submission attempts without storing the full payload directly in the model.
- `idempotency_key` should be generated from filing identity plus snapshot version plus attempt semantics.
- `request_summary` and `response_summary` should be sanitized JSON, not raw secret-bearing payloads.

### Suggested constraints

- unique `return_filing` + `attempt_number`
- unique non-null `provider_request_id` when provider guarantees uniqueness

### Suggested indexes

- `return_filing`, `attempt_number`
- `status`
- `provider_request_id`
- `started_at`
- `completed_at`

## 7. ReturnFilingEvent

### Purpose

Append-only event log for filing state transitions and operator/provider events.

### Proposed fields

- `id`
- `return_filing`
- `filing_attempt`
- `event_type`
- `old_status`
- `new_status`
- `actor`
- `metadata`
- `created_at`

### Suggested event types

- `filing.created`
- `filing.approved`
- `filing.queued`
- `filing.submission_started`
- `filing.submitted`
- `filing.arn_received`
- `filing.status_synced`
- `filing.completed`
- `filing.failed`
- `filing.retry_requested`
- `filing.retry_started`
- `filing.cancelled`
- `filing.resync_requested`
- `filing.resync_completed`

### Suggested indexes

- `return_filing`, `created_at`
- `filing_attempt`, `created_at`
- `event_type`, `created_at`

## 8. ReturnPreparation changes

`ReturnPreparation` should remain the business preparation aggregate, but a few changes are recommended.

### Additions

- `snapshot_version`
- `snapshot_locked_at`
- `snapshot_locked_by`
- `readiness_snapshot`
- `last_readiness_evaluated_at`

### Recommended rule changes

- `arn` should eventually be treated as a convenience mirror or deprecated field, with the filing record being the source of truth
- `filed_at` and `filed_by` should either be mirrored from `ReturnFiling` or phased out as direct source-of-truth fields

## 9. Approval model usage

Current approvals are generic and can work for filing v1.

Recommended linkage:

- keep `ApprovalRequest` for the approval workflow
- optionally store the filing-authorizing approval in `ReturnFiling.approval_request`

If maker-checker becomes more complex later, a dedicated filing approval model can be added without blocking v1.

## 10. Provider configuration options

For v1, provider credentials can remain environment-backed.

If per-tenant or per-workspace provider credentials are required, add:

- `FilingProviderCredential`

Proposed fields:

- `workspace`
- `provider`
- `environment`
- `credential_label`
- `is_default`
- `status`
- `last_verified_at`

Sensitive values should not be stored in plain text in application tables.

## 11. Migration order

Recommended migration order:

1. create `apps/filings`
2. add `ReturnFiling`
3. add `ReturnFilingAttempt`
4. add `ReturnFilingEvent`
5. add optional `ReturnPreparation` support fields
6. backfill filing mirrors only if needed

## 12. Example relationships

```text
CompliancePeriod
  └── ReturnPreparation
        └── ReturnFiling
              ├── ReturnFilingAttempt
              └── ReturnFilingEvent
```

## 13. Source of truth guidance

- Preparation truth: `ReturnPreparation`
- Filing truth: `ReturnFiling`
- Attempt truth: `ReturnFilingAttempt`
- Historical audit truth: `ReturnFilingEvent`

## 14. Recommended first implementation cut

For the first build phase, implement only:

- `ReturnFiling`
- `ReturnFilingAttempt`
- `ReturnFilingEvent`
- minimal `ReturnPreparation` snapshot support fields if needed

That is enough to start the WhiteBooks sandbox integration safely.
