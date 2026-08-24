# One-Week Broad Rollout Confidence Plan

Date: August 24, 2026

## Purpose

This plan is the fastest realistic path to raise confidence from:

- controlled launch confidence: strong
- broad/open rollout confidence: limited

The goal is not to make the product perfect in one week.

The goal is to remove the highest-signal uncertainties that currently keep broad rollout confidence lower than controlled-launch confidence.

## Target outcome by end of week

If this plan is completed well, expected confidence movement is:

- broad/open rollout confidence:
  - from `5.5/10`
  - to approximately `7.5/10` or better

That assumes:

- real production or production-like environment verification
- explicit named ownership
- completed operational closeout evidence
- one end-to-end release rehearsal with captured evidence

## Scope

This week is focused on five outcomes:

1. prove actual production topology
2. close the production launch ops checklist
3. assign named release ownership
4. run one full production-like release rehearsal
5. define and record rollout boundaries

## Roles needed

Use these working roles even if the exact people differ:

- Release owner
- Backend owner
- Frontend owner
- DevOps or platform owner
- QA or UAT owner
- Support owner
- Business approver

## Day-by-day execution plan

## Day 1: Topology truth and owner assignment

Primary goal:

- eliminate uncertainty about who owns launch and what actually runs in the target environment

Tasks:

1. Fill named owners in:
   - `docs/release-signoff-2026-08-24.md`
2. Review the actual target environment against:
   - `docs/production-launch-ops-checklist-2026-08-24.md`
3. Confirm real service names and queue mapping:
   - backend
   - frontend
   - imports worker
   - reconciliation worker
   - filings worker
   - scheduled worker
   - celery beat
4. Record mismatches between docs and real systemd units.
5. Confirm release window and rollback owner.

Suggested commands:

```bash
systemctl list-unit-files | grep -E 'celery|gst'
systemctl list-units --type=service | grep -E 'celery|gst'
ls -1 /etc/systemd/system | grep -E 'celery|gst'
redis-cli ping
```

Exit criteria:

- all primary owners are named
- actual service topology is recorded
- any missing worker/unit mismatch is identified clearly

## Day 2: Security and deploy posture verification

Primary goal:

- confirm the target environment is safe enough for a broader rollout posture

Tasks:

1. Validate production secret handling.
2. Confirm cookie, TLS, and redirect settings.
3. Review host, CORS, and CSRF settings.
4. Run security verification commands.
5. Record outputs and any exceptions.

Required commands:

```bash
./venv/bin/python manage.py check
./venv/bin/python manage.py check --deploy
./venv/bin/python manage.py audit_security_posture
./venv/bin/python manage.py enforce_security_retention --audit-days 1 --filing-days 1 --provider-auth-days 1 --import-days 1
cd gst-compliance-frontend && npm run lint && npm run build
```

Exit criteria:

- deploy posture is reviewed and acceptable
- security checklist evidence is recorded
- any required remediation items are either fixed or explicitly accepted

## Day 3: Workers, retention, logging, and alerting

Primary goal:

- confirm the operational system can support real incident handling

Tasks:

1. Confirm Celery Beat is running.
2. Confirm retention settings are enabled.
3. Confirm queue split matches intended topology.
4. Confirm security log destination and capture path.
5. Confirm alert routing for:
   - `auth.login_failed`
   - `provider_auth.failed`
   - `request.rejected`
6. Record monitoring or alert destinations.

Exit criteria:

- scheduled jobs are confirmed active
- logging and alert destinations are documented
- worker topology is confirmed as operational, not just configured

## Day 4: Full release rehearsal

Primary goal:

- prove the release process works end to end with evidence, not assumptions

Tasks:

1. Execute `docs/live-release-runbook.md`.
2. Complete the auth smoke path.
3. Complete the user-management path.
4. Complete the notices path.
5. Complete the live-data path.
6. Complete the filing control path up to the approved rollout boundary.
7. Capture required screenshots and evidence.
8. Mark checklist completion in:
   - `docs/production-launch-ops-checklist-2026-08-24.md`

Exit criteria:

- runbook completed end to end
- evidence pack captured
- no unclear release step remains undocumented

## Day 5: Rollout boundary and final signoff

Primary goal:

- convert technical readiness into an explicit release decision

Tasks:

1. Define target tenant scope.
2. Define enabled filing scope at launch.
3. Decide whether provider write actions are enabled immediately or phased.
4. Decide which checks are mandatory before each release:
   - backend verification
   - launch gate
   - live staging smoke
   - live visual smoke
   - any additional production checks
5. Fill final fields in:
   - `docs/release-signoff-2026-08-24.md`
6. Record go / no-go decision.

Exit criteria:

- tenant scope is explicit
- rollout boundaries are explicit
- signoff record is complete
- go / no-go decision is recorded

## Priority order if time compresses

If the team cannot complete everything, do these first:

1. actual service topology confirmation
2. named owner assignment
3. `check --deploy` and security verification
4. full runbook rehearsal
5. rollout boundary and final signoff

Do not skip the first three and still call the rollout broad-launch ready.

## Deliverables by end of week

These should all exist in completed form:

1. `docs/release-signoff-2026-08-24.md`
2. `docs/production-launch-ops-checklist-2026-08-24.md`
3. release rehearsal evidence pack
4. recorded target tenant scope
5. required release-check policy

## Definition of success

This week is successful if:

- the remaining unknowns are reduced to conscious business decisions, not hidden environment risk
- worker and service topology is proven
- security and deploy posture is evidenced
- release owners are named
- rollout boundaries are explicit
- the team can say exactly why launch is safe, for whom, and under what controls

## Definition of failure

This week is not successful if:

- systemd/Celery topology is still unclear
- owner fields remain `TBD`
- rollout scope remains vague
- deploy/security checks were not actually run
- runbook completion is still theoretical

## Recommended next step after this week

If the week completes successfully:

- move from controlled launch confidence to broader rollout preparation
- start a limited but larger supervised tenant wave
- keep feature gates and support monitoring active

If the week does not complete successfully:

- stay in controlled-launch mode
- do not widen rollout scope
- treat remaining unknowns as operational blockers, not paperwork
