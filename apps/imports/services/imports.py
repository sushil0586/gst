from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from django.utils import timezone
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.services.compliance_periods import ensure_period_modifiable
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch, ImportTemplate
from apps.imports.services.correction_policy import evaluate_import_correction_policy, get_import_correction_policy
from apps.imports.services.parsers import PARSER_REGISTRY
from apps.common.security import sanitize_json
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation

User = get_user_model()


def create_import_batch(*, serializer, user):
    ensure_period_modifiable(serializer.validated_data["compliance_period"], actor=user, attempted_action="import.upload")
    instance = serializer.save(
        status=ImportBatch.BatchStatus.UPLOADED,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="import.uploaded",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.compliance_period_id,
        metadata={"file_name": instance.file_name, "import_type": instance.import_type},
    )
    enqueue_import_processing(import_batch=instance, actor=user)
    instance.refresh_from_db()
    return instance


def fetch_gstr2b_import_batch(*, validated_data, user):
    gstin = validated_data["gstin_instance"]
    compliance_period = validated_data["compliance_period_instance"]
    ensure_period_modifiable(compliance_period, actor=user, attempted_action="import.fetch_gstr2b")

    if gstin.client_id != validated_data["client_instance"].id:
        raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})
    if compliance_period.gstin_id != gstin.id:
        raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected GSTIN."})

    provider_code = validated_data.get("provider", ReturnFiling.Provider.WHITEBOOKS)
    auth_session = _get_latest_provider_auth_session(
        workspace_id=validated_data["workspace_instance"].id,
        client_id=validated_data["client_instance"].id,
        gstin_id=gstin.id,
        provider=provider_code,
    )

    import_batch = ImportBatch.objects.create(
        workspace=validated_data["workspace_instance"],
        client=validated_data["client_instance"],
        gstin=gstin,
        compliance_period=compliance_period,
        import_type=ImportBatch.ImportType.GSTR_2B,
        source_type=ImportBatch.SourceType.PROVIDER,
        file_name=_build_provider_import_filename(gstin.gstin, compliance_period.period),
        source_metadata={
            "provider": provider_code,
            "fetch_status": "requested",
            "auth_session_id": str(auth_session.id),
            "txn": auth_session.txn,
        },
        status=ImportBatch.BatchStatus.UPLOADED,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="import.provider_fetch_requested",
        entity=import_batch,
        workspace_id=import_batch.workspace_id,
        client_id=import_batch.client_id,
        gstin_id=import_batch.gstin_id,
        compliance_period_id=import_batch.compliance_period_id,
        metadata={"provider": provider_code, "import_type": import_batch.import_type},
    )

    client = WhiteBooksClient()
    try:
        period_code = _to_whitebooks_period(compliance_period.period)
        generate_response = client.generate_gstr2b(
            email=auth_session.email,
            gstin=gstin.gstin,
            ret_period=period_code,
            txn=auth_session.txn,
            state_code=gstin.state_code,
            gst_username=gstin.whitebooks_gst_username,
        )
        int_tran_id = _extract_first_non_empty(generate_response, "int_tran_id", "intr_tran_id", "intTranId", "reference_id", "ref_id")
        if not int_tran_id:
            raise WhiteBooksSubmissionError("WhiteBooks 2B generation did not return an internal transaction reference.")
        status_response = client.get_gstr2b_generate_status(
            email=auth_session.email,
            gstin=gstin.gstin,
            int_tran_id=str(int_tran_id),
            txn=auth_session.txn,
            state_code=gstin.state_code,
            gst_username=gstin.whitebooks_gst_username,
        )
        filenum = _extract_first_non_empty(status_response, "filenum", "file_num", "fileNo", "fileno")
        if not filenum:
            raise WhiteBooksSubmissionError(
                "WhiteBooks 2B generation is not ready yet. Retry the fetch once the provider finishes preparing the 2B file."
            )
        all_response = client.fetch_gstr2b_all(
            email=auth_session.email,
            gstin=gstin.gstin,
            rtnprd=period_code,
            filenum=str(filenum),
            txn=auth_session.txn,
            state_code=gstin.state_code,
            gst_username=gstin.whitebooks_gst_username,
        )
        normalized_rows = _normalize_whitebooks_gstr2b_rows(all_response)
        import_batch.source_metadata = {
            "provider": provider_code,
            "fetch_status": "fetched",
            "auth_session_id": str(auth_session.id),
            "txn": auth_session.txn,
            "int_tran_id": str(int_tran_id),
            "filenum": str(filenum),
            "generate_response": client.sanitize_response_payload(generate_response),
            "status_response": client.sanitize_response_payload(status_response),
            "all_response": client.sanitize_response_payload(all_response),
            "normalized_rows": sanitize_json(normalized_rows, max_items=50),
        }
        import_batch.updated_by = user
        import_batch.save(update_fields=["source_metadata", "updated_by", "updated_at"])
        record_audit_log(
            actor=user,
            action="import.provider_fetch_completed",
            entity=import_batch,
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            gstin_id=import_batch.gstin_id,
            compliance_period_id=import_batch.compliance_period_id,
            metadata={"provider": provider_code, "normalized_row_count": len(normalized_rows)},
        )
        enqueue_import_processing(import_batch=import_batch, actor=user)
        import_batch.refresh_from_db()
        return import_batch
    except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        import_batch.status = ImportBatch.BatchStatus.FAILED
        import_batch.error_summary = {"errors": 1, "warnings": 0, "by_field": {"provider": 1}, "message": str(exc)}
        existing_metadata = import_batch.source_metadata if isinstance(import_batch.source_metadata, dict) else {}
        existing_metadata["fetch_status"] = "failed"
        import_batch.source_metadata = existing_metadata
        import_batch.processed_at = timezone.now()
        import_batch.updated_by = user
        import_batch.save(update_fields=["status", "error_summary", "source_metadata", "processed_at", "updated_by", "updated_at"])
        record_audit_log(
            actor=user,
            action="import.provider_fetch_failed",
            entity=import_batch,
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            gstin_id=import_batch.gstin_id,
            compliance_period_id=import_batch.compliance_period_id,
            metadata={"provider": provider_code, "error": str(exc)},
        )
        raise serializers.ValidationError({"gstin": str(exc)}) from exc


