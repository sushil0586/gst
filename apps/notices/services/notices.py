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
