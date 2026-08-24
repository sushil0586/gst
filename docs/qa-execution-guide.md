# QA Execution Guide

## Purpose

This guide explains how to run the Playwright QA suite for the GST Compliance frontend in local, CI, and staging-style modes.

## Suite location

- Frontend app: `gst-compliance-frontend/`
- E2E tests: `gst-compliance-frontend/tests/e2e/`
- Page objects: `gst-compliance-frontend/tests/pages/`

## Local setup

From `gst-compliance-frontend/`:

```bash
npm ci
npx playwright install
```

## Common commands

Run the stable local Chromium pass:

```bash
npm run test:e2e:chromium
```

Run the launch-regression slice for the supported release surfaces:

```bash
npm run test:e2e:launch
```

Run the full local suite with all configured browsers:

```bash
npm run test:e2e:cross-browser
```

Run the visual-regression suite:

```bash
npm run test:e2e:visual
```

Update visual baselines intentionally after approved UI changes:

```bash
npm run test:e2e:visual:update
```

Run the Firefox/WebKit visual smoke slice:

```bash
npm run test:e2e:visual:smoke
```

Update Firefox/WebKit smoke baselines intentionally:

```bash
npm run test:e2e:visual:smoke:update
```

Run a single spec:

```bash
npx playwright test tests/e2e/returns-workflow.spec.ts --project=chromium
```

Run lint before pushing:

```bash
npm run lint -- src tests
```

## Staging-style execution

Use an already running environment instead of the local Playwright web server by setting `PLAYWRIGHT_BASE_URL`.

Use the host root, not a deep link. For example, if the browser URL is `https://gst-stage.accerio.in/dashboard`, set `PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in`.

Example:

```bash
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in npm run test:e2e:chromium
```

Cross-browser against staging:

```bash
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in npm run test:e2e:cross-browser
```

Run the dedicated live smoke slice against a real environment:

```bash
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in \
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com \
PLAYWRIGHT_LIVE_PASSWORD=demo12345 \
npm run test:e2e:live
```

Run the dedicated live visual smoke slice against a real environment:

```bash
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in \
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com \
PLAYWRIGHT_LIVE_PASSWORD=demo12345 \
npm run test:e2e:live:visual
```

Update live visual baselines intentionally only after validating the seeded staging/demo environment:

```bash
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in \
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com \
PLAYWRIGHT_LIVE_PASSWORD=demo12345 \
npm run test:e2e:live:visual:update
```

Live coverage includes:

- `live-smoke.spec.ts`: login, dashboard load, refresh persistence, logout, and mobile-width usability
- `live-navigation.spec.ts`: major signed-in workspace routes
- `live-workspaces.spec.ts`: imports empty-state/details flow and returns blocker guidance flow
- `live-operations-support.spec.ts`: operations and approvals empty states, follow-up modal flow, and audit event detail inspection
- `live-notices-audit.spec.ts`: notices empty state and modal behavior, audit filtering, detail inspection, and XLSX export
- `live-settings-access.spec.ts`: settings navigation, team onboarding modal, change-password validation, and workspace-management context
- `live-master-data.spec.ts`: clients search/validation plus GSTIN and compliance-period edit surfaces without mutating staging data
- `live-visual-smoke.spec.ts`: seeded live screenshots for dashboard, imports, returns, reports, IMS, and team management

These tests use no API mocks.

## CI behavior

The GitHub Actions workflow:

- installs frontend dependencies
- installs Playwright browsers
- lints `src` and `tests`
- runs a dedicated functional cross-browser lane
- runs a dedicated Chromium visual-regression lane
- runs a dedicated Firefox/WebKit visual-smoke lane as non-blocking coverage
- supports a non-blocking live-visual smoke lane when staging secrets are configured
- uploads Playwright HTML reports and `test-results`

Workflow file:

- [frontend-playwright.yml](/Users/ansh/Documents/Gst-Compliance/.github/workflows/frontend-playwright.yml)

## Visual testing roadmap

This section documents the current Playwright visual-browser state and the planned path to full visual coverage using both mocked states and real seeded environment data.

