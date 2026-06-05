from django.utils import timezone

from apps.audit_logs.services.audit import record_audit_log
from apps.customer_operations.models import OperationalFollowUp


def create_operational_follow_up(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="operational_follow_up.created",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        metadata={
            "title": instance.title,
            "pending_with": instance.pending_with,
            "status": instance.status,
            "priority": instance.priority,
        },
    )
    return instance


def update_operational_follow_up(*, serializer, user):
    previous = serializer.instance
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="operational_follow_up.updated",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        metadata={
            "title": instance.title,
            "from_status": previous.status,
            "to_status": instance.status,
            "from_pending_with": previous.pending_with,
            "to_pending_with": instance.pending_with,
            "from_priority": previous.priority,
            "to_priority": instance.priority,
        },
    )
    return instance


def complete_operational_follow_up(*, instance: OperationalFollowUp, user, closed_reason: str = ""):
    instance.status = OperationalFollowUp.FollowUpStatus.COMPLETED
    instance.completed_at = timezone.now()
    instance.completed_by = user
    if closed_reason:
        instance.closed_reason = closed_reason
    instance.updated_by = user
    instance.save(update_fields=["status", "completed_at", "completed_by", "closed_reason", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="operational_follow_up.completed",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        metadata={"title": instance.title},
    )
    return instance


def escalate_operational_follow_up(*, instance: OperationalFollowUp, user, notes: str = ""):
    instance.status = OperationalFollowUp.FollowUpStatus.ESCALATED
    instance.escalated_at = timezone.now()
    if notes:
        instance.notes = f"{instance.notes}\n\nEscalation note:\n{notes}".strip()
    instance.updated_by = user
    instance.save(update_fields=["status", "escalated_at", "notes", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="operational_follow_up.escalated",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        metadata={"title": instance.title},
    )
    return instance


def log_operational_follow_up_contact(*, instance: OperationalFollowUp, user, notes: str = ""):
    instance.last_contacted_at = timezone.now()
    if notes:
        instance.notes = f"{instance.notes}\n\nContact log:\n{notes}".strip()
    instance.updated_by = user
    instance.save(update_fields=["last_contacted_at", "notes", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="operational_follow_up.contact_logged",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        metadata={"title": instance.title},
    )
    return instance

