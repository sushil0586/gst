from dataclasses import dataclass
from datetime import date

from django.contrib.auth import get_user_model

from apps.accounts.models import WorkspaceRole
from apps.accounts.services.onboarding import ensure_workspace_membership
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import OperationalAlertRoutingRule, ProviderRolloutPolicy, ReturnFiling, ReturnFilingIncidentNote
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@dataclass
class SeedEntityGraph:
    owner_user: object
    organization: Organization
    workspace: Workspace
    client: Client
    gstin: GSTIN
    gstr1_period: CompliancePeriod
    gstr3b_period: CompliancePeriod


PRODUCTION_ALERT_RULE_DEFAULTS = (
    {
        "alert_code": "confirmation_pending",
        "minimum_severity": ReturnFilingIncidentNote.Severity.WARNING,
        "target_role": WorkspaceRole.REVIEWER,
        "notes": "Reviewers track provider confirmation-pending filings and coordinate resync.",
    },
    {
        "alert_code": "retry_required",
        "minimum_severity": ReturnFilingIncidentNote.Severity.WARNING,
        "target_role": WorkspaceRole.REVIEWER,
        "notes": "Reviewers assess retryable provider issues before replaying the filing.",
    },
    {
        "alert_code": "stale_status_sync",
        "minimum_severity": ReturnFilingIncidentNote.Severity.WARNING,
        "target_role": WorkspaceRole.MANAGER,
        "notes": "Managers follow up on stale status-sync cases and assign ownership.",
    },
    {
        "alert_code": "rollout_controls_blocked",
        "minimum_severity": ReturnFilingIncidentNote.Severity.WARNING,
        "target_role": WorkspaceRole.ADMIN,
        "notes": "Admins own rollout-control corrections before live filing continues.",
    },
    {
        "alert_code": "provider_failure",
        "minimum_severity": ReturnFilingIncidentNote.Severity.CRITICAL,
        "target_role": WorkspaceRole.SENIOR_CA,
        "notes": "Senior CA reviews non-retryable provider failures before requeue or closure.",
    },
)


def seed_entity_graph(
    *,
    owner_email,
    owner_password,
    organization_name,
    organization_code,
    workspace_name,
    workspace_code,
    client_legal_name,
    client_trade_name,
    client_code,
    pan,
    client_email,
    gstin_value,
    state_code,
    period,
    owner_first_name="Workspace",
    owner_last_name="Owner",
    owner_username=None,
    owner_role=WorkspaceRole.OWNER,
    owner_is_staff=True,
    owner_is_superuser=False,
):
    owner_user = _get_or_create_user(
        email=owner_email,
        password=owner_password,
        username=owner_username or owner_email.split("@")[0],
        first_name=owner_first_name,
        last_name=owner_last_name,
        is_staff=owner_is_staff,
        is_superuser=owner_is_superuser,
    )

    organization, _ = Organization.objects.get_or_create(
        code=organization_code,
        defaults={
            "name": organization_name,
            "created_by": owner_user,
            "updated_by": owner_user,
        },
    )
    if organization.name != organization_name:
        organization.name = organization_name
        organization.updated_by = owner_user
        organization.save(update_fields=["name", "updated_by", "updated_at"])

    workspace, _ = Workspace.objects.get_or_create(
        organization=organization,
        code=workspace_code,
        defaults={
            "name": workspace_name,
            "timezone": "Asia/Kolkata",
            "created_by": owner_user,
            "updated_by": owner_user,
        },
    )
    if workspace.name != workspace_name:
        workspace.name = workspace_name
        workspace.updated_by = owner_user
        workspace.save(update_fields=["name", "updated_by", "updated_at"])
    ensure_workspace_membership(user=owner_user, workspace=workspace, role=owner_role)

    client, _ = Client.objects.get_or_create(
        workspace=workspace,
        client_code=client_code,
        defaults={
            "legal_name": client_legal_name,
            "trade_name": client_trade_name,
            "pan": pan,
            "email": client_email,
            "created_by": owner_user,
            "updated_by": owner_user,
        },
    )
    client_updates = []
    if client.legal_name != client_legal_name:
        client.legal_name = client_legal_name
        client_updates.append("legal_name")
    if client.trade_name != client_trade_name:
        client.trade_name = client_trade_name
        client_updates.append("trade_name")
    if client.pan != pan:
        client.pan = pan
        client_updates.append("pan")
    if client.email != client_email:
        client.email = client_email
        client_updates.append("email")
    if client_updates:
        client.updated_by = owner_user
        client.save(update_fields=client_updates + ["updated_by", "updated_at"])

    gstin, _ = GSTIN.objects.get_or_create(
        gstin=gstin_value,
        defaults={
            "client": client,
            "registration_type": "regular",
            "state_code": state_code,
            "created_by": owner_user,
            "updated_by": owner_user,
        },
    )
    gstin_updates = []
    if gstin.client_id != client.id:
        gstin.client = client
        gstin_updates.append("client")
    if gstin.state_code != state_code:
        gstin.state_code = state_code
        gstin_updates.append("state_code")
    if gstin_updates:
        gstin.updated_by = owner_user
        gstin.save(update_fields=gstin_updates + ["updated_by", "updated_at"])

    gstr1_period = _ensure_compliance_period(
        gstin=gstin,
        period=period,
        return_type="GSTR-1",
        actor=owner_user,
    )
    gstr3b_period = _ensure_compliance_period(
        gstin=gstin,
        period=period,
        return_type="GSTR-3B",
        actor=owner_user,
    )

    return SeedEntityGraph(
        owner_user=owner_user,
        organization=organization,
        workspace=workspace,
        client=client,
        gstin=gstin,
        gstr1_period=gstr1_period,
        gstr3b_period=gstr3b_period,
    )


