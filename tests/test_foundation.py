import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from django.core.management import call_command

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.accounts.services.rbac import has_permission
from apps.audit_logs.models import AuditLog
from apps.approvals.models import ApprovalRequest
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch, ImportRowError
from apps.notices.models import Notice
from apps.organizations.models import Organization
from apps.reconciliation.models import ReconciliationItem
from apps.reconciliation.models import ReconciliationRun
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace


User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="owner", email="owner@example.com", password="strong-pass-123")


@pytest.fixture
def authenticated_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def hierarchy(user):
    organization = Organization.objects.create(name="Acme Org", code="ACME", created_by=user, updated_by=user)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Primary Workspace",
        code="PRIMARY",
        created_by=user,
        updated_by=user,
    )
    WorkspaceMembership.objects.create(
        user=user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=user,
        updated_by=user,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Acme Client Pvt Ltd",
        trade_name="Acme Client",
        client_code="CLIENT001",
        pan="ABCDE1234F",
        created_by=user,
        updated_by=user,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234F1Z5",
        registration_type="regular",
        state_code="29",
        created_by=user,
        updated_by=user,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-3B",
        created_by=user,
        updated_by=user,
    )
    return {
        "organization": organization,
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
    }


@pytest.mark.django_db
def test_model_hierarchy_creation(hierarchy):
    assert hierarchy["workspace"].organization == hierarchy["organization"]
    assert hierarchy["client"].workspace == hierarchy["workspace"]
    assert hierarchy["gstin"].client == hierarchy["client"]
    assert hierarchy["compliance_period"].gstin == hierarchy["gstin"]


@pytest.mark.django_db
def test_jwt_auth_token(api_client, user):
    response = api_client.post(
        "/api/v1/auth/token/",
        {"email": "owner@example.com", "password": "strong-pass-123"},
        format="json",
    )
    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" in response.data
    assert response.data["user"]["user"]["email"] == "owner@example.com"


@pytest.mark.django_db
def test_current_user_endpoint(api_client, hierarchy, user):
    token_response = api_client.post(
        "/api/v1/auth/token/",
        {"email": "owner@example.com", "password": "strong-pass-123"},
        format="json",
    )
    access_token = token_response.data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    response = api_client.get("/api/v1/auth/me/")
    assert response.status_code == 200
    assert response.data["data"]["user"]["email"] == "owner@example.com"
    assert response.data["data"]["default_workspace"]["id"] == str(hierarchy["workspace"].id)
    assert "manage_client" in response.data["data"]["permissions_summary"]["codes"]
    assert len(response.data["data"]["workspaces"]) == 1
    assert len(response.data["data"]["organizations"]) == 1


@pytest.mark.django_db
def test_seed_demo_data_idempotent():
    call_command("seed_demo_data")
    call_command("seed_demo_data")
    assert Organization.objects.filter(code="DEMOORG").count() == 1
    assert Workspace.objects.filter(code="DEMO-WS").count() == 1
    assert Client.objects.filter(client_code="DEMOCLIENT").count() == 1
    assert GSTIN.objects.filter(gstin="29ABCDE1234F1Z5").count() == 1
    assert CompliancePeriod.objects.filter(period="2026-04", return_type="GSTR-3B").count() == 1


