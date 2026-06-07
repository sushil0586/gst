from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import WorkspaceRole
from apps.accounts.services.rbac import user_has_any_workspace_role
from apps.audit_logs.services.audit import record_audit_log
from apps.common.security import sanitize_json
from apps.filings.models import ReturnFiling, ReturnFilingAttempt, ReturnFilingEvent, ReturnFilingIncidentNote
from apps.filings.services.alerts import escalate_return_filing_alerts
from apps.filings.providers import (
    FilingProviderAuthenticationError,
    FilingProviderConfigurationError,
    FilingProviderError,
    FilingProviderSessionLimitError,
    FilingProviderStepError,
    FilingProviderTemporaryError,
)
from apps.filings.providers.registry import get_filing_provider
from apps.returns.models import ReturnPreparation

User = get_user_model()

def create_return_filing(*, validated_data, user):
    existing = validated_data.get("existing_filing")
    if existing is not None:
        return existing, False
    restart_existing = validated_data.get("restart_existing_filing")
    if restart_existing is not None:
        latest_attempt = restart_existing.attempts.order_by("-attempt_number").first()
        with transaction.atomic():
            restart_existing.updated_by = user
            restart_existing.error_summary = {}
            restart_existing.save(update_fields=["updated_by", "error_summary", "updated_at"])
            if latest_attempt is not None and latest_attempt.status == ReturnFilingAttempt.AttemptStatus.CREATED:
                latest_attempt.status = ReturnFilingAttempt.AttemptStatus.QUEUED
                latest_attempt.updated_by = user
                latest_attempt.save(update_fields=["status", "updated_by", "updated_at"])
            ReturnFilingEvent.objects.create(
                return_filing=restart_existing,
                filing_attempt=latest_attempt,
                event_type="filing.requeued_after_auth_refresh",
                old_status=restart_existing.status,
                new_status=restart_existing.status,
                actor=user,
                metadata={"reason": "Fresh provider auth session verified before restarting queued filing."},
            )
            record_audit_log(
                actor=user,
                action="return_filing.requeued_after_auth_refresh",
                entity=restart_existing,
                workspace_id=restart_existing.workspace_id,
                client_id=restart_existing.client_id,
                gstin_id=restart_existing.gstin_id,
                compliance_period_id=restart_existing.compliance_period_id,
                metadata={"latest_attempt_id": str(latest_attempt.id) if latest_attempt else ""},
            )
        enqueue_return_filing(filing=restart_existing, actor=user)
        return restart_existing, True

    prepared_return = validated_data["prepared_return_instance"]
    approval_request = validated_data.get("approval_request_instance")
    confirmation_note = validated_data.get("confirmation_note", "")

    if prepared_return.return_type in {
        ReturnPreparation.ReturnType.GSTR9,
        ReturnPreparation.ReturnType.GSTR9C,
    }:
        return _create_manual_return_filing(
            validated_data=validated_data,
            user=user,
            prepared_return=prepared_return,
            approval_request=approval_request,
            confirmation_note=confirmation_note,
        )

    if settings.FILING_ENFORCE_MAKER_CHECKER and prepared_return.approved_by_id and prepared_return.approved_by_id == user.id:
        raise serializers.ValidationError(
            {
                "prepared_return": (
                    "Maker-checker policy blocks the same user from approving and filing this return. "
                    "Use a different filer or disable enforcement for non-production environments."
                )
            }
        )

    with transaction.atomic():
        filing = ReturnFiling.objects.create(
            workspace_id=validated_data["workspace"],
            client_id=validated_data["client"],
            gstin_id=validated_data["gstin"],
            compliance_period_id=validated_data["compliance_period"],
            prepared_return=prepared_return,
            approval_request=approval_request,
            provider=validated_data["provider"],
            return_type=validated_data["return_type"],
            status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
            prepared_snapshot_version=1,
            readiness_snapshot={
                "return_status": prepared_return.status,
                "confirmation_note": confirmation_note,
                "validated_for_filing": True,
            },
            approved_by=prepared_return.approved_by,
            filed_by=user,
            created_by=user,
            updated_by=user,
        )
        attempt = ReturnFilingAttempt.objects.create(
            return_filing=filing,
            attempt_number=1,
            status=ReturnFilingAttempt.AttemptStatus.QUEUED,
            idempotency_key=f"{filing.id}:1",
            triggered_by=user,
            request_summary={
                "provider": filing.provider,
                "return_type": filing.return_type,
                "confirmation_note": confirmation_note,
            },
            created_by=user,
            updated_by=user,
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=attempt,
            event_type="filing.queued",
            old_status="",
            new_status=filing.status,
            actor=user,
            metadata={
                "provider": filing.provider,
                "attempt_number": attempt.attempt_number,
            },
        )
        record_audit_log(
            actor=user,
            action="return_filing.queued",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "prepared_return_id": str(prepared_return.id),
                "provider": filing.provider,
                "return_type": filing.return_type,
                "attempt_number": attempt.attempt_number,
            },
        )
    enqueue_return_filing(filing=filing, actor=user)
    return filing, True


