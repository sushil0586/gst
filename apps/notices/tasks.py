from celery import shared_task
from django.contrib.auth import get_user_model

from apps.notices.services.notices import process_scheduled_notice_syncs

User = get_user_model()


@shared_task(name="apps.notices.process_scheduled_notice_syncs")
def process_scheduled_notice_syncs_task(actor_id=None, workspace_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    return process_scheduled_notice_syncs(actor=actor, workspace_id=workspace_id)
