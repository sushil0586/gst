from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.common.security import sanitize_json
from apps.customer_operations.models import OperationalFollowUp
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import (
    WhiteBooksAuthenticationError,
    WhiteBooksSubmissionError,
    WhiteBooksTemporaryError,
)
from apps.notices.models import Notice, NoticeSyncEvent


def create_notice(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="notice.created",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        metadata={"reference_number": instance.reference_number},
    )
    return instance


def update_notice(*, serializer, user):
    previous = serializer.instance
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="notice.updated",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        metadata={
            "reference_number": instance.reference_number,
            "from_status": previous.status,
            "to_status": instance.status,
            "from_due_date": previous.due_date.isoformat() if previous.due_date else None,
            "to_due_date": instance.due_date.isoformat() if instance.due_date else None,
            "from_assigned_to": previous.assigned_to_id,
            "to_assigned_to": instance.assigned_to_id,
        },
    )
    return instance


def sync_whitebooks_notices(*, validated_data, actor=None):
    context = resolve_notice_provider_context(validated_data=validated_data)
    sync_date = validated_data.get("date") or timezone.localdate()
    whitebooks_date = sync_date.strftime("%d/%m/%Y")

    try:
        response = context["client"].get_notice_list(
            email=context["email"],
            gstin=context["gstin"].gstin,
            date=whitebooks_date,
            txn=context["txn"],
            state_code=context["gstin"].state_code,
            gst_username=context["gst_username"],
        )
    except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        _record_notice_sync_event(
            gstin=context["gstin"],
            provider=ReturnFiling.Provider.WHITEBOOKS,
            event_type=NoticeSyncEvent.EventType.LIST_SYNC,
            status=NoticeSyncEvent.EventStatus.FAILED,
            message=f"WhiteBooks notice sync failed for {whitebooks_date}.",
            counters={"row_count": 0},
            error_message=str(exc),
            actor=actor,
        )
        raise
    sanitized_response = context["client"].sanitize_response_payload(response)
    rows = _extract_notice_rows(sanitized_response)
    now = timezone.now()
    user = actor if getattr(actor, "is_authenticated", False) else None

    created_count = 0
    updated_count = 0
    skipped_count = 0
    synced_notices = []

    with transaction.atomic():
        for row in rows:
            mapped = _map_whitebooks_notice_row(row)
            if not mapped["reference_number"]:
                skipped_count += 1
                continue

            notice = Notice.objects.filter(
                gstin=context["gstin"],
                reference_number=mapped["reference_number"],
                is_active=True,
            ).first()
            created = notice is None
            if created:
                notice = Notice(
                    gstin=context["gstin"],
                    reference_number=mapped["reference_number"],
                    title=mapped["title"],
                    description=mapped["description"],
                    status=mapped["status"],
                    due_date=mapped["provider_due_date"],
                    created_by=user,
                )
                created_count += 1
            else:
                updated_count += 1
                if not notice.title:
                    notice.title = mapped["title"]
                if not notice.description and mapped["description"]:
                    notice.description = mapped["description"]
                if notice.due_date is None and mapped["provider_due_date"] is not None:
                    notice.due_date = mapped["provider_due_date"]

            notice.provider = ReturnFiling.Provider.WHITEBOOKS
            notice.provider_reference_id = mapped["provider_reference_id"]
            notice.provider_notice_type = mapped["provider_notice_type"]
            notice.provider_status = mapped["provider_status"]
            notice.provider_due_date = mapped["provider_due_date"]
            notice.provider_payload = sanitize_json(row)
            notice.provider_synced_at = now
            notice.provider_last_error = ""
            notice.updated_by = user
            notice.save()

            record_audit_log(
                actor=actor,
                action="notice.whitebooks_sync_created" if created else "notice.whitebooks_sync_updated",
                entity=notice,
                workspace_id=context["workspace"].id,
                client_id=context["client_record"].id,
                gstin_id=context["gstin"].id,
                metadata={
                    "provider": ReturnFiling.Provider.WHITEBOOKS,
                    "reference_number": notice.reference_number,
                    "provider_reference_id": notice.provider_reference_id,
                    "provider_status": notice.provider_status,
                    "sync_date": whitebooks_date,
                    "auth_session_id": str(context["auth_session"].id) if context["auth_session"] else None,
                },
            )
            synced_notices.append(
                {
                    "id": str(notice.id),
                    "reference_number": notice.reference_number,
                    "provider_reference_id": notice.provider_reference_id,
                    "provider_status": notice.provider_status,
                    "created": created,
                }
            )

    result = {
        "provider": ReturnFiling.Provider.WHITEBOOKS,
        "sync_date": whitebooks_date,
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "synced_count": created_count + updated_count,
        "notices": synced_notices,
        "provider_payload": sanitize_json(sanitized_response),
    }
    _record_notice_sync_event(
        gstin=context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        event_type=NoticeSyncEvent.EventType.LIST_SYNC,
        status=NoticeSyncEvent.EventStatus.PARTIAL if skipped_count else NoticeSyncEvent.EventStatus.SUCCESS,
        message=f"WhiteBooks notices synced for {whitebooks_date}.",
        counters={
            "created_count": created_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "synced_count": created_count + updated_count,
            "row_count": len(rows),
        },
        provider_payload=sanitized_response,
        actor=actor,
    )
    return result