def create_import_template(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    _set_default_template_if_needed(instance=instance, user=user)
    record_audit_log(
        actor=user,
        action="import_template.created",
        entity=instance,
        workspace_id=instance.workspace_id,
        metadata={"import_type": instance.import_type, "source_type": instance.source_type},
    )
    return instance


def update_import_template(*, serializer, user):
    instance = serializer.save(updated_by=user)
    _set_default_template_if_needed(instance=instance, user=user)
    record_audit_log(
        actor=user,
        action="import_template.updated",
        entity=instance,
        workspace_id=instance.workspace_id,
        metadata={"import_type": instance.import_type, "source_type": instance.source_type},
    )
    return instance


def deactivate_import_template(*, instance, user):
    instance.is_active = False
    instance.is_default = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "is_default", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="import_template.deleted",
        entity=instance,
        workspace_id=instance.workspace_id,
        metadata={"import_type": instance.import_type, "source_type": instance.source_type},
    )


def _set_default_template_if_needed(*, instance, user):
    if not instance.is_default:
        return
    (
        ImportTemplate.objects.filter(
            workspace=instance.workspace,
            import_type=instance.import_type,
            source_type=instance.source_type,
        )
        .exclude(pk=instance.pk)
        .update(is_default=False, updated_by=user)
    )