def _create_manual_return_filing(*, validated_data, user, prepared_return, approval_request, confirmation_note):
    existing = ReturnFiling.objects.filter(
        prepared_return=prepared_return,
        prepared_snapshot_version=1,
        is_active=True,
    ).first()
    if existing is not None:
        return existing, False

    with transaction.atomic():
        filing = ReturnFiling.objects.create(
            workspace_id=validated_data["workspace"],
            client_id=validated_data["client"],
            gstin_id=validated_data["gstin"],
            compliance_period_id=validated_data["compliance_period"],
            prepared_return=prepared_return,
            approval_request=approval_request,
            provider=validated_data["provider"],
            return_type=validated_data["return_type"],
            status=ReturnFiling.FilingStatus.APPROVED,
            prepared_snapshot_version=1,
            readiness_snapshot={
                "return_status": prepared_return.status,
                "confirmation_note": confirmation_note,
                "validated_for_filing": True,
                "manual_filing_only": True,
                "manual_filing_reason": (
                    "Annual filing is currently tracked as an operational manual filing flow "
                    "for GSTR-9 and GSTR-9C."
                ),
            },
            approved_by=prepared_return.approved_by,
            filed_by=None,
            created_by=user,
            updated_by=user,
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            event_type="filing.manual_tracking_opened",
            old_status="",
            new_status=filing.status,
            actor=user,
            metadata={
                "provider": filing.provider,
                "manual_filing_only": True,
                "return_type": filing.return_type,
            },
        )
        record_audit_log(
            actor=user,
            action="return_filing.manual_tracking_opened",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "prepared_return_id": str(prepared_return.id),
                "provider": filing.provider,
                "return_type": filing.return_type,
            },
        )
    return filing, True


def enqueue_return_filing(*, filing, actor):
    from apps.filings.tasks import process_return_filing_task

    if settings.CELERY_TASK_ALWAYS_EAGER:
        process_return_filing(filing_id=filing.id, actor_id=actor.id if actor else None)
        return

    try:
        process_return_filing_task.apply_async(
            args=[str(filing.id), actor.id if actor else None],
            queue=settings.CELERY_FILINGS_QUEUE,
        )
    except Exception:
        if settings.CELERY_STRICT_PRODUCTION_ASYNC and not settings.DEBUG:
            raise RuntimeError("Filing worker is unavailable. Filing jobs cannot fall back to inline execution in production.")
        process_return_filing(filing_id=filing.id, actor_id=actor.id if actor else None)


def enqueue_return_filing_status_sync(*, filing, actor):
    from apps.filings.tasks import sync_return_filing_status_task

    if settings.CELERY_TASK_ALWAYS_EAGER:
        sync_return_filing_status(filing_id=filing.id, actor_id=actor.id if actor else None)
        return

    try:
        sync_return_filing_status_task.apply_async(
            args=[str(filing.id), actor.id if actor else None],
            queue=settings.CELERY_FILINGS_QUEUE,
        )
    except Exception:
        if settings.CELERY_STRICT_PRODUCTION_ASYNC and not settings.DEBUG:
            raise RuntimeError("Filing status-sync worker is unavailable. Status sync cannot fall back to inline execution in production.")
        sync_return_filing_status(filing_id=filing.id, actor_id=actor.id if actor else None)


