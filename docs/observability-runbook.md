# Observability Runbook

This project now exposes a lightweight request trace path suitable for local debugging and first-stage production operations.

## What is available

### Request IDs

Every backend response now carries:

- `X-Request-ID`

If an incoming request already sends `X-Request-ID`, the backend reuses it. Otherwise it generates one.

This same request ID is also included in:

- error response envelopes as `request_id`
- slow-request performance logs
- rejected-request security logs

Use it as the primary correlation key between browser issues and backend logs.

## Performance headers

When `DEBUG=True` or `PERFORMANCE_HEADERS_ENABLED=True`, the backend also sends:

- `X-Response-Time-ms`
- `X-DB-Query-Count`
- `Server-Timing`

These are especially useful during dashboard/import/report tuning.

## Frontend local debugging

To log API timing metadata in the browser console:

```bash
NEXT_PUBLIC_DEBUG_PERFORMANCE=true
```

The frontend will print:

- request method
- request URL
- `X-Request-ID`
- response time
- DB query count
- `Server-Timing`

## Slow request logs

Requests slower than `PERFORMANCE_SLOW_REQUEST_MS` are logged through `gst_compliance.performance`.

Example fields:

- `request_id`
- `path`
- `method`
- `duration_ms`
- `query_count`

## Operational workflow

When a user reports a slow or failed request:

1. Capture the request ID from the browser network panel or error message.
2. Search backend logs for that `request_id`.
3. Check whether the request also emitted slow-request telemetry.
4. Use `X-DB-Query-Count` and `Server-Timing` to decide whether the issue is query-heavy or app-heavy.

## Recommended production wiring

- ship `gst_compliance.performance` logs to centralized log storage
- ship `gst_compliance.security` logs to centralized log storage
- preserve `X-Request-ID` through reverse proxy and load balancer layers
- have the frontend or API gateway inject request IDs if you want end-to-end cross-service correlation