def enqueue_import_processing(*, import_batch, actor):
    import_batch.status = ImportBatch.BatchStatus.QUEUED
    import_batch.save(update_fields=["status", "updated_at"])

    if settings.CELERY_TASK_ALWAYS_EAGER:
        process_import_batch(import_batch_id=import_batch.id, actor_id=actor.id if actor else None)
        return

    from apps.imports.tasks import process_import_batch_task

    try:
        async_result = process_import_batch_task.apply_async(
            args=[str(import_batch.id), actor.id if actor else None],
            queue=settings.CELERY_IMPORTS_QUEUE,
        )
        import_batch.celery_task_id = async_result.id
        import_batch.save(update_fields=["celery_task_id", "updated_at"])
    except Exception:
        if settings.CELERY_STRICT_PRODUCTION_ASYNC and not settings.DEBUG:
            raise RuntimeError("Import processing worker is unavailable. Heavy jobs cannot fall back to inline execution in production.")
        process_import_batch(import_batch_id=import_batch.id, actor_id=actor.id if actor else None)


def correct_import_batch_row(*, import_batch, row_number, raw_row, user):
    ensure_period_modifiable(import_batch.compliance_period, actor=user, attempted_action="import.correct_row")
    policy = evaluate_import_correction_policy(batch=import_batch, user=user)
    if not policy.can_edit_rows:
        raise serializers.ValidationError(
            {"row_number": policy.warning_message or "The active correction policy does not allow row editing for this batch."}
        )
    if import_batch.source_type == ImportBatch.SourceType.PROVIDER:
        raise serializers.ValidationError(
            {"row_number": "Row correction is not yet available for provider-fetched imports. Upload a replacement file instead."}
        )
    parser_class = PARSER_REGISTRY[import_batch.import_type]
    parser = parser_class(import_batch)
    source_rows = {row_number_value: row for row_number_value, row in parser.read_file()}
    if row_number not in source_rows:
        raise serializers.ValidationError({"row_number": "This row could not be found in the source file."})

    merged_raw_row = {
        str(key): "" if value is None else str(value)
        for key, value in (source_rows[row_number] or {}).items()
    }
    merged_raw_row.update(
        {
            str(key): "" if value is None else str(value)
            for key, value in (raw_row or {}).items()
        }
    )
    sanitized_raw_row = merged_raw_row
    metadata = dict(import_batch.source_metadata or {}) if isinstance(import_batch.source_metadata, dict) else {}
    manual_overrides = metadata.get("manual_row_overrides")
    if not isinstance(manual_overrides, dict):
        manual_overrides = {}
    manual_overrides[str(row_number)] = sanitized_raw_row
    metadata["manual_row_overrides"] = manual_overrides
    import_batch.source_metadata = metadata
    import_batch.corrected_at = timezone.now()
    import_batch.corrected_by = user
    import_batch.invalidation_reason = policy.invalidation_reason or "source_import_modified"
    import_batch.updated_by = user
    import_batch.save(
        update_fields=[
            "source_metadata",
            "corrected_at",
            "corrected_by",
            "invalidation_reason",
            "updated_by",
            "updated_at",
        ]
    )

    result = process_import_batch(import_batch_id=import_batch.id, actor_id=user.id if user else None)
    import_batch.refresh_from_db()
    invalidation_counts = invalidate_downstream_after_import_correction(
        import_batch=import_batch,
        actor=user,
        reason=import_batch.invalidation_reason or "source_import_modified",
    )
    record_audit_log(
        actor=user,
        action="import.row_corrected",
        entity=import_batch,
        workspace_id=import_batch.workspace_id,
        client_id=import_batch.client_id,
        gstin_id=import_batch.gstin_id,
        compliance_period_id=import_batch.compliance_period_id,
        metadata={
            "row_number": row_number,
            "corrected_fields": sorted(sanitized_raw_row.keys()),
            "reprocessed_result": result,
            "downstream_invalidations": invalidation_counts,
        },
    )
    return import_batch


