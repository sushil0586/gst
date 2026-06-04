from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

from apps.audit_logs.services.audit import record_audit_log
from apps.gst_transactions.models import TransactionRemediationAssignment, TransactionRemediationFollowUp

User = get_user_model()


def dispatch_follow_up_reminder(*, follow_up_id, actor_id=None, automated=False):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    follow_up = TransactionRemediationFollowUp.objects.select_related(
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "assignment",
        "assigned_to",
    ).get(pk=follow_up_id)
    if follow_up.status in {
        TransactionRemediationFollowUp.FollowUpStatus.COMPLETED,
        TransactionRemediationFollowUp.FollowUpStatus.DISMISSED,
    }:
        return follow_up

    rendered_payload = _render_follow_up_payload(follow_up=follow_up)
    delivery_channel = settings.REMEDIATION_FOLLOW_UP_DELIVERY_CHANNEL
    if delivery_channel == "email":
        recipient_email = rendered_payload.get("recipient_email")
        if not recipient_email:
            raise ValueError("Follow-up recipient email is missing.")
        send_mail(
            subject=rendered_payload["subject"],
            message=rendered_payload["body_text"],
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
        )

    follow_up.status = TransactionRemediationFollowUp.FollowUpStatus.SENT
    follow_up.last_notified_at = timezone.now()
    follow_up.reminder_count += 1
    if actor is not None:
        follow_up.updated_by = actor
    follow_up.save(update_fields=["status", "last_notified_at", "reminder_count", "updated_by", "updated_at"])
    record_audit_log(
        actor=actor,
        action="transaction_remediation_follow_up.reminder_sent",
        entity=follow_up,
        workspace_id=follow_up.workspace_id,
        client_id=follow_up.client_id,
        gstin_id=follow_up.gstin_id,
        compliance_period_id=follow_up.compliance_period_id,
        metadata={
            "assignment_id": str(follow_up.assignment_id),
            "delivery_channel": delivery_channel,
            "automated": automated,
        },
    )
    return follow_up


def process_due_follow_up_reminders(*, actor=None, workspace_id=None, now=None):
    current_time = now or timezone.now()
    due_follow_ups = TransactionRemediationFollowUp.objects.filter(
        is_active=True,
        remind_at__lte=current_time,
        status__in=[
            TransactionRemediationFollowUp.FollowUpStatus.OPEN,
            TransactionRemediationFollowUp.FollowUpStatus.SENT,
        ],
    ).select_related("assignment")
    if workspace_id:
        due_follow_ups = due_follow_ups.filter(workspace_id=workspace_id)

    processed = []
    for follow_up in due_follow_ups:
        if follow_up.last_notified_at and follow_up.last_notified_at.date() >= current_time.date():
            _maybe_auto_escalate_follow_up(follow_up=follow_up, actor=actor, now=current_time)
            continue
        processed.append(
            dispatch_follow_up_reminder(
                follow_up_id=follow_up.id,
                actor_id=actor.id if actor else None,
                automated=True,
            )
        )
        _maybe_auto_escalate_follow_up(follow_up=follow_up, actor=actor, now=current_time)
    return processed


def _maybe_auto_escalate_follow_up(*, follow_up, actor=None, now=None):
    if not settings.REMEDIATION_AUTO_ESCALATION_ENABLED:
        return None
    current_time = now or timezone.now()
    assignment = follow_up.assignment
    if assignment.status not in {
        TransactionRemediationAssignment.AssignmentStatus.OPEN,
        TransactionRemediationAssignment.AssignmentStatus.IN_PROGRESS,
    }:
        return None
    if assignment.escalated_at is not None:
        return None
    if follow_up.auto_escalated_at is not None:
        return None
    threshold = follow_up.remind_at + timedelta(hours=settings.REMEDIATION_AUTO_ESCALATION_DELAY_HOURS)
    if current_time < threshold:
        return None

    assignment.escalated_at = current_time
    assignment.escalated_by = actor
    assignment.escalation_notes = f"Auto-escalated after follow-up remained unresolved beyond {settings.REMEDIATION_AUTO_ESCALATION_DELAY_HOURS} hour(s)."
    if actor is not None:
        assignment.updated_by = actor
    assignment.save(update_fields=["escalated_at", "escalated_by", "escalation_notes", "updated_by", "updated_at"])

    follow_up.auto_escalated_at = current_time
    if actor is not None:
        follow_up.updated_by = actor
    follow_up.save(update_fields=["auto_escalated_at", "updated_by", "updated_at"])
    record_audit_log(
        actor=actor,
        action="transaction_remediation_assignment.auto_escalated",
        entity=assignment,
        workspace_id=assignment.workspace_id,
        client_id=assignment.client_id,
        gstin_id=assignment.gstin_id,
        compliance_period_id=assignment.compliance_period_id,
        metadata={"follow_up_id": str(follow_up.id)},
    )
    return assignment


def _render_follow_up_payload(*, follow_up):
    assignee = follow_up.assigned_to
    assignee_name = assignee.get_full_name().strip() if assignee and assignee.get_full_name().strip() else (assignee.username if assignee else "Workspace member")
    recipient_email = assignee.email if assignee and assignee.email else None
    subject = f"GST remediation follow-up • {follow_up.client.legal_name} • {follow_up.compliance_period.period}"
    body_lines = [
        subject,
        "",
        f"Assignment: {follow_up.assignment.title}",
        f"Follow-up: {follow_up.title}",
        f"Type: {follow_up.follow_up_type.replace('_', ' ')}",
        f"Due at: {follow_up.remind_at.isoformat()}",
        f"Assigned to: {assignee_name}",
    ]
    if follow_up.notes:
        body_lines.extend(["", "Notes:", follow_up.notes])
    return {
        "subject": subject,
        "body_text": "\n".join(body_lines),
        "recipient_email": recipient_email,
        "assigned_to_name": assignee_name,
        "client_name": follow_up.client.legal_name,
        "period": follow_up.compliance_period.period,
    }