@transaction.atomic
def process_return_filing(*, filing_id, actor_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    filing = (
        ReturnFiling.objects.select_for_update(of=("self",))
        .select_related("workspace", "client", "gstin", "compliance_period", "prepared_return", "approval_request")
        .get(pk=filing_id)
    )
    latest_attempt = filing.attempts.order_by("-attempt_number").first()
    if latest_attempt is None:
        raise serializers.ValidationError("No filing attempt exists for this filing.")
    if latest_attempt.status not in {
        ReturnFilingAttempt.AttemptStatus.CREATED,
        ReturnFilingAttempt.AttemptStatus.QUEUED,
    }:
        return {"filing_id": str(filing.id), "status": filing.status}

    provider = get_filing_provider(filing.provider)
    planned_provider_stage = _get_planned_provider_stage(provider=provider, filing=filing)
    previous_status = filing.status
    try:
        latest_attempt.status = ReturnFilingAttempt.AttemptStatus.IN_PROGRESS
        latest_attempt.started_at = latest_attempt.started_at or timezone.now()
        latest_attempt.updated_by = actor
        latest_attempt.save(update_fields=["status", "started_at", "updated_by", "updated_at"])
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=latest_attempt,
            event_type="filing.submission_started",
            old_status=previous_status,
            new_status=previous_status,
            actor=actor,
            metadata={"attempt_number": latest_attempt.attempt_number},
        )
        _record_requested_provider_stage_events(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            previous_status=previous_status,
            provider_stage=planned_provider_stage,
        )
        record_audit_log(
            actor=actor,
            action="return_filing.submission_started",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={"attempt_number": latest_attempt.attempt_number},
        )
        _record_requested_provider_stage_audits(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            provider_stage=planned_provider_stage,
        )

        payload, result = provider.submit_return(filing)
        filing.status = ReturnFiling.FilingStatus.SUBMITTED
        filing.provider_reference_id = result.provider_reference_id
        filing.provider_acknowledgement_id = result.provider_acknowledgement_id
        filing.submitted_at = timezone.now()
        filing.last_status_sync_at = filing.submitted_at
        filing.filed_by = actor or filing.filed_by
        filing.updated_by = actor
        filing.error_summary = {}
        filing.save(
            update_fields=[
                "status",
                "provider_reference_id",
                "provider_acknowledgement_id",
                "submitted_at",
                "last_status_sync_at",
                "filed_by",
                "updated_by",
                "error_summary",
                "updated_at",
            ]
        )

        latest_attempt.status = (
            ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS
            if result.provider_stage == "file_requested"
            else ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
        )
        latest_attempt.submitted_at = filing.submitted_at
        latest_attempt.request_payload_hash = str(hash(str(payload)))
        latest_attempt.request_summary = {
            "return_type": filing.return_type,
            "provider": filing.provider,
            "prepared_return_id": str(filing.prepared_return_id),
            "provider_stage": result.provider_stage or "submitted",
        }
        latest_attempt.response_summary = sanitize_json(result.raw_response)
        latest_attempt.provider_request_id = result.provider_reference_id
        latest_attempt.provider_status_raw = sanitize_json(result.raw_response)
        latest_attempt.updated_by = actor
        latest_attempt.save(
            update_fields=[
                "status",
                "submitted_at",
                "request_payload_hash",
                "request_summary",
                "response_summary",
                "provider_request_id",
                "provider_status_raw",
                "updated_by",
                "updated_at",
            ]
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=latest_attempt,
            event_type="filing.submitted",
            old_status=previous_status,
            new_status=filing.status,
            actor=actor,
            metadata={
                "provider_reference_id": filing.provider_reference_id,
                "provider_acknowledgement_id": filing.provider_acknowledgement_id,
                "provider_stage": result.provider_stage or "submitted",
            },
        )
        _record_completed_provider_stage_events(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            previous_status=previous_status,
            provider_reference_id=filing.provider_reference_id,
            completed_stages=provider.completed_stages_from_result(result),
        )
        record_audit_log(
            actor=actor,
            action="return_filing.submitted",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "provider_reference_id": filing.provider_reference_id,
                "provider_acknowledgement_id": filing.provider_acknowledgement_id,
                "provider_stage": result.provider_stage or "submitted",
                "attempt_number": latest_attempt.attempt_number,
            },
        )
        _record_completed_provider_stage_audits(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            provider_reference_id=filing.provider_reference_id,
            completed_stages=provider.completed_stages_from_result(result),
        )
        enqueue_return_filing_status_sync(filing=filing, actor=actor)
        return {
            "filing_id": str(filing.id),
            "status": filing.status,
            "provider_reference_id": filing.provider_reference_id,
        }
    except FilingProviderStepError as exc:
        _persist_partial_provider_progress(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            partial_response=exc.partial_response,
            provider_reference_id=exc.provider_reference_id,
            provider_acknowledgement_id=exc.provider_acknowledgement_id,
        )
        _record_completed_provider_stage_events(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            previous_status=previous_status,
            provider_reference_id=exc.provider_reference_id or filing.provider_reference_id,
            completed_stages=exc.completed_stages,
        )
        _record_completed_provider_stage_audits(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            provider_reference_id=exc.provider_reference_id or filing.provider_reference_id,
            completed_stages=exc.completed_stages,
        )
        failure_stage = exc.provider_stage or planned_provider_stage
        filing_status = ReturnFiling.FilingStatus.NEEDS_RETRY if exc.retryable else ReturnFiling.FilingStatus.FAILED
        event_type, audit_action = provider.failure_markers(failure_stage, retryable=exc.retryable)
        _mark_filing_failure(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            old_status=previous_status,
            filing_status=filing_status,
            error_code=exc.error_code or "provider_step_error",
            error_message=str(exc),
            event_type=event_type,
            audit_action=audit_action,
            provider_stage=failure_stage,
        )
        raise
    except FilingProviderTemporaryError as exc:
        event_type, audit_action = provider.failure_markers(planned_provider_stage, retryable=True)
        _mark_filing_failure(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            old_status=previous_status,
            filing_status=ReturnFiling.FilingStatus.NEEDS_RETRY,
            error_code="whitebooks_temporary_error",
            error_message=str(exc),
            event_type=event_type,
            audit_action=audit_action,
            provider_stage=planned_provider_stage,
        )
        raise
    except FilingProviderSessionLimitError as exc:
        event_type, audit_action = provider.failure_markers(planned_provider_stage)
        _mark_filing_failure(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            old_status=previous_status,
            filing_status=ReturnFiling.FilingStatus.FAILED,
            error_code="whitebooks_session_limit",
            error_message=str(exc),
            event_type=event_type,
            audit_action=audit_action,
            provider_stage=planned_provider_stage,
        )
        raise
    except FilingProviderAuthenticationError as exc:
        event_type, audit_action = provider.failure_markers(planned_provider_stage)
        _mark_filing_failure(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            old_status=previous_status,
            filing_status=ReturnFiling.FilingStatus.FAILED,
            error_code="whitebooks_authentication_error",
            error_message=str(exc),
            event_type=event_type,
            audit_action=audit_action,
            provider_stage=planned_provider_stage,
        )
        raise
    except FilingProviderConfigurationError as exc:
        event_type, audit_action = provider.failure_markers(planned_provider_stage)
        _mark_filing_failure(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            old_status=previous_status,
            filing_status=ReturnFiling.FilingStatus.FAILED,
            error_code="whitebooks_configuration_error",
            error_message=str(exc),
            event_type=event_type,
            audit_action=audit_action,
            provider_stage=planned_provider_stage,
        )
        raise
    except FilingProviderError as exc:
        event_type, audit_action = provider.failure_markers(planned_provider_stage)
        _mark_filing_failure(
            filing=filing,
            attempt=latest_attempt,
            actor=actor,
            old_status=previous_status,
            filing_status=ReturnFiling.FilingStatus.FAILED,
            error_code="whitebooks_submission_error",
            error_message=str(exc),
            event_type=event_type,
            audit_action=audit_action,
            provider_stage=planned_provider_stage,
        )
        raise


