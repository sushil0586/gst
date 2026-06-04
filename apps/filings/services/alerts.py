from collections import OrderedDict

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.db import models
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import WorkspaceMembership
from apps.audit_logs.services.audit import record_audit_log
from apps.filings.models import OperationalAlertRoutingRule, ReturnFiling, ReturnFilingEvent, ReturnFilingIncidentNote
from apps.filings.services.rollout import (
    resolve_provider_rollout_policy,
    rollout_policy_allows_live_status_sync,
    rollout_policy_allows_live_submission,
)

SEVERITY_ORDER = {
    ReturnFilingIncidentNote.Severity.INFO: 1,
    ReturnFilingIncidentNote.Severity.WARNING: 2,
    ReturnFilingIncidentNote.Severity.CRITICAL: 3,
}


def build_return_filing_operational_alerts(*, filing, latest_attempt=None):
    response_summary = latest_attempt.response_summary if latest_attempt and isinstance(latest_attempt.response_summary, dict) else {}
    failure_summary = response_summary.get("failure_summary") if isinstance(response_summary.get("failure_summary"), dict) else {}
    next_action = str(response_summary.get("next_action") or "")
    provider_stage = str(
        response_summary.get("provider_stage")
        or (latest_attempt.request_summary.get("provider_stage") if latest_attempt and isinstance(latest_attempt.request_summary, dict) else "")
        or ""
    )
    policy = resolve_provider_rollout_policy(filing=filing)
    _, submission_reason = rollout_policy_allows_live_submission(filing=filing)
    _, status_sync_reason = rollout_policy_allows_live_status_sync(filing=filing)
    alerts = []

    if next_action == "review_rollout_controls":
        alerts.append(
            {
                "code": "rollout_controls_blocked",
                "severity": ReturnFilingIncidentNote.Severity.WARNING,
                "title": "Tenant rollout controls are blocking live progression",
                "message": status_sync_reason or submission_reason or "Review rollout policy before continuing.",
                "routing_hint": policy.notes if policy is not None else "",
            }
        )

    if filing.status == ReturnFiling.FilingStatus.NEEDS_RETRY:
        alerts.append(
            {
                "code": "retry_required",
                "severity": ReturnFilingIncidentNote.Severity.WARNING,
                "title": "Filing requires retry",
                "message": str(failure_summary.get("message") or (latest_attempt.failure_message if latest_attempt else "") or "A retryable provider issue was recorded."),
                "routing_hint": "",
            }
        )

    if filing.status == ReturnFiling.FilingStatus.FAILED or failure_summary:
        alerts.append(
            {
                "code": str(failure_summary.get("code") or (latest_attempt.failure_code if latest_attempt else "") or "provider_failure"),
                "severity": ReturnFilingIncidentNote.Severity.CRITICAL,
                "title": "Provider failure requires review",
                "message": str(failure_summary.get("message") or (latest_attempt.failure_message if latest_attempt else "") or "The provider returned a non-retryable failure."),
                "routing_hint": "",
            }
        )

    if filing.status == ReturnFiling.FilingStatus.SUBMITTED and provider_stage == "file_requested":
        alerts.append(
            {
                "code": "confirmation_pending",
                "severity": ReturnFilingIncidentNote.Severity.WARNING,
                "title": "Final filing is still confirmation-pending",
                "message": "Await ARN or terminal provider status before treating this filing as complete.",
                "routing_hint": "",
            }
        )

    if filing.status == ReturnFiling.FilingStatus.SUBMITTED and filing.last_status_sync_at:
        if (timezone.now() - filing.last_status_sync_at).total_seconds() >= 3600:
            alerts.append(
                {
                    "code": "stale_status_sync",
                    "severity": ReturnFilingIncidentNote.Severity.WARNING,
                    "title": "Provider status sync is stale",
                    "message": "This filing has not been status-synced recently. Review resync or support follow-up.",
                    "routing_hint": "",
                }
            )

    return alerts


def get_alert_routing_summary(*, filing, alerts):
    matches = resolve_alert_routes(filing=filing, alerts=alerts)
    recipients = OrderedDict()
    matched_rules = []
    routing_mode = "rule" if any(match.get("rule") is not None for match in matches) else ("default" if matches else "none")
    for match in matches:
        rule = match["rule"]
        if rule is not None:
            matched_rules.append(
                {
                    "id": str(rule.id),
                    "target_role": rule.target_role,
                    "minimum_severity": rule.minimum_severity,
                    "alert_code": rule.alert_code,
                    "scope": match["scope"],
                }
            )
        for recipient in match["recipients"]:
            recipients[str(recipient.id)] = {
                "user_id": recipient.id,
                "name": _display_user(recipient),
                "email": recipient.email,
                "role": match["role"],
            }
    return {
        "email_delivery_enabled": bool(settings.FILING_ALERT_EMAIL_ENABLED),
        "routing_mode": routing_mode,
        "default_roles": list(getattr(settings, "FILING_DEFAULT_ALERT_RECIPIENT_ROLES", [])),
        "matched_rules": matched_rules,
        "recipients": list(recipients.values()),
    }


