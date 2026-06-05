from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def returns_api_client():
    return APIClient()


@pytest.fixture
def returns_user(db):
    return User.objects.create_user(username="filer", email="filer@example.com", password="strong-pass-123")


@pytest.fixture
def returns_authenticated_client(returns_api_client, returns_user):
    returns_api_client.force_authenticate(user=returns_user)
    return returns_api_client


@pytest.fixture
def returns_context(returns_user):
    organization = Organization.objects.create(name="Returns Org", code="RETORG", created_by=returns_user, updated_by=returns_user)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Returns Workspace",
        code="RET-WS",
        created_by=returns_user,
        updated_by=returns_user,
    )
    WorkspaceMembership.objects.create(
        user=returns_user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=returns_user,
        updated_by=returns_user,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Returns Client Pvt Ltd",
        trade_name="Returns Client",
        client_code="RET001",
        pan="ABCDE1234T",
        created_by=returns_user,
        updated_by=returns_user,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234T1Z5",
        registration_type="regular",
        state_code="29",
        created_by=returns_user,
        updated_by=returns_user,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-3B",
        created_by=returns_user,
        updated_by=returns_user,
    )
    return {
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
        "user": returns_user,
    }


def create_transaction(
    *,
    context,
    transaction_type,
    reference_number,
    counterparty_gstin="29ABCDE9999F1Z5",
    counterparty_name="Vendor One",
    taxable_value="1000.00",
    cgst_amount="90.00",
    sgst_amount="90.00",
    igst_amount="0.00",
    cess_amount="0.00",
    total_amount="1180.00",
    metadata=None,
):
    return GSTTransaction.objects.create(
        workspace=context["workspace"],
        client=context["client"],
        gstin=context["gstin"],
        compliance_period=context["compliance_period"],
        transaction_type=transaction_type,
        document_type="invoice",
        reference_number=reference_number,
        transaction_date="2026-04-15",
        counterparty_gstin=counterparty_gstin,
        counterparty_name=counterparty_name,
        taxable_value=Decimal(taxable_value),
        cgst_amount=Decimal(cgst_amount),
        sgst_amount=Decimal(sgst_amount),
        igst_amount=Decimal(igst_amount),
        cess_amount=Decimal(cess_amount),
        tax_amount=Decimal(cgst_amount) + Decimal(sgst_amount) + Decimal(igst_amount) + Decimal(cess_amount),
        total_amount=Decimal(total_amount),
        metadata=metadata or {},
        created_by=context["user"],
        updated_by=context["user"],
    )


def create_reconciliation_run_with_items(*, context):
    run = ReconciliationRun.objects.create(
        workspace=context["workspace"],
        client=context["client"],
        gstin=context["gstin"],
        compliance_period=context["compliance_period"],
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        matched_count=1,
        partial_match_count=1,
        missing_in_portal_count=1,
        created_by=context["user"],
        updated_by=context["user"],
    )
    matched_books = create_transaction(context=context, transaction_type="purchase", reference_number="P-001")
    matched_portal = create_transaction(context=context, transaction_type="gstr_2b", reference_number="P-001")
    at_risk_books = create_transaction(context=context, transaction_type="purchase", reference_number="P-002")
    at_risk_portal = create_transaction(context=context, transaction_type="gstr_2b", reference_number="P-002", total_amount="1300.00")
    deferred_portal = create_transaction(context=context, transaction_type="gstr_2b", reference_number="P-003", total_amount="1250.00")

    ReconciliationItem.objects.create(
        reconciliation_run=run,
        books_transaction=matched_books,
        portal_transaction=matched_portal,
        match_status=ReconciliationItem.MatchStatus.MATCHED,
        action_status=ReconciliationItem.ActionStatus.OPEN,
        created_by=context["user"],
        updated_by=context["user"],
    )
    ReconciliationItem.objects.create(
        reconciliation_run=run,
        books_transaction=at_risk_books,
        portal_transaction=at_risk_portal,
        match_status=ReconciliationItem.MatchStatus.PARTIAL_MATCH,
        mismatch_reason=ReconciliationItem.MismatchReason.TOTAL_AMOUNT_MISMATCH,
        action_status=ReconciliationItem.ActionStatus.OPEN,
        created_by=context["user"],
        updated_by=context["user"],
    )
    ReconciliationItem.objects.create(
        reconciliation_run=run,
        portal_transaction=deferred_portal,
        match_status=ReconciliationItem.MatchStatus.MISSING_IN_BOOKS,
        mismatch_reason=ReconciliationItem.MismatchReason.MISSING_IN_BOOKS,
        action_status=ReconciliationItem.ActionStatus.DEFERRED,
        created_by=context["user"],
        updated_by=context["user"],
    )
    return run


