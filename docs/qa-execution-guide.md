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

Example:

```bash
PLAYWRIGHT_BASE_URL=https://your-staging-url.example.com npm run test:e2e:chromium
```

Cross-browser against staging:

```bash
PLAYWRIGHT_BASE_URL=https://your-staging-url.example.com npm run test:e2e:cross-browser
```

Run the dedicated live smoke slice against a real environment:

```bash
PLAYWRIGHT_BASE_URL=https://your-staging-url.example.com \
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com \
PLAYWRIGHT_LIVE_PASSWORD=demo12345 \
npm run test:e2e:live
```

Live coverage includes:

- `live-smoke.spec.ts`: login, dashboard load, refresh persistence, logout, and mobile-width usability
- `live-navigation.spec.ts`: major signed-in workspace routes
- `live-workspaces.spec.ts`: imports empty-state/details flow and returns blocker guidance flow
- `live-operations-support.spec.ts`: operations and approvals empty states, follow-up modal flow, and audit event detail inspection
- `live-notices-audit.spec.ts`: notices empty state and modal behavior, audit filtering, detail inspection, and XLSX export
- `live-settings-access.spec.ts`: settings navigation, team onboarding modal, change-password validation, and workspace-management context
- `live-master-data.spec.ts`: clients search/validation plus GSTIN and compliance-period edit surfaces without mutating staging data

These tests use no API mocks.

## CI behavior

The GitHub Actions workflow:

- installs frontend dependencies
- installs Playwright browsers
- lints `src` and `tests`
- runs Chromium, Firefox, and WebKit
- uploads Playwright HTML reports and `test-results`

Workflow file:

- [frontend-playwright.yml](/Users/ansh/Documents/Gst-Compliance/.github/workflows/frontend-playwright.yml)

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
