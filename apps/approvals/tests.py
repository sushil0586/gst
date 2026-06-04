import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.approvals.models import ApprovalRequest
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def approval_api_client():
    return APIClient()


@pytest.fixture
def approval_users(db):
    owner = User.objects.create_user(username="owner2", email="owner2@example.com", password="strong-pass-123")
    reviewer = User.objects.create_user(username="reviewer2", email="reviewer2@example.com", password="strong-pass-123")
    return {"owner": owner, "reviewer": reviewer}


@pytest.fixture
def approval_authenticated_client(approval_api_client, approval_users):
    approval_api_client.force_authenticate(user=approval_users["owner"])
    return approval_api_client


@pytest.fixture
def approval_context(approval_users):
    owner = approval_users["owner"]
    reviewer = approval_users["reviewer"]
    organization = Organization.objects.create(name="Approval Org", code="APPROV", created_by=owner, updated_by=owner)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Approval Workspace",
        code="APPROV-WS",
        created_by=owner,
        updated_by=owner,
    )
    WorkspaceMembership.objects.create(user=owner, workspace=workspace, role=WorkspaceRole.OWNER, created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=reviewer, workspace=workspace, role=WorkspaceRole.REVIEWER, created_by=owner, updated_by=owner)
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Approval Client Pvt Ltd",
        trade_name="Approval Client",
        client_code="APP001",
        pan="ABCDE1234P",
        created_by=owner,
        updated_by=owner,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234P1Z5",
        registration_type="regular",
        state_code="29",
        created_by=owner,
        updated_by=owner,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-3B",
        status="closed",
        created_by=owner,
        updated_by=owner,
    )
    return_preparation = ReturnPreparation.objects.create(
        compliance_period=compliance_period,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={"itc_summary": {"eligible_itc": "100.00"}},
        prepared_by=owner,
        created_by=owner,
        updated_by=owner,
    )
    return {
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
        "return_preparation": return_preparation,
        "owner": owner,
        "reviewer": reviewer,
    }


def approval_payload(context):
    return {
        "workspace": str(context["workspace"].id),
        "client": str(context["client"].id),
        "gstin": str(context["gstin"].id),
        "compliance_period": str(context["compliance_period"].id),
        "entity_type": "return_preparation",
        "entity_id": str(context["return_preparation"].id),
        "requested_to": context["reviewer"].id,
        "comments": "Please review before filing.",
    }


@pytest.mark.django_db
def test_approval_request_lifecycle(approval_authenticated_client, approval_context):
    create_response = approval_authenticated_client.post("/api/v1/approvals/", approval_payload(approval_context), format="json")
    assert create_response.status_code == 201
    approval_id = create_response.data["data"]["id"]

    approve_response = approval_authenticated_client.post(
        f"/api/v1/approvals/{approval_id}/approve/",
        {"comments": "Approved by control owner"},
        format="json",
    )
    assert approve_response.status_code == 200
    approval = ApprovalRequest.objects.get(pk=approval_id)
    assert approval.status == ApprovalRequest.ApprovalStatus.APPROVED


@pytest.mark.django_db
def test_return_approval_integration(approval_authenticated_client, approval_context):
    create_response = approval_authenticated_client.post("/api/v1/approvals/", approval_payload(approval_context), format="json")
    approval_id = create_response.data["data"]["id"]

    approval_authenticated_client.post(f"/api/v1/approvals/{approval_id}/approve/", {}, format="json")
    approval_context["return_preparation"].refresh_from_db()
    assert approval_context["return_preparation"].status == ReturnPreparation.PreparationStatus.APPROVED


@pytest.mark.django_db
def test_approval_blocks_same_preparer_when_maker_checker_enforced(approval_authenticated_client, approval_context, settings):
    settings.FILING_ENFORCE_MAKER_CHECKER = True
    create_response = approval_authenticated_client.post("/api/v1/approvals/", approval_payload(approval_context), format="json")
    approval_id = create_response.data["data"]["id"]

    approve_response = approval_authenticated_client.post(
        f"/api/v1/approvals/{approval_id}/approve/",
        {"comments": "Attempted self approval"},
        format="json",
    )

    assert approve_response.status_code == 400
    assert "Maker-checker policy" in str(approve_response.data)


@pytest.mark.django_db
def test_approval_reject_and_cancel(approval_authenticated_client, approval_context):
    create_response = approval_authenticated_client.post("/api/v1/approvals/", approval_payload(approval_context), format="json")
    first_approval_id = create_response.data["data"]["id"]
    reject_response = approval_authenticated_client.post(
        f"/api/v1/approvals/{first_approval_id}/reject/",
        {"comments": "Need more supporting detail"},
        format="json",
    )
    assert reject_response.status_code == 200

    approval_context["return_preparation"].status = ReturnPreparation.PreparationStatus.READY_FOR_REVIEW
    approval_context["return_preparation"].save(update_fields=["status"])
    second_response = approval_authenticated_client.post("/api/v1/approvals/", approval_payload(approval_context), format="json")
    second_approval_id = second_response.data["data"]["id"]
    cancel_response = approval_authenticated_client.post(
        f"/api/v1/approvals/{second_approval_id}/cancel/",
        {"comments": "Closing this request"},
        format="json",
    )
    assert cancel_response.status_code == 200
    assert ApprovalRequest.objects.get(pk=second_approval_id).status == ApprovalRequest.ApprovalStatus.CANCELLED


@pytest.mark.django_db
def test_approval_filters(approval_authenticated_client, approval_context):
    approval_authenticated_client.post("/api/v1/approvals/", approval_payload(approval_context), format="json")
    response = approval_authenticated_client.get(
        f"/api/v1/approvals/?status=pending&entity_type=return_preparation&client={approval_context['client'].id}&period={approval_context['compliance_period'].id}"
    )
    assert response.status_code == 200
    assert response.data["pagination"]["count"] == 1
    assert AuditLog.objects.filter(action="approval_request.created").exists()
