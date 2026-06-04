from apps.audit_logs.models import AuditLog


def get_audit_log_queryset():
    return AuditLog.objects.filter(is_active=True).select_related("actor")
