from datetime import timedelta

from django.utils import timezone

from apps.audit_logs.models import AuditLog
from apps.filings.models import ProviderAuthSession, ReturnFilingAttempt
from apps.imports.models import ImportBatch, ImportRowError


def _compact_response_summary(payload):
    if not isinstance(payload, dict):
        return {}
    return {
        "provider_stage": str(payload.get("provider_stage") or ""),
        "next_action": str(payload.get("next_action") or ""),
        "retryable": bool(payload.get("retryable")),
        "operations_requested": [value for value in payload.get("operations_requested", []) if isinstance(value, str)][:10],
        "operations_completed": [value for value in payload.get("operations_completed", []) if isinstance(value, str)][:10],
        "operations_failed": [value for value in payload.get("operations_failed", []) if isinstance(value, str)][:10],
        "failure_summary": payload.get("failure_summary") if isinstance(payload.get("failure_summary"), dict) else {},
        "retention_state": "compacted",
    }


def _compact_request_summary(payload):
    if not isinstance(payload, dict):
        return {}
    return {
        "provider": str(payload.get("provider") or ""),
        "return_type": str(payload.get("return_type") or ""),
        "provider_stage": str(payload.get("provider_stage") or ""),
        "prepared_return_id": str(payload.get("prepared_return_id") or ""),
        "retention_state": "compacted",
    }


def _compact_provider_auth_payload(payload):
    if not isinstance(payload, dict):
        return {}
    return {
        "available": bool(payload),
        "status_cd": str(payload.get("status_cd") or ""),
        "status_desc": str(payload.get("status_desc") or payload.get("message") or ""),
        "retention_state": "compacted",
    }


def enforce_security_retention(
    *,
    audit_days: int,
    filing_days: int,
    provider_auth_days: int,
    import_days: int,
) -> dict[str, int]:
    now = timezone.now()
    counters = {
        "audit_logs_compacted": 0,
        "filing_attempts_compacted": 0,
        "provider_auth_sessions_compacted": 0,
        "import_batches_compacted": 0,
        "import_row_errors_deleted": 0,
    }

    audit_cutoff = now - timedelta(days=audit_days)
    for audit_log in AuditLog.objects.filter(created_at__lt=audit_cutoff, is_active=True).iterator():
        next_before = {"retention_state": "purged"} if audit_log.before_state else {}
        next_after = {"retention_state": "purged"} if audit_log.after_state else {}
        next_metadata = dict(audit_log.metadata or {})
        next_metadata["retention_state"] = "compacted"
        changed = (
            audit_log.before_state != next_before
            or audit_log.after_state != next_after
            or audit_log.metadata != next_metadata
        )
        if changed:
            audit_log.before_state = next_before
            audit_log.after_state = next_after
            audit_log.metadata = next_metadata
            audit_log.save(update_fields=["before_state", "after_state", "metadata", "updated_at"])
            counters["audit_logs_compacted"] += 1

    filing_cutoff = now - timedelta(days=filing_days)
    for attempt in ReturnFilingAttempt.objects.filter(created_at__lt=filing_cutoff, is_active=True).iterator():
        next_request = _compact_request_summary(attempt.request_summary)
        next_response = _compact_response_summary(attempt.response_summary)
        next_status = _compact_response_summary(attempt.provider_status_raw)
        changed = (
            attempt.request_summary != next_request
            or attempt.response_summary != next_response
            or attempt.provider_status_raw != next_status
        )
        if changed:
            attempt.request_summary = next_request
            attempt.response_summary = next_response
            attempt.provider_status_raw = next_status
            attempt.save(update_fields=["request_summary", "response_summary", "provider_status_raw", "updated_at"])
            counters["filing_attempts_compacted"] += 1

    provider_cutoff = now - timedelta(days=provider_auth_days)
    for auth_session in ProviderAuthSession.objects.filter(created_at__lt=provider_cutoff, is_active=True).iterator():
        next_otp = _compact_provider_auth_payload(auth_session.otp_request_payload)
        next_auth = _compact_provider_auth_payload(auth_session.auth_token_payload)
        next_metadata = _compact_provider_auth_payload(auth_session.session_metadata)
        changed = (
            auth_session.otp_request_payload != next_otp
            or auth_session.auth_token_payload != next_auth
            or auth_session.session_metadata != next_metadata
        )
        if changed:
            auth_session.otp_request_payload = next_otp
            auth_session.auth_token_payload = next_auth
            auth_session.session_metadata = next_metadata
            auth_session.save(update_fields=["otp_request_payload", "auth_token_payload", "session_metadata", "updated_at"])
            counters["provider_auth_sessions_compacted"] += 1

    import_cutoff = now - timedelta(days=import_days)
    for batch in ImportBatch.objects.filter(created_at__lt=import_cutoff, is_active=True).iterator():
        metadata = batch.source_metadata if isinstance(batch.source_metadata, dict) else {}
        next_metadata = {
            key: value
            for key, value in metadata.items()
            if key not in {"normalized_rows", "generate_response", "status_response", "all_response"}
        }
        if metadata != next_metadata:
            next_metadata["retention_state"] = "compacted"
            batch.source_metadata = next_metadata
            batch.save(update_fields=["source_metadata", "updated_at"])
            counters["import_batches_compacted"] += 1

    deleted, _details = ImportRowError.objects.filter(created_at__lt=import_cutoff, is_active=True).delete()
    counters["import_row_errors_deleted"] = int(deleted)

    return counters
