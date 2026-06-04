from apps.audit_logs.services.audit import record_audit_log


def create_organization(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(actor=user, action="organization.created", entity=instance, metadata={"name": instance.name})
    return instance


def update_organization(*, serializer, user):
    instance = serializer.save(updated_by=user)
    record_audit_log(actor=user, action="organization.updated", entity=instance, metadata={"name": instance.name})
    return instance


def deactivate_organization(*, instance, user):
    instance.is_active = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "updated_by", "updated_at"])
    record_audit_log(actor=user, action="organization.deleted", entity=instance, metadata={"name": instance.name})
