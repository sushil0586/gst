# GST Compliance SaaS QA UAT Cases

## Scope

These UAT cases cover the current product surface for:

- self-registration
- team management
- onboarding
- navigation
- master setup
- imports
- transaction review
- reconciliation
- returns
- approvals
- locking
- audit trail
- close-manager operations
- exports

For the most practical production-style run using the existing import bundles and customer-management flows, use [live-uat-end-to-end-pack.md](/Users/ansh/Documents/Gst-Compliance/docs/live-uat-end-to-end-pack.md:1) alongside this broader case catalog.

## Environment Preconditions

- Backend is running
- Frontend is running
- Demo or tester account is available
- At least one workspace exists
- Sample files are available in `docs/sample-files/`
- Scenario bundle reference is available in `docs/import-scenario-bundles.md`

For onboarding-specific cases, also prepare:

- one email address for a brand-new firm owner
- one email address for a new filer or CA joining an existing workspace

## UAT-001 Login

### Steps

1. Open the login page.
2. Enter valid credentials.
3. Submit.

### Expected

- User is authenticated.
- User lands in the dashboard or onboarding depending on setup state.

## UAT-001A Self-Registration For A New Workspace

### Steps

1. Open the login page.
2. Click `Create a new workspace`.
3. Enter first name, last name, email, password, organization name, workspace name, and timezone.
4. Submit.

### Expected

- Account is created successfully.
- User is signed in immediately.
- New organization and workspace are created.
- User lands in onboarding as the new workspace owner.

## UAT-001B Team Management Navigation

### Steps

1. Open `Settings`.
2. Open `Team management`.

### Expected
   
- Team management page opens successfully.
- Selected workspace context is respected.
- Page explains onboarding roles like `filer` and `senior_ca`.

## UAT-001C Add Workspace Filer

### Steps

1. Open `Settings -> Team management`.
2. Click `Add member`.
3. Enter email, first name, last name, role = `Filer`, and initial password.
4. Save.

### Expected

- Workspace member is created.
- Member appears in the team list with role `Filer`.
- The new user can log in and access filing pages for that workspace.

## UAT-001D Add Senior CA

### Steps

1. Open `Settings -> Team management`.
2. Add a user with role = `Senior CA`.
3. Log in using that new user in a separate session.

### Expected

- User can open the workspace normally.
- User can prepare returns.
- User can approve returns.
- User can mark returns filed.
- User can view audit trail.

## UAT-001E Update Or Deactivate Workspace Member

### Steps

1. Open `Settings -> Team management`.
2. Edit an existing member and change their role.
3. Save.
4. Deactivate the member.

### Expected

- Role change is saved successfully.
- Deactivated membership disappears from active operating access.
- Deactivated user should no longer be able to work in that workspace after session refresh.

## UAT-002 Onboarding Flow

### Steps

1. Open onboarding.
2. Create or select workspace.
3. Create client.
4. Create GSTIN.
5. Create compliance period.

### Expected

- Each step saves successfully.
- Layout remains stable while changing dropdowns.
- Final state allows the user to enter dashboard pages.

## UAT-003 Sidebar Navigation Coverage

### Steps

1. Click each sidebar item:
   - Dashboard
   - Clients
   - GSTINs
   - Compliance Periods
   - Imports
   - 2B Reconciliation
   - Returns
   - Approvals
   - Notices
   - Reports
   - Audit Trail
   - Settings

### Expected

- Each page opens successfully.
- No broken navigation.
- Active menu highlighting is correct.

## UAT-004 Client Drill-Down Navigation

### Steps

1. Open `Clients`.
2. Click `Open` on a client.
3. Navigate to the client GSTIN view.
4. Navigate to a client period workspace.

### Expected

- Client profile opens.
- GSTIN and period data are visible.
- Monthly workspace links to imports, reconciliation, returns, approvals, and audit trail.

## UAT-005 Create Client

### Steps

1. Open `Clients`.
2. Click `Add Client`.
3. Enter valid data.
4. Save.

### Expected

- Client is created.
- It appears in the client list.
- It can be selected in topbar context.

## UAT-006 Create GSTIN

### Steps

1. Open `GSTINs` or client detail.
2. Create a GSTIN for a valid client.

### Expected

- GSTIN is created.
- It appears in lists and topbar selection.

## UAT-007 Create Compliance Period

### Steps

1. Open `Compliance Periods`.
2. Add a new period for a GSTIN.

### Expected

- Period is created.
- It appears in period lists and topbar selection.

## UAT-008 Import Sales Register

### Steps

1. Open `Imports`.
2. Select a full context.
3. Choose `Sales`.
4. Upload a valid sales file.

