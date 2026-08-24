# Frontend Launch Verification Summary

## Purpose

This document is the short reference for the frontend launch gate.

Use it when we need to answer:

- what frontend surfaces are in the launch-ready release scope
- which automated checks protect those surfaces
- which command should be treated as the primary frontend launch regression gate

## Primary launch gate

From `gst-compliance-frontend/` run:

```bash
npm run test:e2e:launch
```

This is the primary local frontend launch-regression command.

CI equivalent:

- GitHub Actions workflow: `.github/workflows/frontend-playwright.yml`
- Job name: `launch-e2e`

## Covered launch surfaces

The launch gate currently protects these supported frontend surfaces:

1. Returns
   - launch-critical OTP verification
   - filing start flow
   - filing recovery flow

2. Notices
   - operational posture visibility
   - overdue notice visibility
   - live owner reassignment path

3. Settings
   - administration hub landing surface
   - handoff into workspace and team management flows

4. IMS
   - operator workbench posture
   - live context and auth-session visibility
   - supported action-tab presence

## Specs included

The current launch gate runs these Playwright specs:

- `tests/e2e/returns-workflow.spec.ts`
- `tests/e2e/notices-workflow.spec.ts`
- `tests/e2e/settings-launch-smoke.spec.ts`
- `tests/e2e/ims-launch-smoke.spec.ts`

## What this gate is for

This gate is intended to catch:

- broken launch-critical operator flows
- regressions on supported release surfaces
- navigation or workflow drift between hub pages and operational modules
- UI regressions that make the launch surface less supportable

## What this gate is not for

This gate does not replace:

- the broader cross-browser Playwright suite
- visual-regression verification
- live-environment smoke checks
- backend verification and Django checks

Those remain separate release signals.

## Recommended release order

Before a release candidate is accepted:

1. Run backend verification.
2. Run `npm run test:e2e:launch`.
3. Run the broader frontend Playwright lanes as needed for the release type.
4. Run staging UAT and release-runbook checks.

## Source references

- `gst-compliance-frontend/package.json`
- `.github/workflows/frontend-playwright.yml`
- `docs/live-release-runbook.md`
- `docs/qa-execution-guide.md`
- `docs/launch-scope.md`
