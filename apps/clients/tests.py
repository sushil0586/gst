import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN, GSTINTaxpayerProfile
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def clients_api_client():
    return APIClient()


@pytest.fixture
def clients_context(db):
    owner = User.objects.create_user(
        username="clients-owner",
        email="clients-owner@example.com",
        password="strong-pass-123",
    )
    viewer = User.objects.create_user(
        username="clients-viewer",
        email="clients-viewer@example.com",
        password="strong-pass-123",
    )
    organization = Organization.objects.create(
        name="Client Test Org",
        code="CLIENT-ORG",
        created_by=owner,
        updated_by=owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="Client Test Workspace",
        code="CLIENT-WS",
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
    return {
        "owner": owner,
        "viewer": viewer,
        "workspace": workspace,
    }


@pytest.fixture
def clients_owner_client(clients_api_client, clients_context):
    clients_api_client.force_authenticate(user=clients_context["owner"])
    return clients_api_client


@pytest.fixture
def clients_viewer_client(clients_context):
    client = APIClient()
    client.force_authenticate(user=clients_context["viewer"])
    return client


@pytest.mark.django_db
def test_owner_can_bootstrap_client_and_gstin_with_taxpayer_profile(clients_owner_client, clients_context):
    payload = {
        "workspace": str(clients_context["workspace"].id),
        "legal_name": "WhiteBooks",
        "trade_name": "GSTN",
        "client_code": "WHIT-286Q",
        "pan": "AAGCB1286Q",
        "email": "finance@whitebooks.example.com",
        "gstin": "27AAGCB1286Q2Z3",
        "registration_type": "regular",
        "state_code": "27",
        "whitebooks_gst_username": "MH_NT2.1642",
        "taxpayer_lookup_payload": {
            "status_cd": "1",
            "status_desc": "Public API Search Taxpayer Success",
            "data": {
                "stjCd": "MH001",
                "lgnm": "WhiteBooks",
                "stj": "AMRAVATI",
                "dty": "Regular",
                "adadr": [],
                "cxdt": "",
                "gstin": "27AAGCB1286Q2Z3",
                "nba": ["Export"],
                "lstupdt": "01/07/2017",
                "rgdt": "01/07/2017",
                "ctb": "Proprietorship",
                "pradr": {
                    "addr": {
                        "bnm": "Gold Hill Supreme",
                        "loc": "Electronic City Phase 2",
                    },
                    "ntr": "Export",
                },
                "tradeNam": "GSTN",
                "ctjCd": "1008",
                "sts": "Active",
                "ctj": "",
                "einvoiceStatus": "No",
            },
        },
    }

    response = clients_owner_client.post("/api/v1/clients/bootstrap/", payload, format="json")

    assert response.status_code == 201
    data = response.data["data"]
    assert data["client"]["legal_name"] == "WhiteBooks"
    assert data["gstin"]["gstin"] == "27AAGCB1286Q2Z3"
    assert data["gstin"]["whitebooks_gst_username"] == "MH_NT2.1642"
    assert data["taxpayer_profile"]["state_jurisdiction_code"] == "MH001"
    assert data["taxpayer_profile"]["einvoice_status"] == "No"

    client = Client.objects.get(client_code="WHIT-286Q")
    gstin = GSTIN.objects.get(client=client)
    assert gstin.whitebooks_gst_username == "MH_NT2.1642"

    profile = GSTINTaxpayerProfile.objects.get(gstin=gstin)
    assert profile.legal_name == "WhiteBooks"
    assert profile.trade_name == "GSTN"
    assert profile.registration_type == "Regular"
    assert profile.raw_payload["status_desc"] == "Public API Search Taxpayer Success"

    assert AuditLog.objects.filter(action="client.created", client_id_ref=client.id).exists()
    assert AuditLog.objects.filter(action="gstin.created", client_id_ref=client.id).exists()
    assert AuditLog.objects.filter(action="gstin.taxpayer_profile_saved", client_id_ref=client.id).exists()


@pytest.mark.django_db
def test_owner_can_bootstrap_client_without_gstin(clients_owner_client, clients_context):
    response = clients_owner_client.post(
        "/api/v1/clients/bootstrap/",
        {
            "workspace": str(clients_context["workspace"].id),
            "legal_name": "No GSTIN Client",
            "trade_name": "",
            "client_code": "NOGST-001",
            "pan": "ABCDE1234F",
            "email": "",
        },
        format="json",
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["client"]["client_code"] == "NOGST-001"
    assert data["gstin"] is None
    assert data["taxpayer_profile"] is None
    assert Client.objects.filter(client_code="NOGST-001").exists()


@pytest.mark.django_db
def test_viewer_cannot_bootstrap_client(clients_viewer_client, clients_context):
    response = clients_viewer_client.post(
        "/api/v1/clients/bootstrap/",
        {
            "workspace": str(clients_context["workspace"].id),
            "legal_name": "Blocked Client",
            "trade_name": "",
            "client_code": "BLOCK-001",
            "pan": "ABCDE1234F",
            "email": "ops@example.com",
            "gstin": "27ABCDE1234F1Z5",
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_bootstrap_rejects_duplicate_client_code_in_workspace(clients_owner_client, clients_context):
    Client.objects.create(
        workspace=clients_context["workspace"],
        legal_name="Existing Client",
        trade_name="Existing",
        client_code="NEER-GUPT-726B",
        pan="ABCDE1234F",
        email="existing@example.com",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )

    response = clients_owner_client.post(
        "/api/v1/clients/bootstrap/",
        {
            "workspace": str(clients_context["workspace"].id),
            "legal_name": "New Client",
            "trade_name": "",
            "client_code": "NEER-GUPT-726B",
            "pan": "AAGCB1286Q",
            "email": "finance@example.com",
            "gstin": "27AAGCB1286Q2Z3",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["errors"]["client_code"][0] == "A client with this code already exists in the selected workspace."


@pytest.mark.django_db
def test_owner_can_delete_client_when_no_transactions_exist(clients_owner_client, clients_context):
    client = Client.objects.create(
        workspace=clients_context["workspace"],
        legal_name="Disposable Client",
        trade_name="Disposable",
        client_code="DEL-001",
        pan="ABCDE1234K",
        email="delete@example.com",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="27ABCDE1234K1Z1",
        registration_type="regular",
        state_code="27",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-06",
        return_type="GSTR-1",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )

    response = clients_owner_client.delete(f"/api/v1/clients/{client.id}/")

    assert response.status_code == 200
    client.refresh_from_db()
    gstin.refresh_from_db()
    period.refresh_from_db()
    assert client.is_active is False
    assert gstin.is_active is False
    assert period.is_active is False
    assert AuditLog.objects.filter(action="client.deleted", client_id_ref=client.id).exists()


@pytest.mark.django_db
def test_owner_cannot_delete_client_when_transactions_exist(clients_owner_client, clients_context):
    client = Client.objects.create(
        workspace=clients_context["workspace"],
        legal_name="Protected Client",
        trade_name="Protected",
        client_code="KEEP-001",
        pan="ABCDE1234M",
        email="keep@example.com",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="27ABCDE1234M1Z1",
        registration_type="regular",
        state_code="27",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-06",
        return_type="GSTR-3B",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    GSTTransaction.objects.create(
        workspace=clients_context["workspace"],
        client=client,
        gstin=gstin,
        compliance_period=period,
        transaction_type="purchase",
        document_type="invoice",
        reference_number="INV-DEL-001",
        transaction_date="2026-06-01",
        counterparty_gstin="27AAAAA0000A1Z5",
        counterparty_name="Vendor",
        taxable_value="1000.00",
        cgst_amount="90.00",
        sgst_amount="90.00",
        igst_amount="0.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )

    response = clients_owner_client.delete(f"/api/v1/clients/{client.id}/")

    assert response.status_code == 400
    assert response.data["errors"]["client"] == "This client cannot be deleted because active transactions exist against it."
    client.refresh_from_db()
    assert client.is_active is True


@pytest.mark.django_db
def test_client_list_exposes_delete_capability(clients_owner_client, clients_context):
    deletable_client = Client.objects.create(
        workspace=clients_context["workspace"],
        legal_name="Delete Ready",
        trade_name="Delete Ready",
        client_code="DEL-READY",
        pan="ABCDE1234N",
        email="ready@example.com",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    protected_client = Client.objects.create(
        workspace=clients_context["workspace"],
        legal_name="Delete Blocked",
        trade_name="Delete Blocked",
        client_code="DEL-BLOCK",
        pan="ABCDE1234P",
        email="blocked@example.com",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    gstin = GSTIN.objects.create(
        client=protected_client,
        gstin="27ABCDE1234P1Z1",
        registration_type="regular",
        state_code="27",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-06",
        return_type="GSTR-1",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )
    GSTTransaction.objects.create(
        workspace=clients_context["workspace"],
        client=protected_client,
        gstin=gstin,
        compliance_period=period,
        transaction_type="purchase",
        document_type="invoice",
        reference_number="INV-BLOCK-001",
        transaction_date="2026-06-01",
        counterparty_gstin="27AAAAA0000A1Z5",
        counterparty_name="Vendor",
        taxable_value="1000.00",
        cgst_amount="90.00",
        sgst_amount="90.00",
        igst_amount="0.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        created_by=clients_context["owner"],
        updated_by=clients_context["owner"],
    )

    response = clients_owner_client.get(f"/api/v1/clients/?workspace={clients_context['workspace'].id}")

    assert response.status_code == 200
    payload = response.data["data"]
    items = payload["items"] if isinstance(payload, dict) and "items" in payload else payload
    deletable_payload = next(item for item in items if item["id"] == str(deletable_client.id))
    protected_payload = next(item for item in items if item["id"] == str(protected_client.id))
    assert deletable_payload["can_delete"] is True
    assert deletable_payload["transaction_count"] == 0
    assert protected_payload["can_delete"] is False
    assert protected_payload["transaction_count"] == 1
