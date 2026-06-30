# QA Findings

## Current status

Two active functional application bugs are currently confirmed on staging:

- team member deactivation executes immediately with no confirmation
- `/reports/transaction-review` returns `404`

One additional UI copy defect is confirmed in the local source-backed approval workflow:

- approval rejection success toast is misspelled as `Approval request rejectd.`

## Latest live verification

- Verified on June 30, 2026 against `https://gst-stage.accerio.in`
- Confirmed with seeded demo account:
  - login succeeds
  - dashboard loads
  - browser refresh preserves session
  - logout returns the user to `/login`
  - imports workspace shows stable empty-state and import-history detail behavior
  - returns workspace shows blocker guidance and routes users toward imports and reconciliation
  - operations and approvals empty states load consistently
  - follow-up creation modal and audit event detail open correctly from live workspaces
  - notices empty state and add-notice modal render correctly
  - audit filters, detail modal, and XLSX export work in staging
  - settings navigation, team add-member modal, change-password validation, and workspace-management context work in staging
  - clients search/no-match guidance and add-client validation work in staging
  - GSTIN and compliance-period edit surfaces open correctly without forced mutations
- No blocking functional defects were observed in this live smoke slice.

## Open bugs

### Bug: Team member deactivation happens immediately with no confirmation

- Steps to reproduce:
  1. Sign in to `https://gst-stage.accerio.in` with a user that can manage workspace members.
  2. Open `/settings/team`.
  3. Click `Deactivate` on a workspace member row.
- Actual result:
  - The UI sends a live `DELETE` request immediately and shows `Workspace member deactivated.` with no confirmation dialog or safety step.
- Expected result:
  - Deactivation should require an explicit confirmation step before the destructive request is sent.
- Severity: High
- Screenshot/video reference if available:
  - Reproduced in live browser verification on June 30, 2026.
  - Local Playwright regression coverage now also verifies that the source application flow is expected to show a confirmation modal before deletion.
- Suggested fix area:
  - Team management deactivation flow in the frontend settings workspace, plus staging deployment/version parity review because the source-backed regression path expects confirmation.

### Bug: Transaction Review deep link returns 404 on staging

- Steps to reproduce:
  1. Sign in to `https://gst-stage.accerio.in` with a valid workspace user.
  2. Open `https://gst-stage.accerio.in/reports/transaction-review`.
- Actual result:
  - The app renders a `404` page with `This page could not be found.`
- Expected result:
  - The Transaction Review workspace should load, matching the local route coverage and the Reports area behavior.
- Severity: Medium
- Screenshot/video reference if available:
  - Reproduced in live browser verification on June 30, 2026.
- Suggested fix area:
  - Frontend route registration or deployment artifact for the Reports child route.

### Bug: Approval rejection success toast is misspelled

- Steps to reproduce:
  1. Open `/approvals` with a pending approval request.
  2. Click `Reject`.
  3. Enter review remarks and confirm the action.
- Actual result:
  - The flow completes, but the success toast shows `Approval request rejectd.`
- Expected result:
  - The success toast should say `Approval request rejected.`
- Severity: Low
- Screenshot/video reference if available:
  - Reproduced during local Playwright regression execution on June 30, 2026.
- Suggested fix area:
  - Approval action success-message copy in the approvals workspace frontend.

Previously reported issues around:

- sidebar workspace identity
- team-member deactivation confirmation
- mobile navigation accessible naming
- dashboard completed-count fallback

were verified as fixed or no longer reproducible in the current build.

## Data-testid Recommendations

- Add stable `data-testid` hooks for the four topbar context selectors:
  - workspace selector
  - client selector
  - GSTIN selector
  - period selector
- Add stable `data-testid` hooks for:
  - import batch rows
  - reconciliation run rows
  - return history rows
  - primary modal submit buttons
  - mobile navigation trigger

These are not required for current coverage, but they would reduce ambiguity where repeated text and repeated controls exist.