def fetch_whitebooks_notice_detail(*, notice, validated_data, actor=None):
    context = resolve_notice_provider_context(
        validated_data={
            "workspace": notice.gstin.client.workspace,
            "client": notice.gstin.client,
            "gstin": notice.gstin,
            "auth_session": validated_data.get("auth_session"),
            "txn": validated_data.get("txn"),
            "email": validated_data.get("email"),
            "resolved_email": validated_data.get("resolved_email"),
        }
    )
    reference_id = str(notice.provider_reference_id or notice.reference_number or "").strip()
    if not reference_id:
        raise serializers.ValidationError({"reference_number": "A notice reference is required before fetching details."})

    user = actor if getattr(actor, "is_authenticated", False) else None
    try:
        response = context["client"].get_notice_details(
            email=context["email"],
            gstin=context["gstin"].gstin,
            reference_id=reference_id,
            txn=context["txn"],
            state_code=context["gstin"].state_code,
            gst_username=context["gst_username"],
        )
        sanitized_response = context["client"].sanitize_response_payload(response)
    except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        notice.provider = ReturnFiling.Provider.WHITEBOOKS
        notice.provider_last_error = str(exc)
        notice.updated_by = user
        notice.save(update_fields=["provider", "provider_last_error", "updated_by", "updated_at"])
        record_audit_log(
            actor=actor,
            action="notice.whitebooks_detail_failed",
            entity=notice,
            workspace_id=notice.gstin.client.workspace_id,
            client_id=notice.gstin.client_id,
            gstin_id=notice.gstin_id,
            metadata={
                "provider": ReturnFiling.Provider.WHITEBOOKS,
                "reference_number": notice.reference_number,
                "provider_reference_id": reference_id,
                "error_message": str(exc),
                "auth_session_id": str(context["auth_session"].id) if context["auth_session"] else None,
            },
        )
        _record_notice_sync_event(
            notice=notice,
            gstin=notice.gstin,
            provider=ReturnFiling.Provider.WHITEBOOKS,
            event_type=NoticeSyncEvent.EventType.DETAIL_FETCH,
            status=NoticeSyncEvent.EventStatus.FAILED,
            reference_number=notice.reference_number,
            provider_reference_id=reference_id,
            message="WhiteBooks notice detail fetch failed.",
            error_message=str(exc),
            actor=actor,
        )
        raise

    detail_candidate = _extract_notice_detail_candidate(sanitized_response)
    detail_row = dict(detail_candidate) if isinstance(detail_candidate, dict) else {}
    detail_row["refId"] = _first_non_empty(detail_row, "refId", "refid", "ref_id") or reference_id
    mapped = _map_whitebooks_notice_row(detail_row)
    now = timezone.now()

    notice.provider = ReturnFiling.Provider.WHITEBOOKS
    notice.provider_reference_id = mapped["provider_reference_id"] or reference_id
    if mapped["provider_notice_type"]:
        notice.provider_notice_type = mapped["provider_notice_type"]
    if mapped["provider_status"]:
        notice.provider_status = mapped["provider_status"]
    if mapped["provider_due_date"] is not None:
        notice.provider_due_date = mapped["provider_due_date"]
        if notice.due_date is None:
            notice.due_date = mapped["provider_due_date"]
    notice.provider_detail_payload = sanitize_json(sanitized_response)
    notice.provider_detail_synced_at = now
    notice.provider_last_error = ""
    notice.updated_by = user
    notice.save()

    record_audit_log(
        actor=actor,
        action="notice.whitebooks_detail_fetched",
        entity=notice,
        workspace_id=notice.gstin.client.workspace_id,
        client_id=notice.gstin.client_id,
        gstin_id=notice.gstin_id,
        metadata={
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "reference_number": notice.reference_number,
            "provider_reference_id": notice.provider_reference_id,
            "provider_status": notice.provider_status,
            "auth_session_id": str(context["auth_session"].id) if context["auth_session"] else None,
        },
    )
    _record_notice_sync_event(
        notice=notice,
        gstin=notice.gstin,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        event_type=NoticeSyncEvent.EventType.DETAIL_FETCH,
        status=NoticeSyncEvent.EventStatus.SUCCESS,
        reference_number=notice.reference_number,
        provider_reference_id=notice.provider_reference_id,
        message="WhiteBooks notice detail fetched.",
        counters={"detail_count": 1},
        provider_payload=sanitized_response,
        actor=actor,
    )
    return notice


