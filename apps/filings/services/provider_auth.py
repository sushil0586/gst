import inspect

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.common.security_events import log_security_event
from apps.filings.providers import (
    FilingProviderAuthenticationError,
    FilingProviderSessionLimitError,
)
from apps.filings.providers.registry import get_filing_provider


SENSITIVE_PROVIDER_KEYS = {
    "access_token",
    "auth_token",
    "authorization",
    "client_secret",
    "password",
    "secret",
    "sek",
    "session_key",
    "token",
}


def _sanitize_provider_payload(payload):
    if isinstance(payload, dict):
        sanitized = {}
        for key, value in payload.items():
            if str(key).lower() in SENSITIVE_PROVIDER_KEYS:
                sanitized[key] = "[REDACTED]"
            else:
                sanitized[key] = _sanitize_provider_payload(value)
        return sanitized
    if isinstance(payload, list):
        return [_sanitize_provider_payload(item) for item in payload]
    return payload


def request_provider_otp_session(*, validated_data, user):
    provider_code = validated_data.get("provider", ReturnFiling.Provider.WHITEBOOKS)
    email = validated_data.get("email") or settings.WHITEBOOKS_CONTACT_EMAIL
    provider = get_filing_provider(provider_code)
    request_otp = getattr(provider, "request_otp", None)
    if not callable(request_otp):
        raise serializers.ValidationError({"provider": "This provider does not support OTP-based authentication."})

    with transaction.atomic():
        auth_session = ProviderAuthSession.objects.create(
            workspace_id=validated_data["workspace"],
            client_id=validated_data["client"],
            gstin_id=validated_data.get("gstin"),
            provider=provider_code,
            email=email,
            status=ProviderAuthSession.SessionStatus.CREATED,
            initiated_by=user,
            created_by=user,
            updated_by=user,
        )

    gstin_instance = validated_data.get("gstin_instance")
    state_code = _resolve_state_code(gstin_instance)
    gst_username = _resolve_gst_username(gstin_instance)

    try:
        payload = _invoke_provider_auth_callable(
            request_otp,
            email=email,
            state_code=state_code,
            gst_username=gst_username,
        )
        txn = _extract_txn(payload)
        auth_session.status = ProviderAuthSession.SessionStatus.OTP_REQUESTED
        auth_session.txn = txn
        auth_session.otp_request_payload = _sanitize_provider_payload(payload)
        auth_session.error_summary = {}
        auth_session.last_requested_at = timezone.now()
        auth_session.updated_by = user
        auth_session.save(
            update_fields=[
                "status",
                "txn",
                "otp_request_payload",
                "error_summary",
                "last_requested_at",
                "updated_by",
                "updated_at",
            ]
        )
        record_audit_log(
            actor=user,
            action=_provider_auth_action(provider_code, "otp_requested"),
            entity=auth_session,
            workspace_id=auth_session.workspace_id,
            client_id=auth_session.client_id,
            gstin_id=auth_session.gstin_id,
            metadata={"email": email, "txn": txn, "state_code": state_code, "gst_username": gst_username},
        )
        log_security_event(
            event="provider_auth.otp_requested",
            severity="info",
            details={
                "provider": provider_code,
                "workspace_id": str(auth_session.workspace_id),
                "client_id": str(auth_session.client_id),
                "gstin_id": str(auth_session.gstin_id or ""),
            },
        )
        return auth_session
    except FilingProviderSessionLimitError as exc:
        _mark_auth_session_failed(
            auth_session=auth_session,
            actor=user,
            error_code=f"{_provider_error_prefix(provider_code)}_session_limit",
            error_message=str(exc),
            audit_action=_provider_auth_action(provider_code, "failed"),
        )
        raise
    except FilingProviderAuthenticationError as exc:
        _mark_auth_session_failed(
            auth_session=auth_session,
            actor=user,
            error_code=f"{_provider_error_prefix(provider_code)}_authentication_error",
            error_message=str(exc),
            audit_action=_provider_auth_action(provider_code, "failed"),
        )
        raise


