import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.constants import ROLE_PERMISSION_MAP
from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import OperationalAlertRoutingRule, ProviderRolloutPolicy
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def accounts_api_client():
    return APIClient()


@pytest.fixture
def accounts_owner(db):
    return User.objects.create_user(
        username="owner-accounts",
        email="owner-accounts@example.com",
        password="strong-pass-123",
        first_name="Owner",
        last_name="Accounts",
    )


@pytest.fixture
def accounts_context(accounts_owner):
    organization = Organization.objects.create(
        name="Accounts Org",
        code="ACC-ORG",
        created_by=accounts_owner,
        updated_by=accounts_owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="Accounts Workspace",
        code="ACC-WS",
        created_by=accounts_owner,
        updated_by=accounts_owner,
    )
    owner_membership = WorkspaceMembership.objects.create(
        user=accounts_owner,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=accounts_owner,
        updated_by=accounts_owner,
    )
    admin_user = User.objects.create_user(
        username="admin-accounts",
        email="admin-accounts@example.com",
        password="strong-pass-123",
    )
    WorkspaceMembership.objects.create(
        user=admin_user,
        workspace=workspace,
        role=WorkspaceRole.ADMIN,
        created_by=accounts_owner,
        updated_by=accounts_owner,
    )
    manager_user = User.objects.create_user(
        username="manager-accounts",
        email="manager-accounts@example.com",
        password="strong-pass-123",
    )
    WorkspaceMembership.objects.create(
        user=manager_user,
        workspace=workspace,
        role=WorkspaceRole.MANAGER,
        created_by=accounts_owner,
        updated_by=accounts_owner,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Accounts Client Pvt Ltd",
        trade_name="Accounts Client",
        client_code="ACC001",
        pan="ABCDE1234K",
        created_by=accounts_owner,
        updated_by=accounts_owner,
    )
    return {
        "organization": organization,
        "workspace": workspace,
        "owner": accounts_owner,
        "owner_membership": owner_membership,
        "admin_user": admin_user,
        "manager_user": manager_user,
        "client": client,
    }


@pytest.fixture
def owner_client(accounts_api_client, accounts_context):
    accounts_api_client.force_authenticate(user=accounts_context["owner"])
    return accounts_api_client


@pytest.fixture
def admin_client(accounts_context):
    client = APIClient()
    client.force_authenticate(user=accounts_context["admin_user"])
    return client


@pytest.fixture
def manager_client(accounts_context):
    client = APIClient()
    client.force_authenticate(user=accounts_context["manager_user"])
    return client


