# Filings API Specification

## 1. Purpose

This document proposes the API surface for production filing workflows.

The API should support:

- readiness evaluation
- filing lifecycle visibility
- submission initiation
- provider status tracking
- retry and resync operations

## 2. Base path

Recommended base path:

- `/api/v1/filings/`

Related return endpoints should continue to live under:

- `/api/v1/returns/`

## 3. Guiding principles

- keep preparation endpoints separate from filing endpoints
- make filing idempotent
- expose lifecycle state clearly
- keep retry and resync explicit administrative/user actions
- provide normalized provider failure messages

## 4. Recommended endpoints

### 4.1 Evaluate readiness

`GET /api/v1/returns/readiness/`

Query params:

- `workspace`
- `client`
- `gstin`
- `compliance_period`

Response shape:

```json
{
  "data": {
    "ready": true,
    "return_types": {
      "gstr1": {
        "ready": true,
        "blocking_issues": [],
        "warnings": []
      },
      "gstr3b": {
        "ready": false,
        "blocking_issues": [
          {
            "code": "approval_pending",
            "message": "Return approval is still pending."
          }
        ],
        "warnings": []
      }
    },
    "evaluated_at": "2026-06-03T12:30:00Z"
  }
}
```

### 4.2 Create or view filing lifecycle

`GET /api/v1/filings/`

Filters:

- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `return_type`
- `status`
- `provider`

`GET /api/v1/filings/{filing_id}/`

Returns:

- filing metadata
- latest status
- ARN
- prepared return reference
- latest attempt summary
- timeline summary

### 4.3 Start filing

`POST /api/v1/filings/start/`

Request:

```json
{
  "workspace": "uuid",
  "client": "uuid",
  "gstin": "uuid",
  "compliance_period": "uuid",
  "prepared_return": "uuid",
  "return_type": "gstr1",
  "provider": "whitebooks",
  "confirmation_note": "Approved for filing"
}
```

Behavior:

- validate permissions
- validate return readiness
- validate approval state
- freeze or confirm prepared snapshot version
- create `ReturnFiling`
- create first `ReturnFilingAttempt`
- enqueue background submission

Response:

```json
{
  "data": {
    "id": "filing_uuid",
    "status": "queued_for_filing",
    "attempt_id": "attempt_uuid"
  },
  "message": "Filing queued"
}
```

### 4.4 Filing timeline

`GET /api/v1/filings/{filing_id}/events/`

Returns append-only event entries for UI timeline and support analysis.

### 4.5 Filing attempts

`GET /api/v1/filings/{filing_id}/attempts/`

Returns attempt history with:

- attempt number
- started/completed timestamps
- provider request reference
- status
- failure summary if applicable

### 4.6 Retry filing

`POST /api/v1/filings/{filing_id}/retry/`

Use only when:

- status is `failed` or `needs_retry`
- user has filing permission
- retry policy allows it

Response:

```json
{
  "data": {
    "id": "filing_uuid",
    "status": "queued_for_filing",
    "attempt_id": "new_attempt_uuid"
  },
  "message": "Retry queued"
}
```

### 4.7 Resync provider status

`POST /api/v1/filings/{filing_id}/resync/`

Use for:

- support operations
- post-timeout recovery
- provider/local drift correction

### 4.8 Cancel filing

`POST /api/v1/filings/{filing_id}/cancel/`

Only allowed before irreversible provider submission.

### 4.9 Filing evidence

`GET /api/v1/filings/{filing_id}/evidence/`

Returns filing evidence metadata and downloadable artifact references.

## 5. Status model

Recommended filing status values:

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

Recommended attempt status values:

- `created`
- `queued`
- `in_progress`
- `submitted_to_provider`
- `awaiting_status`
- `completed`
- `failed`
- `cancelled`

## 6. Permission expectations

Suggested permission split:

- `prepare_return`
- `approve_return`
- `file_return`
- `view_filing`
- `resync_filing`

Suggested behavior:

- standard users can view filings in accessible scope
- only approved roles can start filing
- retry/resync may be restricted to admins or filing operators

## 7. Error shape

Provider failures should be normalized.

Suggested response example:

```json
{
  "message": "WhiteBooks rejected the filing request.",
  "errors": {
    "provider": [
      {
        "code": "payload_validation_failed",
        "detail": "HSN summary is missing."
      }
    ]
  }
}
```

## 8. Background processing contract

The `start` and `retry` endpoints should not block on final provider completion.

They should:

- create records synchronously
- enqueue work asynchronously
- return accepted lifecycle state

Frontend should poll:

- `GET /api/v1/filings/{filing_id}/`

## 9. UI endpoint consumption

Recommended frontend screens:

- filing readiness card
- file return modal
- filing status timeline
- filing attempts table
- ARN summary panel
- provider error panel

## 10. Recommended first implementation cut

Implement first:

- `GET /returns/readiness/`
- `GET /filings/`
- `GET /filings/{id}/`
- `POST /filings/start/`
- `GET /filings/{id}/events/`
- `GET /filings/{id}/attempts/`
- `POST /filings/{id}/retry/`

Leave evidence and cancel for the next pass if needed.
