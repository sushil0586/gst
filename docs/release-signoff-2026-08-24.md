# Release Signoff Record

Date: August 24, 2026

## Purpose

This document is the final release-decision artifact for the current GST Compliance launch candidate.

It is meant to capture:

- what was verified
- what decision is being recommended
- who owns the release
- what still must be explicitly confirmed before go-live

## Release candidate status

Recommendation: **go for controlled launch after final owner signoff**, not for broad unsupervised rollout.

Why:

- backend verification baseline is green
- frontend launch gate is green
- staging live functional verification is green
- staging live visual smoke is green
- the remaining risk is primarily operational, not feature-completeness risk

## Verified evidence

### Backend

- verification command:
  - `pytest -q`
- last known verified result:
  - `318 passed, 2 warnings`

### Frontend local release gate

- command:
  - `cd gst-compliance-frontend && npm run test:e2e:launch`
- last known verified result:
  - `5 passed`

### Staging environment

- URL:
  - `https://gst-stage.accerio.in`
- demo admin:
  - `demo_admin@example.com`

### Staging live functional verification on August 24, 2026

- result:
  - `14 passed`
- verified areas:
  - auth sign-in, refresh persistence, and sign-out
  - mobile-width auth and navigation
  - dashboard and major signed-in route navigation
  - settings, team, workspace, and change-password flows
  - clients, GSTINs, and compliance periods
  - imports, returns blocker guidance, and reconciliation routing
  - operations, approvals, follow-ups, notices, and audit trail
  - IMS read-only provider checks

### Staging live visual verification on August 24, 2026

- command family:
  - `cd gst-compliance-frontend && npm run test:e2e:live:visual`
- result:
  - `1 passed`
- verified visual areas:
  - dashboard hero
  - imports
  - returns
  - reports
  - IMS
  - settings team management

## Launch scope covered by this signoff

This signoff currently supports a controlled release for:

1. Returns workflow surfaces in the current supported scope
2. Notices
3. Settings administration surfaces currently in release scope
4. IMS operator workbench in the currently supported read-oriented scope
5. Core authenticated navigation and seeded staging operator flows

## Required named owners

These fields must be filled before final go-live approval:

- Release owner: `TBD`
- Support owner: `TBD`
- Rollback owner: `TBD`
- Production deploy owner: `TBD`
- Business approver: `TBD`

## Required rollout decisions

These decisions must be explicitly recorded before launch:

- Target tenant scope: `TBD`
- Rollout mode: `controlled launch`
- Filing scope allowed at launch: `TBD`
- Whether provider write actions are enabled immediately: `TBD`
- Whether live staging smoke is mandatory before every release: `TBD`

## Required operational confirmations

These items are not yet confirmed inside this record and still need explicit completion:

1. Production secrets are rotated and stored outside repo-managed env files.
2. Production `check --deploy` posture is acceptable.
3. Celery/systemd service topology is confirmed and matches the intended production deployment.
4. Retention and scheduled jobs are enabled in the target environment.
5. Logging and alert routing exists for auth failures, provider auth failures, and request rejection events.
6. The full release runbook in `docs/live-release-runbook.md` is executed and marked complete by an assigned owner.

Use this checklist to close these items:

- `docs/production-launch-ops-checklist-2026-08-24.md`

Recommended execution track for closing them this week:

- `docs/one-week-broad-rollout-confidence-plan-2026-08-24.md`

## Go decision rule

Approve controlled launch only if all of the following are true:

1. Backend verification is green.
2. Frontend launch gate is green.
3. Staging live functional smoke is green.
4. Staging live visual smoke is green.
5. Release owner and support owner are explicitly assigned.
6. Target tenant scope is explicitly documented.
7. Production security and worker topology confirmations are complete.
8. Rollback owner is named and rollback path is understood.

## No-go conditions

Do not approve launch if any of the following are true:

1. Staging auth or operator flows are unreliable.
2. Required release checks are failing.
3. Target tenant scope is not explicitly bounded.
4. Production worker/service topology is still unclear.
5. Support handling for first-cycle incidents is not assigned.
6. Rollback responsibility is unclear.

## Decision log

- August 24, 2026:
  - Controlled-launch recommendation recorded based on green backend baseline, green frontend launch gate, green staging functional smoke, and green staging visual smoke.
  - Remaining work is primarily operational signoff and production-environment confirmation.

## Final approval

- Decision: `Pending final named-owner approval`
- Approved by: `TBD`
- Approval timestamp: `TBD`
- Release window: `TBD`
- Rollback window: `TBD`
