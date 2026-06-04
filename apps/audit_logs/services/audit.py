from apps.audit_logs.models import AuditLog
from apps.common.security import sanitize_json


def record_audit_log(
    *,
    actor,
    action,
    entity,
    workspace_id=None,
    client_id=None,
    gstin_id=None,
    compliance_period_id=None,
    metadata=None,
    before_state=None,
    after_state=None,
):
    return AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        entity_type=entity.__class__.__name__,
        entity_id=entity.id,
        workspace_id_ref=workspace_id,
        client_id_ref=client_id,
        gstin_id_ref=gstin_id,
        compliance_period_id_ref=compliance_period_id,
        metadata=sanitize_json(metadata or {}),
        before_state=sanitize_json(before_state or {}),
        after_state=sanitize_json(after_state or {}),
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        updated_by=actor if getattr(actor, "is_authenticated", False) else None,
    )
