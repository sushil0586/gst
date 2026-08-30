# GST Compliance

GST Compliance is a split-stack GST operations product:

- A Django + Django REST Framework backend at the repository root
- A Next.js frontend in `gst-compliance-frontend/`

The project is no longer just a scaffold. Core flows for authentication, client hierarchy, imports, GST transactions, reconciliation, returns, approvals, notices, audit logs, dashboard summaries, exports, and settings-linked administration are present.

## Repository layout

```text
.
├── apps/                         Django domain apps
├── config/                       Django settings, URLs, ASGI/WSGI, Celery
├── docs/                         Runbooks, sample bundles, UAT docs, technical review
├── gst-compliance-frontend/      Next.js App Router frontend
├── media/                        Local uploaded import files
├── tests/                        Backend cross-cutting tests
├── tools/                        Internal helper scripts
├── manage.py
└── requirements.txt
```

## Current status

### Implemented backend areas

- JWT auth with current-user session payload
- Organizations, workspaces, clients, GSTINs, and compliance periods
- Import batches and import templates
- GST transaction creation and remediation support records
- Reconciliation runs and reconciliation items
- Return preparation, readiness, approval, filing, and workbook export hooks
- Approval requests, notices, and audit logs
- Dashboard summary and close-manager reporting
- CSV/XLSX export endpoints

### Implemented frontend areas

- Auth, onboarding, dashboard shell, imports, reconciliation, returns, approvals, reports, audit trail
- Live API integration for core flows through TanStack Query
- Safer fallback behavior for clients, GSTINs, and periods only when live API requests fail

### Visible operations surface

The visible product surface now includes:

- `/notices`
- `/settings`
- `/ims`

These routes are part of the active launch-readiness scope and should be treated as supported product surfaces, not placeholder navigation.

Primary frontend launch verification reference:

- [docs/frontend-launch-verification-summary.md](/Users/ansh/Documents/Gst-Compliance/docs/frontend-launch-verification-summary.md:1)

## Tech stack

### Backend

- Django
- Django REST Framework
- SimpleJWT
- django-filter
- drf-spectacular
- django-cors-headers
- django-environ
- Celery + Redis foundation
- PostgreSQL, with SQLite fallback available for local convenience

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Axios
- React Hook Form + Zod

## Local setup

## 1. Backend

```bash
cd /Users/ansh/Documents/Gst-Compliance
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver 7000
```

If PostgreSQL is not available locally, set this in `.env`:

```bash
USE_SQLITE_FALLBACK=True
```

## 2. Frontend

```bash
cd /Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend default API target:

```text
http://127.0.0.1:7000/api/v1
```

Open:

```text
http://localhost:3000
```

## Demo login

After running `python manage.py seed_demo_data`:

- Email: `demo_admin@example.com`
- Username: `demo_admin`
- Password: `demo12345`

For Playwright live and live-visual runs, prefer the host root as `PLAYWRIGHT_BASE_URL`, not a deep link such as `/dashboard`. For your staging environment, use `https://gst-stage.accerio.in` rather than `https://gst-stage.accerio.in/dashboard`.

Recommended staging live Playwright env:

```bash
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com
PLAYWRIGHT_LIVE_PASSWORD=demo12345
```

Recommended local live Playwright env:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com
PLAYWRIGHT_LIVE_PASSWORD=demo12345
```

Example staging live visual smoke run:

```bash
cd gst-compliance-frontend
PLAYWRIGHT_BASE_URL=https://gst-stage.accerio.in \
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com \
PLAYWRIGHT_LIVE_PASSWORD=demo12345 \
npm run test:e2e:live:visual
```

Example local live visual smoke run:

```bash
cd gst-compliance-frontend
PLAYWRIGHT_BASE_URL=http://localhost:3001 \
PLAYWRIGHT_LIVE_EMAIL=demo_admin@example.com \
PLAYWRIGHT_LIVE_PASSWORD=demo12345 \
npm run test:e2e:live:visual
```

GitHub Actions live-visual secrets should use the same values:

- `PLAYWRIGHT_BASE_URL`: `https://gst-stage.accerio.in` in CI, or `http://localhost:3001` for local-only testing
- `PLAYWRIGHT_LIVE_EMAIL`: `demo_admin@example.com`
- `PLAYWRIGHT_LIVE_PASSWORD`: `demo12345`

## Staging recovery validation helper

When staging access is restored after an incident, run the repeatable validation helper from the repo root:

