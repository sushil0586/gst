from celery import shared_task

from apps.filings.services.filings import process_return_filing, sync_return_filing_status


@shared_task(name="apps.filings.process_return_filing")
def process_return_filing_task(filing_id, actor_id=None):
    return process_return_filing(filing_id=filing_id, actor_id=actor_id)


@shared_task(name="apps.filings.sync_return_filing_status")
def sync_return_filing_status_task(filing_id, actor_id=None):
    return sync_return_filing_status(filing_id=filing_id, actor_id=actor_id)
