from celery import shared_task

from apps.reconciliation.services.reconciliation import process_reconciliation_run


@shared_task(name="apps.reconciliation.trigger_reconciliation_run")
def trigger_reconciliation_run(run_id, actor_id=None):
    return process_reconciliation_run(run_id=run_id, actor_id=actor_id)
