from celery import shared_task

from apps.imports.services.imports import process_import_batch


@shared_task(name="apps.imports.process_import_batch_task")
def process_import_batch_task(import_batch_id, actor_id=None):
    return process_import_batch(import_batch_id=import_batch_id, actor_id=actor_id)
