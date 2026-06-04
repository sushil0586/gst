from rest_framework import status
from rest_framework.exceptions import ErrorDetail
from rest_framework.views import exception_handler

from apps.common.api import api_response
from apps.common.security_events import log_security_event


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response

    request = context.get("request")
    if request is not None and response.status_code in {401, 403, 429}:
        path = request.path
        if any(segment in path for segment in ("/auth/", "/provider-auth-sessions", "/whitebooks-auth-sessions", "/exports/")):
            log_security_event(
                event="request.rejected",
                details={
                    "request_id": getattr(request, "request_id", ""),
                    "status_code": response.status_code,
                    "path": path,
                    "method": request.method,
                    "ip": request.META.get("REMOTE_ADDR", ""),
                },
            )

    normalized_errors = normalize_error_payload(response.data)
    message = build_error_message(normalized_errors)
    response.data = api_response(
        status="error",
        message=message,
        data=None,
        errors=normalized_errors,
        request_id=getattr(request, "request_id", "") if request is not None else "",
    )
    return response


def normalize_error_payload(payload):
    if isinstance(payload, dict):
        return {key: normalize_error_payload(value) for key, value in payload.items()}
    if isinstance(payload, list):
        return [normalize_error_payload(value) for value in payload]
    if isinstance(payload, ErrorDetail):
        return str(payload)
    return payload


def build_error_message(normalized_errors):
    if isinstance(normalized_errors, dict):
        detail = normalized_errors.get("detail")
        if isinstance(detail, str):
            return detail
        non_field = normalized_errors.get("non_field_errors")
        if isinstance(non_field, list) and non_field:
            return str(non_field[0])
        for value in normalized_errors.values():
            message = build_error_message(value)
            if message:
                return message
    if isinstance(normalized_errors, list) and normalized_errors:
        return build_error_message(normalized_errors[0])
    if isinstance(normalized_errors, str):
        return normalized_errors
    return "Request failed."
