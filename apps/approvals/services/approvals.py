from django.utils import timezone
from rest_framework import serializers

from apps.approvals.models import ApprovalRequest
from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.models import CompliancePeriod
from apps.imports.models import ImportBatch
from apps.reconciliation.models import ReconciliationRun
from apps.returns.models import ReturnPreparation
from apps.returns.services.returns import approve_return as approve_return_preparation

ENTITY_MODEL_MAP = {
    ApprovalRequest.EntityType.IMPORT_BATCH: ImportBatch,
    ApprovalRequest.EntityType.RECONCILIATION_RUN: ReconciliationRun,
    ApprovalRequest.EntityType.RETURN_PREPARATION: ReturnPreparation,
    ApprovalRequest.EntityType.COMPLIANCE_PERIOD: CompliancePeriod,
}


def create_approval_request(*, serializer, user):
    entity_type = serializer.validated_data["entity_type"]
    entity_id = serializer.validated_data["entity_id"]
    entity = _get_entity(entity_type=entity_type, entity_id=entity_id)
    _validate_entity_matches_context(serializer.validated_data, entity=entity)

    if entity_type == ApprovalRequest.EntityType.RETURN_PREPARATION:
        if entity.status != ReturnPreparation.PreparationStatus.READY_FOR_REVIEW:
            raise serializers.ValidationError("Only returns ready for review can be sent for approval.")

    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="approval_request.created",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.compliance_period_id,
        metadata={"status": instance.status, "entity_type": instance.entity_type},
        after_state={"requested_to": instance.requested_to_id, "status": instance.status},
    )
    return instance


def approve_approval_request(*, instance, user, comments=""):
    if instance.status != ApprovalRequest.ApprovalStatus.PENDING:
        raise serializers.ValidationError("Only pending approval requests can be approved.")
    before_state = {"status": instance.status, "resolution_comments": instance.resolution_comments}
    instance.status = ApprovalRequest.ApprovalStatus.APPROVED
    instance.resolution_comments = comments
    instance.resolved_by = user
    instance.resolved_at = timezone.now()
    instance.updated_by = user
    instance.save(
        update_fields=["status", "resolution_comments", "resolved_by", "resolved_at", "updated_by", "updated_at"]
    )
    if instance.entity_type == ApprovalRequest.EntityType.RETURN_PREPARATION:
        return_preparation = ReturnPreparation.objects.get(pk=instance.entity_id)
        approve_return_preparation(instance=return_preparation, user=user)
    record_audit_log(
        actor=user,
        action="approval_request.approved",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.compliance_period_id,
        before_state=before_state,
        after_state={"status": instance.status, "resolution_comments": instance.resolution_comments},
    )
    return instance


def reject_approval_request(*, instance, user, comments=""):
    if instance.status != ApprovalRequest.ApprovalStatus.PENDING:
        raise serializers.ValidationError("Only pending approval requests can be rejected.")
    before_state = {"status": instance.status, "resolution_comments": instance.resolution_comments}
    instance.status = ApprovalRequest.ApprovalStatus.REJECTED
    instance.resolution_comments = comments
    instance.resolved_by = user
    instance.resolved_at = timezone.now()
    instance.updated_by = user
    instance.save(
        update_fields=["status", "resolution_comments", "resolved_by", "resolved_at", "updated_by", "updated_at"]
    )
    record_audit_log(
        actor=user,
        action="approval_request.rejected",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.compliance_period_id,
        before_state=before_state,
        after_state={"status": instance.status, "resolution_comments": instance.resolution_comments},
    )
    return instance


def cancel_approval_request(*, instance, user, comments=""):
    if instance.status != ApprovalRequest.ApprovalStatus.PENDING:
        raise serializers.ValidationError("Only pending approval requests can be cancelled.")
    before_state = {"status": instance.status, "resolution_comments": instance.resolution_comments}
    instance.status = ApprovalRequest.ApprovalStatus.CANCELLED
    instance.resolution_comments = comments
    instance.resolved_by = user
    instance.resolved_at = timezone.now()
    instance.updated_by = user
    instance.save(
        update_fields=["status", "resolution_comments", "resolved_by", "resolved_at", "updated_by", "updated_at"]
    )
    record_audit_log(
        actor=user,
        action="approval_request.cancelled",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.compliance_period_id,
        before_state=before_state,
        after_state={"status": instance.status, "resolution_comments": instance.resolution_comments},
    )
    return instance


def _get_entity(*, entity_type, entity_id):
    model = ENTITY_MODEL_MAP[entity_type]
    return model.objects.get(pk=entity_id)


def _validate_entity_matches_context(data, *, entity):
    entity_workspace_id = getattr(entity, "workspace_id", None)
    entity_client_id = getattr(entity, "client_id", None)
    entity_gstin_id = getattr(entity, "gstin_id", None)
    entity_period_id = getattr(entity, "compliance_period_id", None)

    if isinstance(entity, ReturnPreparation):
        entity_workspace_id = entity.compliance_period.gstin.client.workspace_id
        entity_client_id = entity.compliance_period.gstin.client_id
        entity_gstin_id = entity.compliance_period.gstin_id
        entity_period_id = entity.compliance_period_id
    elif isinstance(entity, CompliancePeriod):
        entity_workspace_id = entity.gstin.client.workspace_id
        entity_client_id = entity.gstin.client_id
        entity_gstin_id = entity.gstin_id
        entity_period_id = entity.id

    if str(data["workspace"].id) != str(entity_workspace_id):
        raise serializers.ValidationError({"workspace": "Entity does not belong to the selected workspace."})
    if str(data["client"].id) != str(entity_client_id):
        raise serializers.ValidationError({"client": "Entity does not belong to the selected client."})
    if data.get("gstin") and entity_gstin_id and str(data["gstin"].id) != str(entity_gstin_id):
        raise serializers.ValidationError({"gstin": "Entity does not belong to the selected GSTIN."})
    if data.get("compliance_period") and entity_period_id and str(data["compliance_period"].id) != str(entity_period_id):
        raise serializers.ValidationError({"compliance_period": "Entity does not belong to the selected compliance period."})
