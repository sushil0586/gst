# Customer Operational Follow-up MVP

## Purpose

Build a CA- and customer-operations-friendly follow-up system that is linked to actual GST execution scope:

- client
- GSTIN
- compliance period
- return preparation
- return filing
- notice

This is intentionally **not** a generic CRM module. It should help a CA firm answer:

- Which returns are pending because of the customer?
- Which GSTINs need customer follow-up today?
- What exactly is blocked, and who is it pending with?
- Which customer should be called right now, and why?

## Current Gap

Today the codebase has:

- `Client` with only `legal_name`, `trade_name`, `client_code`, `pan`, and `email`
- strong internal transaction-remediation follow-up in `apps/gst_transactions`
- returns, filings, and notices that already map operational work

But it does **not** have:

- customer mobile/contact master
- operational follow-up linked to return/GSTIN/period
- return-status register for CA/customer management
- a clean "pending from customer" workflow

## Existing Models Relevant To This MVP

- `Client` in [apps/clients/models.py](/Users/ansh/Documents/Gst-Compliance/apps/clients/models.py:1)
- `ReturnPreparation` in [apps/returns/models.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/models.py:1)
- `ReturnFiling` and `WhiteBooksAuthSession` in [apps/filings/models.py](/Users/ansh/Documents/Gst-Compliance/apps/filings/models.py:1)
- `Notice` in [apps/notices/models.py](/Users/ansh/Documents/Gst-Compliance/apps/notices/models.py:1)
- current internal follow-up/reporting patterns in:
  - [apps/gst_transactions/models.py](/Users/ansh/Documents/Gst-Compliance/apps/gst_transactions/models.py:150)
  - [gst-compliance-frontend/src/app/(dashboard)/reports/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/reports/page.tsx:1)

## MVP Scope

The MVP should deliver three user-facing capabilities:

1. Customer contact master
2. Operational follow-up register
3. Return status register

## Product Rules

### Rule 1: Operational, Not CRM

Every follow-up must be anchored to real compliance work.

Allowed anchors:

- client only for broad customer coordination
- client + GSTIN
- client + GSTIN + compliance period
- return preparation
- return filing
- notice

Preferred rule for validation:

- `client` is required
- at least one of `gstin`, `compliance_period`, `return_preparation`, `return_filing`, or `notice` should be present

### Rule 2: Separate "Pending With" From "Status"

`pending_with` answers *who needs to act next*.

`status` answers *what stage the follow-up itself is in*.

This separation will make reporting much clearer.

### Rule 3: Customer Contact Must Be Reusable

Contacts should be defined once and then linked into follow-up records.

Do not force users to retype mobile/email for every reminder item.

## New Backend Models

### 1. ClientContact

Suggested app placement:

- `apps/clients/models.py`

Suggested fields:

- `client` FK to `Client`
- `name`
- `designation`
- `mobile_number`
- `alternate_mobile_number`
- `email`
- `is_primary`
- `preferred_contact_mode`
- `notes`
- `is_active`

Suggested choices for `preferred_contact_mode`:

- `call`
- `whatsapp`
- `email`
- `sms`

Suggested indexes:

- `(client, is_primary)`
- `(mobile_number)`
- `(email)`

Suggested constraints:

- at most one active primary contact per client

### 2. OperationalFollowUp

Suggested app placement:

- new app: `apps/customer_operations`

Reason:

- this keeps customer/CA workflow separate from transaction-remediation internals
- it gives us room later for reminders, escalations, and management reports

Suggested fields:

- `workspace` FK
- `client` FK
- `gstin` FK nullable
- `compliance_period` FK nullable
- `return_preparation` FK nullable
- `return_filing` FK nullable
- `notice` FK nullable
- `contact` FK to `ClientContact`, nullable
- `contact_name_snapshot`
- `mobile_number_snapshot`
- `email_snapshot`
- `follow_up_type`
- `reason`
- `pending_with`
- `status`
- `priority`
- `title`
- `notes`
- `next_action`
- `due_at`
- `completed_at`
- `last_contacted_at`
- `assigned_to` FK user nullable
- `completed_by` FK user nullable
- `escalated_at`
- `closed_reason`

Suggested `follow_up_type` choices:

- `data_request`
- `approval_request`
- `otp_coordination`
- `payment_confirmation`
- `notice_document_request`
- `return_filing_confirmation`
- `mismatch_resolution`
- `general`

Suggested `pending_with` choices:

- `customer`
- `ca_team`
- `reviewer`
- `provider`
- `government_portal`

Suggested `status` choices:

- `open`
- `in_progress`
- `waiting`
- `completed`
- `cancelled`
- `escalated`

Suggested `priority` choices:

- `low`
- `medium`
- `high`
- `critical`

Suggested indexes:

- `(workspace, status)`
- `(workspace, pending_with)`
- `(client, status)`
- `(gstin, status)`
- `(compliance_period, status)`
- `(assigned_to, status)`
- `(due_at)`
- `(priority, status)`

Suggested validation rules:

- `client` must belong to `workspace`
- if `gstin` is provided, it must belong to `client`
- if `compliance_period` is provided, it must belong to `gstin`
- if `return_preparation` is provided, it must belong to `compliance_period`
- if `return_filing` is provided, it must belong to the same client/GSTIN/period
- if `notice` is provided, it must belong to the same GSTIN

### Why snapshot fields?

Keep:

- `contact_name_snapshot`
- `mobile_number_snapshot`
- `email_snapshot`

This protects the follow-up history if a contact record changes later.

## Derived Reporting Layer

We should not create a separate "return status" table in MVP.

Instead, derive it from:

- `CompliancePeriod`
- `ReturnPreparation`
- `ReturnFiling`
- `OperationalFollowUp`
- `Notice`

### Return Status Register should show

Per client/GSTIN/period/return:

- workspace
- client
- GSTIN
- period
- return type
- due date
- preparation status
- filing status
- ARN
- filed date
- owner
- blocker reason
- pending with
- open follow-up count
- overdue follow-up count
- latest follow-up title

### Pending-from-customer logic

Suggested derived rule for MVP:

A return row is considered `pending_with=customer` if:

- there is at least one open operational follow-up for that row with `pending_with=customer`, or
- there is a blocking condition explicitly marked customer-dependent

## API Design

### Client Contacts

Suggested endpoints:

- `GET /api/v1/client-contacts/`
- `POST /api/v1/client-contacts/`
- `GET /api/v1/client-contacts/{id}/`
- `PATCH /api/v1/client-contacts/{id}/`
- `DELETE /api/v1/client-contacts/{id}/`

Filters:

- `workspace`
- `client`
- `is_primary`
- `is_active`

### Operational Follow-ups

Suggested endpoints:

- `GET /api/v1/operational-follow-ups/`
- `POST /api/v1/operational-follow-ups/`
- `GET /api/v1/operational-follow-ups/{id}/`
- `PATCH /api/v1/operational-follow-ups/{id}/`
- `DELETE /api/v1/operational-follow-ups/{id}/`

Suggested actions:

- `POST /api/v1/operational-follow-ups/{id}/mark-completed/`
- `POST /api/v1/operational-follow-ups/{id}/mark-escalated/`
- `POST /api/v1/operational-follow-ups/{id}/log-contact/`

Filters:

- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `return_type`
- `return_preparation`
- `return_filing`
- `notice`
- `status`
- `pending_with`
- `priority`
- `assigned_to`
- `overdue_only`

### Return Status Register

Suggested endpoint:

- `GET /api/v1/return-status-register/`

Filters:

- `workspace`
- `client`
- `gstin`
- `compliance_period`
- `return_type`
- `pending_with`
- `status_bucket`
- `overdue_only`

Export:

- `GET /api/v1/exports/return-status-register/`
- `GET /api/v1/exports/operational-follow-ups/`

## Frontend MVP Pages

### 1. Client Contacts

Suggested route:

- `/clients/[clientId]/contacts`

Purpose:

- maintain customer contacts for a client

Columns:

- name
- designation
- mobile
- alternate mobile
- email
- preferred mode
- primary
- active

Actions:

- add contact
- edit contact
- set primary
- deactivate

### 2. Operational Follow-up Register

Suggested route:

- `/operations/follow-ups`

Purpose:

- daily CA work queue for customer coordination

Filters:

- workspace
- client
- GSTIN
- period
- pending with
- status
- assigned to
- priority
- overdue only

Columns:

- client
- GSTIN
- period
- linked item
- title
- follow-up type
- pending with
- due at
- contact
- mobile
- assigned to
- status
- priority

Actions:

- create follow-up
- edit
- mark completed
- escalate
- log contact

### 3. Return Status Register

Suggested route:

- `/reports/return-status`

Purpose:

- CA management overview of actual filing progress

Filters:

- workspace
- client
- GSTIN
- period
- return type
- pending with
- overdue only

Columns:

- client
- GSTIN
- period
- return type
- due date
- return stage
- pending with
- blocker
- owner
- open follow-ups
- overdue follow-ups
- ARN

Row quick actions:

- open return
- create follow-up
- open filing operations
- open notices

## Reuse Opportunities

The existing transaction-remediation follow-up flow already gives us useful patterns:

- assignee
- due date
- status
- reminder lifecycle
- follow-up queue cards

We should reuse:

- UI patterns from [reports/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/reports/page.tsx:1709)
- API style from `apps/gst_transactions`
- reminder-status concepts where appropriate

But we should keep this new flow separate from transaction remediation because:

- the audience is broader
- the anchor is return/GSTIN/period, not transaction assignments
- the language must stay customer-operations friendly

## Permissions

Recommended permission mapping:

- owners/admins/managers:
  - full create/update/close/escalate
- accountants/reviewers/filers:
  - create and update follow-ups within workspace scope
- viewers:
  - read-only

Suggested permissions:

- `view_operational_follow_up`
- `manage_operational_follow_up`
- `export_operational_follow_up`

## Audit Logging

Every follow-up change should write audit logs for:

- created
- updated
- completed
- escalated
- contact logged
- deleted

Actions to record:

- `operational_follow_up.created`
- `operational_follow_up.updated`
- `operational_follow_up.completed`
- `operational_follow_up.escalated`
- `operational_follow_up.contact_logged`
- `operational_follow_up.deleted`

## MVP Delivery Order

### Slice 1

- add `ClientContact` model
- serializers, viewset, tests
- client contact UI

### Slice 2

- add `OperationalFollowUp` model
- serializers, viewset, tests
- operations follow-up register UI

### Slice 3

- add derived return-status register API
- add return-status register UI

### Slice 4

- add exports for:
  - follow-up register
  - return status register

### Slice 5

- add quick actions from:
  - returns page
  - operations page
  - notices page

## Non-MVP Items

Do not include in the first cut:

- SMS integration
- WhatsApp integration
- customer portal
- auto-calling
- complex workflow rules
- multi-contact approval chains

Those can come later after users validate the operational flow.

## Recommended First Build

If we want the fastest business value, start with:

1. `ClientContact`
2. `OperationalFollowUp`
3. `/operations/follow-ups`
4. `/reports/return-status`

That will give real CAs a usable daily system without overbuilding.