### Expected

- Batch is created.
- Status moves beyond queued.
- GST transactions are created.

## UAT-009 Import Purchase Register

### Steps

1. Open `Imports`.
2. Choose `Purchase`.
3. Upload a valid purchase file.

### Expected

- Batch is processed.
- Transactions are created.

## UAT-010 Import GSTR-2B

### Steps

1. Open `Imports`.
2. Choose `GSTR-2B`.
3. Upload a valid GSTR-2B file.

### Expected

- Batch is processed.
- Portal-side transactions are created.

## UAT-011 Invalid Import Handling

### Steps

1. Upload `invalid_import_sample.csv`.
2. Open batch details.

### Expected

- Row errors are captured.
- Error summary is visible.
- Error export works.

## UAT-012 Import Template Creation

### Steps

1. Open `Imports`.
2. Create an import template.
3. Fill mappings and save.

### Expected

- Modal is usable.
- Save button remains visible.
- Template is created and listed.

## UAT-013 Template Selection During Upload

### Steps

1. Upload a file using an existing template.

### Expected

- Template is applied.
- Processing uses the mapped fields.

## UAT-014 Transaction Review List

### Steps

1. Open `Reports`.
2. Apply filters by batch, type, status, GSTIN, date.

### Expected

- Rows update correctly.
- Export works.

## UAT-015 Transaction Detail Correction

### Steps

1. Open a transaction detail drawer or correction dialog.
2. Edit filing metadata like HSN, UQC, quantity, supply category.
3. Save.

### Expected

- Transaction updates successfully.
- Readiness issues reduce when applicable.
- Audit trail captures the change.

## UAT-016 Bulk Correction

### Steps

1. Select multiple rows in `Reports`.
2. Open bulk correction.
3. Apply a shared fix.

### Expected

- Selected rows update together.
- Readiness and review data refresh.

## UAT-017 Remediation Buckets

### Steps

1. Open `Reports`.
2. Use remediation buckets like missing HSN or missing UQC.

### Expected

- Matching rows are selected or focused.
- Suggested fix path is visible.

## UAT-018 Shared Remediation Snapshots

### Steps

1. Create a remediation snapshot.
2. Refresh page or use another session.
3. Reopen the page.

### Expected

- Snapshot persists.
- Snapshot metadata is visible.

## UAT-019 Assignments

### Steps

1. Assign a remediation bucket or selected rows to a workspace member.

### Expected

- Assignment is created.
- Ownership shows in the review workspace.

## UAT-020 Follow-Ups

### Steps

1. Create a follow-up for an assignment.
2. Mark completed or dismiss it.

### Expected

- Follow-up status updates correctly.
- It appears in queue summaries.

## UAT-021 Escalation

### Steps

1. Escalate an assignment.
2. Add escalation notes.
3. Clear escalation.

### Expected

- Escalation state is visible.
- Manager queue updates.

## UAT-022 Reconciliation Run

### Steps

1. Open `2B Reconciliation`.
2. Run reconciliation for a period with purchase and 2B data.

### Expected

- Run is created.
- Status moves to completed.
- Items are generated.

## UAT-023 Reconciliation Item Workflow

### Steps

1. Open a reconciliation item.
2. Change action status.
3. Add remarks or assign owner.

### Expected

- Item updates correctly.
- Audit trail captures the change.

## UAT-024 Return Readiness

### Steps

1. Open `Returns`.
2. Review GSTR-1 and GSTR-3B readiness state.
3. Use issue links where available.

### Expected

- Readiness shows `ready`, `ready_with_warnings`, or `blocked`.
- Warnings link to correct review flows.

## UAT-025 Prepare GSTR-1

### Steps

1. Prepare GSTR-1 for a sales-loaded period.

### Expected

- Draft is created.
- Summary values are visible.

## UAT-026 Prepare GSTR-3B

### Steps

1. Prepare GSTR-3B for a context with reconciliation data.

### Expected

- Draft is created.
- ITC and net payable values are visible.

## UAT-027 Export GSTR-1 Workbook

### Steps

1. Export GSTR-1 from `Returns`.

### Expected

- XLSX downloads successfully.
- Filing-style sheets are present.

## UAT-028 Export GSTR-3B Workbook

### Steps

1. Export GSTR-3B from `Returns`.

### Expected

- XLSX downloads successfully.
- 3B sheets are present.

## UAT-029 Approval Request Flow

### Steps

1. Request approval from a ready return.
2. Open `Approvals`.
3. Approve or reject.

### Expected

- Approval queue updates.
- Linked return reflects the approval result.

## UAT-030 Mark Filed

### Steps

1. Mark an approved return as filed.
2. Enter ARN if available.