def escalate_return_filing_alerts(*, filing, user, comments=""):
    latest_attempt = filing.attempts.filter(is_active=True).order_by("-attempt_number").first()
    alerts = build_return_filing_operational_alerts(filing=filing, latest_attempt=latest_attempt)
    if not alerts:
        raise serializers.ValidationError("No operational alerts are currently active for this filing.")

    routing_matches = resolve_alert_routes(filing=filing, alerts=alerts)
    recipients = OrderedDict()
    matched_rule_payload = []
    for match in routing_matches:
        rule = match["rule"]
        if rule is not None:
            matched_rule_payload.append(
                {
                    "rule_id": str(rule.id),
                    "target_role": rule.target_role,
                    "minimum_severity": rule.minimum_severity,
                    "alert_code": rule.alert_code,
                    "scope": match["scope"],
                }
            )
        for recipient in match["recipients"]:
            recipients[str(recipient.id)] = {
                "user_id": recipient.id,
                "name": _display_user(recipient),
                "email": recipient.email,
                "role": match["role"],
            }

    highest_severity = max((alert["severity"] for alert in alerts), key=lambda value: SEVERITY_ORDER.get(value, 0))
    alert_codes = [str(alert["code"]) for alert in alerts]
    message_lines = [f"- {alert['title']}: {alert['message']}" for alert in alerts]
    note_text = comments.strip() or "Operational alerts escalated for support review."

    with transaction.atomic():
        incident_note = ReturnFilingIncidentNote.objects.create(
            return_filing=filing,
            title="Operational alerts escalated",
            note=note_text,
            severity=highest_severity,
            status=ReturnFilingIncidentNote.Status.OPEN,
            alert_code=alert_codes[0] if len(alert_codes) == 1 else "multiple_alerts",
            metadata={
                "alert_codes": alert_codes,
                "alerts": alerts,
                "routed_recipients": list(recipients.values()),
                "matched_rules": matched_rule_payload,
            },
            created_by=user,
            updated_by=user,
        )
        ReturnFilingEvent.objects.create(
            return_filing=filing,
            event_type="filing.alerts_escalated",
            old_status=filing.status,
            new_status=filing.status,
            actor=user,
            metadata={"incident_note_id": str(incident_note.id), "alert_codes": alert_codes, "recipient_count": len(recipients)},
        )
        record_audit_log(
            actor=user,
            action="return_filing.alerts_escalated",
            entity=filing,
            workspace_id=filing.workspace_id,
            client_id=filing.client_id,
            gstin_id=filing.gstin_id,
            compliance_period_id=filing.compliance_period_id,
            metadata={"incident_note_id": str(incident_note.id), "alert_codes": alert_codes, "recipient_count": len(recipients)},
        )

    if settings.FILING_ALERT_EMAIL_ENABLED and recipients:
        subject = f"[GST Compliance] Filing alert escalation for {filing.return_type.upper()} {filing.gstin.gstin if filing.gstin else ''}".strip()
        body = "\n".join(
            [
                f"Workspace: {filing.workspace.name}",
                f"Client: {filing.client.legal_name}",
                f"GSTIN: {filing.gstin.gstin if filing.gstin else 'n/a'}",
                f"Period: {filing.compliance_period.period}",
                f"Provider: {filing.provider}",
                "",
                "Escalation note:",
                note_text,
                "",
                "Active alerts:",
                *message_lines,
            ]
        )
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[payload["email"] for payload in recipients.values() if payload.get("email")],
            fail_silently=True,
        )

    return incident_note


def resolve_alert_routes(*, filing, alerts):
    if not alerts:
        return []
    rules = OperationalAlertRoutingRule.objects.filter(
        workspace=filing.workspace,
        provider=filing.provider,
        is_active=True,
    ).filter(
        models.Q(client__isnull=True) | models.Q(client=filing.client),
        models.Q(gstin__isnull=True) | models.Q(gstin=filing.gstin),
        models.Q(return_type="") | models.Q(return_type=filing.return_type),
    ).order_by("-gstin_id", "-client_id", "-return_type", "-alert_code", "target_role")
    matches = []
    for rule in rules:
        matching_alerts = [
            alert
            for alert in alerts
            if (not rule.alert_code or alert["code"] == rule.alert_code)
            and SEVERITY_ORDER.get(str(alert["severity"]), 0) >= SEVERITY_ORDER.get(rule.minimum_severity, 0)
        ]
        if not matching_alerts:
            continue
        recipients = [
            membership.user
            for membership in WorkspaceMembership.objects.filter(
                workspace=filing.workspace,
                role=rule.target_role,
                is_active=True,
                user__is_active=True,
            ).select_related("user")
        ]
        matches.append(
            {
                "rule": rule,
                "role": rule.target_role,
                "scope": _scope_for_rule(rule),
                "matching_alerts": matching_alerts,
                "recipients": recipients,
            }
        )
    if matches:
        return matches

    default_roles = list(getattr(settings, "FILING_DEFAULT_ALERT_RECIPIENT_ROLES", []))
    if not default_roles:
        return []
    recipients = [
        membership.user
        for membership in WorkspaceMembership.objects.filter(
            workspace=filing.workspace,
            role__in=default_roles,
            is_active=True,
            user__is_active=True,
        )
        .select_related("user")
        .order_by("role", "user__email")
    ]
    if not recipients:
        return []
    return [
        {
            "rule": None,
            "role": ",".join(default_roles),
            "scope": ["workspace", "default_roles"],
            "matching_alerts": alerts,
            "recipients": recipients,
        }
    ]


def _scope_for_rule(rule):
    scope = ["workspace"]
    if rule.client_id:
        scope.append("client")
    if rule.gstin_id:
        scope.append("gstin")
    if rule.return_type:
        scope.append("return_type")
    if rule.alert_code:
        scope.append("alert_code")
    return scope


def _display_user(user):
    full_name = user.get_full_name().strip()
    return full_name or user.username
