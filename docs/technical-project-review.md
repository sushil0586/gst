# GST Compliance Technical Project Review

## 1. Executive status

This workspace is a two-part application:

- A Django + Django REST Framework backend at the repository root.
- A Next.js App Router frontend inside `gst-compliance-frontend/`.

The project is beyond pure scaffolding. The backend exposes a broad authenticated API for imports, GST transactions, reconciliation, returns, approvals, notices, audit logs, dashboard summaries, and exports. The frontend is production-shaped and compiles successfully, but several user flows still rely on mock fallbacks or placeholder pages.

Current state in one line: the platform is a strong pilot-ready foundation, not yet a fully hardened production system.

## 2. Current architecture

### Backend

- Framework: Django 6 + DRF + SimpleJWT.
- API base path: `/api/v1/`.
- Configuration: [config/settings.py](/Users/ansh/Documents/Gst-Compliance/config/settings.py), [config/urls.py](/Users/ansh/Documents/Gst-Compliance/config/urls.py), [config/api_urls.py](/Users/ansh/Documents/Gst-Compliance/config/api_urls.py).
- Domain apps: `accounts`, `organizations`, `workspaces`, `clients`, `gstins`, `compliance_periods`, `imports`, `gst_transactions`, `reconciliation`, `returns`, `approvals`, `notices`, `audit_logs`.
- Pattern: views delegate to `services/`, query shaping lives in `selectors/`, shared API behavior is in `apps/common`.

Key signal:
- The router in [config/api_urls.py](/Users/ansh/Documents/Gst-Compliance/config/api_urls.py:35) registers far more than basic CRUD. This includes import batches, GST transaction remediation, reconciliation runs/items, returns, approvals, notices, audit logs, and export endpoints.

### Frontend

- Framework: Next.js 16 App Router with TypeScript and Tailwind.
- API client: [gst-compliance-frontend/src/lib/api/client.ts](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/lib/api/client.ts:1).
- Data fetching: TanStack Query feature modules under `src/features/*`.
- Session/workspace state: [gst-compliance-frontend/src/store/workspace-context.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/store/workspace-context.tsx:1).
- UI status: several pages are live-backed, while some still intentionally degrade to mock data or placeholder screens.

## 3. What is implemented today

### Backend capabilities

- JWT login, refresh, current-user session payload, and self-registration.
- Workspace-scoped RBAC checks across viewsets.
- Core entity management for organizations, workspaces, clients, GSTINs, and compliance periods.
- File import pipeline with parser registry for sales, purchase, credit note, debit note, and GSTR-2B.
- GST transaction storage and review/remediation supporting objects.
- Reconciliation runs and reconciliation item review flows.
- Return preparation, approval, filing, readiness evaluation, and workbook export hooks.
- Audit trail and multiple export endpoints for transactions, reconciliation, return summary, import errors, close-manager reporting, and audit logs.

### Frontend capabilities

- Auth flow and protected app shell.
- Dashboard, imports, reconciliation, returns, approvals, reports, team settings, onboarding, audit trail, and client hierarchy pages.
- API hooks for dashboard, clients, GSTINs, periods, imports, reconciliation, returns, approvals, workspace members, and audit data.
- Successful production build observed locally with `next build`.

## 4. Main findings

### Finding 1: one backend regression is already caught by tests

Severity: high

The automated suite currently fails on duplicate invoice detection. The pilot workflow test expects an import row error with code `duplicate_in_file`, but that error is not created for the provided duplicate purchase sample.

References:
- Expected behavior in [apps/common/test_pilot_workflow.py](/Users/ansh/Documents/Gst-Compliance/apps/common/test_pilot_workflow.py:419)
- Duplicate detection logic in [apps/imports/services/parsers/base.py](/Users/ansh/Documents/Gst-Compliance/apps/imports/services/parsers/base.py:164)

Why this matters:
- Duplicate handling is central to GST import trustworthiness.
- The failure means a core pilot scenario is currently broken or the detection logic does not match business expectations.

Likely cause:
- The parser’s duplicate check appears row-signature-based, while the failing scenario treats repeated invoice number usage in the same file as a duplicate even when the document date differs.

Validation result:
- `./venv/bin/pytest -q`
- Result: `1 failed, 94 passed`

### Finding 2: frontend workspace selection still silently falls back to mock master data

Severity: medium

The workspace context converts to mock clients, GSTINs, and periods whenever live queries return empty collections.