def discard_import_batch_row(*, import_batch, row_number, user):
    ensure_period_modifiable(import_batch.compliance_period, actor=user, attempted_action="import.discard_row")
    policy = evaluate_import_correction_policy(batch=import_batch, user=user)
    if not policy.can_discard_rows:
        raise serializers.ValidationError(
            {"row_number": policy.warning_message or "The active correction policy does not allow row discard for this batch."}
        )
    if import_batch.source_type == ImportBatch.SourceType.PROVIDER:
        raise serializers.ValidationError(
            {"row_number": "Row discard is not yet available for provider-fetched imports. Upload a replacement file instead."}
        )
    parser_class = PARSER_REGISTRY[import_batch.import_type]
    parser = parser_class(import_batch)
    source_rows = {row_number_value: row for row_number_value, row in parser.read_file()}
    if row_number not in source_rows:
        raise serializers.ValidationError({"row_number": "This row could not be found in the source file."})

    metadata = dict(import_batch.source_metadata or {}) if isinstance(import_batch.source_metadata, dict) else {}
    discarded_rows = metadata.get("discarded_rows")
    if not isinstance(discarded_rows, list):
        discarded_rows = []
    row_number_text = str(row_number)
    if row_number_text not in discarded_rows:
        discarded_rows.append(row_number_text)
    metadata["discarded_rows"] = discarded_rows

    manual_overrides = metadata.get("manual_row_overrides")
    if isinstance(manual_overrides, dict) and row_number_text in manual_overrides:
        manual_overrides.pop(row_number_text, None)
        metadata["manual_row_overrides"] = manual_overrides

    import_batch.source_metadata = metadata
    import_batch.corrected_at = timezone.now()
    import_batch.corrected_by = user
    import_batch.invalidation_reason = policy.invalidation_reason or "source_import_modified"
    import_batch.updated_by = user
    import_batch.save(
        update_fields=[
            "source_metadata",
            "corrected_at",
            "corrected_by",
            "invalidation_reason",
            "updated_by",
            "updated_at",
        ]
    )

    result = process_import_batch(import_batch_id=import_batch.id, actor_id=user.id if user else None)
    import_batch.refresh_from_db()
    invalidation_counts = invalidate_downstream_after_import_correction(
        import_batch=import_batch,
        actor=user,
        reason=import_batch.invalidation_reason or "source_import_modified",
    )
    record_audit_log(
        actor=user,
        action="import.row_discarded",
        entity=import_batch,
        workspace_id=import_batch.workspace_id,
        client_id=import_batch.client_id,
        gstin_id=import_batch.gstin_id,
        compliance_period_id=import_batch.compliance_period_id,
        metadata={
            "row_number": row_number,
            "reprocessed_result": result,
            "downstream_invalidations": invalidation_counts,
        },
    )
    return import_batch


def discard_import_batch(*, import_batch, user):
    ensure_period_modifiable(import_batch.compliance_period, actor=user, attempted_action="import.discard_batch")
    policy = evaluate_import_correction_policy(batch=import_batch, user=user)
    if not policy.can_discard_batch:
        raise serializers.ValidationError(
            {"batch": policy.warning_message or "The active correction policy does not allow batch discard."}
        )

    reason = policy.invalidation_reason or "source_import_modified"
    import_batch.transactions.all().delete()
    import_batch.row_errors.all().delete()

    metadata = dict(import_batch.source_metadata or {}) if isinstance(import_batch.source_metadata, dict) else {}
    metadata["discarded_at"] = timezone.now().isoformat()
    metadata["discarded_by"] = str(user.id) if user else ""
    import_batch.source_metadata = metadata
    import_batch.status = ImportBatch.BatchStatus.DISCARDED
    import_batch.total_rows = 0
    import_batch.valid_rows = 0
    import_batch.invalid_rows = 0
    import_batch.processed_rows = 0
    import_batch.error_summary = {
        "errors": 0,
        "warnings": 0,
        "by_field": {},
        "message": "Batch discarded by operator.",
    }
    import_batch.corrected_at = timezone.now()
    import_batch.corrected_by = user
    import_batch.invalidation_reason = reason
    import_batch.processed_at = timezone.now()
    import_batch.updated_by = user
    import_batch.save(
        update_fields=[
            "source_metadata",
            "status",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "processed_rows",
            "error_summary",
            "corrected_at",
            "corrected_by",
            "invalidation_reason",
            "processed_at",
            "updated_by",
            "updated_at",
        ]
    )

    invalidation_counts = invalidate_downstream_after_import_correction(
        import_batch=import_batch,
        actor=user,
        reason=reason,
    )
    record_audit_log(
        actor=user,
        action="import.batch_discarded",
        entity=import_batch,
        workspace_id=import_batch.workspace_id,
        client_id=import_batch.client_id,
        gstin_id=import_batch.gstin_id,
        compliance_period_id=import_batch.compliance_period_id,
        metadata={
            "downstream_invalidations": invalidation_counts,
        },
    )
    return import_batch