@pytest.mark.django_db
def test_self_registration_creates_user_org_workspace_owner_membership(accounts_api_client):
    response = accounts_api_client.post(
        "/api/v1/auth/register/",
        {
            "email": "new-owner@example.com",
            "password": "strong-pass-123",
            "first_name": "New",
            "last_name": "Owner",
            "organization_name": "New Firm LLP",
            "workspace_name": "Primary Compliance Workspace",
            "timezone": "Asia/Kolkata",
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.data["data"]
    assert payload["access"]
    assert payload["refresh"]
    assert payload["user"]["user"]["email"] == "new-owner@example.com"
    assert payload["user"]["default_workspace"]["role"] == WorkspaceRole.OWNER

    user = User.objects.get(email="new-owner@example.com")
    organization = Organization.objects.get(created_by=user)
    workspace = Workspace.objects.get(created_by=user)
    membership = WorkspaceMembership.objects.get(user=user, workspace=workspace)

    assert organization.name == "New Firm LLP"
    assert workspace.organization == organization
    assert workspace.name == "Primary Compliance Workspace"
    assert membership.role == WorkspaceRole.OWNER
    assert membership.is_active is True


@pytest.mark.django_db
def test_current_user_returns_platform_admin_for_superuser(accounts_api_client, accounts_context):
    superuser = User.objects.create_superuser(
        username="platform-admin",
        email="platform-admin@example.com",
        password="strong-pass-123",
    )
    second_org = Organization.objects.create(
        name="Secondary Org",
        code="SEC-ORG",
        created_by=accounts_context["owner"],
        updated_by=accounts_context["owner"],
    )
    second_workspace = Workspace.objects.create(
        organization=second_org,
        name="Secondary Workspace",
        code="SEC-WS",
        created_by=accounts_context["owner"],
        updated_by=accounts_context["owner"],
    )

    accounts_api_client.force_authenticate(user=superuser)
    response = accounts_api_client.get("/api/v1/auth/me/")

    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["is_platform_admin"] is True
    assert payload["default_workspace"]["role"] == "platform_admin"
    workspace_ids = {entry["id"] for entry in payload["workspaces"]}
    assert str(accounts_context["workspace"].id) in workspace_ids
    assert str(second_workspace.id) in workspace_ids
    permissions = set(payload["permissions_summary"]["codes"])
    assert "manage_users" in permissions
    assert "file_return" in permissions


@pytest.mark.django_db
def test_workspace_owner_can_create_workspace_member(owner_client, accounts_context):
    response = owner_client.post(
        "/api/v1/workspace-members/",
        {
            "workspace": str(accounts_context["workspace"].id),
            "email": "filer@example.com",
            "first_name": "Filer",
            "last_name": "User",
            "role": WorkspaceRole.FILER,
            "password": "strong-pass-123",
        },
        format="json",
    )

    assert response.status_code == 201
    membership = WorkspaceMembership.objects.get(user__email="filer@example.com", workspace=accounts_context["workspace"])
    assert membership.role == WorkspaceRole.FILER
    assert membership.is_active is True
    assert response.data["data"]["email"] == "filer@example.com"


@pytest.mark.django_db
def test_workspace_admin_can_create_workspace_member(admin_client, accounts_context):
    response = admin_client.post(
        "/api/v1/workspace-members/",
        {
            "workspace": str(accounts_context["workspace"].id),
            "email": "seniorca@example.com",
            "first_name": "Senior",
            "last_name": "CA",
            "role": WorkspaceRole.SENIOR_CA,
            "password": "strong-pass-123",
        },
        format="json",
    )

    assert response.status_code == 201
    membership = WorkspaceMembership.objects.get(user__email="seniorca@example.com", workspace=accounts_context["workspace"])
    assert membership.role == WorkspaceRole.SENIOR_CA
    assert set(response.data["data"]["permissions"]) == ROLE_PERMISSION_MAP[WorkspaceRole.SENIOR_CA]


@pytest.mark.django_db
def test_manager_cannot_create_workspace_member(manager_client, accounts_context):
    response = manager_client.post(
        "/api/v1/workspace-members/",
        {
            "workspace": str(accounts_context["workspace"].id),
            "email": "blocked@example.com",
            "first_name": "Blocked",
            "last_name": "Manager",
            "role": WorkspaceRole.FILER,
            "password": "strong-pass-123",
        },
        format="json",
    )

    assert response.status_code == 403
    assert not User.objects.filter(email="blocked@example.com").exists()


@pytest.mark.django_db
def test_workspace_member_role_can_be_updated(owner_client, accounts_context):
    member = User.objects.create_user(
        username="member-update",
        email="member-update@example.com",
        password="strong-pass-123",
    )
    membership = WorkspaceMembership.objects.create(
        user=member,
        workspace=accounts_context["workspace"],
        role=WorkspaceRole.FILER,
        created_by=accounts_context["owner"],
        updated_by=accounts_context["owner"],
    )

    response = owner_client.patch(
        f"/api/v1/workspace-members/{membership.id}/",
        {"role": WorkspaceRole.SENIOR_CA},
        format="json",
    )

    assert response.status_code == 200
    membership.refresh_from_db()
    assert membership.role == WorkspaceRole.SENIOR_CA
    assert response.data["data"]["role"] == WorkspaceRole.SENIOR_CA


@pytest.mark.django_db
def test_workspace_member_can_be_updated_with_name_and_password(owner_client, accounts_context):
    member = User.objects.create_user(
        username="member-password-reset",
        email="member-password-reset@example.com",
        password="strong-pass-123",
        first_name="Old",
        last_name="Name",
    )
    membership = WorkspaceMembership.objects.create(
        user=member,
        workspace=accounts_context["workspace"],
        role=WorkspaceRole.FILER,
        created_by=accounts_context["owner"],
        updated_by=accounts_context["owner"],
    )

    response = owner_client.patch(
        f"/api/v1/workspace-members/{membership.id}/",
        {
            "role": WorkspaceRole.REVIEWER,
            "first_name": "New",
            "last_name": "Reviewer",
            "password": "changed-pass-123",
        },
        format="json",
    )

    assert response.status_code == 200
    member.refresh_from_db()
    membership.refresh_from_db()
    assert membership.role == WorkspaceRole.REVIEWER
    assert member.first_name == "New"
    assert member.last_name == "Reviewer"
    assert member.check_password("changed-pass-123")


@pytest.mark.django_db
def test_workspace_member_can_be_deactivated(owner_client, accounts_context):
    member = User.objects.create_user(
        username="member-deactivate",
        email="member-deactivate@example.com",
        password="strong-pass-123",
    )
    membership = WorkspaceMembership.objects.create(
        user=member,
        workspace=accounts_context["workspace"],
        role=WorkspaceRole.FILER,
        created_by=accounts_context["owner"],
        updated_by=accounts_context["owner"],
    )

    response = owner_client.delete(f"/api/v1/workspace-members/{membership.id}/")

    assert response.status_code == 200
    membership.refresh_from_db()
    assert membership.is_active is False


@pytest.mark.django_db
def test_forgot_password_sends_reset_email(accounts_api_client, accounts_owner, settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.APP_FRONTEND_URL = "http://localhost:3000"

    response = accounts_api_client.post(
        "/api/v1/auth/forgot-password/",
        {"email": accounts_owner.email},
        format="json",
    )

    assert response.status_code == 200
    assert len(mail.outbox) == 1
    assert "reset-password?uid=" in mail.outbox[0].body
    assert accounts_owner.email in mail.outbox[0].to


@pytest.mark.django_db
def test_reset_password_confirm_updates_password(accounts_api_client, accounts_owner):
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    uid = urlsafe_base64_encode(force_bytes(accounts_owner.pk))
    token = default_token_generator.make_token(accounts_owner)

    response = accounts_api_client.post(
        "/api/v1/auth/reset-password/",
        {
            "uid": uid,
            "token": token,
            "password": "brand-new-pass-123",
        },
        format="json",
    )

    assert response.status_code == 200
    accounts_owner.refresh_from_db()
    assert accounts_owner.check_password("brand-new-pass-123")


@pytest.mark.django_db
def test_authenticated_user_can_change_password(accounts_api_client, accounts_owner):
    accounts_api_client.force_authenticate(user=accounts_owner)

    response = accounts_api_client.post(
        "/api/v1/auth/change-password/",
        {
            "current_password": "strong-pass-123",
            "new_password": "changed-directly-123",
        },
        format="json",
    )

    assert response.status_code == 200
    accounts_owner.refresh_from_db()
    assert accounts_owner.check_password("changed-directly-123")


@pytest.mark.django_db
def test_senior_ca_permissions_include_prepare_approve_file():
    assert ROLE_PERMISSION_MAP[WorkspaceRole.SENIOR_CA] == {
        "view_client",
        "prepare_return",
        "approve_return",
        "file_return",
        "view_audit_log",
    }


@pytest.mark.django_db
def test_seed_demo_data_uses_shared_entity_graph():
    call_command("seed_demo_data")

    assert User.objects.filter(email="demo_admin@example.com").exists()
    workspace = Workspace.objects.get(code="DEMO-WS")
    client = Client.objects.get(workspace=workspace, client_code="DEMOCLIENT")
    gstin_periods = CompliancePeriod.objects.filter(gstin__gstin="29ABCDE1234F1Z5")
    assert client.legal_name == "Demo Client Private Limited"
    assert gstin_periods.filter(return_type="GSTR-1", period="2026-04").exists()
    assert gstin_periods.filter(return_type="GSTR-3B", period="2026-04").exists()


@pytest.mark.django_db
def test_seed_production_defaults_creates_rollout_and_alert_defaults():
    call_command(
        "seed_production_defaults",
        "--owner-email=prod.owner@example.com",
        "--owner-password=strong-pass-123",
        "--organization-name=Prod Org",
        "--organization-code=PROD-ORG",
        "--workspace-name=Prod Workspace",
        "--workspace-code=PROD-WS",
        "--client-legal-name=Prod Client Limited",
        "--client-trade-name=Prod Client",
        "--client-code=PRODCLIENT",
        "--pan=ABCDE1234T",
        "--client-email=tax@prodclient.example.com",
        "--gstin=27ABCDE1234T1Z5",
        "--state-code=27",
        "--period=2026-05",
        "--enable-live-submission",
        "--enable-live-status-sync",
    )

    workspace = Workspace.objects.get(code="PROD-WS")
    client = Client.objects.get(workspace=workspace, client_code="PRODCLIENT")
    periods = CompliancePeriod.objects.filter(gstin__gstin="27ABCDE1234T1Z5", period="2026-05")
    rollout_policies = ProviderRolloutPolicy.objects.filter(workspace=workspace, client=client, gstin__gstin="27ABCDE1234T1Z5")
    alert_rules = OperationalAlertRoutingRule.objects.filter(workspace=workspace, client=client, gstin__gstin="27ABCDE1234T1Z5")

    assert User.objects.filter(email="prod.owner@example.com").exists()
    assert periods.filter(return_type="GSTR-1").exists()
    assert periods.filter(return_type="GSTR-3B").exists()
    assert rollout_policies.filter(return_type="gstr1", enable_live_submission=True, enable_live_status_sync=True).exists()
    assert rollout_policies.filter(return_type="gstr3b", enable_live_submission=True, enable_live_status_sync=True).exists()
    assert alert_rules.filter(return_type="gstr1", alert_code="confirmation_pending", target_role=WorkspaceRole.REVIEWER).exists()
    assert alert_rules.filter(return_type="gstr3b", alert_code="provider_failure", target_role=WorkspaceRole.SENIOR_CA).exists()

    call_command(
        "seed_production_defaults",
        "--owner-email=prod.owner@example.com",
        "--owner-password=strong-pass-123",
        "--organization-name=Prod Org",
        "--organization-code=PROD-ORG",
        "--workspace-name=Prod Workspace",
        "--workspace-code=PROD-WS",
        "--client-legal-name=Prod Client Limited",
        "--client-trade-name=Prod Client",
        "--client-code=PRODCLIENT",
        "--pan=ABCDE1234T",
        "--client-email=tax@prodclient.example.com",
        "--gstin=27ABCDE1234T1Z5",
        "--state-code=27",
        "--period=2026-05",
        "--enable-live-submission",
        "--enable-live-status-sync",
    )

    assert ProviderRolloutPolicy.objects.filter(workspace=workspace, client=client, gstin__gstin="27ABCDE1234T1Z5").count() == 2
    assert OperationalAlertRoutingRule.objects.filter(workspace=workspace, client=client, gstin__gstin="27ABCDE1234T1Z5").count() == 10
