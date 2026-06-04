import io

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch, ImportRowError, ImportTemplate
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.organizations.models import Organization
from apps.reconciliation.models import ReconciliationRun
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def import_api_client():
    return APIClient()


@pytest.fixture
def import_user(db):
    return User.objects.create_user(username="importer", email="importer@example.com", password="strong-pass-123")


@pytest.fixture
def import_authenticated_client(import_api_client, import_user):
    client = APIClient()
    client.force_authenticate(user=import_user)
    return client


@pytest.fixture
def import_accountant_user(db):
    return User.objects.create_user(username="importacct", email="importacct@example.com", password="strong-pass-123")


@pytest.fixture
def import_accountant_client(import_api_client, import_accountant_user):
    client = APIClient()
    client.force_authenticate(user=import_accountant_user)
    return client


@pytest.fixture
def import_context(import_user):
    organization = Organization.objects.create(name="Import Org", code="IMPO", created_by=import_user, updated_by=import_user)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Import Workspace",
        code="IMPORT-WS",
        created_by=import_user,
        updated_by=import_user,
    )
    WorkspaceMembership.objects.create(
        user=import_user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=import_user,
        updated_by=import_user,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Import Client Pvt Ltd",
        trade_name="Import Client",
        client_code="IMPORT001",
        pan="ABCDE1234L",
        email="import-client@example.com",
        created_by=import_user,
        updated_by=import_user,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234L1Z9",
        registration_type="regular",
        state_code="29",
        created_by=import_user,
        updated_by=import_user,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-3B",
        created_by=import_user,
        updated_by=import_user,
    )
    return {
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
    }


@pytest.fixture
def import_context_with_accountant(import_context, import_accountant_user):
    WorkspaceMembership.objects.create(
        user=import_accountant_user,
        workspace=import_context["workspace"],
        role=WorkspaceRole.ACCOUNTANT,
        created_by=import_accountant_user,
        updated_by=import_accountant_user,
    )
    return import_context


def build_csv_file(name, content):
    return SimpleUploadedFile(name, content.encode("utf-8"), content_type="text/csv")


