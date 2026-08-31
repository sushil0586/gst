import hashlib
import json

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.common.security import sanitize_json
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.ims.models import IMSActionBatch
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import (
    WhiteBooksAuthenticationError,
    WhiteBooksSubmissionError,
    WhiteBooksTemporaryError,
)

IMS_PROVIDER_STATUS_VALUES = {
    "ACCEPTED": "Accept",
    "REJECTED": "Reject",
    "PENDING": "Pending",
}

IMS_PROVIDER_GOODS_TYPE_VALUES = {
    "GOODS": "G",
    "SERVICES": "S",
}


def _get_latest_auth_session(*, workspace, client, gstin):
    queryset = ProviderAuthSession.objects.filter(
        workspace=workspace,
        client=client,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        is_active=True,
    )
    if gstin is not None:
        queryset = queryset.filter(gstin=gstin)
    return queryset.order_by("-verified_at", "-updated_at", "-created_at").first()


def resolve_ims_provider_context(*, validated_data):
    workspace = validated_data["workspace"]
    client = validated_data["client"]
    gstin = validated_data["gstin"]
    auth_session = validated_data.get("auth_session") or _get_latest_auth_session(
        workspace=workspace,
        client=client,
        gstin=gstin,
    )
    txn = str(validated_data.get("txn") or getattr(auth_session, "txn", "") or "").strip()
    email = str(
        validated_data.get("email")
        or getattr(auth_session, "email", "")
        or validated_data.get("resolved_email")
        or settings.WHITEBOOKS_CONTACT_EMAIL
        or ""
    ).strip()

    if not txn:
        raise serializers.ValidationError(
            {"txn": "A verified WhiteBooks auth session or explicit txn is required before using IMS APIs."}
        )

    if auth_session is not None:
        freshness = get_provider_auth_session_freshness(auth_session=auth_session)
        if freshness["is_stale"]:
            raise serializers.ValidationError({"auth_session": freshness["stale_reason"]})

    return {
        "client": WhiteBooksClient(),
        "workspace": workspace,
        "client_record": client,
        "gstin": gstin,
        "auth_session": auth_session,
        "email": email,
        "txn": txn,
        "gstin_value": gstin.gstin,
        "state_code": gstin.state_code,
        "gst_username": gstin.whitebooks_gst_username or None,
    }


def ims_save(*, validated_data, actor=None):
    context = resolve_ims_provider_context(validated_data=validated_data)
    payload = {
        "rtin": context["gstin_value"],
        "reqtyp": "SAVE",
        "invdata": validated_data["invdata"],
    }
    return _run_tracked_write_action(
        action_type=IMSActionBatch.ActionType.SAVE,
        context=context,
        ret_period=validated_data["ret_period"],
        payload=payload,
        actor=actor,
        allow_duplicate_action=validated_data.get("allow_duplicate_action", False),
    )


def ims_reset(*, validated_data, actor=None):
    context = resolve_ims_provider_context(validated_data=validated_data)
    payload = {
        "rtin": context["gstin_value"],
        "reqtyp": "RESET",
        "invdata": validated_data["invdata"],
    }
    return _run_tracked_write_action(
        action_type=IMSActionBatch.ActionType.RESET,
        context=context,
        ret_period=validated_data["ret_period"],
        payload=payload,
        actor=actor,
        allow_duplicate_action=validated_data.get("allow_duplicate_action", False),
    )


