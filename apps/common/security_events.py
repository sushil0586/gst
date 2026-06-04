import logging


logger = logging.getLogger("gst_compliance.security")


def log_security_event(*, event: str, severity: str = "warning", details: dict | None = None):
    details = details or {}
    payload = {
        "event": event,
        "severity": severity,
        "details": details,
        "request_id": details.get("request_id", ""),
    }
    log_method = getattr(logger, severity, logger.warning)
    log_method("security_event", extra=payload)