def _mark_filing_failure(*, filing, attempt, actor, old_status, filing_status, error_code, error_message, event_type, audit_action, provider_stage=None):
    now = timezone.now()
    filing.status = filing_status
    filing.error_summary = {"code": error_code, "message": error_message}
    filing.last_status_sync_at = now
    filing.updated_by = actor
    filing.save(update_fields=["status", "error_summary", "last_status_sync_at", "updated_by", "updated_at"])

    attempt.status = ReturnFilingAttempt.AttemptStatus.FAILED
    attempt.failure_code = error_code
    attempt.failure_message = error_message
    attempt.completed_at = now
    existing_response_summary = attempt.response_summary if isinstance(attempt.response_summary, dict) else {}
    attempt.response_summary = {
        **existing_response_summary,
        "failure_summary": {
            "code": error_code,
            "message": error_message,
            "provider_stage": provider_stage or "",
            "retryable": filing_status == ReturnFiling.FilingStatus.NEEDS_RETRY,
        },
        "retryable": filing_status == ReturnFiling.FilingStatus.NEEDS_RETRY,
    }
    attempt.updated_by = actor
    attempt.save(
        update_fields=[
            "status",
            "failure_code",
            "failure_message",
            "completed_at",
            "response_summary",
            "updated_by",
            "updated_at",
        ]
    )

    ReturnFilingEvent.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        event_type=event_type,
        old_status=old_status,
        new_status=filing.status,
        actor=actor,
        metadata={"code": error_code, "message": error_message, "provider_stage": provider_stage or ""},
    )
    record_audit_log(
        actor=actor,
        action=audit_action,
        entity=filing,
        workspace_id=filing.workspace_id,
        client_id=filing.client_id,
        gstin_id=filing.gstin_id,
        compliance_period_id=filing.compliance_period_id,
        metadata={
            "code": error_code,
            "message": error_message,
            "attempt_number": attempt.attempt_number,
            "provider_stage": provider_stage or "",
        },
    )


