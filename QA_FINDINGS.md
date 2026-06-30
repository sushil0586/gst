# QA Findings

## Current status

The following issues are still reproducible on the current staging deployment and require a fresh frontend deploy to verify the source fixes:

- imports page triggers an initial `403` request before the full context is applied
- `/reports/transaction-review` returns `404`

The following issues were fixed in source and verified locally on June 30, 2026:

- approval rejection success toast copy
- mobile import-history layout
- blocked return preparation buttons now show disabled guidance before click

## Latest live verification

- Verified on June 30, 2026 against `https://gst-stage.accerio.in`
- Confirmed with seeded demo account:
  - login succeeds
  - dashboard loads
  - browser refresh preserves session
  - logout returns the user to `/login`
  - imports workspace shows stable empty-state and import-history detail behavior
  - imports workspace still issues one premature background `403` request before the client, GSTIN, and period selectors finish applying
  - returns workspace shows blocker guidance and routes users toward imports and reconciliation
  - operations and approvals empty states load consistently
  - follow-up creation modal and audit event detail open correctly from live workspaces
  - notices empty state and add-notice modal render correctly
  - audit filters, detail modal, and XLSX export work in staging
  - settings navigation, team add-member modal, change-password validation, and workspace-management context work in staging
  - team-member deactivation now opens a confirmation modal correctly
  - clients search/no-match guidance and add-client validation work in staging
  - GSTIN and compliance-period edit surfaces open correctly without forced mutations
- The dedicated live Playwright slice passed after aligning one stale test expectation with the current `Change password` CTA label.
- Additional local verification on June 30, 2026 confirmed source fixes for:
  - `/reports/transaction-review` redirecting into `/reports`
  - import batch queries waiting for full context before firing
  - corrected approval rejection toast copy
  - mobile import-history cards
  - disabled blocked-return preparation actions

## Open bugs

### Bug: Imports page fires a premature `403` request before full context selection is applied

- Steps to reproduce:
  1. Sign in to `https://gst-stage.accerio.in` with a user that can manage workspace members.
  2. Open `/imports`.
  3. Observe network activity while the page initializes the selected workspace context.
- Actual result:
  - The frontend first requests `/api/backend/imports/batches?workspace=<workspace-id>` and receives `403 Forbidden`.
  - After the client, GSTIN, and compliance-period values finish loading, a second request with the full filter set succeeds and the page renders normally.
- Expected result:
  - The page should wait until the full required context is available before requesting import batches, so it does not emit avoidable authorization errors in normal use.
- Severity: Medium
- Screenshot/video reference if available:
  - Reproduced in live browser verification on June 30, 2026.
  - Confirmed through a Playwright network trace: initial workspace-only request returns `403`, subsequent full-context requests return `200`.
- Suggested fix area:
  - Frontend imports query enablement or filter-gating logic in `useImportBatchesQuery` and the imports screen context-loading flow.

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
  - The flow previously completed with `Approval request rejectd.`
- Expected result:
  - The success toast should say `Approval request rejected.`
- Severity: Low
- Screenshot/video reference if available:
  - Reproduced during local Playwright regression execution on June 30, 2026.
  - Fixed in source and verified locally the same day.
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
