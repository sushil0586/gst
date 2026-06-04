from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.services.audit import record_audit_log


def create_compliance_period(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="compliance_period.created",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.id,
        metadata={"period": instance.period},
    )
    return instance


def update_compliance_period(*, serializer, user):
    ensure_period_modifiable(serializer.instance, actor=user, attempted_action="compliance_period.update")
    before_state = {
        "status": serializer.instance.status,
        "due_date": serializer.instance.due_date.isoformat() if serializer.instance.due_date else None,
        "is_locked": serializer.instance.is_locked,
    }
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="compliance_period.updated",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.id,
        metadata={"period": instance.period},
        before_state=before_state,
        after_state={
            "status": instance.status,
            "due_date": instance.due_date.isoformat() if instance.due_date else None,
            "is_locked": instance.is_locked,
        },
    )
    return instance


def deactivate_compliance_period(*, instance, user):
    ensure_period_modifiable(instance, actor=user, attempted_action="compliance_period.delete")
    instance.is_active = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="compliance_period.deleted",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.id,
    )


def can_modify_period(period):
    return not period.is_locked


def ensure_period_modifiable(period, *, actor=None, attempted_action="period.modify"):
    if can_modify_period(period):
        return True
    record_audit_log(
        actor=actor,
        action="compliance_period.modification_blocked",
        entity=period,
        workspace_id=period.gstin.client.workspace_id,
        client_id=period.gstin.client_id,
        gstin_id=period.gstin_id,
        compliance_period_id=period.id,
        metadata={"attempted_action": attempted_action, "reason": "period_locked"},
        before_state={"is_locked": True},
    )
    raise serializers.ValidationError("This compliance period is locked and cannot be modified.")


def lock_period(*, instance, user):
    if instance.is_locked:
        return instance
    before_state = {"is_locked": instance.is_locked, "locked_at": None, "locked_by": None}
    instance.is_locked = True
    instance.locked_at = timezone.now()
    instance.locked_by = user
    instance.updated_by = user
    instance.save(update_fields=["is_locked", "locked_at", "locked_by", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="compliance_period.locked",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.id,
        before_state=before_state,
        after_state={"is_locked": True, "locked_at": instance.locked_at.isoformat(), "locked_by": user.id},
    )
    return instance


def unlock_period(*, instance, user):
    membership = WorkspaceMembership.objects.filter(
        user=user,
        workspace=instance.gstin.client.workspace,
        is_active=True,
        role__in=[WorkspaceRole.OWNER, WorkspaceRole.ADMIN],
    ).first()
    if membership is None:
        raise serializers.ValidationError("Only workspace owners or admins can unlock a compliance period.")
    if not instance.is_locked:
        return instance
    before_state = {
        "is_locked": instance.is_locked,
        "locked_at": instance.locked_at.isoformat() if instance.locked_at else None,
        "locked_by": instance.locked_by_id,
    }
    instance.is_locked = False
    instance.locked_at = None
    instance.locked_by = None
    instance.updated_by = user
    instance.save(update_fields=["is_locked", "locked_at", "locked_by", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="compliance_period.unlocked",
        entity=instance,
        workspace_id=instance.gstin.client.workspace_id,
        client_id=instance.gstin.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.id,
        before_state=before_state,
        after_state={"is_locked": False, "locked_at": None, "locked_by": None},
    )
    return instance
