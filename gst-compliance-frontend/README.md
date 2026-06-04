# GST Compliance Frontend

Professional App Router frontend for the GST Compliance SaaS product. The app now uses the live Django backend for authentication, onboarding, dashboard summaries, imports, reconciliation, returns, approvals, audit trail, and exports, while still keeping mock fallback in a few safe display-only areas.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Axios
- React Hook Form + Zod
- Recharts
- Sonner

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy the example env file before wiring real APIs:

```bash
cp .env.example .env.local
```

Available variable:

- `NEXT_PUBLIC_API_BASE_URL`

## Architecture

The project is organized around reusable SaaS shell primitives and feature folders:

- `src/app`
  App Router pages and route-group layouts.
- `src/components/layout`
  Sidebar, topbar, and dashboard shell.
- `src/components/common`
  Shared page sections, states, actions, and helpers.
- `src/components/forms`
  Form and upload shells.
- `src/components/tables`
  Table shell components.
- `src/components/charts`
  Dashboard chart components.
- `src/components/status`
  Status badges and workflow visual components.
- `src/data`
  Mock workspace, client, GSTIN, period, dashboard, and audit data.
- `src/lib/api`
  Centralized Axios client and error helpers.
- `src/lib/auth`
  Token storage abstraction and auth service placeholder.
- `src/lib/query`
  TanStack Query provider and query key factory.
- `src/lib/validations`
  Zod schemas.
- `src/features`
  Feature-level exports ready for growth.

## Routes included

- `/login`
- `/forgot-password`
- `/dashboard`
- `/clients`
- `/clients/[clientId]`
- `/clients/[clientId]/gstins`
- `/clients/[clientId]/periods/[periodId]`
- `/gstins`
- `/compliance-periods`
- `/imports`
- `/reconciliation`
- `/returns`
- `/approvals`
- `/notices`
- `/reports`
- `/audit-trail`
- `/settings`

## Notes

- Toasts use `sonner`, not deprecated shadcn toast.
- API base URL is read from `.env.local`.
- Pilot checklist is available at `/settings/pilot-readiness`.
- Backend sample files and the runbook live in `../docs/sample-files/` and `../docs/pilot-runbook.md`.