def _get_planned_provider_stage(*, provider, filing):
    planned_stage_getter = getattr(provider, "planned_submission_stage", None)
    if callable(planned_stage_getter):
        return planned_stage_getter(filing)
    return "submitted"


def _record_requested_provider_stage_events(*, filing, attempt, actor, previous_status, provider_stage):
    provider = get_filing_provider(filing.provider)
    for stage in provider.requested_stages_for(provider_stage, filing=filing):
        definition = provider.requested_definition(stage)
        if definition is None:
            continue
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=attempt,
            event_type=definition.requested_event_type,
            old_status=previous_status,
            new_status=previous_status,
            actor=actor,
            metadata={"attempt_number": attempt.attempt_number, "provider_stage": stage},
        )


def _record_requested_provider_stage_audits(*, filing, attempt, actor, provider_stage):
    provider = get_filing_provider(filing.provider)
    for stage in provider.requested_stages_for(provider_stage, filing=filing):
        definition = provider.requested_definition(stage)
        if definition is None:
            continue
        record_audit_log(
            actor=actor,
            action=definition.requested_audit_action,
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={"attempt_number": attempt.attempt_number, "provider_stage": stage},
        )


def _record_completed_provider_stage_events(*, filing, attempt, actor, previous_status, provider_reference_id, completed_stages):
    provider = get_filing_provider(filing.provider)
    for stage in completed_stages:
        definition = provider.requested_definition(stage)
        if definition is None:
            continue
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=attempt,
            event_type=definition.completed_event_type,
            old_status=previous_status,
            new_status=filing.status,
            actor=actor,
            metadata={
                "provider_reference_id": provider_reference_id,
                "provider_stage": stage,
            },
        )


def _record_completed_provider_stage_audits(*, filing, attempt, actor, provider_reference_id, completed_stages):
    provider = get_filing_provider(filing.provider)
    for stage in completed_stages:
        definition = provider.requested_definition(stage)
        if definition is None:
            continue
        record_audit_log(
            actor=actor,
            action=definition.completed_audit_action,
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "provider_reference_id": provider_reference_id,
                "provider_stage": stage,
                "attempt_number": attempt.attempt_number,
            },
        )


def _persist_partial_provider_progress(*, filing, attempt, actor, partial_response, provider_reference_id="", provider_acknowledgement_id=""):
    if not partial_response and not provider_reference_id and not provider_acknowledgement_id:
        return

    response_summary = sanitize_json(partial_response if isinstance(partial_response, dict) else {})
    if provider_reference_id:
        filing.provider_reference_id = provider_reference_id
    if provider_acknowledgement_id:
        filing.provider_acknowledgement_id = provider_acknowledgement_id
    filing.last_status_sync_at = timezone.now()
    filing.updated_by = actor
    filing.save(
        update_fields=[
            "provider_reference_id",
            "provider_acknowledgement_id",
            "last_status_sync_at",
            "updated_by",
            "updated_at",
        ]
    )

    attempt.response_summary = response_summary
    attempt.provider_status_raw = response_summary
    if provider_reference_id:
        attempt.provider_request_id = provider_reference_id
    attempt.updated_by = actor
    attempt.save(
        update_fields=[
            "response_summary",
            "provider_status_raw",
            "provider_request_id",
            "updated_by",
            "updated_at",
        ]
    )



