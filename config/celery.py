import os

from celery import Celery
from celery.schedules import crontab
from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.task_acks_late = settings.CELERY_TASK_ACKS_LATE
app.conf.worker_prefetch_multiplier = settings.CELERY_WORKER_PREFETCH_MULTIPLIER
app.conf.worker_max_tasks_per_child = settings.CELERY_WORKER_MAX_TASKS_PER_CHILD
app.conf.worker_send_task_events = settings.CELERY_WORKER_SEND_TASK_EVENTS
app.conf.task_track_started = True
app.conf.task_time_limit = settings.CELERY_TASK_TIME_LIMIT
app.conf.task_soft_time_limit = settings.CELERY_TASK_SOFT_TIME_LIMIT
app.conf.task_routes = {
    "apps.imports.process_import_batch_task": {"queue": settings.CELERY_IMPORTS_QUEUE},
    "apps.reconciliation.trigger_reconciliation_run": {"queue": settings.CELERY_RECONCILIATION_QUEUE},
    "apps.filings.process_return_filing": {"queue": settings.CELERY_FILINGS_QUEUE},
    "apps.filings.sync_return_filing_status": {"queue": settings.CELERY_FILINGS_QUEUE},
    "apps.common.enforce_security_retention": {"queue": settings.CELERY_SCHEDULED_QUEUE},
    "apps.gst_transactions.generate_scheduled_close_manager_digests": {"queue": settings.CELERY_SCHEDULED_QUEUE},
    "apps.gst_transactions.process_due_transaction_remediation_follow_ups": {"queue": settings.CELERY_SCHEDULED_QUEUE},
    "apps.gst_transactions.dispatch_transaction_remediation_digest": {"queue": settings.CELERY_SCHEDULED_QUEUE},
    "apps.gst_transactions.dispatch_transaction_remediation_follow_up_reminder": {"queue": settings.CELERY_SCHEDULED_QUEUE},
}

if getattr(settings, "CLOSE_MANAGER_DIGEST_ENABLED", False):
    app.conf.beat_schedule = {
        "generate-scheduled-close-manager-digests": {
            "task": "apps.gst_transactions.generate_scheduled_close_manager_digests",
            "schedule": crontab(
                hour=settings.CLOSE_MANAGER_DIGEST_SCHEDULE_HOUR,
                minute=settings.CLOSE_MANAGER_DIGEST_SCHEDULE_MINUTE,
            ),
        }
    }

if getattr(settings, "REMEDIATION_FOLLOW_UP_AUTOMATION_ENABLED", False):
    app.conf.beat_schedule = {
        **getattr(app.conf, "beat_schedule", {}),
        "process-due-transaction-remediation-follow-ups": {
            "task": "apps.gst_transactions.process_due_transaction_remediation_follow_ups",
            "schedule": crontab(minute=settings.REMEDIATION_FOLLOW_UP_SCHEDULE_MINUTE),
        },
    }

if getattr(settings, "SECURITY_RETENTION_ENABLED", False):
    app.conf.beat_schedule = {
        **getattr(app.conf, "beat_schedule", {}),
        "enforce-security-retention": {
            "task": "apps.common.enforce_security_retention",
            "schedule": crontab(
                hour=settings.SECURITY_RETENTION_SCHEDULE_HOUR,
                minute=settings.SECURITY_RETENTION_SCHEDULE_MINUTE,
            ),
            "kwargs": {
                "audit_days": settings.SECURITY_RETENTION_AUDIT_DAYS,
                "filing_days": settings.SECURITY_RETENTION_FILING_DAYS,
                "provider_auth_days": settings.SECURITY_RETENTION_PROVIDER_AUTH_DAYS,
                "import_days": settings.SECURITY_RETENTION_IMPORT_DAYS,
            },
        },
    }