def seed_production_defaults(
    *,
    owner_email,
    owner_password,
    organization_name,
    organization_code,
    workspace_name,
    workspace_code,
    client_legal_name,
    client_trade_name,
    client_code,
    pan,
    client_email,
    gstin_value,
    state_code,
    period,
    enable_live_submission=False,
    enable_live_status_sync=False,
):
    entity_graph = seed_entity_graph(
        owner_email=owner_email,
        owner_password=owner_password,
        organization_name=organization_name,
        organization_code=organization_code,
        workspace_name=workspace_name,
        workspace_code=workspace_code,
        client_legal_name=client_legal_name,
        client_trade_name=client_trade_name,
        client_code=client_code,
        pan=pan,
        client_email=client_email,
        gstin_value=gstin_value,
        state_code=state_code,
        period=period,
        owner_first_name="Production",
        owner_last_name="Owner",
        owner_is_staff=True,
        owner_is_superuser=False,
    )

    for return_type in ("gstr1", "gstr3b"):
        ProviderRolloutPolicy.objects.update_or_create(
            workspace=entity_graph.workspace,
            client=entity_graph.client,
            gstin=entity_graph.gstin,
            provider=ReturnFiling.Provider.WHITEBOOKS,
            return_type=return_type,
            defaults={
                "enable_live_submission": enable_live_submission,
                "enable_live_status_sync": enable_live_status_sync,
                "notes": "Seeded production rollout defaults.",
                "created_by": entity_graph.owner_user,
                "updated_by": entity_graph.owner_user,
            },
        )

    for return_type in ("gstr1", "gstr3b"):
        for rule_defaults in PRODUCTION_ALERT_RULE_DEFAULTS:
            OperationalAlertRoutingRule.objects.update_or_create(
                workspace=entity_graph.workspace,
                client=entity_graph.client,
                gstin=entity_graph.gstin,
                provider=ReturnFiling.Provider.WHITEBOOKS,
                return_type=return_type,
                alert_code=rule_defaults["alert_code"],
                target_role=rule_defaults["target_role"],
                defaults={
                    "minimum_severity": rule_defaults["minimum_severity"],
                    "notes": rule_defaults["notes"],
                    "created_by": entity_graph.owner_user,
                    "updated_by": entity_graph.owner_user,
                },
            )

    AuditLog.objects.get_or_create(
        actor=entity_graph.owner_user,
        action="production.defaults_seeded",
        entity_type="Workspace",
        entity_id=entity_graph.workspace.id,
        defaults={
            "workspace_id_ref": entity_graph.workspace.id,
            "client_id_ref": entity_graph.client.id,
            "gstin_id_ref": entity_graph.gstin.id,
            "metadata": {
                "source": "seed_production_defaults",
                "period": period,
                "enable_live_submission": enable_live_submission,
                "enable_live_status_sync": enable_live_status_sync,
            },
            "created_by": entity_graph.owner_user,
            "updated_by": entity_graph.owner_user,
        },
    )

    return entity_graph


def _get_or_create_user(*, email, password, username, first_name, last_name, is_staff, is_superuser):
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "is_staff": is_staff,
            "is_superuser": is_superuser,
        },
    )
    update_fields = []
    if user.username != username:
        user.username = username
        update_fields.append("username")
    if user.first_name != first_name:
        user.first_name = first_name
        update_fields.append("first_name")
    if user.last_name != last_name:
        user.last_name = last_name
        update_fields.append("last_name")
    if user.is_staff != is_staff:
        user.is_staff = is_staff
        update_fields.append("is_staff")
    if user.is_superuser != is_superuser:
        user.is_superuser = is_superuser
        update_fields.append("is_superuser")
    if created or not user.check_password(password):
        user.set_password(password)
        update_fields.append("password")
    if update_fields:
        user.save(update_fields=update_fields)
    return user


def _ensure_compliance_period(*, gstin, period, return_type, actor):
    due_day = 11 if return_type == "GSTR-1" else 20
    due_date = _due_date_for_period(period, due_day)
    compliance_period, _ = CompliancePeriod.objects.get_or_create(
        gstin=gstin,
        period=period,
        return_type=return_type,
        defaults={
            "status": CompliancePeriod.PeriodStatus.OPEN,
            "due_date": due_date,
            "created_by": actor,
            "updated_by": actor,
        },
    )
    update_fields = []
    if compliance_period.due_date != due_date:
        compliance_period.due_date = due_date
        update_fields.append("due_date")
    if compliance_period.status != CompliancePeriod.PeriodStatus.OPEN:
        compliance_period.status = CompliancePeriod.PeriodStatus.OPEN
        update_fields.append("status")
    if update_fields:
        compliance_period.updated_by = actor
        compliance_period.save(update_fields=update_fields + ["updated_by", "updated_at"])
    return compliance_period


def _due_date_for_period(period, due_day):
    year, month = [int(part) for part in period.split("-")]
    if month == 12:
        return date(year + 1, 1, due_day)
    return date(year, month + 1, due_day)