Reference:
- [gst-compliance-frontend/src/store/workspace-context.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/store/workspace-context.tsx:80)
- Live-or-fallback switching at [gst-compliance-frontend/src/store/workspace-context.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/store/workspace-context.tsx:141)

Why this matters:
- A real API/data issue can look like “valid empty business data.”
- UAT users may not realize they are seeing synthetic clients/GSTINs/periods.
- It makes backend completeness harder to verify from the UI.

### Finding 3: some frontend sections are still explicitly placeholder workflow shells

Severity: medium

The notices page and top-level settings page are not live modules; they are intentionally placeholder-driven views backed by mock data.

References:
- Notices shell in [gst-compliance-frontend/src/app/(dashboard)/notices/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/notices/page.tsx:1)
- Settings shell in [gst-compliance-frontend/src/app/(dashboard)/settings/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/settings/page.tsx:1)

Why this matters:
- These routes look present in navigation, but their feature depth is not equivalent to imports/reconciliation/returns.
- Pilot users may interpret route availability as operational readiness.

### Finding 4: approval request validation is minimal at the serializer boundary

Severity: low to medium

`ReturnApprovalSerializer` is an empty serializer.

Reference:
- [apps/returns/serializers.py](/Users/ansh/Documents/Gst-Compliance/apps/returns/serializers.py:70)

Why this matters:
- The view relies on service-level validation rather than request-shape validation.
- This is not inherently wrong, but it narrows the API contract and makes the endpoint easier to misuse or extend inconsistently later.

### Finding 5: root documentation understates implemented scope and overstates placeholder status

Severity: low

The root README still describes several modules as placeholder API foundations, but the live router now exposes many of those modules as implemented endpoints.

References:
- Placeholder wording in [README.md](/Users/ansh/Documents/Gst-Compliance/README.md:141)
- Actual registered routes in [config/api_urls.py](/Users/ansh/Documents/Gst-Compliance/config/api_urls.py:35)

Why this matters:
- New contributors can form the wrong mental model.
- It slows onboarding and makes handoff less reliable.

## 5. Technical maturity by area

### Strongest areas

- Backend project structure and separation of concerns.
- Workspace/client/GSTIN/period hierarchy.
- Session/auth foundations.
- Import/reconciliation/returns breadth.
- Reporting/export orientation.
- Test coverage breadth across apps.

### Mixed-readiness areas

- Import correctness rules, especially duplicate semantics.
- Frontend truthfulness when APIs return no records.
- Production readiness of notices and generic settings workflows.
- End-to-end alignment between pilot documentation, backend behavior, and frontend UX.

### Lower-maturity areas

- Some workflow UX remains documentation/demo-oriented rather than fully operational.
- The workspace is not a single clean deployable monorepo root with unified commands.
- Generated assets and local runtime data are mixed into the workspace, which adds noise for maintenance.

## 6. Test and verification snapshot

Backend:

- Command run: `./venv/bin/pytest -q`
- Outcome: `94 passed, 1 failed`
- Failed test: duplicate invoice detection in pilot workflow

Frontend:

- `npm run build` succeeds from `gst-compliance-frontend/`

Operational note:

- The repository root is not an npm project. Frontend commands must be run from `gst-compliance-frontend/`.

## 7. Recommended next steps

1. Fix and define duplicate import semantics.
   Clarify whether duplicates are same invoice number only, same invoice number plus supplier, or exact repeated line item. Then align parser logic and tests.

2. Remove or visibly label frontend mock fallback in authenticated flows.
   Prefer explicit empty/error states over silent substitution once pilot users are involved.

3. Classify routes by readiness.
   Mark `notices` and generic `settings` as pilot/demo if they are not yet fully operational.

4. Refresh root documentation.
   Update README to reflect the real route surface, startup model, and current backend/frontend split.

5. Consider workspace hygiene.
   Excluding generated media, local databases, `.next`, `node_modules`, and virtualenv content from review-focused scans will make maintenance easier.

## 8. Practical conclusion

The project has real substance. It is not merely a design prototype: the backend domain model, API surface, import pipeline, reconciliation, returns, approvals, and export layers are all meaningfully present. The frontend is also well beyond wireframes.

The main gap is not “missing architecture.” It is alignment and hardening:

- business-rule correctness in imports,
- eliminating ambiguous mock fallbacks,
- and bringing documentation in line with reality.

If those areas are addressed, this codebase can move from strong pilot foundation toward a dependable operational release.
