# Launch Readiness Assessment

Date: August 24, 2026

## Purpose

This is the current go/no-go assessment for the GST Compliance launch scope.

It is meant to answer:

- are we launch-capable right now
- what is still blocking a responsible launch
- what can be accepted in a controlled release
- what should happen next

## Current recommendation

Recommendation: **conditional go for a controlled launch**, not yet a broad or loosely supervised rollout.

Reason:

- the backend verification baseline is now green
- the frontend launch gate is now defined, automated, documented, and passing
- staging live Playwright verification is now passing across functional and visual smoke coverage
- the visible launch surfaces for Returns, Notices, Settings, and IMS now have explicit release coverage
- the remaining risks are mostly operational and staging-truth risks, not obvious missing architecture risks

This is strong enough for a controlled release with explicit rollout ownership, staging rehearsal, and release-check discipline.

It is not yet strong enough for an unstructured “open the product widely and trust the environment” launch posture.

## Verified state as of August 24, 2026

### Backend

- local backend verification has been made repeatable
- backend CI workflow exists in `.github/workflows/backend-verification.yml`
- latest verified result:
  - `pytest -q`
  - `318 passed, 2 warnings`
- filing failure persistence and auth-session contract handling were fixed and reverified

### Frontend

- launch-critical Playwright gate exists as:
  - `npm run test:e2e:launch`
- CI equivalent exists as:
  - `launch-e2e` job in `.github/workflows/frontend-playwright.yml`
- latest verified result:
  - `5 passed`
- broader bundled launch regression was also verified earlier in local mocked coverage

### Staging

- staging URL verified:
  - `https://gst-stage.accerio.in`
- seeded demo credentials verified:
  - `demo_admin@example.com`
- live functional Playwright verification result on August 24, 2026:
  - `14 passed`
- live visual Playwright verification result on August 24, 2026:
  - `1 passed`
- covered staging areas:
  - sign-in, refresh persistence, and sign-out
  - mobile-width auth and navigation
  - major signed-in route navigation
  - settings, team, workspaces, and change-password validation
  - clients, GSTINs, and compliance periods
  - imports, returns blocker guidance, and reconciliation routing
  - operations, approvals, follow-ups, notices, and audit trail
  - IMS read-only provider checks
  - seeded visual smoke for dashboard, imports, returns, reports, IMS, and team management

### Release documentation

- launch scope is documented
- launch gap matrix is documented
- QA execution guide includes the launch gate
- live release runbook includes the frontend launch regression step
- a dedicated frontend launch verification summary exists
- a release signoff record exists
- a production launch ops checklist exists
- a one-week broad-rollout confidence plan exists

## Supported launch surfaces

The current launch-ready visible frontend scope is:

1. Returns
2. Notices
3. Settings administration hub
4. IMS operator surface

These are now treated as supported release surfaces, not placeholder navigation.

## Must-fix before launch

These are the items that should be completed before the release is declared truly ready:

1. Release signoff artifact
   We now have strong staging evidence, but we still need one explicit signoff record that names:
   - release owner
   - support owner
   - target tenant scope
   - rollback owner
   - exact release date and window

2. Final required-check policy
   The team should explicitly decide which GitHub checks are required for release approval:
   - `backend-verification`
   - `launch-e2e`
   - local or CI visual-regression policy
   - whether live staging smoke is mandatory or advisory

3. Rollout policy confirmation on target tenants
   Launch should not proceed without explicit confirmation that rollout-control rules, maker-checker behavior, and support routing match the intended tenant scope.

4. Production security and worker topology verification
   Before launch, the team still needs to confirm:
   - production secrets are rotated and not shared from local files
   - retention and scheduled jobs are enabled in the target environment
   - Celery/systemd worker units actually exist with the intended names
   - log and alert routing is in place for auth, provider, and request failures

5. Full runbook rehearsal ownership
   The live checks are green, but someone still needs to execute the full release runbook end to end and mark each step complete.

## Acceptable for controlled launch

These are not ideal, but they are acceptable in a controlled launch if they are understood:

1. CI overlap between the narrow launch gate and broader frontend coverage
   This is a cost/performance issue, not a release blocker.

2. Non-blocking web-server warning noise during Playwright startup
   The `ECONNREFUSED 127.0.0.1:8010` warnings did not fail the launch gate and currently appear to be startup noise rather than product failure.

3. Live visual baseline refreshes on approved UI changes
   The live dashboard visual target had to be tightened and staging baselines were intentionally refreshed on August 24, 2026. This is acceptable if baseline updates remain deliberate and documented.

4. Broader hardening backlog on support depth and observability
   These should continue post-launch, but they do not appear to block a narrow, supervised release.

## Defer to post-launch hardening

These should remain on the roadmap, but they do not need to block a controlled launch:

1. Broader cross-browser and visual policy simplification
2. Additional launch-surface Playwright depth beyond the current gate
3. Further documentation consolidation
4. Additional operational dashboards and alerting refinement
5. Deeper IMS expansion beyond the currently supported operator surface

## Main risks if we launch now

1. Staging-only or environment-only regressions
   The biggest remaining uncertainty is no longer mocked local workflow logic. It is real environment behavior.

2. Process drift during release
   If the team does not consistently use the release runbook and required gates, the current readiness gains can be bypassed operationally.

3. Tenant rollout mistakes
   The system is now more launch-capable, but that increases the importance of correct rollout policy and support-role setup.

4. Production-worker mismatch
   The recent staging deployment question about missing Celery service units is a reminder that documented service names and actual environment topology can drift. That is an operational launch risk until confirmed.

## Go / no-go rule

### Go

Proceed with a controlled launch only if all of the following are true:

1. backend verification is green
2. `npm run test:e2e:launch` is green
3. staging live smoke and live visual smoke are green
4. tenant rollout policy is confirmed
5. release owner and support owner are explicitly assigned
6. production worker/security checklist is confirmed

### No-go

Do not proceed if any of the following are true:

1. staging auth or filing-access flows are unreliable
2. rollout policy behavior is not understood for the target tenant scope
3. the launch gate is failing
4. backend verification is failing
5. support ownership is unclear for first-cycle issues
6. production service topology is not understood

## Immediate next actions

1. Capture a release signoff record with owner names, tenant scope, rollback path, and release window.
2. Decide and document required GitHub and Playwright checks for release approval.
3. Verify production security settings and actual worker/service topology using `docs/production-launch-ops-checklist-2026-08-24.md`.
4. Use `docs/one-week-broad-rollout-confidence-plan-2026-08-24.md` as the recommended execution track for this work.
5. Execute and mark complete the full release runbook from `docs/live-release-runbook.md`, then finalize `docs/release-signoff-2026-08-24.md`.

## Bottom line

As of August 24, 2026, the product appears **launch-capable for a controlled release**.

The remaining work is now clearly concentrated in operational proof, release discipline, and production-environment confirmation rather than obvious missing frontend or backend implementation.