### Current verified status as of July 24, 2026

- The frontend already has a dedicated visual suite in `gst-compliance-frontend/tests/e2e/visual-regression.spec.ts`.
- The current strict Chromium visual suite covers 20 snapshot states across desktop, mobile, and tablet layouts.
- The current Firefox/WebKit visual smoke suite covers 10 browser-specific snapshots:
  - login
  - dashboard
  - imports
  - returns
  - reports
  - across both Firefox and WebKit
- Stored visual baselines currently live under `gst-compliance-frontend/tests/e2e/visual-regression.spec.ts-snapshots/`.
- Cross-browser smoke baselines live under `gst-compliance-frontend/tests/e2e/visual-cross-browser-smoke.spec.ts-snapshots/`.
- Local verification on July 24, 2026 confirmed:
  - `20/20` Chromium visual tests passing
  - `10/10` Firefox/WebKit visual smoke tests passing
- Live Playwright coverage already exists separately for real signed-in functional checks:
  - `live-smoke.spec.ts`
  - `live-navigation.spec.ts`
  - `live-workspaces.spec.ts`
  - `live-master-data.spec.ts`
  - `live-operations-support.spec.ts`
  - `live-settings-access.spec.ts`
  - `live-notices-audit.spec.ts`
  - `live-ims.spec.ts`
- Local live visual verification on July 24, 2026 also confirmed:
  - `1/1` live visual smoke test passing against `http://localhost:3001`
  - seeded live screenshot coverage for dashboard, imports, returns, reports, IMS, and settings/team
- Current staging target for live browser validation:
  - browser URL: `https://gst-stage.accerio.in/dashboard`
  - Playwright `PLAYWRIGHT_BASE_URL`: `https://gst-stage.accerio.in`
- CI now runs the functional cross-browser suite, a dedicated visual-only Chromium job, and a non-blocking Firefox/WebKit visual-smoke job.
- CI now also supports a non-blocking live-visual smoke job through `workflow_dispatch` and a weekly scheduled run when `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_LIVE_EMAIL`, and `PLAYWRIGHT_LIVE_PASSWORD` are configured as repository secrets.

### Actual seeded and live data already available

The existing live suite and staging verification already rely on seeded demo-style workspace data rather than blank generic environments. Current known stable live/demo records include:

- workspace: `Demo Workspace`
- client: `Demo Client Private Limited`
- GSTIN: `29ABCDE1234F1Z5`
- workspace admin: `demo_admin@example.com`

These records are already referenced by the live Playwright assertions and are the right base for any future live visual smoke coverage.

### Target visual coverage model

The recommended end state is three layers of browser-based visual coverage:

1. Mocked visual regression
2. Responsive visual regression
3. Live visual smoke with seeded real data

#### 1. Mocked visual regression

Purpose:

- catch UI regressions with deterministic fixture-backed data
- keep strict snapshot comparisons stable in CI

Current count:

- 20 Chromium snapshots across desktop, mobile, and tablet states

Target count:

- approximately 20 to 25 desktop Chromium snapshots

Recommended additional screens and states:

- login
- dashboard alternate/alert state
- imports batch-detail dialog
- reconciliation mismatch/follow-up state
- returns blocked state
- returns prepared/review state
- approvals populated queue
- operations follow-up dialog
- notices empty state
- notices create dialog
- audit trail list state
- audit event detail dialog
- reports transaction detail dialog
- reports remediation ownership state
- settings landing
- settings team management
- settings workspace management
- IMS default tabbed workbench state

#### 2. Responsive visual regression

Purpose:

- catch mobile/tablet layout regressions that desktop-only snapshots miss

Recommended viewports:

- mobile: `390x844`
- tablet: `768x1024`
- desktop: `1440x1200`

Priority screens:

- login
- dashboard
- imports
- returns
- reports
- IMS
- settings/team

Target count:

- approximately 14 additional responsive snapshots across mobile and tablet states for the highest-risk screens

#### 3. Live visual smoke with seeded real data

Purpose:

- confirm the actual deployed app still looks sane with real auth, real routing, and seeded staging/demo records
- complement mocked visual regression rather than replace it

Current live visual targets:

- `/dashboard`
- `/imports`
- `/returns`
- `/reports`
- `/ims`
- `/settings/team`

Recommended approach:

- Chromium only at first
- capture `main` region screenshots rather than full-page screenshots
- keep this suite non-blocking initially
- review screenshots and diffs as artifacts instead of forcing strict PR gating on day one

### Deterministic controls required for reliable visual tests

Visual tests should stay deterministic by default. The current reports regression already proved that time-relative UI can drift when the suite uses fixed fixture data but a real current clock.

Required controls:

- freeze browser time for visual specs
- standardize viewport sizes
- disable animations
- hide text carets
- keep fixture data stable and intentional
- avoid snapshotting transient toasts unless explicitly needed
- prefer element-level screenshots of `main` or specific cards/dialogs over full-document captures when only one region matters

### Browser strategy

Recommended browser split:

- Chromium: full strict visual baseline suite
- Firefox: small visual smoke slice on critical screens
- WebKit: small visual smoke slice on critical screens

Recommended Firefox/WebKit smoke pages:

- login
- dashboard
- imports
- returns
- reports

This avoids turning cross-browser rendering noise into daily snapshot churn while still giving browser-level confidence.

### CI rollout plan

Recommended workflow structure:

- `frontend-functional`
  - existing behavioral Playwright suite across configured browsers
- `frontend-visual`
  - mocked Chromium visual regression
  - now implemented as a dedicated CI job
- `frontend-visual-smoke`
  - Firefox/WebKit visual sanity slice on critical pages
  - now implemented as a non-blocking CI job
- `frontend-live-visual`
  - staging/demo visual smoke
  - now implemented as a manual and weekly scheduled non-blocking CI job

Artifact expectations:

- always upload Playwright HTML report
- always upload `test-results`
- keep actual/expected/diff images for visual failures
- retain artifacts for at least 14 days

### Snapshot management rules

Snapshots should only change intentionally.

Recommended review rules:

- update baselines only with approved UI changes
- keep snapshot updates in the same PR as the UI change
- mention expected screenshot changes in the PR description
- inspect actual and diff artifacts before approving baseline refreshes

### Phased implementation plan with actual numbers

Phase 1: stabilize the existing suite

- extract the current visual time-freeze behavior into shared visual setup
- keep current 8 Chromium snapshots green and deterministic
- add a dedicated visual CI job

Phase 2: expand desktop mocked visual coverage

- grow from 8 snapshots to roughly 20 to 25 snapshots
- cover all major dashboard modules already represented in the E2E suite

Phase 3: add responsive coverage

- add about 14 mobile/tablet snapshots
- focus on high-risk workflow screens and modal surfaces

Phase 4: add cross-browser visual smoke

- add about 5 Firefox critical screenshots
- add about 5 WebKit critical screenshots

Phase 5: add live visual smoke with seeded real data

- add about 6 real signed-in visual smoke checks against staging/demo
- use the existing seeded records already verified in live Playwright runs

### Definition of done

This app can reasonably claim full Playwright visual browser-based coverage when all of the following are true:

- major modules have mocked Chromium visual baselines
- critical screens have mobile and tablet coverage
- a dedicated visual job runs in CI
- Firefox and WebKit have a small critical visual smoke slice
- a live visual smoke suite runs against seeded staging/demo data
- snapshot update rules are documented and followed consistently

## Recommended release gate

Before a release candidate:

1. Run `npm run test:e2e:chromium`
2. Run `npm run test:e2e:cross-browser`
3. Run `npm run test:e2e:visual`
4. Run one staging pass with `PLAYWRIGHT_BASE_URL`
5. Run `npm run test:e2e:live` with explicit live credentials
6. Review `QA_FINDINGS.md`
7. Review `UI_UX_REVIEW.md`

## Notes

- The Playwright config starts a local production build automatically unless `PLAYWRIGHT_BASE_URL` is provided.
- CI uses retries and multi-browser coverage; local runs stay lighter for faster feedback.
