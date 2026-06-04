import re
from typing import Any

SENSITIVE_KEYS = {
    "access_token",
    "auth_token",
    "authorization",
    "client_secret",
    "email",
    "gst_username",
    "otp",
    "password",
    "pan",
    "secret",
    "sek",
    "session_key",
    "token",
    "txn",
}

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z0-9]{10}[A-Z0-9]{3}$")
PAN_REGEX = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
ARN_REGEX = re.compile(r"^[A-Z0-9]{10,20}$")


def mask_value(value: str) -> str:
    if len(value) <= 4:
        return "*" * len(value)
    if EMAIL_REGEX.match(value):
        local, domain = value.split("@", 1)
        return f"{local[:2]}***@{domain}"
    if GSTIN_REGEX.match(value):
        return f"{value[:2]}******{value[-3:]}"
    if PAN_REGEX.match(value):
        return f"{value[:3]}****{value[-1:]}"
    if ARN_REGEX.match(value) and len(value) >= 12:
        return f"{value[:4]}****{value[-4:]}"
    return f"{value[:2]}***{value[-2:]}"


def sanitize_json(payload: Any, *, max_depth: int = 5, max_items: int = 25) -> Any:
    if max_depth <= 0:
        return "[TRUNCATED]"
    if isinstance(payload, dict):
        sanitized = {}
        for index, (key, value) in enumerate(payload.items()):
            if index >= max_items:
                sanitized["__truncated__"] = f"{len(payload) - max_items} additional entries hidden"
                break
            lowered_key = str(key).lower()
            if lowered_key in SENSITIVE_KEYS:
                sanitized[key] = "[REDACTED]"
                continue
            sanitized[key] = sanitize_json(value, max_depth=max_depth - 1, max_items=max_items)
        return sanitized
    if isinstance(payload, list):
        items = [sanitize_json(item, max_depth=max_depth - 1, max_items=max_items) for item in payload[:max_items]]
        if len(payload) > max_items:
            items.append(f"[TRUNCATED {len(payload) - max_items} items]")
        return items
    if isinstance(payload, str):
        normalized = payload.strip()
        if EMAIL_REGEX.match(normalized) or GSTIN_REGEX.match(normalized.upper()) or PAN_REGEX.match(normalized.upper()):
            return mask_value(normalized.upper() if not EMAIL_REGEX.match(normalized) else normalized)
        if len(normalized) > 160:
            return f"{normalized[:157]}..."
        return normalized
    return payload
