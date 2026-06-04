from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def reconciliation_api_client():
    return APIClient()


@pytest.fixture
def reconciliation_user(db):
    return User.objects.create_user(username="reviewer", email="reviewer@example.com", password="strong-pass-123")


@pytest.fixture
def reconciliation_authenticated_client(reconciliation_api_client, reconciliation_user):
    reconciliation_api_client.force_authenticate(user=reconciliation_user)
    return reconciliation_api_client


@pytest.fixture
def reconciliation_context(reconciliation_user):
    organization = Organization.objects.create(name="Recon Org", code="RECON", created_by=reconciliation_user, updated_by=reconciliation_user)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Recon Workspace",
        code="RECON-WS",
        created_by=reconciliation_user,
        updated_by=reconciliation_user,
    )
    WorkspaceMembership.objects.create(
        user=reconciliation_user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=reconciliation_user,
        updated_by=reconciliation_user,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Recon Client Pvt Ltd",
        trade_name="Recon Client",
        client_code="RECON001",
        pan="ABCDE1234R",
        created_by=reconciliation_user,
        updated_by=reconciliation_user,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234R1Z5",
        registration_type="regular",
        state_code="29",
        created_by=reconciliation_user,
        updated_by=reconciliation_user,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-3B",
        created_by=reconciliation_user,
        updated_by=reconciliation_user,
    )
    return {
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
        "user": reconciliation_user,
    }


def create_transaction(
    *,
    context,
    transaction_type,
    reference_number,
    transaction_date="2026-04-15",
    counterparty_gstin="29ABCDE1234F1Z5",
    counterparty_name="Vendor One",
    taxable_value="1000.00",
    cgst_amount="90.00",
    sgst_amount="90.00",
    igst_amount="0.00",
    cess_amount="0.00",
    total_amount="1180.00",
):
    return GSTTransaction.objects.create(
        workspace=context["workspace"],
        client=context["client"],
        gstin=context["gstin"],
        compliance_period=context["compliance_period"],
        transaction_type=transaction_type,
        document_type="invoice",
        reference_number=reference_number,
        transaction_date=transaction_date,
        counterparty_gstin=counterparty_gstin,
        counterparty_name=counterparty_name,
        taxable_value=Decimal(taxable_value),
        cgst_amount=Decimal(cgst_amount),
        sgst_amount=Decimal(sgst_amount),
        igst_amount=Decimal(igst_amount),
        cess_amount=Decimal(cess_amount),
        tax_amount=Decimal(cgst_amount) + Decimal(sgst_amount) + Decimal(igst_amount) + Decimal(cess_amount),
        total_amount=Decimal(total_amount),
        created_by=context["user"],
        updated_by=context["user"],
    )


def run_payload(context):
    return {
        "workspace": str(context["workspace"].id),
        "client": str(context["client"].id),
        "gstin": str(context["gstin"].id),
        "compliance_period": str(context["compliance_period"].id),
        "run_type": "gstr_2b_purchase",
    }


@pytest.mark.django_db
def test_exact_match(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-001")
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV 001")

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    assert response.status_code == 201
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    item = run.items.get()
    assert item.match_status == ReconciliationItem.MatchStatus.MATCHED
    assert run.matched_count == 1


@pytest.mark.django_db
def test_partial_match_due_to_amount_difference(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-002", total_amount="1180.00")
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV-002", total_amount="1180.80")

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    item = run.items.get()
    assert item.match_status == ReconciliationItem.MatchStatus.PARTIAL_MATCH
    assert run.partial_match_count == 1


@pytest.mark.django_db
def test_missing_in_portal(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-003")

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    item = run.items.get()
    assert item.match_status == ReconciliationItem.MatchStatus.MISSING_IN_PORTAL
    assert item.mismatch_reason == ReconciliationItem.MismatchReason.MISSING_IN_PORTAL
    assert run.missing_in_portal_count == 1


@pytest.mark.django_db
def test_missing_in_books(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV-004")

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    item = run.items.get()
    assert item.match_status == ReconciliationItem.MatchStatus.MISSING_IN_BOOKS
    assert item.mismatch_reason == ReconciliationItem.MismatchReason.MISSING_IN_BOOKS
    assert run.missing_in_books_count == 1


@pytest.mark.django_db
def test_duplicate_in_books(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-005")
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV/005")

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    assert run.items.count() == 2
    assert run.items.filter(match_status=ReconciliationItem.MatchStatus.DUPLICATE_IN_BOOKS).count() == 2
    assert run.duplicate_count == 2


@pytest.mark.django_db
def test_duplicate_in_portal(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV-006")
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV 006")

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    assert run.items.filter(match_status=ReconciliationItem.MatchStatus.DUPLICATE_IN_PORTAL).count() == 2


@pytest.mark.django_db
def test_item_action_update(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-007")
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV-007", total_amount="1300.00")
    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    item = run.items.get()

    patch_response = reconciliation_authenticated_client.patch(
        f"/api/v1/reconciliation/items/{item.id}/",
        {"action_status": "resolved", "remarks": "Reviewed with vendor"},
        format="json",
    )
    assert patch_response.status_code == 200
    item.refresh_from_db()
    assert item.action_status == ReconciliationItem.ActionStatus.RESOLVED
    assert AuditLog.objects.filter(action="reconciliation_item.resolved", entity_id=item.id).exists()


@pytest.mark.django_db
def test_run_summary_counts(reconciliation_authenticated_client, reconciliation_context):
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-008")
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV-008")
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-009", total_amount="1180.00")
    create_transaction(context=reconciliation_context, transaction_type="gstr_2b", reference_number="INV-009", total_amount="1180.50")
    create_transaction(context=reconciliation_context, transaction_type="purchase", reference_number="INV-010")
    create_transaction(
        context=reconciliation_context,
        transaction_type="gstr_2b",
        reference_number="INV-011",
        transaction_date="2026-04-16",
    )

    response = reconciliation_authenticated_client.post("/api/v1/reconciliation/runs/", run_payload(reconciliation_context), format="json")
    assert response.status_code == 201
    run = ReconciliationRun.objects.get(pk=response.data["data"]["id"])
    assert run.matched_count == 1
    assert run.partial_match_count == 1
    assert run.missing_in_portal_count == 1
    assert run.missing_in_books_count == 1
    assert run.total_itc_at_risk > Decimal("0.00")
