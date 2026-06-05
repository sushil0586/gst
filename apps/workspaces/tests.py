import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def workspace_api_client():
    return APIClient()


@pytest.fixture
def workspace_context(db):
    owner = User.objects.create_user(username="workspace-owner", email="workspace-owner@example.com", password="pass12345")
    manager = User.objects.create_user(username="workspace-manager", email="workspace-manager@example.com", password="pass12345")
    filer = User.objects.create_user(username="workspace-filer", email="workspace-filer@example.com", password="pass12345")
    organization = Organization.objects.create(
        name="Ansh & Co",
        code="ANSHCO",
        created_by=owner,
        updated_by=owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="Delhi Office",
        code="DELHI",
        timezone="Asia/Kolkata",
        created_by=owner,
        updated_by=owner,
    )
    WorkspaceMembership.objects.create(user=owner, workspace=workspace, role=WorkspaceRole.OWNER, created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=manager, workspace=workspace, role=WorkspaceRole.MANAGER, created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=filer, workspace=workspace, role=WorkspaceRole.FILER, created_by=owner, updated_by=owner)
    return {
        "owner": owner,
        "manager": manager,
        "filer": filer,
        "organization": organization,
        "workspace": workspace,
    }


@pytest.fixture
def owner_client(workspace_api_client, workspace_context):
    workspace_api_client.force_authenticate(user=workspace_context["owner"])
    return workspace_api_client


@pytest.fixture
def manager_client(workspace_api_client, workspace_context):
    workspace_api_client.force_authenticate(user=workspace_context["manager"])
    return workspace_api_client


@pytest.fixture
def filer_client(workspace_api_client, workspace_context):
    workspace_api_client.force_authenticate(user=workspace_context["filer"])
    return workspace_api_client


def test_owner_can_create_additional_workspace(owner_client, workspace_context):
    response = owner_client.post(
        "/api/v1/workspaces/",
        {
            "organization": str(workspace_context["organization"].id),
            "name": "Jaipur Office",
            "code": "JAIPUR",
            "timezone": "Asia/Kolkata",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["name"] == "Jaipur Office"
    assert WorkspaceMembership.objects.filter(
        user=workspace_context["owner"],
        workspace__name="Jaipur Office",
        role=WorkspaceRole.OWNER,
        is_active=True,
    ).exists()


def test_owner_can_list_workspaces(owner_client, workspace_context):
    response = owner_client.get("/api/v1/workspaces/")

    assert response.status_code == 200
    assert len(response.data["data"]) == 1
    assert response.data["data"][0]["name"] == workspace_context["workspace"].name


def test_manager_cannot_create_additional_workspace(manager_client, workspace_context):
    response = manager_client.post(
        "/api/v1/workspaces/",
        {
            "organization": str(workspace_context["organization"].id),
            "name": "Jaipur Office",
            "code": "JAIPUR",
            "timezone": "Asia/Kolkata",
        },
        format="json",
    )

    assert response.status_code == 403


def test_filer_cannot_deactivate_workspace(filer_client, workspace_context):
    response = filer_client.delete(f"/api/v1/workspaces/{workspace_context['workspace'].id}/")

    assert response.status_code == 403