def prepare_payload(context, return_type):
    return {
        "workspace": str(context["workspace"].id),
        "client": str(context["client"].id),
        "gstin": str(context["gstin"].id),
        "compliance_period": str(context["compliance_period"].id),
        "return_type": return_type,
    }


@pytest.mark.django_db
def test_gstr1_summary(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-001", counterparty_gstin="29ABCDE1234F1Z5")
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-002", counterparty_gstin="")
    create_transaction(context=returns_context, transaction_type="credit_note", reference_number="CN-001", total_amount="590.00", taxable_value="500.00", cgst_amount="45.00", sgst_amount="45.00")
    create_transaction(context=returns_context, transaction_type="debit_note", reference_number="DN-001", total_amount="708.00", taxable_value="600.00", cgst_amount="54.00", sgst_amount="54.00")
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="S-EXC-001",
        counterparty_gstin="29ABCDE1234F1Z5",
        metadata={
            "period_exception": {
                "allowed": True,
                "reason": "Late-reported invoice accepted after review.",
                "category": "late_reported_invoice",
                "selected_period": returns_context["compliance_period"].period,
            }
        },
    )

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    outward = prepared.summary_snapshot["outward_supplies"]
    assert outward["b2b_taxable_value"] == "2000.00"
    assert outward["b2c_taxable_value"] == "1000.00"
    assert outward["credit_note_tax_amount"] == "90.00"
    assert outward["debit_note_tax_amount"] == "108.00"
    assert outward["document_count"] == 5
    assert prepared.summary_snapshot["period_exceptions"]["count"] == 1
    assert prepared.summary_snapshot["period_exceptions"]["documents"][0]["document_number"] == "S-EXC-001"


