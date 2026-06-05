# GST Compliance Live UAT End-to-End Pack

## Purpose

This pack gives one practical UAT flow for a CA firm or operations team using the existing sample bundles in `docs/sample-files/`.

Use it when you want to answer:

- can a real workspace be set up and used without admin intervention?
- can data be imported, reviewed, reconciled, and converted into prepared returns?
- can customer follow-ups, notices, approvals, and audit visibility be managed in the same operating cycle?
- are the main production-facing workflows stable enough for customer onboarding?

This pack is designed to cover most live scenarios with the files you already have, without inventing new test data.

## Recommended Test Scope

Run this pack in staging or a production-like UAT environment where:

- backend and frontend are deployed
- migrations are applied
- mail settings are real if forgot-password is part of UAT
- rollout and maker-checker flags are set as intended
- no demo fallback should appear in core live registers

## Required Sample Bundles

Use these existing bundles:

1. `docs/sample-files/scenario-bundles/01_happy_path_basic/`
2. `docs/sample-files/scenario-bundles/02_reconciliation_exceptions/`
3. `docs/sample-files/scenario-bundles/03_import_validation_failures/`
4. `docs/sample-files/scenario-bundles/04_template_mapping_custom_headers/`
5. `docs/sample-files/scenario-bundles/08_credit_debit_notes/`
6. `docs/sample-files/scenario-bundles/09_portal_ready_filing_bundle/`

## Suggested UAT Actors

- `Workspace Owner`
  - creates the workspace or manages setup
  - adds users
  - can see end-to-end state
- `Filer`
  - imports, reconciles, prepares returns
- `Senior CA`
  - reviews approvals, notices, and filing readiness

## Suggested UAT Workspace Setup

Create or use:

- one workspace
- one main client
- one GSTIN
- one compliance period for the primary happy-path cycle
- optionally a second period if you want to isolate exception bundles from the clean happy path

Recommended naming:

- client: `UAT Client Private Limited`
- GSTIN: use any valid test GSTIN accepted by your current setup
- period 1: `2026-05`
- period 2: `2026-06`

## Result Capture Template

Record every case as:

- `Pass`
- `Pass with note`
- `Fail`
- `Blocked`

For each failure capture:

- exact page
- user role
- sample file used
- actual result
- expected result
- screenshot or short screen recording

## End-to-End UAT Flow

### Phase 1: Access And Workspace Control

#### UAT-E2E-001 Login And Dashboard Access

Steps:

1. Log in as workspace owner.
2. Confirm dashboard loads.
3. Confirm topbar workspace, client, GSTIN, and period selectors are usable.

Expected:

- login succeeds
- dashboard loads without demo fallback
- sidebar navigation works

#### UAT-E2E-002 Forgot Password And Reset Password

Steps:

1. Open forgot-password.
2. request reset for a valid user
3. open the reset link from email
4. set a new password
5. log in with the new password

Expected:

- reset email is delivered
- reset link opens correct frontend URL
- password changes successfully
- user can log in with the new password immediately

#### UAT-E2E-003 Team Management

Steps:

1. Open `Settings -> Team management`.
2. Add a `Filer`.
3. Add a `Senior CA`.
4. Edit one member role if needed.
5. Log in as the new filer.
6. Log in as the new senior CA in a separate session if available.

Expected:

- members are created successfully
- role labels are correct
- filer can access operating screens
- senior CA can access review-ready screens

### Phase 2: Master Data And Customer Coordination

#### UAT-E2E-004 Client, GSTIN, And Period Setup

Steps:

1. Create a client.
2. Create a GSTIN.
3. Create a compliance period.
4. select the created scope in the topbar

Expected:

- all three save successfully
- records appear in their respective registers
- selected context stays stable across pages

#### UAT-E2E-005 Customer Contact Setup

Steps:

1. Open the client detail page.
2. Add a primary customer contact.
3. Include at least one usable channel:
   - mobile, alternate mobile, or email
4. Save.

Expected:

- contact saves successfully
- primary contact is visible on client detail
- follow-up flows can later select this contact

### Phase 3: Happy Path Data Intake To Return Preparation

Use bundle:

- `docs/sample-files/scenario-bundles/01_happy_path_basic/`

