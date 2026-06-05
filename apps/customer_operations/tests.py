from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.clients.models import Client, ClientContact
from apps.compliance_periods.models import CompliancePeriod
from apps.customer_operations.models import OperationalFollowUp
from apps.filings.models import ReturnFiling
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def customer_operations_api_client():
    return APIClient()


@pytest.fixture
def customer_operations_context(db):
    owner = User.objects.create_user(username="co-owner", email="co-owner@example.com", password="strong-pass-123")
    viewer = User.objects.create_user(username="co-viewer", email="co-viewer@example.com", password="strong-pass-123")
    assignee = User.objects.create_user(
        username="co-assignee",
        email="co-assignee@example.com",
        password="strong-pass-123",
        first_name="Client",
        last_name="Executive",
    )
    organization = Organization.objects.create(name="Customer Ops Org", code="COPS-ORG", created_by=owner, updated_by=owner)
    workspace = Workspace.objects.create(organization=organization, name="Customer Ops WS", code="COPS-WS", created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=owner, workspace=workspace, role=WorkspaceRole.OWNER, created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=viewer, workspace=workspace, role=WorkspaceRole.VIEWER, created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=assignee, workspace=workspace, role=WorkspaceRole.MANAGER, created_by=owner, updated_by=owner)
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Ops Client Private Limited",
        trade_name="Ops Client",
        client_code="OPS001",
        pan="ABCDE1234F",
        email="ops@client.example.com",
        created_by=owner,
        updated_by=owner,
    )
    contact = ClientContact.objects.create(
        client=client,
        name="Aakash Verma",
        designation="Finance Manager",
        mobile_number="9876543210",
        email="aakash@example.com",
        is_primary=True,
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
    period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-06",
        return_type="GSTR-3B",
        status="open",
        created_by=owner,
        updated_by=owner,
    )
    return {
        "owner": owner,
        "viewer": viewer,
        "assignee": assignee,
        "workspace": workspace,
        "client": client,
        "contact": contact,
        "gstin": gstin,
        "period": period,
    }


@pytest.fixture
def customer_operations_owner_client(customer_operations_api_client, customer_operations_context):
    customer_operations_api_client.force_authenticate(user=customer_operations_context["owner"])
    return customer_operations_api_client


@pytest.fixture
def customer_operations_viewer_client(customer_operations_context):
    client = APIClient()
    client.force_authenticate(user=customer_operations_context["viewer"])
    return client