def ensure_notice_follow_up(*, notice, actor=None):
    existing = _get_open_notice_follow_up(notice=notice)
    if existing is not None:
        record_audit_log(
            actor=actor,
            action="notice.follow_up_reused",
            entity=notice,
            workspace_id=notice.gstin.client.workspace_id,
            client_id=notice.gstin.client_id,
            gstin_id=notice.gstin_id,
            metadata={
                "reference_number": notice.reference_number,
                "follow_up_id": str(existing.id),
            },
        )
        _record_notice_sync_event(
            notice=notice,
            gstin=notice.gstin,
            provider=notice.provider or ReturnFiling.Provider.WHITEBOOKS,
            event_type=NoticeSyncEvent.EventType.FOLLOW_UP,
            status=NoticeSyncEvent.EventStatus.SUCCESS,
            reference_number=notice.reference_number,
            provider_reference_id=notice.provider_reference_id,
            message="Existing notice follow-up reused.",
            counters={"created": 0, "reused": 1},
            actor=actor,
        )
        return existing, False

    user = actor if getattr(actor, "is_authenticated", False) else None
    follow_up = OperationalFollowUp.objects.create(
        workspace=notice.gstin.client.workspace,
        client=notice.gstin.client,
        gstin=notice.gstin,
        notice=notice,
        follow_up_type=OperationalFollowUp.FollowUpType.NOTICE_DOCUMENT_REQUEST,
        reason=f"Response or supporting documents required for notice {notice.reference_number}.",
        pending_with=OperationalFollowUp.PendingWith.CUSTOMER,
        status=OperationalFollowUp.FollowUpStatus.OPEN,
        priority=_derive_notice_follow_up_priority(notice=notice),
        title=_limit(f"Notice follow-up: {notice.reference_number}", 160),
        notes=_build_notice_follow_up_notes(notice=notice),
        next_action="Collect notice response documents, update notice status, and escalate before the due date if still pending.",
        due_at=_derive_notice_follow_up_due_at(notice=notice),
        assigned_to=notice.assigned_to,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=actor,
        action="operational_follow_up.created",
        entity=follow_up,
        workspace_id=follow_up.workspace_id,
        client_id=follow_up.client_id,
        gstin_id=follow_up.gstin_id,
        metadata={
            "source": "notice_tracking",
            "notice_id": str(notice.id),
            "reference_number": notice.reference_number,
            "pending_with": follow_up.pending_with,
            "status": follow_up.status,
            "priority": follow_up.priority,
        },
    )
    record_audit_log(
        actor=actor,
        action="notice.follow_up_created",
        entity=notice,
        workspace_id=notice.gstin.client.workspace_id,
        client_id=notice.gstin.client_id,
        gstin_id=notice.gstin_id,
        metadata={
            "reference_number": notice.reference_number,
            "follow_up_id": str(follow_up.id),
            "priority": follow_up.priority,
            "due_at": follow_up.due_at.isoformat(),
        },
    )
    _record_notice_sync_event(
        notice=notice,
        gstin=notice.gstin,
        provider=notice.provider or ReturnFiling.Provider.WHITEBOOKS,
        event_type=NoticeSyncEvent.EventType.FOLLOW_UP,
        status=NoticeSyncEvent.EventStatus.SUCCESS,
        reference_number=notice.reference_number,
        provider_reference_id=notice.provider_reference_id,
        message="Notice follow-up created.",
        counters={"created": 1, "reused": 0},
        actor=actor,
    )
    return follow_up, True