### Expected

- Return moves to filed.
- Filed metadata is stored.

## UAT-030A WhiteBooks GSTR-3B Final Filing Confirmation Pending

### Steps

1. Open `Returns` for a GSTR-3B that has already completed provider draft save and liability offset.
2. Start or inspect the provider filing lifecycle after the final filing request is sent.
3. Open the same filing from `Operations`.

### Expected

- Returns shows `GSTR-3B final filing requested, awaiting ARN or rejection status`.
- Operations shows `final filing requested, awaiting ARN`.
- The filing remains confirmation-pending and is not shown as filed yet.
- Support guidance recommends resync before telling operations the return is filed.

## UAT-030B WhiteBooks GSTR-3B Delayed ARN Resync

### Steps

1. Open a GSTR-3B filing in confirmation-pending state.
2. Trigger `Resync` from `Returns` or `Operations` after the provider has generated an ARN.

### Expected

- Filing moves to `filed`.
- ARN is stored on both the filing and prepared return.
- Latest provider status and track evidence are visible in the UI.
- Audit trail captures the successful status sync.

## UAT-030C WhiteBooks GSTR-3B Rejection Resync

### Steps

1. Open a GSTR-3B filing in confirmation-pending state where the provider later rejects the filing.
2. Trigger `Resync`.

### Expected

- Filing moves to `failed`.
- Provider rejection code and message are preserved in filing evidence.
- Support status summary recommends provider-error review instead of blind retry.
- Reviewed requeue remains separately auditable from standard retry.

## UAT-030D WhiteBooks GSTR-3B Status Mismatch And Recovery

### Steps

1. Open a GSTR-3B filing where the provider transport succeeded but final outcome is still unclear.
2. Compare `Returns` and `Operations` views.
3. Trigger `Resync`.

### Expected

- Both views show the same confirmation-pending state and recommended action.
- The filing remains safely resyncable if no ARN or terminal rejection is returned.
- Provider evidence snapshot shows available `file`, `status`, and `track` evidence.
- No UI path marks the filing as complete without synced confirmation.

## UAT-031 Lock Period

### Steps

1. Lock a filed period from `Compliance Periods`.

### Expected

- Period becomes locked.
- Lock badge is visible.

## UAT-032 Locked Period Guardrails

### Steps

1. Try importing into a locked period.
2. Try running reconciliation.
3. Try preparing returns.
4. Try editing transactions.

### Expected

- All blocked actions fail clearly.

## UAT-033 Audit Trail

### Steps

1. Open `Audit Trail`.
2. Filter by action and entity type.
3. Export logs.

### Expected

- Relevant records appear.
- Before/after summaries are visible.
- Export works.

## UAT-034 Dashboard Live Metrics

### Steps

1. Open `Dashboard`.
2. Verify summary metrics after imports, reconciliation, and returns.

### Expected

- Health score is live.
- Open issues are live.
- Recent activity is live.

## UAT-035 Workspace Close Manager

### Steps

1. On `Dashboard`, inspect workspace close-manager section.
2. Review queues, manager attention, due follow-ups, and automation performance.

### Expected

- Data reflects current remediation state.
- No broken cards or tables.

## UAT-036 Digest Generation And Dispatch

### Steps

1. Generate a digest.
2. Generate email preview.
3. Send email digest.
4. Acknowledge a digest.

### Expected

- Digest records appear.
- Statuses update correctly.
- Retry dispatch works for failed/generated items.

## UAT-037 Close Manager Report Export

### Steps

1. Export close report from the dashboard close-manager section.

### Expected

- XLSX downloads successfully.
- Sheets include summary, queues, workload, follow-ups, trends, and activity.

## UAT-038 Automation Report

### Steps

1. Review the 7-day automation performance section.

### Expected

- Digests, reminders, failures, and escalations are visible.
- Recent automation activity feed is populated where events exist.

## UAT-039 Notices Page

### Steps

1. Open `Notices`.

### Expected

- Page loads successfully.
- Placeholder shell is visible.
- No broken layout or runtime issue.

## UAT-040 Settings References

### Steps

1. Open `Settings`.
2. Open `Pilot Readiness`.
3. Open `User Guide & UAT`.
4. Open `Team management`.

### Expected

- Navigation works.
- Test guidance is available inside the app.
- Team onboarding tools are available from the settings area.

## Exit Criteria

You can consider the system ready for a full manual Phase 1 pass when:

- all sidebar pages load
- client drill-down navigation works
- imports, review, reconciliation, and returns all complete successfully
- approval, filing, and locking work
- audit logs and exports work
- close-manager operations and automation reporting work
- no blocking runtime errors are encountered during the flow
