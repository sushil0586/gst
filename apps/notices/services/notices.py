from apps.audit_logs.services.audit import record_audit_log


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
