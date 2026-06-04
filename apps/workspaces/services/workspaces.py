from apps.accounts.services.onboarding import ensure_workspace_membership
from apps.audit_logs.services.audit import record_audit_log


def create_workspace(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    ensure_workspace_membership(user=user, workspace=instance)
    record_audit_log(
        actor=user,
        action="workspace.created",
        entity=instance,
        workspace_id=instance.id,
        metadata={"name": instance.name},
    )
    return instance


def update_workspace(*, serializer, user):
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="workspace.updated",
        entity=instance,
        workspace_id=instance.id,
        metadata={"name": instance.name},
    )
    return instance


def deactivate_workspace(*, instance, user):
    instance.is_active = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "updated_by", "updated_at"])
    record_audit_log(actor=user, action="workspace.deleted", entity=instance, workspace_id=instance.id)