def process_scheduled_notice_syncs(*, actor=None, workspace_id=None, now=None):
    if not getattr(settings, "WHITEBOOKS_NOTICE_SYNC_ENABLED", False):
        return {
            "enabled": False,
            "processed_count": 0,
            "synced_count": 0,
            "created_count": 0,
            "updated_count": 0,
            "skipped_count": 0,
            "failed_count": 0,
            "failures": [],
        }

    current_time = now or timezone.now()
    sessions = ProviderAuthSession.objects.filter(
        provider=ReturnFiling.Provider.WHITEBOOKS,
        is_active=True,
        gstin__isnull=False,
    ).select_related("workspace", "client", "gstin")
    if workspace_id:
        sessions = sessions.filter(workspace_id=workspace_id)

    seen_gstins = set()
    counters = {
        "enabled": True,
        "processed_count": 0,
        "synced_count": 0,
        "created_count": 0,
        "updated_count": 0,
        "skipped_count": 0,
        "failed_count": 0,
        "failures": [],
    }
    for auth_session in sessions.order_by("gstin_id", "-verified_at", "-updated_at", "-created_at"):
        if auth_session.gstin_id in seen_gstins:
            continue
        seen_gstins.add(auth_session.gstin_id)
        freshness = get_provider_auth_session_freshness(auth_session=auth_session, now=current_time)
        if freshness["is_stale"]:
            counters["skipped_count"] += 1
            continue

        try:
            result = sync_whitebooks_notices(
                validated_data={
                    "workspace": auth_session.workspace,
                    "client": auth_session.client,
                    "gstin": auth_session.gstin,
                    "auth_session": auth_session,
                    "date": current_time.date(),
                    "resolved_email": auth_session.email,
                },
                actor=actor,
            )
        except (serializers.ValidationError, WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            counters["failed_count"] += 1
            failure = {
                "auth_session_id": str(auth_session.id),
                "gstin_id": str(auth_session.gstin_id),
                "gstin": auth_session.gstin.gstin if auth_session.gstin else "",
                "error": str(exc),
            }
            counters["failures"].append(failure)
            record_audit_log(
                actor=actor,
                action="notice.whitebooks_scheduled_sync_failed",
                entity=auth_session,
                workspace_id=auth_session.workspace_id,
                client_id=auth_session.client_id,
                gstin_id=auth_session.gstin_id,
                metadata=failure,
            )
            continue

        counters["processed_count"] += 1
        counters["synced_count"] += int(result.get("synced_count", 0))
        counters["created_count"] += int(result.get("created_count", 0))
        counters["updated_count"] += int(result.get("updated_count", 0))
        counters["skipped_count"] += int(result.get("skipped_count", 0))

    return counters


def resolve_notice_provider_context(*, validated_data):
    workspace = validated_data["workspace"]
    client = validated_data["client"]
    gstin = validated_data["gstin"]
    explicit_txn = str(validated_data.get("txn") or "").strip()
    auth_session = validated_data.get("auth_session")
    if auth_session is None and not explicit_txn:
        auth_session = _get_latest_auth_session(
            workspace=workspace,
            client=client,
            gstin=gstin,
        )
    txn = str(explicit_txn or getattr(auth_session, "txn", "") or "").strip()
    email = str(
        validated_data.get("email")
        or getattr(auth_session, "email", "")
        or validated_data.get("resolved_email")
        or settings.WHITEBOOKS_CONTACT_EMAIL
        or ""
    ).strip()

    if not txn:
        raise serializers.ValidationError(
            {"txn": "A verified WhiteBooks auth session or explicit txn is required before syncing notices."}
        )

    if not email:
        raise serializers.ValidationError({"email": "WhiteBooks contact email is required before syncing notices."})

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
        "gst_username": gstin.whitebooks_gst_username or None,
    }