@pytest.mark.django_db
def test_owner_can_create_operational_follow_up(customer_operations_owner_client, customer_operations_context):
    response = customer_operations_owner_client.post(
        "/api/v1/operational-follow-ups/",
        {
            "workspace": str(customer_operations_context["workspace"].id),
            "client": str(customer_operations_context["client"].id),
            "gstin": str(customer_operations_context["gstin"].id),
            "compliance_period": str(customer_operations_context["period"].id),
            "contact": str(customer_operations_context["contact"].id),
            "follow_up_type": "data_request",
            "reason": "Sales register not received for filing",
            "pending_with": "customer",
            "priority": "high",
            "title": "Need June sales register",
            "notes": "Customer said they will share by evening.",
            "next_action": "Call customer if not received by 5 PM.",
            "due_at": (timezone.now() + timedelta(hours=6)).isoformat(),
            "assigned_to": customer_operations_context["assignee"].id,
        },
        format="json",
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["client_name"] == customer_operations_context["client"].legal_name
    assert data["contact_name"] == "Aakash Verma"
    assert data["contact_mobile"] == "9876543210"
    assert data["pending_with"] == "customer"
    assert OperationalFollowUp.objects.filter(title="Need June sales register").exists()


@pytest.mark.django_db
def test_list_supports_client_gstin_period_and_pending_filters(customer_operations_owner_client, customer_operations_context):
    OperationalFollowUp.objects.create(
        workspace=customer_operations_context["workspace"],
        client=customer_operations_context["client"],
        gstin=customer_operations_context["gstin"],
        compliance_period=customer_operations_context["period"],
        contact=customer_operations_context["contact"],
        contact_name_snapshot="Aakash Verma",
        mobile_number_snapshot="9876543210",
        email_snapshot="aakash@example.com",
        follow_up_type="otp_coordination",
        reason="OTP confirmation pending",
        pending_with="customer",
        priority="critical",
        title="Confirm OTP for filing",
        due_at=timezone.now() + timedelta(hours=2),
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )

    response = customer_operations_owner_client.get(
        "/api/v1/operational-follow-ups/",
        {
            "workspace": str(customer_operations_context["workspace"].id),
            "client": str(customer_operations_context["client"].id),
            "gstin": str(customer_operations_context["gstin"].id),
            "compliance_period": str(customer_operations_context["period"].id),
            "pending_with": "customer",
        },
    )

    assert response.status_code == 200
    assert response.data["pagination"]["count"] == 1
    assert response.data["data"][0]["title"] == "Confirm OTP for filing"


@pytest.mark.django_db
def test_owner_can_complete_and_escalate_operational_follow_up(customer_operations_owner_client, customer_operations_context):
    follow_up = OperationalFollowUp.objects.create(
        workspace=customer_operations_context["workspace"],
        client=customer_operations_context["client"],
        gstin=customer_operations_context["gstin"],
        compliance_period=customer_operations_context["period"],
        follow_up_type="general",
        reason="General coordination",
        pending_with="customer",
        title="Call customer",
        due_at=timezone.now() + timedelta(hours=2),
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )

    escalate_response = customer_operations_owner_client.post(
        f"/api/v1/operational-follow-ups/{follow_up.id}/mark-escalated/",
        {"notes": "No response since morning."},
        format="json",
    )
    complete_response = customer_operations_owner_client.post(
        f"/api/v1/operational-follow-ups/{follow_up.id}/mark-completed/",
        {"closed_reason": "Customer shared the required data."},
        format="json",
    )

    assert escalate_response.status_code == 200
    assert complete_response.status_code == 200
    follow_up.refresh_from_db()
    assert follow_up.status == OperationalFollowUp.FollowUpStatus.COMPLETED
    assert follow_up.completed_at is not None


@pytest.mark.django_db
def test_viewer_cannot_manage_operational_follow_up(customer_operations_viewer_client, customer_operations_context):
    response = customer_operations_viewer_client.post(
        "/api/v1/operational-follow-ups/",
        {
            "workspace": str(customer_operations_context["workspace"].id),
            "client": str(customer_operations_context["client"].id),
            "gstin": str(customer_operations_context["gstin"].id),
            "compliance_period": str(customer_operations_context["period"].id),
            "follow_up_type": "data_request",
            "reason": "Blocked item",
            "pending_with": "customer",
            "title": "Blocked",
            "due_at": (timezone.now() + timedelta(hours=1)).isoformat(),
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_return_status_register_derives_customer_pending_and_filed_rows(customer_operations_owner_client, customer_operations_context):
    open_preparation = ReturnPreparation.objects.create(
        compliance_period=customer_operations_context["period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        prepared_by=customer_operations_context["owner"],
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )
    OperationalFollowUp.objects.create(
        workspace=customer_operations_context["workspace"],
        client=customer_operations_context["client"],
        gstin=customer_operations_context["gstin"],
        compliance_period=customer_operations_context["period"],
        return_preparation=open_preparation,
        contact=customer_operations_context["contact"],
        contact_name_snapshot="Aakash Verma",
        mobile_number_snapshot="9876543210",
        email_snapshot="aakash@example.com",
        follow_up_type="data_request",
        reason="Sales register still pending from customer",
        pending_with="customer",
        priority="high",
        title="Need June sales data",
        due_at=timezone.now() + timedelta(hours=3),
        assigned_to=customer_operations_context["assignee"],
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )

    filed_period = CompliancePeriod.objects.create(
        gstin=customer_operations_context["gstin"],
        period="2026-05",
        return_type="GSTR-1",
        status="closed",
        due_date=timezone.localdate(),
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )
    filed_preparation = ReturnPreparation.objects.create(
        compliance_period=filed_period,
        return_type="gstr1",
        status=ReturnPreparation.PreparationStatus.FILED,
        prepared_by=customer_operations_context["owner"],
        filed_by=customer_operations_context["owner"],
        filed_at=timezone.now(),
        arn="ARN-PREP-001",
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )
    ReturnFiling.objects.create(
        workspace=customer_operations_context["workspace"],
        client=customer_operations_context["client"],
        gstin=customer_operations_context["gstin"],
        compliance_period=filed_period,
        prepared_return=filed_preparation,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type="gstr1",
        status=ReturnFiling.FilingStatus.FILED,
        arn="ARN-FILED-001",
        filed_at=timezone.now(),
        filed_by=customer_operations_context["owner"],
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )

    response = customer_operations_owner_client.get(
        "/api/v1/return-status-register/",
        {
            "workspace": str(customer_operations_context["workspace"].id),
            "client": str(customer_operations_context["client"].id),
        },
    )

    assert response.status_code == 200
    rows = response.data["data"]
    customer_row = next(item for item in rows if item["period"] == "2026-06")
    filed_row = next(item for item in rows if item["period"] == "2026-05")

    assert customer_row["pending_with"] == "customer"
    assert customer_row["status_bucket"] == "customer_pending"
    assert customer_row["open_follow_up_count"] == 1
    assert customer_row["latest_follow_up_title"] == "Need June sales data"
    assert customer_row["owner_name"] == "Client Executive"

    assert filed_row["status_bucket"] == "filed"
    assert filed_row["arn"] == "ARN-FILED-001"
    assert filed_row["filing_status"] == "filed"


@pytest.mark.django_db
def test_return_status_register_supports_status_bucket_and_pending_with_filters(
    customer_operations_owner_client,
    customer_operations_context,
):
    preparation = ReturnPreparation.objects.create(
        compliance_period=customer_operations_context["period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION,
        blocking_reason="Reconciliation snapshot is stale.",
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )
    OperationalFollowUp.objects.create(
        workspace=customer_operations_context["workspace"],
        client=customer_operations_context["client"],
        gstin=customer_operations_context["gstin"],
        compliance_period=customer_operations_context["period"],
        return_preparation=preparation,
        follow_up_type="general",
        reason="Waiting for reviewer intervention",
        pending_with="reviewer",
        priority="medium",
        title="Review stale reconciliation blocker",
        due_at=timezone.now() + timedelta(hours=4),
        created_by=customer_operations_context["owner"],
        updated_by=customer_operations_context["owner"],
    )

    blocked_response = customer_operations_owner_client.get(
        "/api/v1/return-status-register/",
        {
            "workspace": str(customer_operations_context["workspace"].id),
            "status_bucket": "blocked",
        },
    )
    reviewer_response = customer_operations_owner_client.get(
        "/api/v1/return-status-register/",
        {
            "workspace": str(customer_operations_context["workspace"].id),
            "pending_with": "reviewer",
        },
    )

    assert blocked_response.status_code == 200
    assert reviewer_response.status_code == 200
    assert blocked_response.data["pagination"]["count"] == 1
    assert reviewer_response.data["pagination"]["count"] == 1
