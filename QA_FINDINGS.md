# QA Findings

## Current status

No active functional staging bugs are currently confirmed in the latest verified smoke slice.

The following issues were fixed in source and verified on staging on June 30, 2026:

- imports page initial `403` during context hydration
- `/reports/transaction-review` deep-link `404`
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
  - imports workspace no longer issues the premature background `403` request seen before deployment
  - returns workspace shows blocker guidance and routes users toward imports and reconciliation
  - operations and approvals empty states load consistently
  - follow-up creation modal and audit event detail open correctly from live workspaces
  - notices empty state and add-notice modal render correctly
  - audit filters, detail modal, and XLSX export work in staging
  - settings navigation, team add-member modal, change-password validation, and workspace-management context work in staging
  - team-member deactivation now opens a confirmation modal correctly
  - clients search/no-match guidance and add-client validation work in staging
  - GSTIN and compliance-period edit surfaces open correctly without forced mutations
- `/reports/transaction-review` now resolves correctly into the transaction review workspace
- Full live Playwright Chromium verification passed on June 30, 2026:
  - `13/13` live tests passed against staging
- Additional local verification on June 30, 2026 confirmed source fixes for:
  - `/reports/transaction-review` redirecting into `/reports`
  - import batch queries waiting for full context before firing
  - corrected approval rejection toast copy
  - mobile import-history cards
  - disabled blocked-return preparation actions

## Recently fixed

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
- Status:
  - Fixed in source and verified on staging on June 30, 2026.

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
- Status:
  - Fixed in source and verified on staging on June 30, 2026.

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
  - Fixed in source, verified locally, and staging smoke remained green after deployment.
- Suggested fix area:
  - Approval action success-message copy in the approvals workspace frontend.
- Status:
  - Fixed.

Previously reported issues around:

- sidebar workspace identity
- team-member deactivation confirmation
- mobile navigation accessible naming
- dashboard completed-count fallback

were verified as fixed or no longer reproducible in the current build.

## Data-testid Recommendations

- Stable `data-testid` hooks are now available for:
  - workspace selector
  - client selector
  - GSTIN selector
  - period selector
  - import batch rows and detail actions
  - reconciliation run rows and detail actions
  - return history rows and review actions
  - primary client-form submit button
  - mobile navigation trigger

These hooks should be preferred for future Playwright coverage where repeated labels or repeated row actions would otherwise make selectors fragile.