def reprocess_import_batch(*, import_batch, user):
    ensure_period_modifiable(import_batch.compliance_period, actor=user, attempted_action="import.reprocess_batch")
    policy = evaluate_import_correction_policy(batch=import_batch, user=user)
    if not policy.can_reprocess:
        raise serializers.ValidationError(
            {"batch": policy.warning_message or "The active correction policy does not allow batch reprocessing."}
        )
    if import_batch.status in {ImportBatch.BatchStatus.DISCARDED, ImportBatch.BatchStatus.SUPERSEDED}:
        raise serializers.ValidationError({"batch": "Discarded or superseded batches cannot be reprocessed."})

    reason = policy.invalidation_reason or "source_import_modified"
    import_batch.corrected_at = timezone.now()
    import_batch.corrected_by = user
    import_batch.invalidation_reason = reason
    import_batch.updated_by = user
    import_batch.save(
        update_fields=[
            "corrected_at",
            "corrected_by",
            "invalidation_reason",
            "updated_by",
            "updated_at",
        ]
    )

    result = process_import_batch(import_batch_id=import_batch.id, actor_id=user.id if user else None)
    import_batch.refresh_from_db()
    invalidation_counts = invalidate_downstream_after_import_correction(
        import_batch=import_batch,
        actor=user,
        reason=reason,
    )
    record_audit_log(
        actor=user,
        action="import.batch_reprocessed",
        entity=import_batch,
        workspace_id=import_batch.workspace_id,
        client_id=import_batch.client_id,
        gstin_id=import_batch.gstin_id,
        compliance_period_id=import_batch.compliance_period_id,
        metadata={
            "reprocessed_result": result,
            "downstream_invalidations": invalidation_counts,
        },
    )
    return import_batch