#### UAT-E2E-006 Import Happy Path Sales, Purchase, And 2B

Steps:

1. Upload `sales_standard.csv` as `Sales`.
2. Upload `purchase_standard.csv` as `Purchase`.
3. Upload `gstr_2b_standard.csv` as `GSTR-2B`.

Expected:

- all imports process successfully
- no row-level critical errors
- import batches show processed status
- transaction counts are populated

#### UAT-E2E-007 Reconciliation Happy Path

Steps:

1. Open `2B Reconciliation`.
2. Run reconciliation for the active period.
3. Review summary and item list.

Expected:

- reconciliation run completes
- mostly matched items are visible
- summary counts are populated

#### UAT-E2E-008 Prepare GSTR-1 And GSTR-3B

Steps:

1. Open `Returns`.
2. Prepare `GSTR-1`.
3. Prepare `GSTR-3B`.
4. Export both workbooks if the screen allows it.

Expected:

- both returns prepare successfully
- return rows move into draft/prepared state
- exports download without server error

### Phase 4: Exception And Guardrail Coverage

#### UAT-E2E-009 Import Validation Failures

Use bundle:

- `docs/sample-files/scenario-bundles/03_import_validation_failures/`

Steps:

1. Upload `invalid_values_sales.csv` as `Sales`.
2. Upload `duplicate_lines_sales.csv` as `Sales`.
3. Upload `conflicting_document_context_sales.csv` as `Sales`.
4. Open each batch detail.

Expected:

- invalid files do not silently pass
- row-level errors are visible
- duplicate and conflicting-context conditions are explained clearly

#### UAT-E2E-010 Wrong Import Type Guardrails

Use bundle:

- `docs/sample-files/scenario-bundles/07_wrong_import_type_guardrails/`

Steps:

1. Upload `sales_register_wrong_type_test.csv` as `Purchase`.
2. Upload `purchase_register_wrong_type_test.csv` as `Sales`.

Expected:

- uploads are blocked
- user gets a clear wrong-import-type warning

### Phase 5: Reconciliation Exception Management

Use bundle:

- `docs/sample-files/scenario-bundles/02_reconciliation_exceptions/`

Recommended:

- use a separate compliance period from the happy path if you want clean result comparison

#### UAT-E2E-011 Reconciliation Exceptions

Steps:

1. Upload `purchase_reconciliation_exceptions.csv` as `Purchase`.
2. Upload `gstr_2b_reconciliation_exceptions.csv` as `GSTR-2B`.
3. Run reconciliation.
4. Review mismatch categories and item list.

Expected:

- matched and exception rows coexist
- items like tax mismatch, missing in books, and missing in portal are visible
- exception rows can be filtered and reviewed

### Phase 6: Template Mapping And Rich Filing Metadata

#### UAT-E2E-012 Template Mapping

Use bundle:

- `docs/sample-files/scenario-bundles/04_template_mapping_custom_headers/`

Steps:

1. Open imports.
2. choose `Sales`
3. open `Create template`
4. upload `vendor_sales_custom_headers.csv`
5. map the suggested headers from the bundle README
6. save the template
7. reuse the saved template for another upload

Expected:

- template saves successfully
- reused template uploads successfully
- custom headers map into normalized transaction fields

#### UAT-E2E-013 Filing Metadata Rich Sales

Use bundle:

- `docs/sample-files/scenario-bundles/05_filing_metadata_rich/`

Steps:

1. Upload `sales_filing_metadata_rich.csv` as `Sales`.
2. Open `Reports`.
3. inspect transactions and metadata fields
4. prepare `GSTR-1`

Expected:

- HSN, UQC, quantity, service flag, supply category, and e-commerce GSTIN are visible
- metadata readiness warnings are reduced versus the basic sales sample

### Phase 7: Credit Notes, Debit Notes, And Portal-Ready Cycle

#### UAT-E2E-014 Credit And Debit Notes

Use bundle:

- `docs/sample-files/scenario-bundles/08_credit_debit_notes/`

Steps:

1. Upload `credit_note_sample.csv` as `Credit note`.
2. Upload `debit_note_sample.csv` as `Debit note`.
3. Open `Reports`.
4. prepare `GSTR-1` again if applicable

Expected:

- note imports process successfully
- note transactions are classified correctly
- downstream return/export surfaces reflect note coverage

#### UAT-E2E-015 Portal-Ready Filing Bundle

Use bundle:

- `docs/sample-files/scenario-bundles/09_portal_ready_filing_bundle/`

Steps:

1. Upload files in the bundle README order.
2. Run `2B Reconciliation`.
3. Review `Reports` for rich metadata.
4. Prepare `GSTR-1`.
5. Prepare `GSTR-3B`.
6. Export both workbooks.

Expected:

- imports succeed
- reconciliation produces a realistic mix of matched and actionable rows
- GSTR-1 workbook is richer than the basic bundle
- GSTR-3B prepares successfully from combined context

### Phase 8: Customer Follow-Up And Return Management

#### UAT-E2E-016 Operational Follow-Up Register

Steps:

1. Open `Operations -> Follow-ups`.
2. Create a follow-up linked to the active client, GSTIN, and period.
3. Select the customer contact created earlier.
4. assign the follow-up to a workspace member
5. mark one follow-up escalated
6. mark one follow-up completed

Expected:

- follow-up saves successfully
- register reflects status and assignee updates
- open, overdue, escalated, and completed states are visible

#### UAT-E2E-017 Return Status Register

Steps:

1. Open `Reports -> Return Status`.
2. Review the derived row for the active return.
3. Create a follow-up directly from a return row.
4. Open the linked follow-up register from that flow if available.

Expected:

- return status rows show filing state, blocker, pending owner, and follow-up counts
- follow-up created from return row is attached to the same operational context

### Phase 9: Notices, Approvals, And Audit Visibility

#### UAT-E2E-018 Notices Workflow

Steps:

1. Open `Notices`.
2. Create a notice for the active GSTIN.
3. set owner, due date, status, and summary
4. update the notice status

Expected:

- notice is created successfully
- notice appears in the live register
- assignee and due date are visible

#### UAT-E2E-019 Approval Flow

Steps:

1. Open `Approvals`.
2. Review any approval-ready work created by returns flow.
3. if approval actions are enabled in your current environment, approve or reject one item.

Expected:

- approval queue loads without error
- work items show correct operational context
- approval actions write visible state changes

#### UAT-E2E-020 Audit Trail

Steps:

1. Open `Audit Trail`.
2. filter by recent actions from:
   - imports
   - notices
   - follow-ups
   - returns

Expected:

- recent actions appear
- filters work
- audited activity is traceable to actual user actions from this UAT run

### Phase 10: Final Filing-Ready And Operator Readout

#### UAT-E2E-021 Dashboard And Close Manager

Steps:

1. Open `Dashboard`.
2. review quick actions, close-manager summary, and operational widgets
3. generate digest or report outputs if enabled

Expected:

- dashboard loads live data
- no demo fallback appears in live operational cards
- close-manager widgets reflect the workspace state created during UAT

#### UAT-E2E-022 End-To-End Navigation Consistency

Steps:

1. From follow-ups, open linked returns or return-status pages.
2. From period detail, open reconciliation, returns, approvals, and audit trail.
3. Confirm the workspace/client/GSTIN/period scope is preserved.

Expected:

- scoped deep links hydrate the correct context
- users do not land in the wrong client or period accidentally

## Final UAT Signoff Checklist

Mark the release ready only if all of the following are true:

- login, logout, forgot-password, reset-password, and change-password work
- workspace member creation works
- client, GSTIN, period, and customer contact setup work
- happy-path imports, reconciliation, and return preparation work
- invalid imports fail clearly
- wrong-import-type uploads are blocked
- notices and operational follow-ups work
- return status register is usable
- audit trail captures actions
- no live workflow silently shows demo fallback data
- exports complete without backend errors

## Recommended UAT Run Order

If you only have time for one condensed pass, run in this order:

1. `UAT-E2E-001` to `UAT-E2E-005`
2. `UAT-E2E-006` to `UAT-E2E-008`
3. `UAT-E2E-011`
4. `UAT-E2E-015`
5. `UAT-E2E-016` to `UAT-E2E-020`
6. `UAT-E2E-021` and `UAT-E2E-022`

That gives the strongest production-style confidence with the least duplication.
