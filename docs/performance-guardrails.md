# Performance Guardrails

This project now has a first-pass performance hardening baseline. The goal of these guardrails is to keep common regressions visible before they show up as slow operator pages.

## What is in place

- Slimmer list payloads for imports, reconciliation, and audit logs
- Consolidated dashboard summary fetching
- Single-request workspace context hydration
- Deferred secondary report/import queries on heavy pages
- Write-only XLSX export generation with lazy row iteration
- Debug performance headers and slow-request logging on the backend
- Query-budget regression tests for key shared endpoints
- Shared frontend query defaults to avoid overly eager refetching

## Backend guardrails

### Debug response headers

When `DEBUG=True` or `PERFORMANCE_HEADERS_ENABLED=True`, API responses include:

- `X-Response-Time-ms`
- `X-DB-Query-Count`
- `Server-Timing`

This is useful for local review from browser devtools or API clients.

### Slow request logging

Slow requests are logged through `gst_compliance.performance` when they exceed `PERFORMANCE_SLOW_REQUEST_MS`.

Relevant env vars:

```bash
PERFORMANCE_HEADERS_ENABLED=True
PERFORMANCE_SLOW_REQUEST_MS=1200
PERFORMANCE_LOG_LEVEL=INFO
```

## Frontend guardrails

TanStack Query defaults are intentionally conservative:

- `retry: 1`
- `refetchOnWindowFocus: false`
- `staleTime: 30s`
- `gcTime: 5m`

This reduces accidental churn on dense operator pages.

If you want browser-side request telemetry during local tuning:

```bash
NEXT_PUBLIC_DEBUG_PERFORMANCE=true
```

That will log API timing/query-count headers to the browser console when present.

## Engineering rules

- Keep list endpoints lean. Large nested payloads belong on detail endpoints.
- Avoid mounting secondary queries until the user opens the relevant panel, tab, or dialog.
- New polling should be opt-in and scoped only to active workflows.
- New exports should prefer iterator-driven rows instead of prebuilding large Python lists.
- Shared shell context should stay consolidated rather than adding back chained bootstrapping requests.
- When adding a heavy dashboard/report endpoint, add at least one query-budget regression test.

## Current regression budgets

These are not hard SLOs. They are codebase guardrails intended to catch obvious drift.

- dashboard summary: `<= 25` queries in current test fixture
- workspace context: `<= 8` queries in current test fixture
- transactions export: `<= 6` queries in current test fixture

If a budget needs to rise, document why in the related change.
