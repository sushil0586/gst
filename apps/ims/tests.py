from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.filings.models import ProviderAuthSession
from apps.gstins.models import GSTIN
from apps.ims.models import IMSActionBatch
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def ims_api_client():
    return APIClient()


@pytest.fixture
def ims_context(db):
    owner = User.objects.create_user(
        username="ims-owner",
        email="ims-owner@example.com",
        password="strong-pass-123",
    )
    viewer = User.objects.create_user(
        username="ims-viewer",
        email="ims-viewer@example.com",
        password="strong-pass-123",
    )
    organization = Organization.objects.create(
        name="IMS Test Org",
        code="IMS-ORG",
        created_by=owner,
        updated_by=owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="IMS Workspace",
        code="IMS-WS",
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
        legal_name="IMS Client Private Limited",
        trade_name="IMS Client",
        client_code="IMS001",
        pan="ABCDE1234K",
        email="finance@ims.example.com",
        created_by=owner,
        updated_by=owner,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234K1Z7",
        registration_type="regular",
        state_code="29",
        whitebooks_gst_username="KA_IMS_USER",
        created_by=owner,
        updated_by=owner,
    )
    auth_session = ProviderAuthSession.objects.create(
        workspace=workspace,
        client=client,
        gstin=gstin,
        provider="whitebooks",
        email="otp@ims.example.com",
        txn="txn-ims-123",
        status=ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
        response_contract_confirmed=True,
        verified_at=timezone.now(),
        created_by=owner,
        updated_by=owner,
        initiated_by=owner,
        verified_by=owner,
    )
    return {
        "owner": owner,
        "viewer": viewer,
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "auth_session": auth_session,
    }


@pytest.fixture
def ims_owner_client(ims_context):
    client = APIClient()
    client.force_authenticate(user=ims_context["owner"])
    return client


@pytest.fixture
def ims_viewer_client(ims_context):
    client = APIClient()
    client.force_authenticate(user=ims_context["viewer"])
    return client