def replace_import_batch_file(*, import_batch, validated_data, user):
    ensure_period_modifiable(import_batch.compliance_period, actor=user, attempted_action="import.replace_file")
    policy = evaluate_import_correction_policy(batch=import_batch, user=user)
    if not policy.can_replace_file:
        raise serializers.ValidationError(
            {"file": policy.warning_message or "The active correction policy does not allow file replacement for this batch."}
        )

    config_policy = get_import_correction_policy()
    create_new_version = bool(config_policy.get("replacement_upload_creates_new_batch_version", True))
    reason = policy.invalidation_reason or "source_import_modified"

    replacement_batch = ImportBatch.objects.create(
        workspace=validated_data["workspace"],
        client=validated_data["client"],
        gstin=validated_data.get("gstin"),
        import_template=validated_data.get("resolved_import_template"),
        compliance_period=validated_data["compliance_period"],
        import_type=validated_data["import_type"],
        source_type=validated_data["source_type"],
        file=validated_data["file"],
        file_name=validated_data["file_name"],
        source_metadata={},
        status=ImportBatch.BatchStatus.UPLOADED,
        supersedes_batch=import_batch if create_new_version else import_batch.supersedes_batch,
        created_by=user,
        updated_by=user,
    )

    if create_new_version:
        import_batch.transactions.all().delete()
        import_batch.row_errors.all().delete()
        import_batch.status = ImportBatch.BatchStatus.SUPERSEDED
        import_batch.superseded_by = replacement_batch
        import_batch.invalidation_reason = reason
        import_batch.updated_by = user
        import_batch.save(update_fields=["status", "superseded_by", "invalidation_reason", "updated_by", "updated_at"])
        invalidation_target = import_batch
    else:
        invalidation_target = replacement_batch

    enqueue_import_processing(import_batch=replacement_batch, actor=user)
    replacement_batch.refresh_from_db()
    invalidation_counts = invalidate_downstream_after_import_correction(
        import_batch=invalidation_target,
        actor=user,
        reason=reason,
    )
    record_audit_log(
        actor=user,
        action="import.batch_replaced",
        entity=replacement_batch,
        workspace_id=replacement_batch.workspace_id,
        client_id=replacement_batch.client_id,
        gstin_id=replacement_batch.gstin_id,
        compliance_period_id=replacement_batch.compliance_period_id,
        metadata={
            "replaced_batch_id": str(import_batch.id),
            "creates_new_version": create_new_version,
            "downstream_invalidations": invalidation_counts,
        },
    )
    return replacement_batch