```bash
bash tools/staging_recovery_validation.sh
```

Optional overrides:

- `GST_STAGE_HOST`
- `GST_STAGE_USER`
- `GST_STAGE_SSH_KEY`
- `GST_STAGE_PUBLIC_BASE_URL`
- `GST_STAGE_LOGIN_EMAIL`
- `GST_STAGE_LOGIN_PASSWORD`

## Public launch readiness audit

Before approving a public launch, run the repeatable audit helper on the target release environment:

```bash
bash tools/public_launch_readiness_audit.sh
```

The helper runs backend/frontend gates, Django deploy checks, a fail-on-warning security posture audit, and host service checks when available. It skips retention enforcement by default because retention mutates old sensitive payloads; set `RUN_RETENTION_EXERCISE=true` only on an approved target.

To verify production service topology directly:

```bash
bash tools/service_topology_audit.sh
```

To collect thresholded capacity evidence against authenticated API paths:

```bash
./venv/bin/python tools/loadtest_api.py \
  --base-url https://<production-host>/api/v1 \
  --email <pilot-admin-email> \
  --password <pilot-admin-password> \
  --max-p95-ms 1500 \
  --max-error-rate 0
```

See:

- [docs/public-launch-blocker-burn-down-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/public-launch-blocker-burn-down-2026-08-30.md:1)

## Media storage

The project supports both local filesystem media storage and S3-compatible object storage for uploaded files.

See:

- [docs/s3-media-storage-setup.md](/Users/ansh/Documents/Gst-Compliance/docs/s3-media-storage-setup.md:1)

## Backend commands

```bash
python manage.py migrate
python manage.py seed_demo_data
python manage.py seed_production_defaults --owner-email=ops@example.com --owner-password='change-me' --gstin=27ABCDE1234T1Z5 --state-code=27 --period=2026-05
python manage.py createsuperuser
python manage.py runserver 7000
python manage.py audit_security_posture
python manage.py enforce_security_retention
celery -A config worker -l info
celery -A config beat -l info
```

## Backend verification

Local backend verification now runs cleanly with the project test configuration:

```bash
export DEBUG=true
export USE_SQLITE_FALLBACK=true
export SECRET_KEY=local-dev-secret-key-for-checks-1234567890
export JWT_SIGNING_KEY=local-dev-jwt-signing-key-1234567890
./venv/bin/python manage.py check
./venv/bin/python manage.py makemigrations --check --dry-run
./venv/bin/pytest -q
```

Notes:

- test runs automatically use the project test-safe settings path
- pytest uses SQLite fallback during local test execution for stable verification
- production-only secret enforcement still applies outside test mode
- `manage.py check` and `makemigrations --check` need non-placeholder secrets unless you are running in test mode, so the example above sets safe local verification env vars first

Production defaults command notes:

- seeds the entity graph: owner user, organization, workspace, client, GSTIN, and both `GSTR-1` and `GSTR-3B` periods
- seeds WhiteBooks rollout-policy records for `gstr1` and `gstr3b`
- seeds default operational alert routing rules by role
- stays idempotent, so it can be rerun safely as defaults evolve

## Frontend commands

```bash
npm run dev
npm run build
```

Important:

- `npm` commands do not run from the repository root.
- Run them from `gst-compliance-frontend/`.

## API surface

Base path:

- `/api/v1/`

Auth and schema:

- `/api/v1/auth/token/`
- `/api/v1/auth/token/refresh/`
- `/api/v1/auth/me/`
- `/api/v1/auth/register/`
- `/api/v1/schema/`
- `/api/v1/docs/`
- `/api/v1/redoc/`

Core routed resources:

- `organizations`
- `workspaces`
- `clients`
- `gstins`
- `compliance-periods`
- `import-templates`
- `imports/batches`
- `gst-transactions`
- `gst-transaction-review-snapshots`
- `gst-transaction-remediation-assignments`
- `gst-transaction-remediation-digests`
- `gst-transaction-remediation-follow-ups`
- `workspace-members`
- `reconciliation/runs`
- `reconciliation/items`
- `returns`
- `approvals`
- `notices`
- `audit-logs`

Dashboard and export endpoints:

- `dashboard/summary/`
- `dashboard/close-manager/`
- `dashboard/close-manager/report/`
- `exports/transactions/`
- `exports/import-errors/`
- `exports/reconciliation/`
- `exports/return-summary/`
- `exports/audit-logs/`
- `exports/close-manager-report/`