@pytest.mark.django_db
def test_owner_can_save_ims_payload(ims_owner_client, ims_context, monkeypatch):
    captured = {}

    def fake_ims_save(self, **kwargs):
        captured.update(kwargs)
        return {"status_cd": "1", "message": "saved", "int_tran_id": "ims-int-save-001"}

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.ims_save", fake_ims_save)

    response = ims_owner_client.post(
        "/api/v1/ims/save/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "auth_session": str(ims_context["auth_session"].id),
            "ret_period": "042026",
            "invdata": {"b2b": [{"ctin": "29ABCDE1234F1Z5"}]},
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["message"] == "IMS draft saved"
    assert response.data["data"]["action_batch"]["status"] == "submitted"
    assert response.data["data"]["action_batch"]["action_type"] == "save"
    assert response.data["data"]["action_batch"]["provider_transaction_id"] == "ims-int-save-001"
    assert captured["email"] == "otp@ims.example.com"
    assert captured["gstin"] == "29ABCDE1234K1Z7"
    assert captured["ret_period"] == "042026"
    assert captured["txn"] == "txn-ims-123"
    assert captured["state_code"] == "29"
    assert captured["gst_username"] == "KA_IMS_USER"
    assert captured["payload"]["rtin"] == "29ABCDE1234K1Z7"
    assert captured["payload"]["reqtyp"] == "SAVE"
    assert captured["payload"]["invdata"]["b2b"][0]["ctin"] == "29ABCDE1234F1Z5"
    batch = IMSActionBatch.objects.get(pk=response.data["data"]["action_batch"]["id"])
    assert batch.status == IMSActionBatch.BatchStatus.SUBMITTED
    assert batch.provider_transaction_id == "ims-int-save-001"
    assert batch.auth_session == ims_context["auth_session"]
    assert batch.request_payload_hash
    assert batch.request_payload["rtin"] == "29******1Z7"
    assert batch.response_payload["int_tran_id"] == "ims-int-save-001"
    assert AuditLog.objects.filter(action="ims.save_requested", entity_id=batch.id).exists()
    assert AuditLog.objects.filter(action="ims.save_submitted", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_ims_reset_failure_creates_failed_action_batch(ims_owner_client, ims_context, monkeypatch):
    from apps.integrations.whitebooks.exceptions import WhiteBooksTemporaryError

    def fake_ims_reset(self, **kwargs):
        raise WhiteBooksTemporaryError("IMS provider timeout.")

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.ims_reset", fake_ims_reset)

    response = ims_owner_client.post(
        "/api/v1/ims/reset/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "auth_session": str(ims_context["auth_session"].id),
            "ret_period": "042026",
            "invdata": {"b2b": []},
        },
        format="json",
    )

    assert response.status_code == 400
    batch = IMSActionBatch.objects.get()
    assert batch.action_type == IMSActionBatch.ActionType.RESET
    assert batch.status == IMSActionBatch.BatchStatus.FAILED
    assert batch.error_message == "IMS provider timeout."
    assert AuditLog.objects.filter(action="ims.reset_requested", entity_id=batch.id).exists()
    assert AuditLog.objects.filter(action="ims.reset_failed", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_owner_can_list_recent_ims_action_batches(ims_owner_client, ims_context):
    matching = IMSActionBatch.objects.create(
        workspace=ims_context["workspace"],
        client=ims_context["client"],
        gstin=ims_context["gstin"],
        auth_session=ims_context["auth_session"],
        action_type=IMSActionBatch.ActionType.SAVE,
        ret_period="042026",
        status=IMSActionBatch.BatchStatus.SUBMITTED,
        provider_transaction_id="ims-int-list-001",
        request_payload_hash="hash-list-001",
        created_by=ims_context["owner"],
        updated_by=ims_context["owner"],
        requested_by=ims_context["owner"],
    )
    IMSActionBatch.objects.create(
        workspace=ims_context["workspace"],
        client=ims_context["client"],
        gstin=ims_context["gstin"],
        action_type=IMSActionBatch.ActionType.RESET,
        ret_period="052026",
        status=IMSActionBatch.BatchStatus.SUBMITTED,
        created_by=ims_context["owner"],
        updated_by=ims_context["owner"],
    )

    response = ims_owner_client.get(
        "/api/v1/ims/action-batches/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "ret_period": "042026",
        },
    )

    assert response.status_code == 200
    assert len(response.data["data"]) == 1
    assert response.data["data"][0]["id"] == str(matching.id)
    assert response.data["data"][0]["provider_transaction_id"] == "ims-int-list-001"


@pytest.mark.django_db
def test_ims_save_blocks_duplicate_submitted_payload(ims_owner_client, ims_context, monkeypatch):
    provider_call_count = 0

    def fake_ims_save(self, **kwargs):
        nonlocal provider_call_count
        provider_call_count += 1
        return {"status_cd": "1", "message": "saved", "int_tran_id": f"ims-int-dup-{provider_call_count}"}

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.ims_save", fake_ims_save)

    payload = {
        "workspace": str(ims_context["workspace"].id),
        "client": str(ims_context["client"].id),
        "gstin": str(ims_context["gstin"].id),
        "auth_session": str(ims_context["auth_session"].id),
        "ret_period": "042026",
        "invdata": {"b2b": [{"ctin": "29ABCDE1234F1Z5"}]},
    }

    first_response = ims_owner_client.post("/api/v1/ims/save/", payload, format="json")
    second_response = ims_owner_client.post("/api/v1/ims/save/", payload, format="json")

    assert first_response.status_code == 200
    assert second_response.status_code == 400
    assert provider_call_count == 1
    assert IMSActionBatch.objects.count() == 1
    batch = IMSActionBatch.objects.get()
    assert AuditLog.objects.filter(action="ims.save_duplicate_blocked", entity_id=batch.id).exists()
    assert "allow_duplicate_action" in second_response.data["errors"]


@pytest.mark.django_db
def test_owner_can_retry_failed_ims_action_batch(ims_owner_client, ims_context, monkeypatch):
    captured = {}
    failed_batch = IMSActionBatch.objects.create(
        workspace=ims_context["workspace"],
        client=ims_context["client"],
        gstin=ims_context["gstin"],
        auth_session=ims_context["auth_session"],
        action_type=IMSActionBatch.ActionType.RESET,
        ret_period="042026",
        status=IMSActionBatch.BatchStatus.FAILED,
        request_payload_hash="failed-hash",
        request_payload={
            "rtin": "29******1Z7",
            "reqtyp": "RESET",
            "invdata": {"b2b": [{"ctin": "29******1Z5"}]},
        },
        error_message="IMS provider timeout.",
        created_by=ims_context["owner"],
        updated_by=ims_context["owner"],
        requested_by=ims_context["owner"],
    )

    def fake_ims_reset(self, **kwargs):
        captured.update(kwargs)
        return {"status_cd": "1", "message": "retried", "int_tran_id": "ims-int-retry-001"}

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.ims_reset", fake_ims_reset)

    response = ims_owner_client.post(
        f"/api/v1/ims/action-batches/{failed_batch.id}/retry/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "auth_session": str(ims_context["auth_session"].id),
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["action_batch"]["status"] == "submitted"
    assert response.data["data"]["action_batch"]["action_type"] == "reset"
    assert response.data["data"]["action_batch"]["provider_transaction_id"] == "ims-int-retry-001"
    assert captured["payload"]["rtin"] == "29ABCDE1234K1Z7"
    assert captured["payload"]["reqtyp"] == "RESET"
    assert captured["payload"]["invdata"]["b2b"][0]["ctin"] == "29******1Z5"
    assert IMSActionBatch.objects.count() == 2
    retry_batch = IMSActionBatch.objects.exclude(pk=failed_batch.id).get()
    assert retry_batch.status == IMSActionBatch.BatchStatus.SUBMITTED
    assert AuditLog.objects.filter(action="ims.reset_retry_requested", entity_id=failed_batch.id).exists()
    assert AuditLog.objects.filter(action="ims.reset_submitted", entity_id=retry_batch.id).exists()


@pytest.mark.django_db
def test_owner_can_refresh_ims_action_batch_status(ims_owner_client, ims_context, monkeypatch):
    captured = {}
    batch = IMSActionBatch.objects.create(
        workspace=ims_context["workspace"],
        client=ims_context["client"],
        gstin=ims_context["gstin"],
        auth_session=ims_context["auth_session"],
        action_type=IMSActionBatch.ActionType.SAVE,
        ret_period="042026",
        status=IMSActionBatch.BatchStatus.SUBMITTED,
        provider_transaction_id="ims-int-status-001",
        request_payload_hash="status-hash",
        response_payload={"status_cd": "1", "message": "saved"},
        created_by=ims_context["owner"],
        updated_by=ims_context["owner"],
        requested_by=ims_context["owner"],
    )

    def fake_ims_status(self, **kwargs):
        captured.update(kwargs)
        return {"status_cd": "1", "int_tran_id": "ims-int-status-001", "processing_status": "COMPLETED"}

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.ims_status", fake_ims_status)

    response = ims_owner_client.post(
        f"/api/v1/ims/action-batches/{batch.id}/status/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "auth_session": str(ims_context["auth_session"].id),
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["processing_status"] == "COMPLETED"
    assert response.data["data"]["action_batch"]["id"] == str(batch.id)
    assert captured["int_tran_id"] == "ims-int-status-001"
    batch.refresh_from_db()
    assert batch.response_payload["status_checks"][0]["payload"]["processing_status"] == "COMPLETED"
    assert batch.error_message == ""
    assert AuditLog.objects.filter(action="ims.batch_status_checked", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_viewer_cannot_save_ims_payload(ims_viewer_client, ims_context):
    response = ims_viewer_client.post(
        "/api/v1/ims/save/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "ret_period": "042026",
            "invdata": {"b2b": []},
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_viewer_can_fetch_ims_invoices_using_latest_auth_session(ims_viewer_client, ims_context, monkeypatch):
    captured = {}

    def fake_ims_invoices(self, **kwargs):
        captured.update(kwargs)
        return {"status_cd": "1", "invoices": [{"inum": "INV-001"}]}

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.ims_invoices", fake_ims_invoices)

    response = ims_viewer_client.get(
        "/api/v1/ims/invoices/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "section": "B2B",
            "status": "PENDING",
        },
    )

    assert response.status_code == 200
    assert response.data["data"]["invoices"][0]["inum"] == "INV-001"
    assert captured["email"] == "otp@ims.example.com"
    assert captured["txn"] == "txn-ims-123"
    assert captured["section"] == "B2B"
    assert captured["status"] == "PENDING"


@pytest.mark.django_db
def test_ims_status_rejects_stale_auth_session(ims_owner_client, ims_context):
    ims_context["auth_session"].verified_at = timezone.now() - timedelta(hours=7)
    ims_context["auth_session"].save(update_fields=["verified_at", "updated_at"])

    response = ims_owner_client.get(
        "/api/v1/ims/status/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "auth_session": str(ims_context["auth_session"].id),
            "int_tran_id": "ims-int-001",
        },
    )

    assert response.status_code == 400
    assert "older than" in response.data["errors"]["auth_session"][0]


@pytest.mark.django_db
def test_ims_save_rejects_gstin_from_another_client(ims_owner_client, ims_context):
    another_client = Client.objects.create(
        workspace=ims_context["workspace"],
        legal_name="Another IMS Client",
        trade_name="Another IMS Client",
        client_code="IMS002",
        pan="ABCDE1234L",
        email="another@ims.example.com",
        created_by=ims_context["owner"],
        updated_by=ims_context["owner"],
    )

    response = ims_owner_client.post(
        "/api/v1/ims/save/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(another_client.id),
            "gstin": str(ims_context["gstin"].id),
            "ret_period": "042026",
            "invdata": {"b2b": []},
            "txn": "manual-txn",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["errors"]["gstin"][0] == "GSTIN does not belong to the selected client."


@pytest.mark.django_db
def test_ims_supplier_invoices_rejects_invalid_return_period(ims_owner_client, ims_context):
    response = ims_owner_client.get(
        "/api/v1/ims/supplier-invoices/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "ret_period": "2026-04",
            "section": "B2B",
            "rtn_type": "GSTR1",
        },
    )

    assert response.status_code == 400
    assert response.data["errors"]["ret_period"][0] == "ret_period must use WhiteBooks MMYYYY format."


@pytest.mark.django_db
def test_ims_invoices_rejects_invalid_status_code(ims_viewer_client, ims_context):
    response = ims_viewer_client.get(
        "/api/v1/ims/invoices/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "section": "B2B",
            "status": "PROCESSING",
        },
    )

    assert response.status_code == 400
    assert "PROCESSING" in response.data["errors"]["status"][0]


@pytest.mark.django_db
def test_ims_invoice_count_rejects_invalid_goods_type(ims_viewer_client, ims_context):
    response = ims_viewer_client.get(
        "/api/v1/ims/invoices-count/",
        {
            "workspace": str(ims_context["workspace"].id),
            "client": str(ims_context["client"].id),
            "gstin": str(ims_context["gstin"].id),
            "goods_type": "BOTH",
        },
    )

    assert response.status_code == 400
    assert "BOTH" in response.data["errors"]["goods_type"][0]