def retry_return_filing(*, filing, user, comments=""):
    if filing.status not in {
        ReturnFiling.FilingStatus.FAILED,
        ReturnFiling.FilingStatus.NEEDS_RETRY,
    }:
        raise serializers.ValidationError("Only failed or retryable filings can be retried.")

    with transaction.atomic():
        latest_attempt = filing.attempts.order_by("-attempt_number").first()
        next_attempt_number = (latest_attempt.attempt_number if latest_attempt else 0) + 1
        previous_status = filing.status
        filing.status = ReturnFiling.FilingStatus.QUEUED_FOR_FILING
        filing.error_summary = {}
        filing.updated_by = user
        filing.save(update_fields=["status", "error_summary", "updated_by", "updated_at"])
        attempt = ReturnFilingAttempt.objects.create(
            return_filing=filing,
            attempt_number=next_attempt_number,
            status=ReturnFilingAttempt.AttemptStatus.QUEUED,
            idempotency_key=f"{filing.id}:{next_attempt_number}",
            triggered_by=user,
            request_summary={
                "provider": filing.provider,
                "return_type": filing.return_type,
                "comments": comments,
                "retry": True,
            },
            created_by=user,
            updated_by=user,
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=attempt,
            event_type="filing.retry_requested",
            old_status=previous_status,
            new_status=filing.status,
            actor=user,
            metadata={"attempt_number": next_attempt_number, "comments": comments},
        )
        record_audit_log(
            actor=user,
            action="return_filing.retry_requested",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={"attempt_number": next_attempt_number, "comments": comments},
        )
    enqueue_return_filing(filing=filing, actor=user)
    return filing


def requeue_return_filing_after_review(*, filing, user, comments):
    _ensure_support_recovery_access(filing=filing, user=user, action_label="requeue this filing after review")
    if filing.status != ReturnFiling.FilingStatus.FAILED:
        raise serializers.ValidationError("Only failed filings can be requeued after review.")
    if not comments or not comments.strip():
        raise serializers.ValidationError({"comments": "Comments are required when requeueing a filing after review."})

    with transaction.atomic():
        latest_attempt = filing.attempts.order_by("-attempt_number").first()
        next_attempt_number = (latest_attempt.attempt_number if latest_attempt else 0) + 1
        previous_status = filing.status
        filing.status = ReturnFiling.FilingStatus.QUEUED_FOR_FILING
        filing.error_summary = {}
        filing.updated_by = user
        filing.save(update_fields=["status", "error_summary", "updated_by", "updated_at"])
        attempt = ReturnFilingAttempt.objects.create(
            return_filing=filing,
            attempt_number=next_attempt_number,
            status=ReturnFilingAttempt.AttemptStatus.QUEUED,
            idempotency_key=f"{filing.id}:{next_attempt_number}",
            triggered_by=user,
            request_summary={
                "provider": filing.provider,
                "return_type": filing.return_type,
                "comments": comments,
                "support_requeue": True,
            },
            created_by=user,
            updated_by=user,
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=attempt,
            event_type="filing.recovery_requeued",
            old_status=previous_status,
            new_status=filing.status,
            actor=user,
            metadata={"attempt_number": next_attempt_number, "comments": comments},
        )
        record_audit_log(
            actor=user,
            action="return_filing.recovery_requeued",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={"attempt_number": next_attempt_number, "comments": comments},
        )
    enqueue_return_filing(filing=filing, actor=user)
    return filing


def create_return_filing_incident_note(*, filing, user, title, note, severity, alert_code=""):
    _ensure_support_recovery_access(filing=filing, user=user, action_label="create filing incident notes")
    with transaction.atomic():
        incident_note = ReturnFilingIncidentNote.objects.create(
            return_filing=filing,
            title=title,
            note=note,
            severity=severity,
            status=ReturnFilingIncidentNote.Status.OPEN,
            alert_code=alert_code,
            created_by=user,
            updated_by=user,
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            event_type="filing.incident_note_created",
            old_status=filing.status,
            new_status=filing.status,
            actor=user,
            metadata={
                "incident_note_id": str(incident_note.id),
                "title": title,
                "severity": severity,
                "alert_code": alert_code,
            },
        )
        record_audit_log(
            actor=user,
            action="return_filing.incident_note_created",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "incident_note_id": str(incident_note.id),
                "title": title,
                "severity": severity,
                "alert_code": alert_code,
            },
        )
    return incident_note


def escalate_return_filing_operational_alerts(*, filing, user, comments=""):
    _ensure_support_recovery_access(filing=filing, user=user, action_label="escalate filing operational alerts")
    return escalate_return_filing_alerts(filing=filing, user=user, comments=comments)