@pytest.mark.django_db
def test_clear_transactional_data_command_preserves_master_data(user, hierarchy):
    batch = ImportBatch.objects.create(
        workspace=hierarchy["workspace"],
        client=hierarchy["client"],
        gstin=hierarchy["gstin"],
        compliance_period=hierarchy["compliance_period"],
        import_type="sales",
        source_type="csv",
        file_name="sales-apr.csv",
        status="processed",
        created_by=user,
        updated_by=user,
    )
    ImportRowError.objects.create(
        import_batch=batch,
        row_number=2,
        field_name="counterparty_gstin",
        severity="error",
        error_code="invalid_format",
        error_message="Counterparty GSTIN format is invalid.",
        raw_row={"invoice_no": "S-1003"},
        created_by=user,
        updated_by=user,
    )
    transaction = GSTTransaction.objects.create(
        workspace=hierarchy["workspace"],
        client=hierarchy["client"],
        gstin=hierarchy["gstin"],
        compliance_period=hierarchy["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-1001",
        transaction_date="2026-04-05",
        counterparty_gstin="03AABCU9603R1Z2",
        counterparty_name="North Retail Pvt Ltd",
        taxable_value="100000.00",
        cgst_amount="9000.00",
        sgst_amount="9000.00",
        tax_amount="18000.00",
        total_amount="118000.00",
        import_batch=batch,
        created_by=user,
        updated_by=user,
    )
    run = ReconciliationRun.objects.create(
        workspace=hierarchy["workspace"],
        client=hierarchy["client"],
        gstin=hierarchy["gstin"],
        compliance_period=hierarchy["compliance_period"],
        run_type="gstr_2b_purchase",
        status="completed",
        created_by=user,
        updated_by=user,
    )
    ReconciliationItem.objects.create(
        reconciliation_run=run,
        books_transaction=transaction,
        match_status="missing_in_portal",
        mismatch_reason="missing_in_portal",
        created_by=user,
        updated_by=user,
    )
    ReturnPreparation.objects.create(
        compliance_period=hierarchy["compliance_period"],
        return_type="gstr1",
        status="ready_for_review",
        created_by=user,
        updated_by=user,
    )
    ApprovalRequest.objects.create(
        workspace=hierarchy["workspace"],
        client=hierarchy["client"],
        gstin=hierarchy["gstin"],
        compliance_period=hierarchy["compliance_period"],
        entity_type="return_preparation",
        entity_id=hierarchy["compliance_period"].id,
        status="pending",
        created_by=user,
        updated_by=user,
    )
    Notice.objects.create(
        gstin=hierarchy["gstin"],
        reference_number="N-001",
        title="Test notice",
        status="open",
        created_by=user,
        updated_by=user,
    )
    AuditLog.objects.create(
        actor=user,
        action="test.event",
        entity_type="Client",
        entity_id=hierarchy["client"].id,
        workspace_id_ref=hierarchy["workspace"].id,
        client_id_ref=hierarchy["client"].id,
        created_by=user,
        updated_by=user,
    )

    call_command("clear_transactional_data", "--yes")

    assert Organization.objects.filter(pk=hierarchy["organization"].id).exists()
    assert Workspace.objects.filter(pk=hierarchy["workspace"].id).exists()
    assert Client.objects.filter(pk=hierarchy["client"].id).exists()
    assert GSTIN.objects.filter(pk=hierarchy["gstin"].id).exists()
    assert CompliancePeriod.objects.filter(pk=hierarchy["compliance_period"].id).exists()

    assert ImportBatch.objects.count() == 0
    assert ImportRowError.objects.count() == 0
    assert GSTTransaction.objects.count() == 0
    assert ReconciliationRun.objects.count() == 0
    assert ReconciliationItem.objects.count() == 0
    assert ReturnPreparation.objects.count() == 0
    assert ApprovalRequest.objects.count() == 0
    assert Notice.objects.count() == 0
    assert AuditLog.objects.count() == 0


@pytest.mark.django_db
def test_workspace_creation_assigns_owner_membership(api_client, user, hierarchy):
    token_response = api_client.post(
        "/api/v1/auth/token/",
        {"email": "owner@example.com", "password": "strong-pass-123"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")
    response = api_client.post(
        "/api/v1/workspaces/",
        {
            "organization": str(hierarchy["organization"].id),
            "name": "Secondary Workspace",
            "code": "SECONDARY",
            "timezone": "Asia/Kolkata",
        },
        format="json",
    )
    assert response.status_code == 201
    workspace_id = response.data["data"]["id"]
    assert WorkspaceMembership.objects.filter(user=user, workspace_id=workspace_id, role=WorkspaceRole.OWNER).exists()


@pytest.mark.django_db
def test_has_permission_helper(user, hierarchy):
    assert has_permission(user, hierarchy["workspace"], hierarchy["client"], "manage_client") is True
    assert has_permission(user, hierarchy["workspace"], hierarchy["client"], "file_return") is True
    assert has_permission(user, hierarchy["workspace"], hierarchy["client"], "unknown_code") is False


@pytest.mark.django_db
def test_client_gstin_and_compliance_period_crud(authenticated_client, hierarchy):
    workspace = hierarchy["workspace"]
    client_payload = {
        "workspace": str(workspace.id),
        "legal_name": "Second Client Pvt Ltd",
        "trade_name": "Second Client",
        "client_code": "CLIENT002",
        "pan": "ABCDE1234G",
        "email": "second@example.com",
    }
    client_response = authenticated_client.post("/api/v1/clients/", client_payload, format="json")
    assert client_response.status_code == 201
    new_client_id = client_response.data["data"]["id"]

    list_response = authenticated_client.get(f"/api/v1/clients/?workspace={workspace.id}")
    assert list_response.status_code == 200
    assert list_response.data["pagination"]["count"] >= 2

    gstin_response = authenticated_client.post(
        "/api/v1/gstins/",
        {
            "client": new_client_id,
            "gstin": "29ABCDE1234G1Z9",
            "registration_type": "regular",
            "state_code": "29",
        },
        format="json",
    )
    assert gstin_response.status_code == 201
    gstin_id = gstin_response.data["data"]["id"]

    compliance_response = authenticated_client.post(
        "/api/v1/compliance-periods/",
        {
            "gstin": gstin_id,
            "period": "2026-05",
            "return_type": "GSTR-1",
            "status": "open",
        },
        format="json",
    )
    assert compliance_response.status_code == 201
    assert compliance_response.data["data"]["period"] == "2026-05"


@pytest.mark.django_db
def test_import_batch_and_audit_log_listing(authenticated_client, hierarchy):
    period = hierarchy["compliance_period"]
    response = authenticated_client.post(
        "/api/v1/imports/batches/",
        {
            "workspace": str(hierarchy["workspace"].id),
            "client": str(hierarchy["client"].id),
            "gstin": str(hierarchy["gstin"].id),
            "compliance_period": str(period.id),
            "import_type": "gstr_2b",
            "source_type": "csv",
            "file": SimpleUploadedFile(
                "gstr2b-apr.csv",
                (
                    "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,igst,total_amount\n"
                    "2B-001,2026-04-20,29ABCDE1234F1Z5,Vendor 2B,1000,180,1180\n"
                ).encode("utf-8"),
                content_type="text/csv",
            ),
        },
        format="multipart",
    )
    assert response.status_code == 201
    assert ImportBatch.objects.count() == 1

    audit_response = authenticated_client.get(f"/api/v1/audit-logs/?workspace_id_ref={hierarchy['workspace'].id}")
    assert audit_response.status_code == 200
    assert audit_response.data["pagination"]["count"] >= 1
    assert AuditLog.objects.filter(action="import.uploaded").exists()


@pytest.mark.django_db
def test_reconciliation_and_return_preparation_placeholders(authenticated_client, hierarchy):
    period = hierarchy["compliance_period"]

    reconciliation_response = authenticated_client.post(
        "/api/v1/reconciliation/runs/",
        {
            "workspace": str(hierarchy["workspace"].id),
            "client": str(hierarchy["client"].id),
            "gstin": str(hierarchy["gstin"].id),
            "compliance_period": str(period.id),
            "run_type": "gstr_2b_purchase",
            "notes": "Initial run",
        },
        format="json",
    )
    assert reconciliation_response.status_code == 201
    assert ReconciliationRun.objects.count() == 1

    return_response = authenticated_client.post(
        "/api/v1/returns/prepare/",
        {
            "workspace": str(hierarchy["workspace"].id),
            "client": str(hierarchy["client"].id),
            "gstin": str(hierarchy["gstin"].id),
            "compliance_period": str(period.id),
            "return_type": "gstr3b",
        },
        format="json",
    )
    assert return_response.status_code == 200
    assert ReturnPreparation.objects.count() == 1
