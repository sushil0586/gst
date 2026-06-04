import logging
from time import perf_counter
from uuid import uuid4

from django.conf import settings
from django.db import connection


performance_logger = logging.getLogger("gst_compliance.performance")


class RequestIDMiddleware:
    header_name = "HTTP_X_REQUEST_ID"
    response_header = "X-Request-ID"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.META.get(self.header_name) or str(uuid4())
        request.request_id = request_id
        response = self.get_response(request)
        response[self.response_header] = request_id
        return response


class PerformanceHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        enabled = settings.DEBUG or settings.PERFORMANCE_HEADERS_ENABLED
        should_trace_queries = enabled
        start_query_count = len(connection.queries) if should_trace_queries else 0
        original_force_debug_cursor = connection.force_debug_cursor
        if should_trace_queries:
            connection.force_debug_cursor = True

        started_at = perf_counter()
        try:
            response = self.get_response(request)
        finally:
            if should_trace_queries:
                connection.force_debug_cursor = original_force_debug_cursor

        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        query_count = len(connection.queries) - start_query_count if should_trace_queries else 0

        if enabled:
            response["X-Response-Time-ms"] = str(duration_ms)
            response["X-DB-Query-Count"] = str(query_count)
            response["Server-Timing"] = f"app;dur={duration_ms}, db;desc=\"queries\";dur={query_count}"

        if duration_ms >= settings.PERFORMANCE_SLOW_REQUEST_MS:
            performance_logger.warning(
                "slow request",
                extra={
                    "request_id": getattr(request, "request_id", ""),
                    "path": request.path,
                    "method": request.method,
                    "duration_ms": duration_ms,
                    "query_count": query_count,
                },
            )

        return response
