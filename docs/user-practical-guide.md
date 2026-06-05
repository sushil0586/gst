# GST Compliance SaaS User Practical Guide

## Purpose

This guide helps a CA, finance user, operations lead, or QA tester use the Phase 1 product end to end without needing developer context.

Use it together with:

- `docs/qa-uat-cases.md`
- `docs/pilot-runbook.md`
- `docs/import-scenario-bundles.md`

## Login And Workspace Setup

There are two practical entry paths:

1. `Self-registration for a new firm`
   - Open the login page
   - Click `Create a new workspace`
   - Create the first owner account, organization, and workspace
2. `Existing workspace onboarding`
   - Ask a workspace owner/admin or platform admin to add you from `Settings -> Team management`
   - Log in with the provided credentials

After login:

1. Log in with a valid account.
2. If the app redirects to onboarding, complete:
   - Workspace
   - Client
   - GSTIN
   - Compliance Period
3. After onboarding, use the topbar selectors to choose:
   - Workspace
   - Client
   - GSTIN
   - Compliance Period

These selectors drive most pages in the app.

## Recommended Test Data Packs

Use the ready-made scenario bundles when you want practical end-to-end test data instead of creating your own files.

Primary reference:

- `docs/import-scenario-bundles.md`

Ready zip bundles:

- `docs/sample-files/zips/01_happy_path_basic.zip`
- `docs/sample-files/zips/02_reconciliation_exceptions.zip`
- `docs/sample-files/zips/03_import_validation_failures.zip`
- `docs/sample-files/zips/04_template_mapping_custom_headers.zip`
- `docs/sample-files/zips/05_filing_metadata_rich.zip`
- `docs/sample-files/zips/06_multi_line_invoice.zip`
- `docs/sample-files/zips/07_wrong_import_type_guardrails.zip`
- `docs/sample-files/zips/08_credit_debit_notes.zip`

## Primary Navigation Map

These pages are directly available from the sidebar:

- `Dashboard`
  - Workspace-wide compliance health
  - Monthly workflow status
  - Close-manager controls
- `Clients`
  - Client register
  - Client drill-down
- `GSTINs`
  - GSTIN portfolio across clients
- `Compliance Periods`
  - Monthly filing cycles
  - Lock and unlock controls
- `Imports`
  - File upload
  - Import templates
  - Import history
  - Import errors
- `2B Reconciliation`
  - Run reconciliation
  - Review exceptions
  - Action mismatch items
- `Returns`
  - Prepare GSTR-1
  - Prepare GSTR-3B
  - Readiness warnings
  - Export return workbooks
- `Approvals`
  - Approval queue
  - Approve, reject, cancel
- `Notices`
  - Live notice register
  - Ownership and due-date tracking
  - Response-status updates
- `Reports`
  - Transaction review
  - Transaction correction
  - Remediation buckets
  - Bulk correction
  - Assignment and follow-up workspace
- `Audit Trail`
  - Workflow event log
  - Export audit logs
- `Settings`
  - Team management
  - Pilot readiness
  - User guide and UAT references

## Secondary Navigation Paths

These routes are important for testing but are reached from data pages rather than the sidebar:

- `Clients -> Open`
  - Client profile page
  - Registered GSTINs
  - Client compliance periods
- `Client profile -> GSTIN workspace`
  - GSTIN register for that client
- `Client period workspace`
  - Reached from the client/period path
  - Shows monthly workflow state for a single client-period combination

## Recommended End-To-End Business Workflow

### 1. Set Up The Filing Context

Use:

- `Clients`
- `GSTINs`
- `Compliance Periods`
- `Settings -> Team management` when you need to onboard a filer, reviewer, or senior CA before business testing

Expected result:

- At least one client exists
- At least one GSTIN exists
- At least one open compliance period exists

### 2. Upload Import Files

Use:

- `Imports`

Actions:

- Upload sales register
- Upload purchase register
- Upload GSTR-2B
- Review invalid imports if any
- Save import template if vendor columns vary

Expected result:

- Import batches move to processed or failed
- Import errors are visible when rows fail
- GST transactions are created for valid rows

### 3. Review And Correct Transactions

Use:

- `Reports`

