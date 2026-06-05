from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.filings.models import ReturnFiling


def is_provider_auth_session_live_enabled(*, auth_session) -> bool:
    if getattr(auth_session, "response_contract_confirmed", False):
        return True

    if getattr(auth_session, "provider", "") == ReturnFiling.Provider.WHITEBOOKS:
        status = getattr(auth_session, "status", "")
        payload = auth_session.auth_token_payload if isinstance(getattr(auth_session, "auth_token_payload", None), dict) else {}
        header = payload.get("header") if isinstance(payload.get("header"), dict) else {}
        resolved_txn = str(getattr(auth_session, "txn", "") or header.get("txn") or "")
        if status in {
            getattr(auth_session.SessionStatus, "AUTH_TOKEN_RECEIVED", "auth_token_received"),
            getattr(auth_session.SessionStatus, "SESSION_ACTIVE", "session_active"),
        } and resolved_txn:
            return True
        return str(payload.get("status_cd") or "") == "1" and bool(resolved_txn)

    return False


def get_provider_auth_session_freshness(*, auth_session, now=None):
    now = now or timezone.now()
    max_age_minutes = _get_provider_auth_session_max_age_minutes(auth_session.provider)
    live_enabled = is_provider_auth_session_live_enabled(auth_session=auth_session)
    verified_at = getattr(auth_session, "verified_at", None)
    if verified_at is None and live_enabled:
        verified_at = getattr(auth_session, "updated_at", None) or getattr(auth_session, "created_at", None)
    expires_at = verified_at + timedelta(minutes=max_age_minutes) if verified_at else None

    if verified_at is None:
        return {
            "max_age_minutes": max_age_minutes,
            "verified_at": None,
            "expires_at": None,
            "is_stale": True,
            "stale_reason": "This provider auth session is not active yet. Request OTP and verify it first.",
        }

    if expires_at and now >= expires_at:
        provider_label = str(getattr(auth_session, "get_provider_display", lambda: auth_session.provider)())
        return {
            "max_age_minutes": max_age_minutes,
            "verified_at": verified_at,
            "expires_at": expires_at,
            "is_stale": True,
            "stale_reason": (
                f"The latest {provider_label} auth session is older than {max_age_minutes} minutes. "
                "Request and verify a fresh OTP session before live filing."
            ),
        }

    return {
        "max_age_minutes": max_age_minutes,
        "verified_at": verified_at,
        "expires_at": expires_at,
        "is_stale": False,
        "stale_reason": "",
    }


def _get_provider_auth_session_max_age_minutes(provider_code: str) -> int:
    if provider_code == ReturnFiling.Provider.WHITEBOOKS:
        return int(getattr(settings, "WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES", 360))
    return 90
