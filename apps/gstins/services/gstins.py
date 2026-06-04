from apps.audit_logs.services.audit import record_audit_log
from apps.integrations.whitebooks.client import WhiteBooksClient


def create_gstin(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="gstin.created",
        entity=instance,
        workspace_id=instance.client.workspace_id,
        client_id=instance.client_id,
        metadata={"gstin": instance.gstin},
    )
    return instance


def update_gstin(*, serializer, user):
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="gstin.updated",
        entity=instance,
        workspace_id=instance.client.workspace_id,
        client_id=instance.client_id,
        metadata={"gstin": instance.gstin},
    )
    return instance


def deactivate_gstin(*, instance, user):
    instance.is_active = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="gstin.deleted",
        entity=instance,
        workspace_id=instance.client.workspace_id,
        client_id=instance.client_id,
    )


def search_taxpayer_details(*, workspace, gstin: str, user, email: str = ""):
    client = WhiteBooksClient()
    result = client.search_taxpayer(gstin=gstin, email=email or None)
    record_audit_log(
        actor=user,
        action="gstin.taxpayer_searched",
        entity=workspace,
        workspace_id=workspace.id,
        metadata={
            "gstin": result.get("gstin", gstin),
            "legal_name": result.get("legal_name", ""),
            "status": result.get("status", ""),
        },
    )
    return result