def _run_tracked_write_action(
    *,
    action_type: str,
    context: dict,
    ret_period: str,
    payload: dict,
    actor=None,
    allow_duplicate_action: bool = False,
) -> dict:
    user = actor if getattr(actor, "is_authenticated", False) else None
    request_payload_hash = _hash_payload(payload)
    duplicate = _find_duplicate_action_batch(
        context=context,
        action_type=action_type,
        ret_period=ret_period,
        request_payload_hash=request_payload_hash,
    )
    if duplicate is not None and not allow_duplicate_action:
        record_audit_log(
            actor=actor,
            action=f"ims.{action_type}_duplicate_blocked",
            entity=duplicate,
            workspace_id=duplicate.workspace_id,
            client_id=duplicate.client_id,
            gstin_id=duplicate.gstin_id,
            metadata={
                "provider": duplicate.provider,
                "ret_period": ret_period,
                "request_payload_hash": request_payload_hash,
                "duplicate_batch_id": str(duplicate.id),
            },
        )
        raise serializers.ValidationError(
            {
                "allow_duplicate_action": (
                    "An identical submitted or in-progress IMS action already exists for this GSTIN and period. "
                    "Use retry for failed batches or confirm duplicate action to continue."
                ),
                "action_batch": _serialize_action_batch(duplicate),
            }
        )

    batch = IMSActionBatch.objects.create(
        workspace=context["workspace"],
        client=context["client_record"],
        gstin=context["gstin"],
        auth_session=context["auth_session"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        action_type=action_type,
        ret_period=ret_period,
        request_payload_hash=request_payload_hash,
        request_payload=sanitize_json(payload),
        requested_by=user,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=actor,
        action=f"ims.{action_type}_requested",
        entity=batch,
        workspace_id=batch.workspace_id,
        client_id=batch.client_id,
        gstin_id=batch.gstin_id,
        metadata={
            "provider": batch.provider,
            "ret_period": ret_period,
            "request_payload_hash": batch.request_payload_hash,
        },
    )

    try:
        if action_type == IMSActionBatch.ActionType.SAVE:
            response = context["client"].ims_save(
                email=context["email"],
                gstin=context["gstin_value"],
                ret_period=ret_period,
                txn=context["txn"],
                payload=payload,
                state_code=context["state_code"],
                gst_username=context["gst_username"],
            )
        else:
            response = context["client"].ims_reset(
                email=context["email"],
                gstin=context["gstin_value"],
                ret_period=ret_period,
                txn=context["txn"],
                payload=payload,
                state_code=context["state_code"],
                gst_username=context["gst_username"],
            )
        sanitized_response = context["client"].sanitize_response_payload(response)
    except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        batch.status = IMSActionBatch.BatchStatus.FAILED
        batch.error_message = str(exc)
        batch.completed_at = timezone.now()
        batch.updated_by = user
        batch.save(update_fields=["status", "error_message", "completed_at", "updated_by", "updated_at"])
        record_audit_log(
            actor=actor,
            action=f"ims.{action_type}_failed",
            entity=batch,
            workspace_id=batch.workspace_id,
            client_id=batch.client_id,
            gstin_id=batch.gstin_id,
            metadata={
                "provider": batch.provider,
                "ret_period": ret_period,
                "error_message": str(exc),
            },
        )
        raise

    provider_transaction_id = _extract_provider_transaction_id(sanitized_response)
    now = timezone.now()
    batch.status = IMSActionBatch.BatchStatus.SUBMITTED
    batch.provider_transaction_id = provider_transaction_id
    batch.response_payload = sanitize_json(sanitized_response)
    batch.submitted_at = now
    batch.completed_at = now
    batch.updated_by = user
    batch.save(
        update_fields=[
            "status",
            "provider_transaction_id",
            "response_payload",
            "submitted_at",
            "completed_at",
            "updated_by",
            "updated_at",
        ]
    )
    record_audit_log(
        actor=actor,
        action=f"ims.{action_type}_submitted",
        entity=batch,
        workspace_id=batch.workspace_id,
        client_id=batch.client_id,
        gstin_id=batch.gstin_id,
        metadata={
            "provider": batch.provider,
            "ret_period": ret_period,
            "provider_transaction_id": provider_transaction_id,
        },
    )
    return {
        **sanitized_response,
        "action_batch": _serialize_action_batch(batch),
    }


def _find_duplicate_action_batch(*, context: dict, action_type: str, ret_period: str, request_payload_hash: str):
    return (
        IMSActionBatch.objects.filter(
            is_active=True,
            workspace=context["workspace"],
            client=context["client_record"],
            gstin=context["gstin"],
            action_type=action_type,
            ret_period=ret_period,
            request_payload_hash=request_payload_hash,
            status__in=[IMSActionBatch.BatchStatus.REQUESTED, IMSActionBatch.BatchStatus.SUBMITTED],
        )
        .order_by("-created_at")
        .first()
    )


def _hash_payload(payload: dict) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _extract_provider_transaction_id(payload: dict) -> str:
    for key in ("int_tran_id", "intTranId", "transaction_id", "transactionId", "reference_id", "ref_id"):
        value = payload.get(key)
        if value not in (None, ""):
            return str(value)
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_provider_transaction_id(data)
    return ""


def _serialize_action_batch(batch: IMSActionBatch) -> dict:
    return {
        "id": str(batch.id),
        "workspace": str(batch.workspace_id),
        "client": str(batch.client_id),
        "gstin": str(batch.gstin_id) if batch.gstin_id else None,
        "auth_session": str(batch.auth_session_id) if batch.auth_session_id else None,
        "provider": batch.provider,
        "action_type": batch.action_type,
        "ret_period": batch.ret_period,
        "status": batch.status,
        "provider_transaction_id": batch.provider_transaction_id,
        "request_payload_hash": batch.request_payload_hash,
        "error_message": batch.error_message,
        "requested_by": batch.requested_by_id,
        "submitted_at": batch.submitted_at.isoformat() if batch.submitted_at else None,
        "completed_at": batch.completed_at.isoformat() if batch.completed_at else None,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "updated_at": batch.updated_at.isoformat() if batch.updated_at else None,
    }


def ims_status(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_status(
        email=context["email"],
        gstin=context["gstin_value"],
        int_tran_id=validated_data["int_tran_id"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def retry_ims_action_batch(*, validated_data, actor=None):
    source_batch = validated_data["action_batch"]
    if source_batch.status != IMSActionBatch.BatchStatus.FAILED:
        raise serializers.ValidationError({"action_batch": "Only failed IMS action batches can be retried."})

    source_payload = source_batch.request_payload if isinstance(source_batch.request_payload, dict) else {}
    invdata = source_payload.get("invdata")
    if not isinstance(invdata, dict):
        raise serializers.ValidationError(
            {"action_batch": "This IMS action batch does not have retryable invoice data."}
        )

    context = resolve_ims_provider_context(validated_data=validated_data)
    payload = {
        "rtin": context["gstin_value"],
        "reqtyp": source_batch.action_type.upper(),
        "invdata": invdata,
    }
    record_audit_log(
        actor=actor,
        action=f"ims.{source_batch.action_type}_retry_requested",
        entity=source_batch,
        workspace_id=source_batch.workspace_id,
        client_id=source_batch.client_id,
        gstin_id=source_batch.gstin_id,
        metadata={
            "provider": source_batch.provider,
            "ret_period": source_batch.ret_period,
            "source_batch_id": str(source_batch.id),
            "request_payload_hash": _hash_payload(payload),
        },
    )
    return _run_tracked_write_action(
        action_type=source_batch.action_type,
        context=context,
        ret_period=source_batch.ret_period,
        payload=payload,
        actor=actor,
        allow_duplicate_action=validated_data.get("allow_duplicate_action", False),
    )


def refresh_ims_action_batch_status(*, validated_data, actor=None):
    batch = validated_data["action_batch"]
    if not batch.provider_transaction_id:
        raise serializers.ValidationError(
            {"action_batch": "This IMS action batch does not have a provider transaction ID yet."}
        )

    context = resolve_ims_provider_context(validated_data=validated_data)
    try:
        response = context["client"].ims_status(
            email=context["email"],
            gstin=context["gstin_value"],
            int_tran_id=batch.provider_transaction_id,
            txn=context["txn"],
            state_code=context["state_code"],
            gst_username=context["gst_username"],
        )
        sanitized_response = context["client"].sanitize_response_payload(response)
    except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        batch.error_message = str(exc)
        batch.updated_by = actor if getattr(actor, "is_authenticated", False) else None
        batch.save(update_fields=["error_message", "updated_by", "updated_at"])
        record_audit_log(
            actor=actor,
            action="ims.batch_status_check_failed",
            entity=batch,
            workspace_id=batch.workspace_id,
            client_id=batch.client_id,
            gstin_id=batch.gstin_id,
            metadata={
                "provider": batch.provider,
                "ret_period": batch.ret_period,
                "provider_transaction_id": batch.provider_transaction_id,
                "error_message": str(exc),
            },
        )
        raise

    now = timezone.now()
    response_payload = batch.response_payload if isinstance(batch.response_payload, dict) else {}
    checks = response_payload.get("status_checks") if isinstance(response_payload.get("status_checks"), list) else []
    response_payload["status_checks"] = [
        *checks[-9:],
        {
            "checked_at": now.isoformat(),
            "payload": sanitize_json(sanitized_response),
        },
    ]
    batch.response_payload = response_payload
    batch.error_message = ""
    batch.updated_by = actor if getattr(actor, "is_authenticated", False) else None
    batch.save(update_fields=["response_payload", "error_message", "updated_by", "updated_at"])
    record_audit_log(
        actor=actor,
        action="ims.batch_status_checked",
        entity=batch,
        workspace_id=batch.workspace_id,
        client_id=batch.client_id,
        gstin_id=batch.gstin_id,
        metadata={
            "provider": batch.provider,
            "ret_period": batch.ret_period,
            "provider_transaction_id": batch.provider_transaction_id,
        },
    )
    return {
        **sanitized_response,
        "action_batch": _serialize_action_batch(batch),
    }


def list_ims_action_batches(*, validated_data):
    queryset = IMSActionBatch.objects.filter(
        is_active=True,
        workspace=validated_data["workspace"],
        client=validated_data["client"],
        gstin=validated_data["gstin"],
    )
    ret_period = str(validated_data.get("ret_period") or "").strip()
    if ret_period:
        queryset = queryset.filter(ret_period=ret_period)
    action_type = str(validated_data.get("action_type") or "").strip()
    if action_type:
        queryset = queryset.filter(action_type=action_type)
    status = str(validated_data.get("status") or "").strip()
    if status:
        queryset = queryset.filter(status=status)
    return queryset.order_by("-created_at")[:10]


def ims_invoices(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_invoices(
        email=context["email"],
        gstin=context["gstin_value"],
        section=validated_data["section"],
        status=_to_provider_ims_status(validated_data["status"]),
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_invoices_count(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_invoices_count(
        email=context["email"],
        gstin=context["gstin_value"],
        goods_type=_to_provider_goods_type(validated_data["goods_type"]),
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_supplier_invoices(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_supplier_invoices(
        email=context["email"],
        gstin=context["gstin_value"],
        ret_period=validated_data["ret_period"],
        section=validated_data["section"],
        rtn_type=validated_data["rtn_type"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_rejected_invoices(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_rejected_invoices(
        email=context["email"],
        gstin=context["gstin_value"],
        ret_period=validated_data["ret_period"],
        section=validated_data["section"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_get_file(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_get_file(
        email=context["email"],
        gstin=context["gstin_value"],
        token=validated_data["token"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def _to_provider_ims_status(status: str) -> str:
    normalized = str(status or "").strip().upper()
    return IMS_PROVIDER_STATUS_VALUES.get(normalized, status)


def _to_provider_goods_type(goods_type: str) -> str:
    normalized = str(goods_type or "").strip().upper()
    return IMS_PROVIDER_GOODS_TYPE_VALUES.get(normalized, goods_type)
