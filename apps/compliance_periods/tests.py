import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def lock_api_client():
    return APIClient()


@pytest.fixture
def lock_users(db):
    owner = User.objects.create_user(username="lockowner", email="lockowner@example.com", password="strong-pass-123")
    manager = User.objects.create_user(username="lockmanager", email="lockmanager@example.com", password="strong-pass-123")
    return {"owner": owner, "manager": manager}


@pytest.fixture
def lock_authenticated_client(lock_api_client, lock_users):
    lock_api_client.force_authenticate(user=lock_users["owner"])
    return lock_api_client


@pytest.fixture
def lock_context(lock_users):
    owner = lock_users["owner"]
    manager = lock_users["manager"]
    organization = Organization.objects.create(name="Lock Org", code="LOCKO", created_by=owner, updated_by=owner)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Lock Workspace",
        code="LOCK-WS",
        created_by=owner,
        updated_by=owner,
    )
    WorkspaceMembership.objects.create(user=owner, workspace=workspace, role=WorkspaceRole.OWNER, created_by=owner, updated_by=owner)
    WorkspaceMembership.objects.create(user=manager, workspace=workspace, role=WorkspaceRole.MANAGER, created_by=owner, updated_by=owner)
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Lock Client Pvt Ltd",
        trade_name="Lock Client",
        client_code="LOCK001",
        pan="ABCDE1234Q",
        created_by=owner,
        updated_by=owner,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234Q1Z5",
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
    GSTTransaction.objects.create(
        workspace=workspace,
        client=client,
        gstin=gstin,
        compliance_period=compliance_period,
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-LOCK-001",
        transaction_date="2026-04-15",
        taxable_value="1000.00",
        cgst_amount="90.00",
        sgst_amount="90.00",
        tax_amount="180.00",
        total_amount="1180.00",
        created_by=owner,
        updated_by=owner,
    )
    return {
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
        "owner": owner,
        "manager": manager,
    }


def import_file():
    return SimpleUploadedFile(
        "purchase-lock.csv",
        (
            "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
            "INV-001,2026-04-14,29ABCDE1234F1Z5,Vendor One,1000,90,90,0,0,1180\n"
        ).encode("utf-8"),
        content_type="text/csv",
    )


@pytest.mark.django_db
def test_period_lock_blocks_imports_reconciliation_and_returns(lock_authenticated_client, lock_context):
    period_id = lock_context["compliance_period"].id
    lock_response = lock_authenticated_client.post(f"/api/v1/compliance-periods/{period_id}/lock/", {}, format="json")
    assert lock_response.status_code == 200

    import_response = lock_authenticated_client.post(
        "/api/v1/imports/batches/",
        {
            "workspace": str(lock_context["workspace"].id),
            "client": str(lock_context["client"].id),
            "gstin": str(lock_context["gstin"].id),
            "compliance_period": str(period_id),
            "import_type": "purchase",
            "source_type": "csv",
            "file": import_file(),
        },
        format="multipart",
    )
    assert import_response.status_code == 400

    recon_response = lock_authenticated_client.post(
        "/api/v1/reconciliation/runs/",
        {
            "workspace": str(lock_context["workspace"].id),
            "client": str(lock_context["client"].id),
            "gstin": str(lock_context["gstin"].id),
            "compliance_period": str(period_id),
            "run_type": "gstr_2b_purchase",
        },
        format="json",
    )
    assert recon_response.status_code == 400

    return_response = lock_authenticated_client.post(
        "/api/v1/returns/prepare/",
        {
            "workspace": str(lock_context["workspace"].id),
            "client": str(lock_context["client"].id),
            "gstin": str(lock_context["gstin"].id),
            "compliance_period": str(period_id),
            "return_type": "gstr1",
        },
        format="json",
    )
    assert return_response.status_code == 400


@pytest.mark.django_db
def test_unlock_allows_changes_again(lock_api_client, lock_context):
    lock_api_client.force_authenticate(user=lock_context["owner"])
    period_id = lock_context["compliance_period"].id
    lock_api_client.post(f"/api/v1/compliance-periods/{period_id}/lock/", {}, format="json")
    unlock_response = lock_api_client.post(f"/api/v1/compliance-periods/{period_id}/unlock/", {}, format="json")
    assert unlock_response.status_code == 200

    import_response = lock_api_client.post(
        "/api/v1/imports/batches/",
        {
            "workspace": str(lock_context["workspace"].id),
            "client": str(lock_context["client"].id),
            "gstin": str(lock_context["gstin"].id),
            "compliance_period": str(period_id),
            "import_type": "purchase",
            "source_type": "csv",
            "file": import_file(),
        },
        format="multipart",
    )
    assert import_response.status_code == 201


@pytest.mark.django_db
def test_unlock_requires_owner_or_admin(lock_api_client, lock_context):
    lock_api_client.force_authenticate(user=lock_context["owner"])
    period_id = lock_context["compliance_period"].id
    lock_api_client.post(f"/api/v1/compliance-periods/{period_id}/lock/", {}, format="json")
    lock_api_client.force_authenticate(user=lock_context["manager"])
    response = lock_api_client.post(f"/api/v1/compliance-periods/{period_id}/unlock/", {}, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_audit_log_filters(lock_authenticated_client, lock_context):
    period_id = lock_context["compliance_period"].id
    lock_authenticated_client.post(f"/api/v1/compliance-periods/{period_id}/lock/", {}, format="json")

    response = lock_authenticated_client.get(
        f"/api/v1/audit-logs/?workspace_id_ref={lock_context['workspace'].id}&period={period_id}&action=compliance_period.locked"
    )
    assert response.status_code == 200
    assert response.data["pagination"]["count"] >= 1
    assert AuditLog.objects.filter(action="compliance_period.locked", compliance_period_id_ref=period_id).exists()
