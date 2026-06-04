from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

from apps.accounts.models import WorkspaceMembership
from apps.audit_logs.services.audit import record_audit_log
from apps.common.services.dashboard import build_close_manager_digest_payload
from apps.gst_transactions.models import TransactionRemediationDigest

User = get_user_model()


def create_remediation_digest(*, serializer, user):
    return create_digest_for_workspace(
        workspace=serializer.validated_data["workspace"],
        generated_for=serializer.validated_data.get("generated_for"),
        title=serializer.validated_data["title"],
        delivery_channel=serializer.validated_data["delivery_channel"],
        actor=user,
    )


def create_digest_for_workspace(*, workspace, title, delivery_channel, actor=None, generated_for=None):
    payload = build_close_manager_digest_payload(workspace_id=workspace.id)
    instance = TransactionRemediationDigest.objects.create(
        workspace=workspace,
        generated_for=generated_for,
        generated_by=actor,
        created_by=actor,
        updated_by=actor,
        title=title,
        delivery_channel=delivery_channel,
        summary=payload,
    )
    record_audit_log(
        actor=actor,
        action="transaction_remediation_digest.generated",
        entity=instance,
        workspace_id=instance.workspace_id,
        metadata={"delivery_channel": instance.delivery_channel, "generated_for": instance.generated_for_id},
    )
    enqueue_digest_dispatch(digest=instance, actor=actor)
    instance.refresh_from_db()
    return instance


def generate_scheduled_remediation_digests(*, actor=None, workspace_id=None, for_date=None, delivery_channel=None):
    target_date = for_date or timezone.localdate()
    channel = delivery_channel or settings.CLOSE_MANAGER_DIGEST_DELIVERY_CHANNEL
    roles = set(settings.CLOSE_MANAGER_DIGEST_RECIPIENT_ROLES)
    memberships = WorkspaceMembership.objects.select_related("workspace", "user").filter(role__in=roles)
    if workspace_id:
        memberships = memberships.filter(workspace_id=workspace_id)

    created_digests = []
    for membership in memberships:
        recipient = membership.user
        if channel == TransactionRemediationDigest.DeliveryChannel.EMAIL and not recipient.email:
            continue
        title = f"Scheduled close digest • {target_date.isoformat()}"
        if TransactionRemediationDigest.objects.filter(
            workspace=membership.workspace,
            generated_for=recipient,
            delivery_channel=channel,
            title=title,
            created_at__date=target_date,
        ).exists():
            continue
        created_digests.append(
            create_digest_for_workspace(
                workspace=membership.workspace,
                generated_for=recipient,
                title=title,
                delivery_channel=channel,
                actor=actor,
            )
        )
    return created_digests


def enqueue_digest_dispatch(*, digest, actor):
    if settings.CELERY_TASK_ALWAYS_EAGER:
        try:
            dispatch_remediation_digest(digest_id=digest.id, actor_id=actor.id if actor else None)
        except Exception:
            return
        return

    try:
        from apps.gst_transactions.tasks import dispatch_transaction_remediation_digest_task

        dispatch_transaction_remediation_digest_task.delay(str(digest.id), actor.id if actor else None)
    except Exception:
        try:
            dispatch_remediation_digest(digest_id=digest.id, actor_id=actor.id if actor else None)
        except Exception:
            return


def dispatch_remediation_digest(*, digest_id, actor_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    digest = TransactionRemediationDigest.objects.select_related("workspace", "generated_for").get(pk=digest_id)
    try:
        rendered_payload = _render_digest_payload(digest=digest)
        if digest.delivery_channel == TransactionRemediationDigest.DeliveryChannel.EMAIL:
            recipient_email = rendered_payload.get("recipient_email")
            if not recipient_email:
                raise ValueError("Digest recipient email is missing.")
            send_mail(
                subject=rendered_payload["subject"],
                message=rendered_payload["body_text"],
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient_email],
                fail_silently=False,
            )
        digest.rendered_payload = rendered_payload
        digest.status = TransactionRemediationDigest.DigestStatus.DISPATCHED
        digest.dispatched_at = timezone.now()
        digest.dispatched_by = actor
        digest.dispatch_error = ""
        digest.save(
            update_fields=[
                "rendered_payload",
                "status",
                "dispatched_at",
                "dispatched_by",
                "dispatch_error",
                "updated_at",
            ]
        )
        record_audit_log(
            actor=actor,
            action="transaction_remediation_digest.dispatched",
            entity=digest,
            workspace_id=digest.workspace_id,
            metadata={"delivery_channel": digest.delivery_channel, "generated_for": digest.generated_for_id},
        )
        return digest
    except Exception as exc:
        digest.status = TransactionRemediationDigest.DigestStatus.FAILED
        digest.dispatch_error = str(exc)
        digest.save(update_fields=["status", "dispatch_error", "updated_at"])
        record_audit_log(
            actor=actor,
            action="transaction_remediation_digest.failed",
            entity=digest,
            workspace_id=digest.workspace_id,
            metadata={"delivery_channel": digest.delivery_channel, "error": str(exc)},
        )
        raise


def _render_digest_payload(*, digest):
    summary = digest.summary or {}
    workspace_name = summary.get("workspace", {}).get("name") or digest.workspace.name
    recipient_user = digest.generated_for or digest.generated_by
    recipient_name = None
    recipient_email = None
    if recipient_user:
        full_name = recipient_user.get_full_name().strip()
        recipient_name = full_name or recipient_user.username
        recipient_email = recipient_user.email or None
    highlights = summary.get("highlights") or []
    queues = summary.get("queues") or []
    follow_ups = summary.get("next_follow_ups") or []
    subject = f"GST close digest • {workspace_name}"
    highlight_lines = [f"- {entry}" for entry in highlights] or ["- No urgent remediation items today"]
    lines = [
        subject,
        "",
        "Highlights:",
        *highlight_lines,
        "",
        "Top queues:",
    ]
    for queue in queues[:5]:
        lines.append(
            f"- {queue['client_name']} / {queue['period']}: open {queue['open_assignments'] + queue['in_progress_assignments']}, escalated {queue['escalated_assignments']}, overdue {queue['overdue_assignments']}, follow-ups due {queue['follow_ups_due']}"
        )
    if follow_ups:
        lines.extend(["", "Upcoming follow-ups:"])
        for follow_up in follow_ups[:5]:
            lines.append(
                f"- {follow_up['title']} ({follow_up['follow_up_type'].replace('_', ' ')}) due {follow_up['remind_at']}"
            )
    body_text = "\n".join(lines)
    return {
        "subject": subject,
        "body_text": body_text,
        "delivery_channel": digest.delivery_channel,
        "generated_for_name": recipient_name,
        "recipient_email": recipient_email,
        "preview": {
            "highlights": highlights,
            "queues": queues[:5],
            "next_follow_ups": follow_ups[:5],
        },
    }
