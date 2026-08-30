from celery import shared_task

from apps.imports.services.imports import poll_provider_gstr2b_import_batch, process_import_batch


@shared_task(name="apps.imports.process_import_batch_task")
def process_import_batch_task(import_batch_id, actor_id=None):
    return process_import_batch(import_batch_id=import_batch_id, actor_id=actor_id)


@shared_task(name="apps.imports.poll_provider_gstr2b_import_batch_task")
def poll_provider_gstr2b_import_batch_task(import_batch_id, actor_id=None):
    return poll_provider_gstr2b_import_batch(import_batch_id=import_batch_id, actor_id=actor_id)