def resolve_return_filing_incident_note(*, filing, incident_note, user):
    _ensure_support_recovery_access(filing=filing, user=user, action_label="resolve filing incident notes")
    if incident_note.return_filing_id != filing.id:
        raise serializers.ValidationError("Incident note does not belong to this filing.")
    if incident_note.status == ReturnFilingIncidentNote.Status.RESOLVED:
        return incident_note

    with transaction.atomic():
        incident_note.status = ReturnFilingIncidentNote.Status.RESOLVED
        incident_note.resolved_at = timezone.now()
        incident_note.resolved_by = user
        incident_note.updated_by = user
        incident_note.save(update_fields=["status", "resolved_at", "resolved_by", "updated_by", "updated_at"])
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            event_type="filing.incident_note_resolved",
            old_status=filing.status,
            new_status=filing.status,
            actor=user,
            metadata={
                "incident_note_id": str(incident_note.id),
                "title": incident_note.title,
                "severity": incident_note.severity,
                "alert_code": incident_note.alert_code,
            },
        )
        record_audit_log(
            actor=user,
            action="return_filing.incident_note_resolved",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "incident_note_id": str(incident_note.id),
                "title": incident_note.title,
                "severity": incident_note.severity,
                "alert_code": incident_note.alert_code,
            },
        )
    return incident_note


def _ensure_support_recovery_access(*, filing, user, action_label):
    allowed_roles = set(getattr(settings, "FILING_SUPPORT_RECOVERY_ROLES", [])) or {
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
        WorkspaceRole.MANAGER,
        WorkspaceRole.REVIEWER,
        WorkspaceRole.SENIOR_CA,
    }
    if user_has_any_workspace_role(user, filing.workspace, allowed_roles):
        return
    raise serializers.ValidationError(
        f"Your workspace role does not allow you to {action_label}. Use a reviewer, manager, admin, owner, or senior CA account."
    )