def _get_latest_auth_session(*, workspace, client, gstin):
    return (
        ProviderAuthSession.objects.filter(
            workspace=workspace,
            client=client,
            gstin=gstin,
            provider=ReturnFiling.Provider.WHITEBOOKS,
            is_active=True,
        )
        .order_by("-verified_at", "-updated_at", "-created_at")
        .first()
    )


def _get_open_notice_follow_up(*, notice):
    return (
        OperationalFollowUp.objects.filter(notice=notice, is_active=True)
        .exclude(
            status__in=[
                OperationalFollowUp.FollowUpStatus.COMPLETED,
                OperationalFollowUp.FollowUpStatus.CANCELLED,
            ]
        )
        .order_by("due_at", "-created_at")
        .first()
    )


def _record_notice_sync_event(
    *,
    gstin,
    event_type,
    status,
    provider,
    notice=None,
    reference_number="",
    provider_reference_id="",
    message="",
    counters=None,
    provider_payload=None,
    error_message="",
    actor=None,
):
    user = actor if getattr(actor, "is_authenticated", False) else None
    NoticeSyncEvent.objects.create(
        gstin=gstin,
        notice=notice,
        provider=provider,
        event_type=event_type,
        status=status,
        reference_number=_limit(reference_number or getattr(notice, "reference_number", ""), 64),
        provider_reference_id=_limit(provider_reference_id or getattr(notice, "provider_reference_id", ""), 128),
        message=message,
        counters=sanitize_json(counters or {}),
        provider_payload=sanitize_json(provider_payload or {}),
        error_message=str(error_message or ""),
        initiated_by=user,
        created_by=user,
        updated_by=user,
    )


def _derive_notice_follow_up_priority(*, notice):
    due_date = notice.due_date or notice.provider_due_date
    today = timezone.localdate()
    if notice.status == "escalated":
        return OperationalFollowUp.Priority.CRITICAL
    if due_date and due_date <= today:
        return OperationalFollowUp.Priority.CRITICAL
    if due_date and due_date <= today + timedelta(days=3):
        return OperationalFollowUp.Priority.HIGH
    return OperationalFollowUp.Priority.MEDIUM


def _derive_notice_follow_up_due_at(*, notice):
    due_date = notice.due_date or notice.provider_due_date
    current_time = timezone.now()
    if due_date:
        due_at = timezone.make_aware(datetime.combine(due_date, time(hour=18)), timezone.get_current_timezone())
        if due_at > current_time:
            return due_at
    return current_time + timedelta(hours=24)


def _build_notice_follow_up_notes(*, notice):
    parts = [
        f"Notice: {notice.reference_number}",
        f"Title: {notice.title}",
    ]
    if notice.provider:
        parts.append(f"Provider: {notice.provider}")
    if notice.provider_notice_type:
        parts.append(f"Portal type: {notice.provider_notice_type}")
    if notice.provider_status:
        parts.append(f"Portal status: {notice.provider_status}")
    if notice.description:
        parts.extend(["", notice.description])
    return "\n".join(parts)