def verify_provider_otp_session(*, auth_session, otp, txn, user):
    resolved_txn = txn or auth_session.txn
    if not resolved_txn:
        raise serializers.ValidationError({"txn": "A provider txn value is required to exchange OTP for an auth token."})

    provider = get_filing_provider(auth_session.provider)
    exchange_otp = getattr(provider, "exchange_otp_for_session", None)
    if not callable(exchange_otp):
        raise serializers.ValidationError({"provider": "This provider does not support OTP verification."})
    gstin = getattr(auth_session, "gstin", None)
    state_code = _resolve_state_code(gstin)
    gst_username = _resolve_gst_username(gstin)
    try:
        session = _invoke_provider_auth_callable(
            exchange_otp,
            email=auth_session.email,
            otp=otp,
            txn=resolved_txn,
            state_code=state_code,
            gst_username=gst_username,
        )
        auth_session.txn = resolved_txn
        auth_session.auth_token_payload = _sanitize_provider_payload(session.raw_response)
        auth_session.session_metadata = _sanitize_provider_payload(
            {**session.metadata, "state_code": state_code, "gst_username": gst_username}
        )
        auth_session.response_contract_confirmed = session.response_contract_confirmed
        auth_session.status = (
            ProviderAuthSession.SessionStatus.SESSION_ACTIVE
            if session.response_contract_confirmed
            else ProviderAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED
        )
        auth_session.error_summary = {}
        auth_session.verified_at = timezone.now()
        auth_session.verified_by = user
        auth_session.updated_by = user
        auth_session.save(
            update_fields=[
                "txn",
                "auth_token_payload",
                "session_metadata",
                "response_contract_confirmed",
                "status",
                "error_summary",
                "verified_at",
                "verified_by",
                "updated_by",
                "updated_at",
            ]
        )
        record_audit_log(
            actor=user,
            action=_provider_auth_action(auth_session.provider, "auth_token_received"),
            entity=auth_session,
            workspace_id=auth_session.workspace_id,
            client_id=auth_session.client_id,
            gstin_id=auth_session.gstin_id,
            metadata={
                "email": auth_session.email,
                "txn": resolved_txn,
                "state_code": state_code,
                "gst_username": gst_username,
                "response_contract_confirmed": session.response_contract_confirmed,
            },
        )
        log_security_event(
            event="provider_auth.verified",
            severity="info",
            details={
                "provider": auth_session.provider,
                "workspace_id": str(auth_session.workspace_id),
                "client_id": str(auth_session.client_id),
                "gstin_id": str(auth_session.gstin_id or ""),
            },
        )
        return auth_session
    except FilingProviderSessionLimitError as exc:
        _mark_auth_session_failed(
            auth_session=auth_session,
            actor=user,
            error_code=f"{_provider_error_prefix(auth_session.provider)}_session_limit",
            error_message=str(exc),
            audit_action=_provider_auth_action(auth_session.provider, "failed"),
        )
        raise
    except FilingProviderAuthenticationError as exc:
        _mark_auth_session_failed(
            auth_session=auth_session,
            actor=user,
            error_code=f"{_provider_error_prefix(auth_session.provider)}_authentication_error",
            error_message=str(exc),
            audit_action=_provider_auth_action(auth_session.provider, "failed"),
        )
        raise


def _provider_auth_action(provider_code: str, action: str) -> str:
    return f"{_provider_error_prefix(provider_code)}_auth.{action}"


def _provider_error_prefix(provider_code: str) -> str:
    return str(provider_code).replace("-", "_").lower()


def _extract_txn(payload):
    if not isinstance(payload, dict):
        return ""
    if payload.get("txn"):
        return str(payload["txn"])
    data = payload.get("data")
    if isinstance(data, dict) and data.get("txn"):
        return str(data["txn"])
    header = payload.get("header")
    if isinstance(header, dict) and header.get("txn"):
        return str(header["txn"])
    return ""


def _resolve_state_code(gstin):
    if gstin is None:
        return ""
    return str(getattr(gstin, "state_code", "") or "").strip()


def _resolve_gst_username(gstin):
    if gstin is None:
        return ""
    return str(getattr(gstin, "whitebooks_gst_username", "") or "").strip()


def _invoke_provider_auth_callable(func, **kwargs):
    signature = inspect.signature(func)
    for optional_parameter in ("state_code", "gst_username"):
        if optional_parameter not in signature.parameters:
            kwargs.pop(optional_parameter, None)
    return func(**kwargs)


def _mark_auth_session_failed(*, auth_session, actor, error_code, error_message, audit_action):
    auth_session.status = ProviderAuthSession.SessionStatus.FAILED
    auth_session.error_summary = {"code": error_code, "message": error_message}
    auth_session.updated_by = actor
    auth_session.save(update_fields=["status", "error_summary", "updated_by", "updated_at"])
    log_security_event(
        event="provider_auth.failed",
        details={
            "provider": auth_session.provider,
            "workspace_id": str(auth_session.workspace_id),
            "client_id": str(auth_session.client_id),
            "gstin_id": str(auth_session.gstin_id or ""),
            "code": error_code,
            "message": error_message,
        },
    )
    record_audit_log(
        actor=actor,
        action=audit_action,
        entity=auth_session,
        workspace_id=auth_session.workspace_id,
        client_id=auth_session.client_id,
        gstin_id=auth_session.gstin_id,
        metadata={"code": error_code, "message": error_message},
    )
