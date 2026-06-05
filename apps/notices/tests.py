import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.clients.models import Client
from apps.gstins.models import GSTIN
from apps.notices.models import Notice
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def notices_api_client():
    return APIClient()


@pytest.fixture
def notices_context(db):
    owner = User.objects.create_user(
        username="notices-owner",
        email="notices-owner@example.com",
        password="strong-pass-123",
    )
    viewer = User.objects.create_user(
        username="notices-viewer",
        email="notices-viewer@example.com",
        password="strong-pass-123",
    )
    assignee = User.objects.create_user(
        username="notices-assignee",
        email="notices-assignee@example.com",
        password="strong-pass-123",
        first_name="Assigned",
        last_name="Operator",
    )
    outsider = User.objects.create_user(
        username="notices-outsider",
        email="notices-outsider@example.com",
        password="strong-pass-123",
    )
    organization = Organization.objects.create(
        name="Notices Test Org",
        code="NOTICES-ORG",
        created_by=owner,
        updated_by=owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="Notices Test Workspace",
        code="NOTICES-WS",
        created_by=owner,
        updated_by=owner,
    )
    WorkspaceMembership.objects.create(
        user=owner,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=owner,
        updated_by=owner,
    )
    WorkspaceMembership.objects.create(
        user=viewer,
        workspace=workspace,
        role=WorkspaceRole.VIEWER,
        created_by=owner,
        updated_by=owner,
    )
    WorkspaceMembership.objects.create(
        user=assignee,
        workspace=workspace,
        role=WorkspaceRole.MANAGER,
        created_by=owner,
        updated_by=owner,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Notice Client Private Limited",
        trade_name="Notice Client",
        client_code="NOTICE001",
        pan="ABCDE1234F",
        email="ops@notice.example.com",
        created_by=owner,
        updated_by=owner,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234F1Z5",
        registration_type="regular",
        state_code="29",
        created_by=owner,
        updated_by=owner,
    )
    return {
        "owner": owner,
        "viewer": viewer,
        "assignee": assignee,
        "outsider": outsider,
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
    }


@pytest.fixture
def notices_owner_client(notices_api_client, notices_context):
    notices_api_client.force_authenticate(user=notices_context["owner"])
    return notices_api_client


@pytest.mark.django_db
def test_owner_can_create_notice(notices_owner_client, notices_context):
    response = notices_owner_client.post(
        "/api/v1/notices/",
        {
            "gstin": str(notices_context["gstin"].id),
            "reference_number": "ASMT-10/2026/1184",
            "title": "Mismatch in outward supplies",
            "description": "Please explain the variance in outward tax liability.",
            "status": "open",
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.data["data"]
    assert payload["reference_number"] == "ASMT-10/2026/1184"
    assert payload["client_name"] == notices_context["client"].legal_name
    assert payload["gstin_value"] == notices_context["gstin"].gstin
    assert Notice.objects.filter(reference_number="ASMT-10/2026/1184").exists()


@pytest.mark.django_db
def test_notices_list_supports_workspace_client_and_gstin_filters(notices_owner_client, notices_context):
    other_client = Client.objects.create(
        workspace=notices_context["workspace"],
        legal_name="Other Client",
        trade_name="Other",
        client_code="NOTICE002",
        pan="FGHIJ5678K",
        email="other@notice.example.com",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    other_gstin = GSTIN.objects.create(
        client=other_client,
        gstin="27FGHIJ5678K1Z1",
        registration_type="regular",
        state_code="27",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="NOTICE-001",
        title="Primary notice",
        status="open",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    Notice.objects.create(
        gstin=other_gstin,
        reference_number="NOTICE-002",
        title="Secondary notice",
        status="responded",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    workspace_response = notices_owner_client.get(
        "/api/v1/notices/",
        {"workspace": str(notices_context["workspace"].id)},
    )
    client_response = notices_owner_client.get(
        "/api/v1/notices/",
        {"client": str(notices_context["client"].id)},
    )
    gstin_response = notices_owner_client.get(
        "/api/v1/notices/",
        {"gstin": str(notices_context["gstin"].id)},
    )

    assert workspace_response.status_code == 200
    assert workspace_response.data["pagination"]["count"] == 2
    assert client_response.data["pagination"]["count"] == 1
    assert client_response.data["data"][0]["reference_number"] == "NOTICE-001"
    assert gstin_response.data["pagination"]["count"] == 1
    assert gstin_response.data["data"][0]["gstin_value"] == notices_context["gstin"].gstin


@pytest.mark.django_db
def test_owner_can_update_notice_due_date_status_and_assignee(notices_owner_client, notices_context):
    notice = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="NOTICE-003",
        title="Action required",
        status="open",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    response = notices_owner_client.patch(
        f"/api/v1/notices/{notice.id}/",
        {
            "status": "responded",
            "due_date": "2026-06-12",
            "assigned_to": notices_context["assignee"].id,
            "description": "Draft response prepared and review assigned.",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["status"] == "responded"
    assert payload["due_date"] == "2026-06-12"
    assert payload["assigned_to"] == notices_context["assignee"].id
    assert payload["assigned_to_name"] == "Assigned Operator"


@pytest.mark.django_db
def test_notice_rejects_assignee_outside_workspace(notices_owner_client, notices_context):
    response = notices_owner_client.post(
        "/api/v1/notices/",
        {
            "gstin": str(notices_context["gstin"].id),
            "reference_number": "ASMT-10/2026/9999",
            "title": "Invalid assignment test",
            "assigned_to": notices_context["outsider"].id,
            "status": "open",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "assigned_to" in response.data["errors"]