Actions:

- Filter imported transactions
- Open transaction detail
- Correct metadata like HSN, UQC, quantity, supply category
- Use bulk correction when many rows need the same fix
- Use remediation buckets for readiness gaps

Expected result:

- Transaction metadata is corrected
- Readiness issues reduce after fixes

### 4. Run Purchase Vs 2B Reconciliation

Use:

- `2B Reconciliation`

Actions:

- Create reconciliation run
- Inspect matched, missing, duplicate, and mismatch rows
- Update action status
- Assign or resolve issues as needed

Expected result:

- Reconciliation items are created
- Summary counts are visible
- Open issues are trackable

### 5. Prepare Returns

Use:

- `Returns`

Actions:

- Prepare GSTR-1
- Prepare GSTR-3B
- Review readiness section
- Follow deep links to fix warnings
- Export GSTR-1 and GSTR-3B workbooks

Expected result:

- Draft returns are created
- Readiness clearly shows blocked or warning states
- Workbook exports download successfully

### 6. Approve And Lock

Use:

- `Approvals`
- `Returns`
- `Compliance Periods`

Actions:

- Request approval where needed
- Approve the return
- Mark filed with ARN if available
- Lock the period once filing is final

Expected result:

- Return approval state changes correctly
- Filed periods can be locked
- Locked periods block further mutation flows

### 7. Review Audit And Operations Controls

Use:

- `Audit Trail`
- `Dashboard`
- `Reports`

Actions:

- Verify audit logs were written
- Review close-manager queue
- Review digests, follow-ups, and escalation state
- Export close-manager report if needed

Expected result:

- Operations history is traceable
- Reminder/escalation state is visible

## Page-By-Page Purpose

### Dashboard

Use for:

- compliance health
- current period summary
- workspace close-manager overview
- automation performance

### Clients

Use for:

- creating clients
- opening client profiles
- drilling into client GSTINs and periods

### GSTINs

Use for:

- registration coverage
- state and registration status review

### Compliance Periods

Use for:

- creating monthly periods
- tracking status
- locking and unlocking

### Imports

Use for:

- upload
- template mapping
- import history
- import error review

### Reports

Use for:

- transaction review
- metadata correction
- bulk remediation
- assignment ownership
- follow-up management

### 2B Reconciliation

Use for:

- purchase vs GSTR-2B reconciliation
- mismatch review
- exception actioning

### Returns

Use for:

- draft preparation
- readiness checks
- approval requests
- workbook exports

### Approvals

Use for:

- pending approvals
- approval history
- entity-level approval actions

### Audit Trail

Use for:

- operational traceability
- exportable evidence

### Notices

Current phase:

- live operational register
- useful for assigning ownership, tracking due dates, and recording notice status
- keep detailed legal-response drafting and submission evidence in your operating process

### Settings

Use for:

- onboarding and role assignment
- pilot checklist
- guide and UAT references

### Team Management

Use for:

- adding users into an existing workspace
- assigning roles like `filer` and `senior_ca`
- updating workspace role access
- deactivating workspace access when needed

Recommended role usage:

- `Filer`
  - prepares and files returns
- `Senior CA`
  - prepares, approves, and files returns with audit visibility
- `Reviewer`
  - reviews and approves without filing
- `Accountant`
  - imports, reconciles, and prepares

## Important Testing Notes

- Always confirm the topbar context before testing a workflow.
- Most write flows require:
  - Workspace
  - Client
  - GSTIN
  - Compliance Period
- Locked periods should block:
  - imports
  - reconciliation runs
  - return preparation
  - transaction edits
- Users cannot self-join an existing workspace.
- Existing workspace access should be granted from `Settings -> Team management` or by a platform admin.
- Reconciliation is for purchase vs GSTR-2B, not sales.
- GSTR-1 expects sales-side data.
- GSTR-3B depends on both source transactions and reconciliation state.

## Practical Stop Conditions

You can consider a full user cycle successful when:

- data was imported
- errors were visible where expected
- transactions were reviewed and corrected
- reconciliation was run and actioned
- both returns were prepared
- approvals worked
- filing and lock controls worked
- exports downloaded
- audit trail reflected the workflow