@transaction.atomic
def process_import_batch(*, import_batch_id, actor_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    import_batch = (
        ImportBatch.objects.select_for_update(of=("self",))
        .select_related("workspace", "client", "gstin", "compliance_period")
        .get(pk=import_batch_id)
    )

    try:
        parser_class = PARSER_REGISTRY[import_batch.import_type]
        record_audit_log(
            actor=actor,
            action="import.processing_started",
            entity=import_batch,
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            metadata={"status": import_batch.status},
        )
        parser = parser_class(import_batch)
        result = parser.process()
        metadata = import_batch.source_metadata if isinstance(import_batch.source_metadata, dict) else {}
        if "normalized_rows" in metadata:
            metadata = {**metadata, "normalized_rows": "[PURGED_AFTER_PROCESSING]"}
            import_batch.source_metadata = metadata
            import_batch.save(update_fields=["source_metadata", "updated_at"])
        record_audit_log(
            actor=actor,
            action="import.processed",
            entity=import_batch,
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            metadata=result,
        )
        return result
    except Exception as exc:
        metadata = import_batch.source_metadata if isinstance(import_batch.source_metadata, dict) else {}
        if "normalized_rows" in metadata:
            metadata = {**metadata, "normalized_rows": "[PURGED_AFTER_PROCESSING]"}
            import_batch.source_metadata = metadata
        import_batch.status = ImportBatch.BatchStatus.FAILED
        import_batch.processed_at = timezone.now()
        import_batch.error_summary = {"errors": 1, "warnings": 0, "by_field": {"file": 1}, "message": str(exc)}
        import_batch.save(update_fields=["status", "processed_at", "error_summary", "source_metadata", "updated_at"])
        record_audit_log(
            actor=actor,
            action="import.failed",
            entity=import_batch,
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            metadata={"error": str(exc)},
        )
        raise


def _get_latest_provider_auth_session(*, workspace_id, client_id, gstin_id, provider):
    auth_session = (
        ProviderAuthSession.objects.filter(
            is_active=True,
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            provider=provider,
            status__in=[
                ProviderAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
                ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
            ],
        )
        .order_by("-verified_at", "-created_at")
        .first()
    )
    if auth_session is None:
        raise serializers.ValidationError(
            {"gstin": "A verified provider auth session is required before GSTR-2B can be fetched automatically."}
        )
    if not auth_session.txn:
        raise serializers.ValidationError({"gstin": "The latest provider auth session does not include a txn value."})
    return auth_session


def _build_provider_import_filename(gstin_value, period):
    normalized_period = str(period or "").replace("-", "")
    slug = slugify(gstin_value) or "gstin"
    return f"{slug}-gstr2b-{normalized_period}.provider.json"


def _to_whitebooks_period(period):
    return str(period or "").replace("-", "")[-6:]


def _extract_first_non_empty(payload, *keys):
    if not isinstance(payload, dict):
        return ""
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return value
    for container_key in ("data", "header", "result", "payload"):
        nested = payload.get(container_key)
        if isinstance(nested, dict):
            value = _extract_first_non_empty(nested, *keys)
            if value not in (None, ""):
                return value
    return ""


def _normalize_whitebooks_gstr2b_rows(payload):
    root = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload
    rows = []
    for candidate in _walk_invoice_candidates(root, {}):
        normalized = _normalize_gstr2b_candidate(candidate["node"], candidate["context"])
        if normalized.get("invoice_number") and normalized.get("invoice_date"):
            rows.append(normalized)
    return rows


def _walk_invoice_candidates(node, context):
    if isinstance(node, list):
        for item in node:
            yield from _walk_invoice_candidates(item, context)
        return
    if not isinstance(node, dict):
        return

    merged_context = dict(context)
    for source_key, target_key in (
        ("ctin", "supplier_gstin"),
        ("cname", "supplier_name"),
        ("trdnm", "supplier_name"),
        ("tradeNam", "supplier_name"),
        ("lgnm", "supplier_name"),
    ):
        value = node.get(source_key)
        if value not in (None, "") and not merged_context.get(target_key):
            merged_context[target_key] = value

    if _looks_like_invoice_candidate(node):
        yield {"node": node, "context": merged_context}

    for value in node.values():
        if isinstance(value, (dict, list)):
            yield from _walk_invoice_candidates(value, merged_context)


def _looks_like_invoice_candidate(node):
    if not isinstance(node, dict):
        return False
    has_document = any(node.get(key) not in (None, "") for key in ("inum", "invoice_number", "invoice_no", "doc_no", "nt_num"))
    has_amount = any(node.get(key) not in (None, "") for key in ("val", "txval", "taxable_amt", "taxable_value", "total"))
    has_items = isinstance(node.get("itms"), list) and len(node.get("itms")) > 0
    return has_document and (has_amount or has_items)


def _normalize_gstr2b_candidate(node, context):
    item_totals = _sum_item_totals(node.get("itms")) if isinstance(node.get("itms"), list) else {}
    taxable_value = _coalesce_value(
        node,
        item_totals,
        "txval",
        "taxable_amt",
        "taxable_value",
    )
    cgst_amount = _coalesce_value(node, item_totals, "camt", "cgst", "cgst_amount")
    sgst_amount = _coalesce_value(node, item_totals, "samt", "sgst", "sgst_amount")
    igst_amount = _coalesce_value(node, item_totals, "iamt", "igst", "igst_amount")
    cess_amount = _coalesce_value(node, item_totals, "csamt", "cess", "cess_amount")
    total_amount = _coalesce_value(node, item_totals, "val", "total", "total_amount")
    if total_amount in (None, ""):
        numeric_parts = [taxable_value, cgst_amount, sgst_amount, igst_amount, cess_amount]
        if any(part not in (None, "") for part in numeric_parts):
            total_amount = str(
                sum(_to_decimal_string_part(part) for part in numeric_parts)
            )

    return {
        "invoice_number": _pick(node, "inum", "invoice_number", "invoice_no", "doc_no", "nt_num"),
        "invoice_date": _pick(node, "idt", "invoice_date", "doc_date", "nt_dt"),
        "supplier_gstin": _pick(node, "ctin", "supplier_gstin") or str(context.get("supplier_gstin", "") or ""),
        "supplier_name": _pick(node, "cname", "supplier_name", "trdnm", "tradeNam", "lgnm") or str(context.get("supplier_name", "") or ""),
        "taxable_amt": taxable_value or "",
        "cgst": cgst_amount or "0",
        "sgst": sgst_amount or "0",
        "igst": igst_amount or "0",
        "cess": cess_amount or "0",
        "total": total_amount or "",
        "pos": _pick(node, "pos", "place_of_supply"),
        "reverse_charge": _pick(node, "rchrg", "reverse_charge"),
        "document_type": _normalize_document_type(_pick(node, "inv_typ", "document_type", "ntty")),
    }


def _sum_item_totals(items):
    totals = {"txval": "0", "camt": "0", "samt": "0", "iamt": "0", "csamt": "0"}
    for item in items:
        if not isinstance(item, dict):
            continue
        detail = item.get("itm_det") if isinstance(item.get("itm_det"), dict) else item
        for key in totals:
            value = detail.get(key)
            if value not in (None, ""):
                totals[key] = str(_to_decimal_string_part(totals[key]) + _to_decimal_string_part(value))
    return totals


def _coalesce_value(primary, secondary, *keys):
    for key in keys:
        for source in (primary, secondary):
            if isinstance(source, dict):
                value = source.get(key)
                if value not in (None, ""):
                    return str(value)
    return ""


def _pick(node, *keys):
    for key in keys:
        value = node.get(key) if isinstance(node, dict) else None
        if value not in (None, ""):
            return str(value)
    return ""


def _normalize_document_type(value):
    normalized = str(value or "").strip().lower()
    if normalized in {"c", "cr", "credit", "credit_note"}:
        return "credit_note"
    if normalized in {"d", "dr", "debit", "debit_note"}:
        return "debit_note"
    return "invoice"


def _to_decimal_string_part(value):
    from decimal import Decimal, InvalidOperation

    try:
        return Decimal(str(value or "0").replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return Decimal("0")


def invalidate_downstream_after_import_correction(*, import_batch, actor, reason):
    policy = evaluate_import_correction_policy(batch=import_batch, user=actor)
    now = timezone.now()
    counts = {
        "reconciliation_runs": 0,
        "reconciliation_items": 0,
        "return_preparations": 0,
    }

    if policy.requires_reconciliation_rerun:
        reconciliation_qs = ReconciliationRun.objects.filter(
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            gstin_id=import_batch.gstin_id,
            compliance_period_id=import_batch.compliance_period_id,
            is_active=True,
        ).exclude(status=ReconciliationRun.RunStatus.FAILED)
        counts["reconciliation_runs"] = reconciliation_qs.update(
            is_stale=True,
            invalidated_at=now,
            invalidated_by=actor,
            invalidation_reason=reason,
            updated_by=actor,
        )
        counts["reconciliation_items"] = ReconciliationItem.objects.filter(
            reconciliation_run__in=reconciliation_qs
        ).update(
            derived_from_stale_source=True,
            updated_by=actor,
        )

    if policy.requires_reconciliation_rerun or policy.requires_return_refresh:
        return_qs = ReturnPreparation.objects.filter(
            compliance_period_id=import_batch.compliance_period_id,
            is_active=True,
        ).exclude(status=ReturnPreparation.PreparationStatus.FILED)
        counts["return_preparations"] = return_qs.update(
            is_blocked_by_stale_reconciliation=True,
            blocking_reason=reason,
            status=ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION,
            updated_by=actor,
        )

    if any(counts.values()):
        record_audit_log(
            actor=actor,
            action="import.downstream_invalidated",
            entity=import_batch,
            workspace_id=import_batch.workspace_id,
            client_id=import_batch.client_id,
            gstin_id=import_batch.gstin_id,
            compliance_period_id=import_batch.compliance_period_id,
            metadata={
                "reason": reason,
                **counts,
            },
        )

    return counts
