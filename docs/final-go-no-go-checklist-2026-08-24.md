# Final Go / No-Go Checklist

Date: August 24, 2026

## Purpose

This is the shortest possible closeout list for the current GST Compliance launch candidate.

Use it when the team needs one direct answer to:

- what still must be done before controlled launch
- what is already good enough
- what can wait until broader rollout

Use together with:

- [release-signoff-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/release-signoff-2026-08-24.md:1)
- [production-launch-ops-checklist-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/production-launch-ops-checklist-2026-08-24.md:1)
- [sep-1-10-customer-controlled-launch-plan-2026-09-01.md](/Users/ansh/Documents/Gst-Compliance/docs/sep-1-10-customer-controlled-launch-plan-2026-09-01.md:1)
- [postgres-oom-mitigation-plan-2026-08-24.md](/Users/ansh/Documents/Gst-Compliance/docs/postgres-oom-mitigation-plan-2026-08-24.md:1)

## Already green

- [x] Backend verification baseline is green.
- [x] Frontend launch gate is green.
- [x] Staging login page is reachable.
- [x] Staging auth login returns `200 OK`.
- [x] Staging live functional smoke is green.
- [x] Staging live visual smoke is green.
- [x] SSL redirect hardening is enabled without breaking auth.
- [x] Staging worker topology exists and is running.
- [x] Imports and reconciliation worker concurrency were reduced from `4` to `2`.
- [x] Post-hardening staging validation passed after the concurrency reduction.

## Verification Refresh

Current refresh on August 30, 2026:

- [x] Backend verification passed: `319 passed, 2 warnings`.
- [x] Frontend lint passed with two existing warnings in `tests/e2e/live-ims.spec.ts`.
- [x] Frontend production build passed.
- [x] Frontend launch gate passed: `5 passed`.
- [x] Staging recovery validation passed: SSH reachable, core services running, public login `200 OK`, public auth login `200 OK`, and live smoke `2 passed`.
- [x] Staging live visual smoke passed after approving refreshed live baselines for current seeded staging data.
- [x] September 1 10-customer controlled launch plan created.

Capacity note from August 30, 2026 validation:

- staging still runs on a `1.9 GiB` host with roughly `146 MiB` free memory and `510 MiB` swap in use during validation.
- this remains acceptable only for a controlled launch with explicit support ownership and memory/capacity risk acceptance.

September 1 pilot reference:

- [sep-1-10-customer-controlled-launch-plan-2026-09-01.md](/Users/ansh/Documents/Gst-Compliance/docs/sep-1-10-customer-controlled-launch-plan-2026-09-01.md:1)

## Must close before controlled launch

- [ ] Name the release owner.
- [ ] Name the support owner.
- [ ] Name the rollback owner.
- [ ] Name the production deploy owner.
- [ ] Record the target tenant scope.
- [ ] Record the allowed filing scope at launch.
- [ ] Decide whether provider write actions are enabled immediately or phased.
- [ ] Confirm production secrets are rotated and stored outside repo-managed env files.
- [ ] Confirm production `check --deploy` posture is acceptable.
- [ ] Confirm production logging and alert routing for auth, provider, and request failures.
- [ ] Confirm the rollback path and release window.
- [ ] Explicitly accept the remaining memory/capacity risk for the controlled-launch scope.

## Strongly recommended before broader rollout

- [ ] Move GST staging to a dedicated host or increase memory materially.
- [ ] Re-review Postgres, swap, and worker-memory behavior after the next heavy import run.
- [ ] Decide whether production queue concurrency should also be reduced or rebalanced.
- [ ] Add clearer alerting for OOM, swap pressure, and worker recycling.
- [ ] Confirm whether Finacc and GST should continue sharing infrastructure.

## Controlled-launch decision rule

Mark `Go` only if every item in `Must close before controlled launch` is complete and the team accepts the current host-capacity tradeoff.

Mark `No-go` if any of the following are still true:

- release or rollback ownership is unclear
- target rollout scope is still vague
- production secrets/check posture are not confirmed
- logging/alert routing is not confirmed
- memory-pressure risk is neither reduced nor consciously accepted

## Current recommendation

Recommendation as of August 24, 2026:

- **Controlled launch:** `Go after final owner and scope signoff`
- **Broad rollout:** `Not yet`

## Recommended values to confirm

These are the recommended defaults for a controlled launch based on the current technical and staging evidence.

- Go / no-go: `Go for controlled launch after owner confirmation`
- Target tenant scope: `small named pilot cohort only`
- Filing scope at launch: `approved operator-managed flows only`
- Provider write mode: `phased; do not enable broadly on day one`
- Live staging smoke policy: `mandatory before each release until host-capacity risk is retired`
- Risk acceptance note: `shared 1.9 GiB staging host is acceptable for controlled launch, not acceptable evidence for broad rollout confidence`

## Current confidence

- Controlled launch confidence: `9.2/10`
- Broad rollout confidence: `7.7/10`

## Final closeout fields

- Go / no-go: `Recommended: Go for controlled launch after owner confirmation`
- Release owner: `TBD`
- Support owner: `TBD`
- Rollback owner: `TBD`
- Deploy owner: `TBD`
- Target tenant scope: `Recommended: small named pilot cohort only`
- Filing scope at launch: `Recommended: approved operator-managed flows only`
- Provider write mode: `Recommended: phased, not broad day-one enablement`
- Release window: `TBD`
- Risk acceptance note: `Recommended: accept shared-host capacity tradeoff for controlled launch only`

## Ready-To-Fill Signoff Block

Use this block on Tuesday, August 25, 2026 when you are ready to finalize the decision:

```text
GST Compliance Controlled Launch Signoff
Date: August 25, 2026

Decision: Go for controlled launch

Release owner: <name>
Support owner: <name>
Rollback owner: <name>
Production deploy owner: <name>
Business approver: <name>

Target tenant scope: small named pilot cohort only
Filing scope at launch: approved operator-managed flows only
Provider write mode: phased, not broad day-one enablement
Live staging smoke policy: mandatory before each release until host-capacity risk is retired

Release window: <date/time window>
Rollback window: <date/time window>

Risk acceptance:
Shared-host capacity tradeoff is accepted for controlled launch only.
Broad rollout is not approved from this environment posture.

Approval notes:
- Backend verification green
- Frontend launch gate green
- Staging auth green
- Staging live functional smoke green
- Staging live visual smoke green
- Post-hardening staging validation green
- Remaining risk is memory/capacity hardening, not core product flow failure
```
