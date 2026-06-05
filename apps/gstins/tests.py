import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.common.security import sanitize_json
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def gstins_api_client():
    return APIClient()


@pytest.fixture
def gstins_context(db):
    owner = User.objects.create_user(
        username="gstins-owner",
        email="gstins-owner@example.com",
        password="strong-pass-123",
    )
    viewer = User.objects.create_user(
        username="gstins-viewer",
        email="gstins-viewer@example.com",
        password="strong-pass-123",
    )
    organization = Organization.objects.create(
        name="GSTIN Test Org",
        code="GSTIN-ORG",
        created_by=owner,
        updated_by=owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="GSTIN Test Workspace",
        code="GSTIN-WS",
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
    client = Client.objects.create(
        workspace=workspace,
        legal_name="GSTIN Client Private Limited",
        trade_name="GSTIN Client",
        client_code="GST001",
        pan="ABCDE1234F",
        email="finance@gstin.example.com",
        created_by=owner,
        updated_by=owner,
    )
    return {
        "owner": owner,
        "viewer": viewer,
        "workspace": workspace,
        "client": client,
    }


@pytest.fixture
def gstins_owner_client(gstins_api_client, gstins_context):
    gstins_api_client.force_authenticate(user=gstins_context["owner"])
    return gstins_api_client


@pytest.fixture
def gstins_viewer_client(gstins_context):
    client = APIClient()
    client.force_authenticate(user=gstins_context["viewer"])
    return client


@pytest.mark.django_db
def test_workspace_owner_can_search_taxpayer_for_onboarding(gstins_owner_client, gstins_context, monkeypatch):
    captured = {}

    def fake_search_taxpayer(self, *, gstin, email=None):
        captured["gstin"] = gstin
        captured["email"] = email
        return {
            "gstin": gstin,
            "pan": "ABCDE1234F",
            "legal_name": "Orion Retail Private Limited",
            "trade_name": "Orion Retail",
            "state_code": "29",
            "registration_type": "regular",
            "status": "Active",
            "raw_payload": {"status_cd": "1", "lgnm": "Orion Retail Private Limited"},
        }

    monkeypatch.setattr(
        "apps.integrations.whitebooks.client.WhiteBooksClient.search_taxpayer",
        fake_search_taxpayer,
    )

    response = gstins_owner_client.get(
        "/api/v1/gstins/search-taxpayer/",
        {
            "workspace": str(gstins_context["workspace"].id),
            "gstin": "29abcde1234f1z5",
        },
    )

    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["gstin"] == "29ABCDE1234F1Z5"
    assert payload["legal_name"] == "Orion Retail Private Limited"
    assert payload["pan"] == "ABCDE1234F"
    assert payload["state_code"] == "29"
    assert captured["gstin"] == "29ABCDE1234F1Z5"
    assert captured["email"] is None

    audit_entry = AuditLog.objects.get(action="gstin.taxpayer_searched")
    assert str(audit_entry.workspace_id_ref) == str(gstins_context["workspace"].id)
    assert audit_entry.metadata["gstin"] == sanitize_json("29ABCDE1234F1Z5")


@pytest.mark.django_db
def test_viewer_cannot_search_taxpayer(gstins_viewer_client, gstins_context):
    response = gstins_viewer_client.get(
        "/api/v1/gstins/search-taxpayer/",
        {
            "workspace": str(gstins_context["workspace"].id),
            "gstin": "29ABCDE1234F1Z5",
        },
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_owner_can_create_gstin_with_optional_whitebooks_username(gstins_owner_client, gstins_context):
    response = gstins_owner_client.post(
        "/api/v1/gstins/",
        {
            "client": str(gstins_context["client"].id),
            "gstin": "29ABCDE1234F1Z5",
            "registration_type": "regular",
            "state_code": "29",
            "whitebooks_gst_username": "MH_NT2.1642",
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.data["data"]
    assert payload["whitebooks_gst_username"] == "MH_NT2.1642"

    gstin = GSTIN.objects.get(gstin="29ABCDE1234F1Z5")
    assert gstin.whitebooks_gst_username == "MH_NT2.1642"


@pytest.mark.django_db
def test_owner_cannot_create_duplicate_gstin_in_same_workspace(gstins_owner_client, gstins_context):
    GSTIN.objects.create(
        client=gstins_context["client"],
        gstin="29ABCDE1234F1Z5",
        registration_type="regular",
        state_code="29",
        created_by=gstins_context["owner"],
        updated_by=gstins_context["owner"],
    )

    another_client = Client.objects.create(
        workspace=gstins_context["workspace"],
        legal_name="Another GSTIN Client",
        trade_name="Another Client",
        client_code="GST002",
        pan="ABCDE1234G",
        email="another@gstin.example.com",
        created_by=gstins_context["owner"],
        updated_by=gstins_context["owner"],
    )

    response = gstins_owner_client.post(
        "/api/v1/gstins/",
        {
            "client": str(another_client.id),
            "gstin": "29ABCDE1234F1Z5",
            "registration_type": "regular",
            "state_code": "29",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["errors"]["gstin"][0] == "This GSTIN already exists in the selected workspace."