## Architecture notes

- Views are intentionally thin.
- Business logic lives in `services/`.
- Query composition lives in `selectors/`.
- Shared pagination, permissions, response envelopes, and exports live in `apps/common/`.
- Frontend API access is organized by feature under `gst-compliance-frontend/src/features/`.
- Workspace/client/GSTIN/period selection is centralized in `gst-compliance-frontend/src/store/workspace-context.tsx`.

## Documentation

- Pilot runbook: [docs/pilot-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/pilot-runbook.md:1)
- Filing incident runbook: [docs/filing-incident-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/filing-incident-runbook.md:1)
- Import correction workflow plan: [docs/import-correction-workflow-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-workflow-plan.md:1)
- Import correction implementation backlog: [docs/import-correction-implementation-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/import-correction-implementation-backlog.md:1)
- Production security checklist: [docs/production-security-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/production-security-checklist.md:1)
- AWS EC2 staging deployment guide: [docs/aws-ec2-staging-deployment.md](/Users/ansh/Documents/Gst-Compliance/docs/aws-ec2-staging-deployment.md:1)
- Observability runbook: [docs/observability-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/observability-runbook.md:1)
- Worker topology and load-test runbook: [docs/worker-topology-and-loadtest-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/worker-topology-and-loadtest-runbook.md:1)
- Live release runbook: [docs/live-release-runbook.md](/Users/ansh/Documents/Gst-Compliance/docs/live-release-runbook.md:1)
- Import bundles guide: [docs/import-scenario-bundles.md](/Users/ansh/Documents/Gst-Compliance/docs/import-scenario-bundles.md:1)
- UAT cases: [docs/qa-uat-cases.md](/Users/ansh/Documents/Gst-Compliance/docs/qa-uat-cases.md:1)
- User guide: [docs/user-practical-guide.md](/Users/ansh/Documents/Gst-Compliance/docs/user-practical-guide.md:1)
- Technical review: [docs/technical-project-review.md](/Users/ansh/Documents/Gst-Compliance/docs/technical-project-review.md:1)
- Performance guardrails: [docs/performance-guardrails.md](/Users/ansh/Documents/Gst-Compliance/docs/performance-guardrails.md:1)
- Scale readiness plan: [docs/scale-readiness-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/scale-readiness-plan.md:1)
- Production roadmap: [docs/production-roadmap.md](/Users/ansh/Documents/Gst-Compliance/docs/production-roadmap.md:1)
- Filings schema plan: [docs/filings-schema-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/filings-schema-plan.md:1)
- Filings API spec: [docs/filings-api-spec.md](/Users/ansh/Documents/Gst-Compliance/docs/filings-api-spec.md:1)
- WhiteBooks adapter design: [docs/whitebooks-adapter-design.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-adapter-design.md:1)
- WhiteBooks implementation plan: [docs/whitebooks-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-implementation-plan.md:1)
- WhiteBooks API implementation plan: [docs/whitebooks-api-implementation-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-api-implementation-plan.md:1)
- WhiteBooks vertical feature roadmap: [docs/whitebooks-vertical-feature-roadmap-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-vertical-feature-roadmap-2026-08-30.md:1)
- WhiteBooks vertical phase execution plan: [docs/whitebooks-vertical-phase-execution-plan-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-vertical-phase-execution-plan-2026-08-30.md:1)
- WhiteBooks provider confirmation questions: [docs/whitebooks-provider-confirmation-questions-2026-08-30.md](/Users/ansh/Documents/Gst-Compliance/docs/whitebooks-provider-confirmation-questions-2026-08-30.md:1)
- Implementation status plan: [docs/implementation-status-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/implementation-status-plan.md:1)
- Current execution backlog: [docs/current-execution-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/current-execution-backlog.md:1)
- Detailed delivery plan: [docs/detailed-delivery-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/detailed-delivery-plan.md:1)
- API review and next plan: [docs/api-review-next-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/api-review-next-plan.md:1)
- Engineering backlog: [docs/engineering-backlog-90-days.md](/Users/ansh/Documents/Gst-Compliance/docs/engineering-backlog-90-days.md:1)

## Testing

Backend:

```bash
./venv/bin/pytest -q
```

Frontend production build:

```bash
cd gst-compliance-frontend
npm run build
```

Recent verification after the latest fixes:

- targeted backend regression tests passed
- frontend production build passed
