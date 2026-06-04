from celery import shared_task

from apps.common.services.retention import enforce_security_retention


@shared_task(name="apps.common.enforce_security_retention")
def enforce_security_retention_task(*, audit_days: int, filing_days: int, provider_auth_days: int, import_days: int):
    return enforce_security_retention(
        audit_days=audit_days,
        filing_days=filing_days,
        provider_auth_days=provider_auth_days,
        import_days=import_days,
    )