def build_xlsx_file(name, rows):
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return SimpleUploadedFile(
        name,
        buffer.read(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def upload_payload(context, **overrides):
    payload = {
        "workspace": str(context["workspace"].id),
        "client": str(context["client"].id),
        "gstin": str(context["gstin"].id),
        "compliance_period": str(context["compliance_period"].id),
        "import_type": "purchase",
        "source_type": "csv",
    }
    payload.update(overrides)
    return payload


def provider_fetch_payload(context, **overrides):
    payload = {
        "workspace": str(context["workspace"].id),
        "client": str(context["client"].id),
        "gstin": str(context["gstin"].id),
        "compliance_period": str(context["compliance_period"].id),
        "provider": "whitebooks",
    }
    payload.update(overrides)
    return payload


@pytest.mark.django_db
def test_csv_upload_success(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-apr.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-001,2026-04-14,29ABCDE1234F1Z5,Vendor One,1000,90,90,0,0,1180\n",
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    assert response.status_code == 201
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.status == ImportBatch.BatchStatus.PROCESSED
    assert batch.total_rows == 1
    assert batch.valid_rows == 1
    assert batch.invalid_rows == 0
    transaction = GSTTransaction.objects.get(import_batch=batch)
    assert transaction.reference_number == "INV-001"
    assert AuditLog.objects.filter(action="import.uploaded", entity_id=batch.id).exists()
    assert AuditLog.objects.filter(action="import.processing_started", entity_id=batch.id).exists()
    assert AuditLog.objects.filter(action="import.processed", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_xlsx_upload_success(import_authenticated_client, import_context):
    file = build_xlsx_file(
        "gstr2b-apr.xlsx",
        [
            ["invoice_number", "invoice_date", "supplier_gstin", "supplier_name", "taxable_amt", "igst_amount", "total"],
            ["2B-001", "2026-04-20", "29ABCDE1234F1Z5", "Vendor Two", 2500, 450, 2950],
        ],
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, import_type="gstr_2b", source_type="excel", file=file),
        format="multipart",
    )
    assert response.status_code == 201
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.status == ImportBatch.BatchStatus.PROCESSED
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 1


@pytest.mark.django_db
def test_invalid_row_creates_import_row_error(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-invalid.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-002,,29ABCDE1234F1Z5,,oops,90,90,0,0,1180\n",
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    assert response.status_code == 201
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.invalid_rows == 1
    assert batch.valid_rows == 0
    assert ImportRowError.objects.filter(import_batch=batch, field_name="document_date").exists()
    assert ImportRowError.objects.filter(import_batch=batch, severity=ImportRowError.Severity.WARNING).exists()


@pytest.mark.django_db
def test_row_correction_reprocesses_batch_and_creates_transaction(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-correctable.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-002,,29ABCDE1234F1Z5,,oops,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 0

    correction_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/row-corrections/",
        {
            "row_number": 2,
            "raw_row": {
                "invoice_no": "INV-002",
                "invoice_date": "2026-04-15",
                "supplier_gstin": "29ABCDE1234F1Z5",
                "supplier_name": "Vendor Corrected",
                "taxable_value": "1000",
                "cgst": "90",
                "sgst": "90",
                "igst": "0",
                "cess": "0",
                "total_amount": "1180",
            },
        },
        format="json",
    )

    assert correction_response.status_code == 200
    batch.refresh_from_db()
    assert batch.status == ImportBatch.BatchStatus.CORRECTED
    assert batch.valid_rows == 1
    assert batch.invalid_rows == 0
    assert batch.corrected_by_id is not None
    assert batch.source_metadata["manual_row_overrides"]["2"]["supplier_name"] == "Vendor Corrected"
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 1
    assert ImportRowError.objects.filter(import_batch=batch, severity=ImportRowError.Severity.ERROR).count() == 0
    assert AuditLog.objects.filter(action="import.row_corrected", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_row_correction_invalidates_reconciliation_and_blocks_returns(import_authenticated_client, import_context, import_user):
    file = build_csv_file(
        "purchase-correctable-recon.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-003,,29ABCDE1234F1Z5,Vendor Recon,oops,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    reconciliation_run = ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )
    return_prep = ReturnPreparation.objects.create(
        compliance_period=import_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.DRAFT,
        summary_snapshot={},
        created_by=import_user,
        updated_by=import_user,
    )

    correction_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/row-corrections/",
        {
            "row_number": 2,
            "raw_row": {
                "invoice_no": "INV-003",
                "invoice_date": "2026-04-18",
                "supplier_gstin": "29ABCDE1234F1Z5",
                "supplier_name": "Vendor Recon",
                "taxable_value": "1000",
                "cgst": "90",
                "sgst": "90",
                "igst": "0",
                "cess": "0",
                "total_amount": "1180",
            },
        },
        format="json",
    )

    assert correction_response.status_code == 200
    reconciliation_run.refresh_from_db()
    return_prep.refresh_from_db()
    assert reconciliation_run.is_stale is True
    assert reconciliation_run.invalidation_reason == "source_import_modified"
    assert return_prep.is_blocked_by_stale_reconciliation is True
    assert return_prep.status == ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION
    assert AuditLog.objects.filter(action="import.downstream_invalidated", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_row_discard_reprocesses_batch_and_clears_row_errors(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-discardable.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-004,,29ABCDE1234F1Z5,Vendor Discard,oops,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    assert batch.invalid_rows == 1

    discard_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/row-discards/",
        {"row_number": 2},
        format="json",
    )

    assert discard_response.status_code == 200
    batch.refresh_from_db()
    assert batch.status == ImportBatch.BatchStatus.CORRECTED
    assert batch.total_rows == 0
    assert batch.valid_rows == 0
    assert batch.invalid_rows == 0
    assert batch.source_metadata["discarded_rows"] == ["2"]
    assert ImportRowError.objects.filter(import_batch=batch).count() == 0
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 0
    assert AuditLog.objects.filter(action="import.row_discarded", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_row_discard_invalidates_reconciliation_and_blocks_returns(import_authenticated_client, import_context, import_user):
    file = build_csv_file(
        "purchase-discard-recon.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-005,2026-04-21,29ABCDE1234F1Z5,Vendor Discard Recon,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    reconciliation_run = ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )
    return_prep = ReturnPreparation.objects.create(
        compliance_period=import_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.DRAFT,
        summary_snapshot={},
        created_by=import_user,
        updated_by=import_user,
    )

    discard_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/row-discards/",
        {"row_number": 2},
        format="json",
    )

    assert discard_response.status_code == 200
    reconciliation_run.refresh_from_db()
    return_prep.refresh_from_db()
    assert reconciliation_run.is_stale is True
    assert return_prep.is_blocked_by_stale_reconciliation is True
    assert return_prep.status == ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION


@pytest.mark.django_db
def test_batch_discard_clears_operational_output(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-discard-batch.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-006,2026-04-21,29ABCDE1234F1Z5,Vendor Batch Discard,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 1

    discard_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/discard/",
        {"confirm": True},
        format="json",
    )

    assert discard_response.status_code == 200
    batch.refresh_from_db()
    assert batch.status == ImportBatch.BatchStatus.DISCARDED
    assert batch.total_rows == 0
    assert batch.valid_rows == 0
    assert batch.invalid_rows == 0
    assert batch.processed_rows == 0
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 0
    assert ImportRowError.objects.filter(import_batch=batch).count() == 0
    assert AuditLog.objects.filter(action="import.batch_discarded", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_batch_discard_invalidates_reconciliation_and_blocks_returns(import_authenticated_client, import_context, import_user):
    file = build_csv_file(
        "purchase-discard-batch-recon.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-007,2026-04-21,29ABCDE1234F1Z5,Vendor Batch Discard Recon,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    reconciliation_run = ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )
    return_prep = ReturnPreparation.objects.create(
        compliance_period=import_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.DRAFT,
        summary_snapshot={},
        created_by=import_user,
        updated_by=import_user,
    )

    discard_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/discard/",
        {"confirm": True},
        format="json",
    )

    assert discard_response.status_code == 200
    reconciliation_run.refresh_from_db()
    return_prep.refresh_from_db()
    assert reconciliation_run.is_stale is True
    assert return_prep.is_blocked_by_stale_reconciliation is True
    assert return_prep.status == ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION


@pytest.mark.django_db
def test_batch_replacement_creates_superseding_version(import_authenticated_client, import_context):
    original_file = build_csv_file(
        "purchase-replace-original.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-008,2026-04-21,29ABCDE1234F1Z5,Vendor Replace Original,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=original_file),
        format="multipart",
    )
    original_batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    replacement_file = build_csv_file(
        "purchase-replace-corrected.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-008,2026-04-22,29ABCDE1234F1Z5,Vendor Replace Corrected,1200,108,108,0,0,1416\n",
    )

    replace_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{original_batch.id}/replace/",
        {"file": replacement_file},
        format="multipart",
    )

    assert replace_response.status_code == 201
    replacement_batch = ImportBatch.objects.get(pk=replace_response.data["data"]["id"])
    original_batch.refresh_from_db()
    assert original_batch.status == ImportBatch.BatchStatus.SUPERSEDED
    assert original_batch.superseded_by_id == replacement_batch.id
    assert replacement_batch.supersedes_batch_id == original_batch.id
    assert GSTTransaction.objects.filter(import_batch=original_batch).count() == 0
    assert GSTTransaction.objects.filter(import_batch=replacement_batch).count() == 1
    assert AuditLog.objects.filter(action="import.batch_replaced", entity_id=replacement_batch.id).exists()


@pytest.mark.django_db
def test_batch_replacement_invalidates_reconciliation_and_blocks_returns(import_authenticated_client, import_context, import_user):
    original_file = build_csv_file(
        "purchase-replace-recon.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-009,2026-04-21,29ABCDE1234F1Z5,Vendor Replace Recon,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=original_file),
        format="multipart",
    )
    original_batch = ImportBatch.objects.get(pk=create_response.data["data"]["id"])
    reconciliation_run = ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )
    return_prep = ReturnPreparation.objects.create(
        compliance_period=import_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.DRAFT,
        summary_snapshot={},
        created_by=import_user,
        updated_by=import_user,
    )
    replacement_file = build_csv_file(
        "purchase-replace-recon-corrected.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-009,2026-04-23,29ABCDE1234F1Z5,Vendor Replace Recon Updated,1400,126,126,0,0,1652\n",
    )

    replace_response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{original_batch.id}/replace/",
        {"file": replacement_file},
        format="multipart",
    )

    assert replace_response.status_code == 201
    original_batch.refresh_from_db()
    reconciliation_run.refresh_from_db()
    return_prep.refresh_from_db()
    assert original_batch.status == ImportBatch.BatchStatus.SUPERSEDED
    assert reconciliation_run.is_stale is True
    assert return_prep.is_blocked_by_stale_reconciliation is True
    assert return_prep.status == ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION


@pytest.mark.django_db
def test_batch_reprocess_rebuilds_batch_and_invalidates_downstream(import_authenticated_client, import_context, import_user):
    upload_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(
            import_context,
            file=build_csv_file(
                "purchase-reprocess.csv",
                "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
                "INV-010,2026-04-23,29ABCDE1234F1Z5,Vendor Reprocess,1000,90,90,0,0,1180\n",
            ),
        ),
        format="multipart",
    )
    batch = ImportBatch.objects.get(pk=upload_response.data["data"]["id"])
    reconciliation_run = ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )
    return_prep = ReturnPreparation.objects.create(
        compliance_period=import_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.DRAFT,
        summary_snapshot={},
        created_by=import_user,
        updated_by=import_user,
    )

    response = import_authenticated_client.post(
        f"/api/v1/imports/batches/{batch.id}/reprocess/",
        {"confirm": True},
        format="json",
    )

    assert response.status_code == 200
    batch.refresh_from_db()
    reconciliation_run.refresh_from_db()
    return_prep.refresh_from_db()
    assert batch.status in {ImportBatch.BatchStatus.PROCESSED, ImportBatch.BatchStatus.CORRECTED}
    assert batch.corrected_by_id == import_user.id
    assert GSTTransaction.objects.filter(import_batch=batch).count() == 1
    assert reconciliation_run.is_stale is True
    assert return_prep.is_blocked_by_stale_reconciliation is True
    assert AuditLog.objects.filter(action="import.batch_reprocessed", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_duplicate_document_number_detection(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-duplicates.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-003,2026-04-15,29ABCDE1234F1Z5,Vendor One,1000,90,90,0,0,1180\n"
        "INV-003,2026-04-16,29ABCDE1234F1Z5,Vendor One,1500,135,135,0,0,1770\n",
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    assert response.status_code == 201
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.total_rows == 2
    assert batch.valid_rows == 1
    assert batch.invalid_rows == 1
    assert ImportRowError.objects.filter(import_batch=batch, error_code="duplicate_in_file").exists()
    assert ImportRowError.objects.filter(import_batch=batch, error_code="conflicting_document_context").exists()


@pytest.mark.django_db
def test_multiline_invoice_rows_aggregate_into_single_transaction(import_authenticated_client, import_context):
    file = build_csv_file(
        "sales-multiline.csv",
        "invoice_no,invoice_date,recipient_gstin,counterparty_name,taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,total_amount,hsn_code,description,uqc,quantity\n"
        "S-2001,2026-04-21,29ABCDE1234F1Z5,Customer One,1000,90,90,0,0,1180,7203,Steel Goods,KGS,25\n"
        "S-2001,2026-04-21,29ABCDE1234F1Z5,Customer One,500,45,45,0,0,590,7306,Pipes,KGS,10\n",
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, import_type="sales", file=file),
        format="multipart",
    )
    assert response.status_code == 201
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.total_rows == 2
    assert batch.valid_rows == 2
    assert batch.invalid_rows == 0

    transactions = GSTTransaction.objects.filter(import_batch=batch)
    assert transactions.count() == 1
    transaction = transactions.get()
    assert transaction.reference_number == "S-2001"
    assert transaction.taxable_value == 1500
    assert transaction.cgst_amount == 135
    assert transaction.sgst_amount == 135
    assert transaction.total_amount == 1770
    assert transaction.metadata["aggregated_line_count"] == 2
    assert transaction.metadata["source_rows"] == [2, 3]
    assert len(transaction.metadata["line_items"]) == 2
    assert transaction.metadata["line_items"][0]["hsn_code"] == "7203"
    assert transaction.metadata["line_items"][1]["hsn_code"] == "7306"


@pytest.mark.django_db
def test_fetch_gstr2b_from_provider_creates_import_batch_and_transactions(import_authenticated_client, import_context, import_user, monkeypatch):
    ProviderAuthSession.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="platform@example.com",
        txn="txn-2b-001",
        status=ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
        response_contract_confirmed=True,
        created_by=import_user,
        updated_by=import_user,
        initiated_by=import_user,
        verified_by=import_user,
    )

    monkeypatch.setattr(
        WhiteBooksClient,
        "generate_gstr2b",
        lambda self, **kwargs: {"status_cd": "1", "data": {"int_tran_id": "int-2b-001"}},
    )
    monkeypatch.setattr(
        WhiteBooksClient,
        "get_gstr2b_generate_status",
        lambda self, **kwargs: {"status_cd": "1", "data": {"filenum": "file-2b-001"}},
    )
    monkeypatch.setattr(
        WhiteBooksClient,
        "fetch_gstr2b_all",
        lambda self, **kwargs: {
            "status_cd": "1",
            "data": {
                "b2b": [
                    {
                        "ctin": "29ABCDE1234F1Z5",
                        "cname": "Vendor Two",
                        "inv": [
                            {
                                "inum": "2B-INV-001",
                                "idt": "20/04/2026",
                                "val": "2950.00",
                                "pos": "29",
                                "rchrg": "N",
                                "itms": [
                                    {
                                        "num": 1,
                                        "itm_det": {
                                            "txval": "2500.00",
                                            "iamt": "450.00",
                                            "camt": "0.00",
                                            "samt": "0.00",
                                            "csamt": "0.00",
                                        },
                                    }
                                ],
                            }
                        ],
                    }
                ]
            },
        },
    )

    response = import_authenticated_client.post(
        "/api/v1/imports/batches/fetch-gstr2b/",
        provider_fetch_payload(import_context),
        format="json",
    )

    assert response.status_code == 200
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.source_type == ImportBatch.SourceType.PROVIDER
    assert batch.status == ImportBatch.BatchStatus.PROCESSED
    assert batch.source_metadata["provider"] == "whitebooks"
    assert batch.source_metadata["fetch_status"] == "fetched"
    assert batch.source_metadata["normalized_rows"] == "[PURGED_AFTER_PROCESSING]"
    assert batch.total_rows == 1
    assert batch.valid_rows + batch.invalid_rows == 1
    assert AuditLog.objects.filter(action="import.provider_fetch_requested", entity_id=batch.id).exists()
    assert AuditLog.objects.filter(action="import.provider_fetch_completed", entity_id=batch.id).exists()


@pytest.mark.django_db
def test_fetch_gstr2b_requires_verified_provider_auth_session(import_authenticated_client, import_context):
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/fetch-gstr2b/",
        provider_fetch_payload(import_context),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["errors"]["gstin"] == "A verified provider auth session is required before GSTR-2B can be fetched automatically."


@pytest.mark.django_db
def test_import_captures_enriched_metadata_for_returns(import_authenticated_client, import_context):
    file = build_csv_file(
        "sales-enriched.csv",
        "invoice_no,invoice_date,recipient_gstin,counterparty_name,taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,total_amount,hsn_code,description,uqc,quantity,is_service,supply_category,ecommerce_gstin\n"
        "S-1001,2026-04-21,29ABCDE1234F1Z5,Customer One,1000,90,90,0,0,1180,7203,Steel Goods,KGS,25,false,taxable,29ECOM1234F1Z5\n",
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, import_type="sales", file=file),
        format="multipart",
    )
    assert response.status_code == 201
    batch = ImportBatch.objects.get(pk=response.data["data"]["id"])
    transaction = GSTTransaction.objects.get(import_batch=batch)
    assert transaction.metadata["hsn_code"] == "7203"
    assert transaction.metadata["description"] == "Steel Goods"
    assert transaction.metadata["uqc"] == "KGS"
    assert transaction.metadata["quantity"] == "25"
    assert transaction.metadata["supply_category"] == "taxable"
    assert transaction.metadata["ecommerce_gstin"] == "29ECOM1234F1Z5"
    assert transaction.metadata["line_items"][0]["hsn_code"] == "7203"
    assert transaction.metadata["line_items"][0]["quantity"] == "25"


@pytest.mark.django_db
def test_import_list_detail_error_and_transaction_apis(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-history.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-004,2026-04-21,29ABCDE1234F1Z5,Vendor History,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]

    list_response = import_authenticated_client.get(f"/api/v1/imports/batches/?client={import_context['client'].id}")
    assert list_response.status_code == 200
    assert list_response.data["pagination"]["count"] >= 1

    detail_response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/")
    assert detail_response.status_code == 200
    assert detail_response.data["data"]["transaction_count"] == 1

    errors_response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/errors/")
    assert errors_response.status_code == 200
    assert errors_response.data["pagination"]["count"] == 0

    transaction_response = import_authenticated_client.get(
        f"/api/v1/gst-transactions/?client={import_context['client'].id}&source_import_batch={batch_id}"
    )
    assert transaction_response.status_code == 200
    assert transaction_response.data["pagination"]["count"] == 1


@pytest.mark.django_db
def test_import_correction_policy_without_downstream_dependencies(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-policy.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-100,2026-04-21,29ABCDE1234F1Z5,Vendor Policy,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]

    response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/correction-policy/")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["lifecycle_state"] == ImportBatch.BatchStatus.PROCESSED
    assert data["can_edit_rows"] is True
    assert data["can_discard_batch"] is True
    assert data["requires_reconciliation_rerun"] is False
    assert data["is_locked_by_filing"] is False


@pytest.mark.django_db
def test_import_correction_policy_marks_reconciliation_as_downstream_dependency(import_authenticated_client, import_context, import_user):
    file = build_csv_file(
        "purchase-policy-recon.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-101,2026-04-21,29ABCDE1234F1Z5,Vendor Recon,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]
    ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )

    response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/correction-policy/")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["requires_reconciliation_rerun"] is True
    assert data["affected_reconciliation_runs"] == 1
    assert "reconciliation" in data["warning_message"].lower()
    assert data["next_required_action"]


@pytest.mark.django_db
def test_import_correction_policy_requires_elevated_role_after_approval(import_authenticated_client, import_accountant_client, import_context_with_accountant, import_user):
    file = build_csv_file(
        "purchase-policy-approved.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-102,2026-04-21,29ABCDE1234F1Z5,Vendor Approved,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context_with_accountant, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]
    ReturnPreparation.objects.create(
        compliance_period=import_context_with_accountant["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.APPROVED,
        summary_snapshot={},
        approved_by=import_user,
        created_by=import_user,
        updated_by=import_user,
    )

    response = import_accountant_client.get(f"/api/v1/imports/batches/{batch_id}/correction-policy/")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["requires_elevated_role"] is True
    assert data["can_edit_rows"] is False
    assert "elevated" in data["warning_message"].lower()


@pytest.mark.django_db
def test_import_correction_policy_locks_batch_when_return_is_filed(import_authenticated_client, import_context, import_user):
    file = build_csv_file(
        "purchase-policy-filed.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-103,2026-04-21,29ABCDE1234F1Z5,Vendor Filed,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]
    ReturnPreparation.objects.create(
        compliance_period=import_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.FILED,
        summary_snapshot={},
        filed_by=import_user,
        created_by=import_user,
        updated_by=import_user,
    )

    response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/correction-policy/")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["is_locked_by_filing"] is True
    assert data["can_edit_rows"] is False
    assert data["can_replace_file"] is False


@pytest.mark.django_db
def test_import_impact_summary_surfaces_allowed_actions(import_authenticated_client, import_context):
    file = build_csv_file(
        "purchase-impact.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-104,2026-04-21,29ABCDE1234F1Z5,Vendor Impact,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]

    response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/impact-summary/")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["summary_title"]
    assert data["severity"] == "success"
    assert any(action["key"] == "edit_rows" and action["allowed"] for action in data["actions"])
    assert any(action["key"] == "replace_file" and action["allowed"] for action in data["actions"])


@pytest.mark.django_db
def test_import_impact_summary_warns_about_reconciliation_rerun(import_authenticated_client, import_context, import_user):
    file = build_csv_file(
        "purchase-impact-recon.csv",
        "invoice_no,invoice_date,supplier_gstin,supplier_name,taxable_value,cgst,sgst,igst,cess,total_amount\n"
        "INV-105,2026-04-21,29ABCDE1234F1Z5,Vendor Impact Recon,1000,90,90,0,0,1180\n",
    )
    create_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file),
        format="multipart",
    )
    batch_id = create_response.data["data"]["id"]
    ReconciliationRun.objects.create(
        workspace=import_context["workspace"],
        client=import_context["client"],
        gstin=import_context["gstin"],
        compliance_period=import_context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=import_user,
        updated_by=import_user,
    )

    response = import_authenticated_client.get(f"/api/v1/imports/batches/{batch_id}/impact-summary/")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["severity"] == "warning"
    assert data["affected_reconciliation_runs"] == 1
    assert "rerun" in data["summary_message"].lower()


@pytest.mark.django_db
def test_import_type_must_match_filename_hint(import_authenticated_client, import_context):
    file = build_csv_file(
        "sales-register-apr.csv",
        "invoice_no,invoice_date,recipient_gstin,counterparty_name,taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,total_amount\n"
        "S-001,2026-04-21,29ABCDE1234F1Z5,Customer One,1000,90,90,0,0,1180\n",
    )
    response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, import_type="purchase", file=file),
        format="multipart",
    )
    assert response.status_code == 400
    assert "looks like sales data" in response.data["errors"]["import_type"][0].lower()


@pytest.mark.django_db
def test_import_template_crud_and_template_based_upload(import_authenticated_client, import_context):
    template_response = import_authenticated_client.post(
        "/api/v1/import-templates/",
        {
            "workspace": str(import_context["workspace"].id),
            "name": "Vendor purchase mapping",
            "import_type": "purchase",
            "source_type": "csv",
            "is_default": True,
            "column_mapping": {
                "document_number": "bill_ref",
                "document_date": "bill_dt",
                "counterparty_gstin": "vendor_gstin",
                "counterparty_name": "vendor_name",
                "taxable_value": "base_value",
                "cgst_amount": "cgst_val",
                "sgst_amount": "sgst_val",
                "total_amount": "gross_total",
            },
        },
        format="json",
    )
    assert template_response.status_code == 201
    template_id = template_response.data["data"]["id"]
    assert AuditLog.objects.filter(action="import_template.created").exists()

    update_response = import_authenticated_client.patch(
        f"/api/v1/import-templates/{template_id}/",
        {"name": "Vendor purchase mapping v2"},
        format="json",
    )
    assert update_response.status_code == 200
    assert AuditLog.objects.filter(action="import_template.updated").exists()

    file = build_csv_file(
        "vendor-template.csv",
        "bill_ref,bill_dt,vendor_gstin,vendor_name,base_value,cgst_val,sgst_val,gross_total\n"
        "TPL-001,2026-04-22,29ABCDE1234F1Z5,Template Vendor,5000,450,450,5900\n",
    )
    upload_response = import_authenticated_client.post(
        "/api/v1/imports/batches/",
        upload_payload(import_context, file=file, import_template=template_id),
        format="multipart",
    )
    assert upload_response.status_code == 201
    batch = ImportBatch.objects.get(pk=upload_response.data["data"]["id"])
    transaction = GSTTransaction.objects.get(import_batch=batch)
    assert transaction.reference_number == "TPL-001"
    assert transaction.counterparty_name == "Template Vendor"

    delete_response = import_authenticated_client.delete(f"/api/v1/import-templates/{template_id}/")
    assert delete_response.status_code == 200
    assert ImportTemplate.objects.get(pk=template_id).is_active is False
    assert AuditLog.objects.filter(action="import_template.deleted").exists()
