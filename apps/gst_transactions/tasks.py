from celery import shared_task
from django.contrib.auth import get_user_model

from apps.gst_transactions.services.digests import dispatch_remediation_digest, generate_scheduled_remediation_digests
from apps.gst_transactions.services.follow_ups import dispatch_follow_up_reminder, process_due_follow_up_reminders

User = get_user_model()


@shared_task(name="apps.gst_transactions.dispatch_transaction_remediation_digest")
def dispatch_transaction_remediation_digest_task(digest_id, actor_id=None):
    return dispatch_remediation_digest(digest_id=digest_id, actor_id=actor_id)


@shared_task(name="apps.gst_transactions.generate_scheduled_close_manager_digests")
def generate_scheduled_close_manager_digests_task(actor_id=None, workspace_id=None, delivery_channel=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    return [
        str(digest.id)
        for digest in generate_scheduled_remediation_digests(
            actor=actor,
            workspace_id=workspace_id,
            delivery_channel=delivery_channel,
        )
    ]


@shared_task(name="apps.gst_transactions.dispatch_transaction_remediation_follow_up_reminder")
def dispatch_transaction_remediation_follow_up_reminder_task(follow_up_id, actor_id=None):
    return str(dispatch_follow_up_reminder(follow_up_id=follow_up_id, actor_id=actor_id).id)


@shared_task(name="apps.gst_transactions.process_due_transaction_remediation_follow_ups")
def process_due_transaction_remediation_follow_ups_task(actor_id=None, workspace_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    return [
        str(follow_up.id)
        for follow_up in process_due_follow_up_reminders(
            actor=actor,
            workspace_id=workspace_id,
        )
    ]