def _map_whitebooks_notice_row(row: dict) -> dict:
    reference = _first_non_empty(
        row,
        "refId",
        "refid",
        "ref_id",
        "refNo",
        "refno",
        "reference_id",
        "referenceId",
        "referenceNumber",
        "reference_number",
        "notice_ref_id",
        "noticeRefId",
        "noticeRefNo",
        "notice_id",
        "noticeId",
        "ntcId",
        "arn",
        "case_id",
        "caseId",
        "id",
    )
    notice_type = _first_non_empty(row, "notice_type", "noticeType", "type", "section", "form", "formType")
    provider_status = _first_non_empty(row, "status", "notice_status", "noticeStatus", "state", "stage")
    provider_due_date = _parse_provider_date(
        _first_non_empty(row, "due_date", "dueDate", "duedate", "response_due_date", "replyDueDate", "last_date", "lastDate")
    )
    description = _first_non_empty(row, "description", "desc", "notice_description", "noticeDescription", "message", "summary")

    title = _first_non_empty(row, "title", "subject", "notice_title", "noticeTitle", "notice_type", "noticeType")
    if not title:
        title = f"WhiteBooks notice {reference}" if reference else "WhiteBooks notice"

    return {
        "reference_number": _limit(reference, 64),
        "title": _limit(title, 255),
        "description": description,
        "status": _map_provider_status(provider_status),
        "provider_reference_id": _limit(reference, 128),
        "provider_notice_type": _limit(notice_type, 128),
        "provider_status": _limit(provider_status, 128),
        "provider_due_date": provider_due_date,
    }


def _extract_notice_rows(payload):
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("notices", "noticeList", "notice_list", "data", "result", "results", "items", "response"):
        value = payload.get(key)
        rows = _extract_notice_rows(value)
        if _looks_like_notice_rows(rows):
            return rows

    for value in payload.values():
        rows = _extract_notice_rows(value)
        if _looks_like_notice_rows(rows):
            return rows
    return []


def _extract_notice_detail_candidate(payload):
    if isinstance(payload, list):
        for item in payload:
            candidate = _extract_notice_detail_candidate(item)
            if isinstance(candidate, dict) and candidate:
                return candidate
        return {}
    if not isinstance(payload, dict):
        return {}
    if _looks_like_notice_rows([payload]):
        return payload

    for key in ("notice", "noticeDetail", "notice_details", "data", "result", "response"):
        candidate = _extract_notice_detail_candidate(payload.get(key))
        if isinstance(candidate, dict) and candidate:
            return candidate
    return payload


def _looks_like_notice_rows(rows):
    if not rows:
        return False
    reference_keys = {
        "refId",
        "refid",
        "ref_id",
        "refNo",
        "refno",
        "reference_id",
        "referenceId",
        "referenceNumber",
        "reference_number",
        "notice_ref_id",
        "noticeRefId",
        "noticeRefNo",
        "notice_id",
        "noticeId",
        "ntcId",
        "arn",
        "case_id",
        "caseId",
        "id",
    }
    return any(reference_keys.intersection(row.keys()) for row in rows if isinstance(row, dict))


def _first_non_empty(row: dict, *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _limit(value: str, max_length: int) -> str:
    value = str(value or "").strip()
    return value[:max_length]


def _map_provider_status(status: str) -> str:
    normalized = str(status or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"closed", "close", "disposed", "completed", "complete"}:
        return "closed"
    if normalized in {"responded", "replied", "reply_filed", "response_filed", "submitted"}:
        return "responded"
    if normalized in {"escalated", "urgent", "critical"}:
        return "escalated"
    return "open"


def _parse_provider_date(value: str):
    normalized = str(value or "").strip()
    if not normalized:
        return None

    parsed = parse_date(normalized[:10])
    if parsed is not None:
        return parsed

    for date_format in ("%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(normalized[:10], date_format).date()
        except ValueError:
            continue
    return None