def sync_return_filing_status(*, filing_id, actor_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    filing = (
        ReturnFiling.objects.select_related("workspace", "client", "gstin", "compliance_period", "prepared_return")
        .get(pk=filing_id)
    )
    provider = get_filing_provider(filing.provider)
    provider_status = provider.get_status(filing)
    previous_status = filing.status

    submission_state = provider_status.get("submission_state", filing.status)
    arn = provider_status.get("arn", "")
    raw_response = provider_status.get("raw_response", {})
    provider_stage = raw_response.get("provider_stage") if isinstance(raw_response, dict) else None

    latest_attempt = filing.attempts.order_by("-attempt_number").first()
    if latest_attempt is not None:
        latest_attempt.provider_status_raw = sanitize_json(raw_response)
        if raw_response:
            existing_response_summary = latest_attempt.response_summary if isinstance(latest_attempt.response_summary, dict) else {}
            latest_attempt.response_summary = {
                **existing_response_summary,
                **sanitize_json(raw_response),
            }
        if provider_stage:
            latest_attempt.request_summary = {
                **(latest_attempt.request_summary or {}),
                "provider_stage": provider_stage,
            }
        latest_attempt.updated_by = actor

    if submission_state == "filed":
        now = timezone.now()
        filing.status = ReturnFiling.FilingStatus.FILED
        filing.arn = arn or filing.arn
        filing.arn_received_at = filing.arn_received_at or now
        filing.filed_at = filing.filed_at or now
        filing.last_status_sync_at = now
        filing.updated_by = actor
        filing.save(
            update_fields=[
                "status",
                "arn",
                "arn_received_at",
                "filed_at",
                "last_status_sync_at",
                "updated_by",
                "updated_at",
            ]
        )
        if latest_attempt is not None:
            latest_attempt.status = ReturnFilingAttempt.AttemptStatus.COMPLETED
            latest_attempt.completed_at = now
            latest_attempt.updated_by = actor
            latest_attempt.save(
                update_fields=[
                    "status",
                    "completed_at",
                    "provider_status_raw",
                    "response_summary",
                    "request_summary",
                    "updated_by",
                    "updated_at",
                ]
            )
        prepared_return = filing.prepared_return
        prepared_return.status = ReturnPreparation.PreparationStatus.FILED
        prepared_return.arn = filing.arn
        prepared_return.filed_at = filing.filed_at
        prepared_return.filed_by = actor or filing.filed_by
        prepared_return.updated_by = actor
        prepared_return.save(update_fields=["status", "arn", "filed_at", "filed_by", "updated_by", "updated_at"])
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=latest_attempt,
            event_type="filing.status_synced",
            old_status=previous_status,
            new_status=filing.status,
            actor=actor,
            metadata={"submission_state": submission_state, "arn": filing.arn},
        )
        record_audit_log(
            actor=actor,
            action="return_filing.filed",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={"submission_state": submission_state, "arn": filing.arn},
        )
    elif submission_state == "failed":
        now = timezone.now()
        failure_summary = _extract_status_sync_failure_summary(raw_response)
        filing.status = ReturnFiling.FilingStatus.FAILED
        filing.last_status_sync_at = now
        filing.updated_by = actor
        filing.error_summary = failure_summary
        filing.save(
            update_fields=[
                "status",
                "last_status_sync_at",
                "updated_by",
                "error_summary",
                "updated_at",
            ]
        )
        if latest_attempt is not None:
            latest_attempt.status = ReturnFilingAttempt.AttemptStatus.FAILED
            latest_attempt.failure_code = str(failure_summary.get("code", "provider_status_failed"))
            latest_attempt.failure_message = str(failure_summary.get("message", "Provider status sync marked the filing as failed."))
            latest_attempt.completed_at = now
            existing_response_summary = latest_attempt.response_summary if isinstance(latest_attempt.response_summary, dict) else {}
            latest_attempt.response_summary = {
                **existing_response_summary,
                "failure_summary": failure_summary,
                "retryable": False,
            }
            latest_attempt.updated_by = actor
            latest_attempt.save(
                update_fields=[
                    "status",
                    "failure_code",
                    "failure_message",
                    "completed_at",
                    "provider_status_raw",
                    "response_summary",
                    "request_summary",
                    "updated_by",
                    "updated_at",
                ]
            )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=latest_attempt,
            event_type="filing.status_synced",
            old_status=previous_status,
            new_status=filing.status,
            actor=actor,
            metadata={
                "submission_state": submission_state,
                "provider_stage": provider_stage or "",
                "code": failure_summary.get("code", ""),
                "message": failure_summary.get("message", ""),
            },
        )
        record_audit_log(
            actor=actor,
            action="return_filing.status_sync_failed",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "submission_state": submission_state,
                "provider_stage": provider_stage or "",
                "code": failure_summary.get("code", ""),
                "message": failure_summary.get("message", ""),
            },
        )
    else:
        now = timezone.now()
        filing.last_status_sync_at = now
        filing.updated_by = actor
        filing.save(update_fields=["last_status_sync_at", "updated_by", "updated_at"])
        if latest_attempt is not None:
            update_fields = ["provider_status_raw", "response_summary", "updated_by", "updated_at"]
            if provider_stage:
                update_fields.append("request_summary")
            latest_attempt.save(update_fields=update_fields)
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            filing_attempt=latest_attempt,
            event_type="filing.status_synced",
            old_status=previous_status,
            new_status=filing.status,
            actor=actor,
            metadata={
                "submission_state": submission_state,
                "provider_stage": provider_stage or "",
                "message": raw_response.get("message", "") if isinstance(raw_response, dict) else "",
            },
        )
        record_audit_log(
            actor=actor,
            action="return_filing.status_synced",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={
                "submission_state": submission_state,
                "provider_stage": provider_stage or "",
                "message": raw_response.get("message", "") if isinstance(raw_response, dict) else "",
            },
        )
    return {
        "filing_id": str(filing.id),
        "status": filing.status,
        "arn": filing.arn,
        "submission_state": submission_state,
    }


def _extract_status_sync_failure_summary(raw_response):
    if not isinstance(raw_response, dict):
        return {
            "code": "provider_status_failed",
            "message": "Provider status sync marked the filing as failed.",
        }

    status_response = raw_response.get("status_response")
    track_response = raw_response.get("track_response")
    public_track_response = raw_response.get("public_track_response")
    status_error = status_response.get("error") if isinstance(status_response, dict) and isinstance(status_response.get("error"), dict) else {}
    track_error = track_response.get("error") if isinstance(track_response, dict) and isinstance(track_response.get("error"), dict) else {}
    public_track_error = (
        public_track_response.get("error")
        if isinstance(public_track_response, dict) and isinstance(public_track_response.get("error"), dict)
        else {}
    )
    code = (
        status_error.get("error_cd")
        or track_error.get("error_cd")
        or public_track_error.get("error_cd")
        or raw_response.get("failure_code")
        or "provider_status_failed"
    )
    message = (
        status_error.get("message")
        or track_error.get("message")
        or public_track_error.get("message")
        or raw_response.get("message")
        or "Provider status sync marked the filing as failed."
    )
    return {
        "code": str(code),
        "message": str(message),
        "provider_stage": str(raw_response.get("provider_stage", "")),
        "retryable": False,
    }
