# Release Baseline Classification

## Purpose

This document classifies the current working-tree changes as of August 24, 2026 into:

- must ship in the release baseline
- related but not strictly required for launch
- in-progress or pilot-only work that should not silently define the launch baseline

This is an Epic 1 artifact.

It helps us separate release-candidate work from active development noise.

## Current working-tree themes

Based on the current `git status`, the active changes cluster into five groups:

1. IMS feature implementation
2. Playwright live, visual, and browser-smoke expansion
3. frontend launch-readiness docs and UI copy changes
4. backend/provider integration changes
5. generated test-result artifacts

## Classification table

| Group | Files | Classification | Rationale | Recommended action |
| --- | --- | --- | --- | --- |
| IMS backend | `apps/ims/*`, `config/api_urls.py`, related type/query wiring | Pilot-only / in-progress | New backend module and route surface are still being actively introduced. | Keep out of the launch baseline unless IMS is explicitly promoted into scope. |
| IMS frontend | `gst-compliance-frontend/src/app/(dashboard)/ims/page.tsx`, `src/features/ims/*`, query keys, navigation, types | Pilot-only / in-progress | IMS UI and data hooks are new and still changing alongside tests and snapshots. | Treat as a separately reviewable feature slice. |
| IMS Playwright coverage | `tests/e2e/ims-workbench.spec.ts`, `tests/e2e/live-ims.spec.ts`, IMS snapshot files | Related but not blocking for core launch | Good coverage work, but only mandatory if IMS is in launch scope. | Keep if IMS stays pilot-visible; do not let it block core launch scope. |
| Visual-regression expansion | `tests/e2e/visual-regression.spec.ts`, new snapshots, `tests/fixtures/visual-fixture.ts` | Must ship if these tests are part of the release gate | Visual coverage is directly tied to launch confidence, but snapshot churn must be intentional. | Review and keep as part of the release baseline once approved. |
| Cross-browser visual smoke | `tests/e2e/visual-cross-browser-smoke.spec.ts`, related snapshots, `tests/fixtures/visual-smoke-fixture.ts` | Must ship | This strengthens the launch QA gate and is already reflected in workflow/docs. | Keep and stabilize. |
| Live visual smoke | `tests/e2e/live-visual-smoke.spec.ts`, related snapshots | Related but non-blocking | Valuable staged confidence lane, but currently non-blocking by design. | Keep if stable; do not treat failures as launch blockers unless policy changes. |
| Frontend Playwright workflow | `.github/workflows/frontend-playwright.yml` | Must ship | This is release-process infrastructure for frontend confidence. | Keep and review as part of Epic 1 baseline. |
| QA documentation updates | `docs/qa-execution-guide.md`, `README.md`, `UI_UX_REVIEW.md`, `QA_FINDINGS.md` | Related but not all launch-blocking | Some files are operationally important; others are supporting review docs. | Keep docs that define actual test/release process. Defer opinionated review docs if needed. |
| Auth/login frontend tweaks | `gst-compliance-frontend/src/app/(auth)/login/page.tsx`, `src/app/api/auth/login/route.ts` | Must review before baseline freeze | Auth is launch-critical, so even small changes matter. | Verify and include only after confirming behavior. |
| Settings guide copy/navigation updates | `gst-compliance-frontend/src/app/(dashboard)/settings/user-guide/page.tsx`, sidebar/navigation files | Must ship if they improve launch honesty | Launch labeling and navigation clarity are in Epic 1 scope. | Keep if they support scope clarity. |
| WhiteBooks provider client changes | `apps/integrations/whitebooks/client.py` | Related but potentially launch-critical | Filing/provider changes can affect live rollout posture even if not immediately visible in UI. | Review separately and classify by operational impact before baseline freeze. |
| Backend settings changes | `config/settings.py` | Must review before baseline freeze | Settings changes affect testability, environment behavior, and launch risk directly. | Review carefully and include only with explicit intent. |
| Package/test command changes | `gst-compliance-frontend/package.json` | Must ship if tied to the launch gate | Test scripts define the release workflow. | Keep if aligned with the launch test matrix. |
| Generated last-run artifact | `gst-compliance-frontend/test-results/.last-run.json` | Do not ship | Generated local artifact, not source of truth. | Exclude from the release baseline. |

## Must-ship baseline candidates

These areas are the strongest candidates for the release baseline:

- frontend Playwright workflow changes
- approved visual-regression and cross-browser smoke additions
- launch-honesty navigation and settings-guide improvements
- any auth-related fixes that are verified
- any backend settings changes required for reliable verification

These directly support Epic 1 goals:

- clear launch scope
- reliable verification
- stronger release gate

## Related but not automatically blocking

These changes matter, but they do not all need to ship in the first frozen baseline:

- live visual smoke additions
- QA documentation refinements
- IMS automated coverage, if IMS remains pilot-only
- WhiteBooks client changes that are not required for the immediate controlled-launch boundary

## In-progress or pilot-only work

These changes should not silently become part of the launch baseline without a conscious scope decision:

- IMS backend implementation
- IMS frontend implementation
- IMS route/navigation inclusion
- IMS-specific snapshots and live tests if IMS is not in launch-ready scope

## Recommended baseline decision

Recommended Epic 1 baseline rule:

1. Keep all core launch verification improvements.
2. Keep launch-honesty docs and navigation changes.
3. Exclude generated artifacts.
4. Hold IMS as pilot-only unless we explicitly choose to promote it.
5. Review WhiteBooks client and backend settings changes independently because they can affect rollout safety.

## Immediate cleanup list

Before we call the branch a release candidate, do this:

1. Remove generated files from the baseline, especially `gst-compliance-frontend/test-results/.last-run.json`.
2. Review auth-related frontend changes for launch impact.
3. Review `config/settings.py` for environment and verification impact.
4. Review `apps/integrations/whitebooks/client.py` for live-rollout implications.
5. Decide whether IMS is:
   - excluded from the release candidate
   - included as pilot-only
   - promoted into launch-ready scope

## Done condition

Release baseline classification is complete when:

- every current working-tree change is understood by group
- must-ship changes are separated from pilot-only work
- generated artifacts are excluded
- IMS has an explicit baseline decision