@pytest.mark.django_db
def test_gstr3b_summary(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-001", taxable_value="5000.00", cgst_amount="450.00", sgst_amount="450.00", total_amount="5900.00")
    create_transaction(
        context=returns_context,
        transaction_type="purchase",
        reference_number="P-EXC-001",
        metadata={
            "period_exception": {
                "allowed": True,
                "reason": "Supplier filed in later month.",
                "category": "gstr_2b_timing_difference",
                "selected_period": returns_context["compliance_period"].period,
            }
        },
    )
    create_reconciliation_run_with_items(context=returns_context)

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    itc_summary = prepared.summary_snapshot["itc_summary"]
    assert itc_summary["eligible_itc"] == "180.00"
    assert itc_summary["itc_at_risk"] == "180.00"
    assert itc_summary["deferred_blocked_itc"] == "180.00"
    assert itc_summary["unresolved_mismatch_count"] == 1
    assert itc_summary["net_tax_payable"] == "720.00"
    assert prepared.summary_snapshot["period_exceptions"]["count"] == 1
    assert prepared.summary_snapshot["period_exceptions"]["documents"][0]["document_number"] == "P-EXC-001"


@pytest.mark.django_db
def test_approve_flow(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-100")
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    prepared_id = prepare_response.data["data"]["id"]

    approve_response = returns_authenticated_client.post(f"/api/v1/returns/{prepared_id}/approve/", {}, format="json")
    assert approve_response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=prepared_id)
    assert prepared.status == ReturnPreparation.PreparationStatus.APPROVED
    assert prepared.approved_by == returns_context["user"]
    assert AuditLog.objects.filter(action="return_preparation.approved", entity_id=prepared.id).exists()


@pytest.mark.django_db
def test_mark_filed_flow(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-101")
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    prepared_id = prepare_response.data["data"]["id"]
    returns_authenticated_client.post(f"/api/v1/returns/{prepared_id}/approve/", {}, format="json")

    filed_response = returns_authenticated_client.post(
        f"/api/v1/returns/{prepared_id}/mark-filed/",
        {"arn": "ARN1234567890"},
        format="json",
    )
    assert filed_response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=prepared_id)
    assert prepared.status == ReturnPreparation.PreparationStatus.FILED
    assert prepared.arn == "ARN1234567890"
    assert prepared.filed_by == returns_context["user"]
    assert prepared.filed_at is not None


@pytest.mark.django_db
def test_invalid_status_transitions(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-102")
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    prepared_id = prepare_response.data["data"]["id"]

    filed_response = returns_authenticated_client.post(
        f"/api/v1/returns/{prepared_id}/mark-filed/",
        {"arn": "ARN-BAD"},
        format="json",
    )
    assert filed_response.status_code == 400

    prepared = ReturnPreparation.objects.get(pk=prepared_id)
    prepared.status = ReturnPreparation.PreparationStatus.DRAFT
    prepared.save(update_fields=["status"])

    approve_response = returns_authenticated_client.post(f"/api/v1/returns/{prepared_id}/approve/", {}, format="json")
    assert approve_response.status_code == 400


@pytest.mark.django_db
def test_return_audit_logs_created(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-103")
    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    prepared_id = response.data["data"]["id"]

    assert AuditLog.objects.filter(action="return_preparation.prepared", entity_id=prepared_id).exists()

    returns_authenticated_client.post(f"/api/v1/returns/{prepared_id}/approve/", {}, format="json")
    returns_authenticated_client.post(f"/api/v1/returns/{prepared_id}/mark-filed/", {"arn": "ARN456"}, format="json")

    assert AuditLog.objects.filter(action="return_preparation.filed", entity_id=prepared_id).exists()


@pytest.mark.django_db
def test_return_readiness_blocks_gstr1_when_sales_missing(returns_authenticated_client, returns_context):
    response = returns_authenticated_client.get(
        "/api/v1/returns/readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["gstr1"]["status"] == "blocked"
    assert any(issue["code"] == "missing_sales_transactions" for issue in payload["gstr1"]["issues"])


@pytest.mark.django_db
def test_return_readiness_warns_for_missing_filing_metadata(returns_authenticated_client, returns_context):
    transaction = create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="S-500",
    )
    response = returns_authenticated_client.get(
        "/api/v1/returns/readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["gstr1"]["status"] == "ready_with_warnings"
    issue_codes = {issue["code"] for issue in payload["gstr1"]["issues"]}
    assert {"missing_hsn", "missing_uqc", "missing_quantity", "missing_supply_category"}.issubset(issue_codes)
    missing_hsn_issue = next(issue for issue in payload["gstr1"]["issues"] if issue["code"] == "missing_hsn")
    assert str(transaction.id) in missing_hsn_issue["transaction_ids"]
    assert missing_hsn_issue["suggested_fix"]["mode"] == "bulk_correct"
    assert "hsn_code" in missing_hsn_issue["suggested_fix"]["fields"]
    missing_quantity_issue = next(issue for issue in payload["gstr1"]["issues"] if issue["code"] == "missing_quantity")
    assert missing_quantity_issue["suggested_fix"]["mode"] == "row_review"
    assert "quantity" in missing_quantity_issue["suggested_fix"]["fields"]


@pytest.mark.django_db
def test_return_readiness_warns_for_gstr3b_reconciliation_gaps(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="S-600",
        taxable_value="5000.00",
        cgst_amount="450.00",
        sgst_amount="450.00",
        total_amount="5900.00",
    )
    create_transaction(context=returns_context, transaction_type="purchase", reference_number="P-600")
    create_transaction(context=returns_context, transaction_type="gstr_2b", reference_number="2B-600")
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert prepare_response.status_code == 200
    create_reconciliation_run_with_items(context=returns_context)

    response = returns_authenticated_client.get(
        "/api/v1/returns/readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["gstr3b"]["status"] == "ready_with_warnings"
    issue_codes = {issue["code"] for issue in payload["gstr3b"]["issues"]}
    assert "unresolved_reconciliation_items" in issue_codes
    assert "itc_at_risk" in issue_codes
    unresolved_issue = next(issue for issue in payload["gstr3b"]["issues"] if issue["code"] == "unresolved_reconciliation_items")
    assert unresolved_issue["suggested_fix"]["mode"] == "row_review"


@pytest.mark.django_db
def test_return_readiness_blocks_locked_period(returns_authenticated_client, returns_context):
    returns_context["compliance_period"].is_locked = True
    returns_context["compliance_period"].save(update_fields=["is_locked"])
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-700")

    response = returns_authenticated_client.get(
        "/api/v1/returns/readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["gstr1"]["status"] == "blocked"
    assert any(issue["code"] == "period_locked" for issue in payload["gstr1"]["issues"])


@pytest.mark.django_db
@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "test-returns-cache",
            "TIMEOUT": 60,
            "KEY_PREFIX": "gst-compliance-test",
        }
    },
    CACHE_RETURN_READINESS_SECONDS=60,
)
def test_return_readiness_uses_shared_cache(returns_authenticated_client, returns_context):
    cache.clear()
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-CACHE-001")
    params = {
        "workspace": str(returns_context["workspace"].id),
        "client": str(returns_context["client"].id),
        "gstin": str(returns_context["gstin"].id),
        "compliance_period": str(returns_context["compliance_period"].id),
    }

    with CaptureQueriesContext(connection) as first_queries:
        first_response = returns_authenticated_client.get("/api/v1/returns/readiness/", params)

    with CaptureQueriesContext(connection) as second_queries:
        second_response = returns_authenticated_client.get("/api/v1/returns/readiness/", params)

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert len(second_queries) < len(first_queries)
    assert len(second_queries) <= 5
