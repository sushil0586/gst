from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import PortalChallanRequest, PortalLedgerSnapshot, ReturnPreparation
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
    document_type="invoice",
    counterparty_gstin="29ABCDE9999F1Z5",
    counterparty_name="Vendor One",
    taxable_value="1000.00",
    cgst_amount="90.00",
    sgst_amount="90.00",
    igst_amount="0.00",
    cess_amount="0.00",
    total_amount="1180.00",
    place_of_supply="29",
    transaction_date="2026-04-15",
    metadata=None,
    compliance_period=None,
):
    return GSTTransaction.objects.create(
        workspace=context["workspace"],
        client=context["client"],
        gstin=context["gstin"],
        compliance_period=compliance_period or context["compliance_period"],
        transaction_type=transaction_type,
        document_type=document_type,
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
        place_of_supply=place_of_supply,
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
        itc_ready_count=1,
        itc_pending_review_count=1,
        itc_blocked_count=1,
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
        itc_status=ReconciliationItem.ITCStatus.ITC_READY,
        review_decision=ReconciliationItem.ReviewDecision.AUTO,
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
        itc_status=ReconciliationItem.ITCStatus.ITC_PENDING_REVIEW,
        review_decision=ReconciliationItem.ReviewDecision.AUTO,
        action_status=ReconciliationItem.ActionStatus.OPEN,
        created_by=context["user"],
        updated_by=context["user"],
    )
    ReconciliationItem.objects.create(
        reconciliation_run=run,
        portal_transaction=deferred_portal,
        match_status=ReconciliationItem.MatchStatus.MISSING_IN_BOOKS,
        mismatch_reason=ReconciliationItem.MismatchReason.MISSING_IN_BOOKS,
        itc_status=ReconciliationItem.ITCStatus.ITC_BLOCKED,
        review_decision=ReconciliationItem.ReviewDecision.AUTO,
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


def create_ready_whitebooks_auth_session(*, context, txn="txn-ledger-001"):
    return ProviderAuthSession.objects.create(
        workspace=context["workspace"],
        client=context["client"],
        gstin=context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn=txn,
        status=ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
        response_contract_confirmed=True,
        verified_at=timezone.now(),
        initiated_by=context["user"],
        verified_by=context["user"],
        created_by=context["user"],
        updated_by=context["user"],
    )


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
    sections = prepared.summary_snapshot["sections"]
    assert outward["b2b_taxable_value"] == "2000.00"
    assert outward["b2c_taxable_value"] == "1000.00"
    assert outward["credit_note_tax_amount"] == "90.00"
    assert outward["debit_note_tax_amount"] == "108.00"
    assert outward["document_count"] == 5
    assert prepared.summary_snapshot["summary_version"] == "gstr1.sectioned.v1"
    assert set(sections.keys()) == {
        "b2b",
        "b2cl",
        "b2cs",
        "cdnr",
        "cdnur",
        "advances_received",
        "advances_adjusted",
        "exports",
        "amendments",
        "ecommerce",
        "nil_exempt_non_gst",
        "hsn_summary",
        "documents_issued",
    }
    assert sections["b2b"]["document_count"] == 2
    assert sections["b2b"]["taxable_value"] == "2000.00"
    assert sections["b2cl"]["document_count"] == 0
    assert sections["b2cs"]["document_count"] == 1
    assert sections["cdnr"]["document_count"] == 2
    assert sections["cdnur"]["document_count"] == 0
    assert sections["advances_received"]["row_count"] == 0
    assert sections["advances_adjusted"]["row_count"] == 0
    assert sections["exports"]["row_count"] == 0
    assert sections["amendments"]["row_count"] == 0
    assert sections["ecommerce"]["row_count"] == 0
    assert sections["hsn_summary"]["row_count"] >= 1
    assert sections["documents_issued"]["row_count"] == 3
    assert prepared.summary_snapshot["period_exceptions"]["count"] == 1


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_LEDGER_READS=False, WHITEBOOKS_ENABLE_PAYMENT_READS=False)
def test_portal_filing_readiness_reports_blockers_when_ledger_reads_are_disabled(returns_authenticated_client, returns_context):
    response = returns_authenticated_client.get(
        "/api/v1/returns/portal-filing-readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["portal_sync"]["enabled"] is False
    assert payload["portal_sync"]["can_fetch"] is False
    assert "WhiteBooks ledger reads are not enabled" in payload["portal_sync"]["blockers"][0]
    assert payload["auth_session"]["available"] is False


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_LEDGER_READS=True, WHITEBOOKS_ENABLE_PAYMENT_READS=True)
def test_portal_filing_readiness_fetches_balance_and_taxpayable(monkeypatch, returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-001")
    create_transaction(context=returns_context, transaction_type="purchase", reference_number="P-001")
    create_reconciliation_run_with_items(context=returns_context)
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert prepare_response.status_code == 200
    create_ready_whitebooks_auth_session(context=returns_context, txn="txn-ledger-live")

    from apps.integrations.whitebooks.client import WhiteBooksClient

    def mock_balance(self, **kwargs):
        assert kwargs["ret_period"] == "042026"
        assert kwargs["gstin"] == returns_context["gstin"].gstin
        return {"status_cd": "1", "status_desc": "Success", "balances": {"cash": 1200, "itc": 450}}

    def mock_taxpayable(self, **kwargs):
        assert kwargs["return_type"] == "GSTR3B"
        return {"status_cd": "1", "status_desc": "Success", "tax_payable": {"net": 720}}

    def mock_cash_ledger(self, **kwargs):
        assert kwargs["from_date"] == "01-04-2026"
        assert kwargs["to_date"] == "30-04-2026"
        return {
            "status_cd": "1",
            "status_desc": "Success",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 1200, "cgstbal": {"tot": 300}, "sgstbal": {"tot": 300}, "igstbal": {"tot": 600}, "cessbal": {"tot": 0}},
                "cl_bal": {"tot_rng_bal": 1800, "cgstbal": {"tot": 450}, "sgstbal": {"tot": 450}, "igstbal": {"tot": 900}, "cessbal": {"tot": 0}},
                "tr": [{"ref": "CH-001"}],
            },
        }

    def mock_itc_ledger(self, **kwargs):
        assert kwargs["from_date"] == "01-04-2026"
        assert kwargs["to_date"] == "30-04-2026"
        return {
            "status_cd": "1",
            "status_desc": "Success",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 500},
                "cl_bal": {"tot_rng_bal": 650},
                "tr": [{"ref": "ITC-001"}, {"ref": "ITC-002"}],
            },
        }

    def mock_liability_ledger(self, **kwargs):
        assert kwargs["from_date"] == "01-04-2026"
        assert kwargs["to_date"] == "30-04-2026"
        return {
            "status_cd": "1",
            "status_desc": "Success",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 300},
                "cl_bal": {"tot_rng_bal": 420},
                "tr": [{"ref": "LIAB-001"}],
            },
        }

    def mock_challan_history(self, **kwargs):
        assert kwargs["from_date"] == "01-04-2026"
        assert kwargs["to_date"] == "30-04-2026"
        return {"status_cd": "1", "status_desc": "Success", "challans": [{"cpin": "CPIN-042026-001", "amount": 720}]}

    def mock_challan_summary(self, **kwargs):
        assert kwargs["cpin"] == "CPIN-042026-001"
        return {"status_cd": "1", "status_desc": "Success", "challan": {"cpin": "CPIN-042026-001", "payment_status": "PAID"}}

    monkeypatch.setattr(WhiteBooksClient, "get_cash_itc_balance", mock_balance)
    monkeypatch.setattr(WhiteBooksClient, "get_tax_payable_balance", mock_taxpayable)
    monkeypatch.setattr(WhiteBooksClient, "get_cash_ledger_details", mock_cash_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_itc_ledger_details", mock_itc_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_liability_ledger_details", mock_liability_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_challan_history", mock_challan_history)
    monkeypatch.setattr(WhiteBooksClient, "get_challan_summary", mock_challan_summary)

    response = returns_authenticated_client.get(
        "/api/v1/returns/portal-filing-readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["portal_sync"]["enabled"] is True
    assert payload["portal_sync"]["payment_reads_enabled"] is True
    assert payload["portal_sync"]["can_fetch"] is True
    assert payload["auth_session"]["available"] is True
    assert payload["computed_summary"]["prepared_return_status"] == "ready_for_review"
    assert payload["provider_evidence"]["source"] == "live_fetch"
    assert payload["provider_evidence"]["balance_response"]["balances"]["cash"] == 1200
    assert payload["provider_evidence"]["taxpayable_response"]["tax_payable"]["net"] == 720
    assert payload["provider_evidence"]["cash_ledger_response"]["data"]["cl_bal"]["tot_rng_bal"] == 1800
    assert payload["provider_evidence"]["cash_ledger_summary"]["opening_total"] == "1200.00"
    assert payload["provider_evidence"]["cash_ledger_summary"]["closing_total"] == "1800.00"
    assert payload["provider_evidence"]["cash_ledger_summary"]["transaction_count"] == 1
    assert payload["provider_evidence"]["itc_ledger_response"]["data"]["cl_bal"]["tot_rng_bal"] == 650
    assert payload["provider_evidence"]["itc_ledger_summary"]["transaction_count"] == 2
    assert payload["provider_evidence"]["liability_ledger_response"]["data"]["cl_bal"]["tot_rng_bal"] == 420
    assert payload["provider_evidence"]["liability_ledger_summary"]["closing_total"] == "420.00"
    assert payload["provider_evidence"]["challan_reference"] == "CPIN-042026-001"
    assert payload["provider_evidence"]["challan_history_response"]["challans"][0]["cpin"] == "CPIN-042026-001"
    assert payload["provider_evidence"]["challan_summary_response"]["challan"]["payment_status"] == "PAID"
    snapshot = PortalLedgerSnapshot.objects.get(compliance_period=returns_context["compliance_period"], return_type="gstr3b")
    assert snapshot.balance_response["balances"]["cash"] == 1200
    assert snapshot.taxpayable_response["tax_payable"]["net"] == 720
    assert snapshot.cash_ledger_response["data"]["cl_bal"]["tot_rng_bal"] == 1800
    assert snapshot.itc_ledger_response["data"]["cl_bal"]["tot_rng_bal"] == 650
    assert snapshot.liability_ledger_response["data"]["cl_bal"]["tot_rng_bal"] == 420
    assert snapshot.challan_reference == "CPIN-042026-001"
    assert snapshot.challan_summary_response["challan"]["payment_status"] == "PAID"
    assert payload["provider_evidence"]["snapshot_id"] == str(snapshot.id)


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_LEDGER_READS=True, WHITEBOOKS_ENABLE_PAYMENT_READS=True)
def test_portal_filing_readiness_keeps_other_ledgers_when_taxpayable_fails(
    monkeypatch,
    returns_authenticated_client,
    returns_context,
):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-001")
    create_transaction(context=returns_context, transaction_type="purchase", reference_number="P-001")
    create_reconciliation_run_with_items(context=returns_context)
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert prepare_response.status_code == 200
    create_ready_whitebooks_auth_session(context=returns_context, txn="txn-ledger-partial")

    from apps.integrations.whitebooks.client import WhiteBooksClient
    from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError

    def mock_balance(self, **kwargs):
        return {"status_cd": "1", "status_desc": "Success", "balances": {"cash": 1200, "itc": 450}}

    def mock_taxpayable(self, **kwargs):
        raise WhiteBooksSubmissionError("LG9010: Invalid Return Type")

    def mock_cash_ledger(self, **kwargs):
        return {
            "status_cd": "1",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 1000, "cgstbal": {"tot": 250}, "sgstbal": {"tot": 250}, "igstbal": {"tot": 500}, "cessbal": {"tot": 0}},
                "cl_bal": {"tot_rng_bal": 1300, "cgstbal": {"tot": 325}, "sgstbal": {"tot": 325}, "igstbal": {"tot": 650}, "cessbal": {"tot": 0}},
                "tr": [],
            },
        }

    def mock_itc_ledger(self, **kwargs):
        return {"status_cd": "1", "data": {"fr_dt": "01/04/2026", "to_dt": "30/04/2026", "op_bal": {"tot_rng_bal": 200}, "cl_bal": {"tot_rng_bal": 240}, "tr": []}}

    def mock_liability_ledger(self, **kwargs):
        return {"status_cd": "1", "data": {"fr_dt": "01/04/2026", "to_dt": "30/04/2026", "op_bal": {"tot_rng_bal": 300}, "cl_bal": {"tot_rng_bal": 420}, "tr": []}}

    def mock_challan_history(self, **kwargs):
        return {"status_cd": "1", "challans": [{"cpin": "CPIN-042026-001"}]}

    def mock_challan_summary(self, **kwargs):
        return {"status_cd": "1", "challan": {"cpin": "CPIN-042026-001", "payment_status": "PAID"}}

    monkeypatch.setattr(WhiteBooksClient, "get_cash_itc_balance", mock_balance)
    monkeypatch.setattr(WhiteBooksClient, "get_tax_payable_balance", mock_taxpayable)
    monkeypatch.setattr(WhiteBooksClient, "get_cash_ledger_details", mock_cash_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_itc_ledger_details", mock_itc_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_liability_ledger_details", mock_liability_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_challan_history", mock_challan_history)
    monkeypatch.setattr(WhiteBooksClient, "get_challan_summary", mock_challan_summary)

    response = returns_authenticated_client.get(
        "/api/v1/returns/portal-filing-readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["provider_evidence"]["source"] == "live_fetch"
    assert payload["provider_evidence"]["balance_response"]["balances"]["cash"] == 1200
    assert payload["provider_evidence"]["taxpayable_response"] is None
    assert payload["provider_evidence"]["cash_ledger_summary"]["closing_total"] == "1300.00"
    assert payload["provider_evidence"]["itc_ledger_summary"]["closing_total"] == "240.00"
    assert payload["provider_evidence"]["liability_ledger_summary"]["closing_total"] == "420.00"
    assert "Portal tax payable evidence could not be fetched right now." in payload["portal_sync"]["warnings"]
    assert "taxpayable: LG9010: Invalid Return Type" in payload["portal_sync"]["transport_error"]


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_LEDGER_READS=True, WHITEBOOKS_ENABLE_PAYMENT_READS=True)
def test_portal_filing_readiness_sanitizes_provider_null_characters(
    monkeypatch,
    returns_authenticated_client,
    returns_context,
):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-001")
    create_transaction(context=returns_context, transaction_type="purchase", reference_number="P-001")
    create_reconciliation_run_with_items(context=returns_context)
    prepare_response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert prepare_response.status_code == 200
    create_ready_whitebooks_auth_session(context=returns_context, txn="txn-ledger-null-char")

    from apps.integrations.whitebooks.client import WhiteBooksClient

    def mock_balance(self, **kwargs):
        return {"status_cd": "1", "status_desc": "Success", "balances": {"cash": 1200, "itc": 450}}

    def mock_taxpayable(self, **kwargs):
        return {"status_cd": "1", "status_desc": "Success", "tax_payable": {"net": 720}}

    def mock_cash_ledger(self, **kwargs):
        return {"status_cd": "1", "data": {"fr_dt": "01/04/2026", "to_dt": "30/04/2026", "op_bal": {"tot_rng_bal": 1000}, "cl_bal": {"tot_rng_bal": 1300}, "tr": []}}

    def mock_itc_ledger(self, **kwargs):
        return {"status_cd": "1", "data": {"fr_dt": "01/04/2026", "to_dt": "30/04/2026", "op_bal": {"tot_rng_bal": 200}, "cl_bal": {"tot_rng_bal": 240}, "tr": []}}

    def mock_liability_ledger(self, **kwargs):
        return {"status_cd": "1", "data": {"fr_dt": "01/04/2026", "to_dt": "30/04/2026", "op_bal": {"tot_rng_bal": 300}, "cl_bal": {"tot_rng_bal": 420}, "tr": []}}

    def mock_challan_history(self, **kwargs):
        return {"status_cd": "1", "challans": [{"cpin": "CPIN-042026-001"}]}

    def mock_challan_summary(self, **kwargs):
        return {"data": {"status": "\x00PENDING", "cpin": "CPIN-042026-001"}, "status_cd": "1"}

    monkeypatch.setattr(WhiteBooksClient, "get_cash_itc_balance", mock_balance)
    monkeypatch.setattr(WhiteBooksClient, "get_tax_payable_balance", mock_taxpayable)
    monkeypatch.setattr(WhiteBooksClient, "get_cash_ledger_details", mock_cash_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_itc_ledger_details", mock_itc_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_liability_ledger_details", mock_liability_ledger)
    monkeypatch.setattr(WhiteBooksClient, "get_challan_history", mock_challan_history)
    monkeypatch.setattr(WhiteBooksClient, "get_challan_summary", mock_challan_summary)

    response = returns_authenticated_client.get(
        "/api/v1/returns/portal-filing-readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["provider_evidence"]["challan_summary_response"]["data"]["status"] == "PENDING"
    snapshot = PortalLedgerSnapshot.objects.get(compliance_period=returns_context["compliance_period"], return_type="gstr3b")
    assert snapshot.challan_summary_response["data"]["status"] == "PENDING"


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_LEDGER_READS=False, WHITEBOOKS_ENABLE_PAYMENT_READS=False)
def test_portal_filing_readiness_uses_latest_saved_snapshot_when_live_fetch_is_unavailable(
    returns_authenticated_client,
    returns_context,
):
    prepared_return = ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={
            "outward_supplies": {"outward_tax_liability": "1500.00"},
            "itc_summary": {"eligible_itc": "500.00", "net_tax_payable": "1000.00"},
        },
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    snapshot = PortalLedgerSnapshot.objects.create(
        compliance_period=returns_context["compliance_period"],
        prepared_return=prepared_return,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type="gstr3b",
        fetched_at=timezone.now(),
        computed_summary={
            "prepared_return_id": str(prepared_return.id),
            "prepared_return_status": "ready_for_review",
            "outward_tax_liability": "1500.00",
            "eligible_itc": "500.00",
            "net_tax_payable": "1000.00",
        },
        balance_response={"status_cd": "1", "balances": {"cash": 900}},
        taxpayable_response={"status_cd": "1", "tax_payable": {"net": 640}},
        cash_ledger_response={
            "status_cd": "1",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 1000, "cgstbal": {"tot": 250}, "sgstbal": {"tot": 250}, "igstbal": {"tot": 500}, "cessbal": {"tot": 0}},
                "cl_bal": {"tot_rng_bal": 1300, "cgstbal": {"tot": 325}, "sgstbal": {"tot": 325}, "igstbal": {"tot": 650}, "cessbal": {"tot": 0}},
                "tr": [],
            },
        },
        itc_ledger_response={
            "status_cd": "1",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 200},
                "cl_bal": {"tot_rng_bal": 240},
                "tr": [{"ref": "ITC-SAVED-001"}],
            },
        },
        liability_ledger_response={
            "status_cd": "1",
            "data": {
                "fr_dt": "01/04/2026",
                "to_dt": "30/04/2026",
                "op_bal": {"tot_rng_bal": 700},
                "cl_bal": {"tot_rng_bal": 880},
                "tr": [],
            },
        },
        challan_reference="CPIN-SAVED-001",
        challan_history_response={"challans": [{"cpin": "CPIN-SAVED-001"}]},
        challan_summary_response={"challan": {"cpin": "CPIN-SAVED-001", "payment_status": "PENDING"}},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )

    response = returns_authenticated_client.get(
        "/api/v1/returns/portal-filing-readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
        },
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["portal_sync"]["enabled"] is False
    assert payload["portal_sync"]["payment_reads_enabled"] is False
    assert payload["provider_evidence"]["source"] == "saved_snapshot"
    assert payload["provider_evidence"]["snapshot_id"] == str(snapshot.id)
    assert payload["provider_evidence"]["balance_response"]["balances"]["cash"] == 900
    assert payload["provider_evidence"]["taxpayable_response"]["tax_payable"]["net"] == 640
    assert payload["provider_evidence"]["cash_ledger_summary"]["closing_total"] == "1300.00"
    assert payload["provider_evidence"]["itc_ledger_summary"]["closing_total"] == "240.00"
    assert payload["provider_evidence"]["liability_ledger_summary"]["closing_total"] == "880.00"
    assert payload["provider_evidence"]["challan_reference"] == "CPIN-SAVED-001"
    assert payload["provider_evidence"]["challan_summary_response"]["challan"]["payment_status"] == "PENDING"


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_CHALLAN_GENERATION=True)
def test_generate_portal_challan_creates_request_and_audit_log(monkeypatch, returns_authenticated_client, returns_context):
    prepared_return = ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    create_ready_whitebooks_auth_session(context=returns_context, txn="txn-challan-001")

    from apps.integrations.whitebooks.client import WhiteBooksClient

    def mock_generate_challan(self, **kwargs):
        assert kwargs["txn"] == "txn-challan-001"
        assert kwargs["gstin"] == returns_context["gstin"].gstin
        assert kwargs["ret_period"] == "042026"
        assert kwargs["payload"]["payment_mod"] == "OTC"
        assert kwargs["payload"]["chln_rsn"] == "RET3B"
        assert kwargs["payload"]["cgst_tax_amt"] == 250
        assert kwargs["payload"]["igst_tax_amt"] == 500
        return {"status_cd": "1", "status_desc": "Success", "cpin": "CPIN-NEW-001"}

    monkeypatch.setattr(WhiteBooksClient, "generate_challan", mock_generate_challan)

    response = returns_authenticated_client.post(
        "/api/v1/returns/generate-portal-challan/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
            "challan_reason": "RET3B",
            "payment_mode": "OTC",
            "bank_code": "ICIC",
            "sub_payment_mode": "CQ",
            "mobile_number": "9876543210",
            "address": "123 Example Street, Bengaluru",
            "cgst_tax_amount": "250.00",
            "igst_tax_amount": "500.00",
            "sgst_tax_amount": "250.00",
            "cess_tax_amount": "0.00",
        },
        format="json",
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["status"] == "submitted"
    assert payload["cpin"] == "CPIN-NEW-001"
    request_record = PortalChallanRequest.objects.get(pk=payload["id"])
    assert request_record.prepared_return == prepared_return
    assert request_record.total_amount == Decimal("1000.00")
    assert AuditLog.objects.filter(action="portal_challan.requested", entity_id=request_record.id).exists()
    assert AuditLog.objects.filter(action="portal_challan.generated", entity_id=request_record.id).exists()


@pytest.mark.django_db
def test_portal_challan_requests_lists_recent_requests(returns_authenticated_client, returns_context):
    prepared_return = ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    auth_session = create_ready_whitebooks_auth_session(context=returns_context, txn="txn-challan-list")
    PortalChallanRequest.objects.create(
        compliance_period=returns_context["compliance_period"],
        prepared_return=prepared_return,
        auth_session=auth_session,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type="gstr3b",
        status=PortalChallanRequest.RequestStatus.SUBMITTED,
        cpin="CPIN-LIST-001",
        challan_reason="RET3B",
        challan_period="042026",
        payment_mode="OTC",
        bank_code="ICIC",
        sub_payment_mode="CQ",
        taxpayer_name=returns_context["client"].legal_name,
        address="123 Test Road",
        mobile_number="9876543210",
        request_payload={"total_amt": 1200},
        response_payload={"cpin": "CPIN-LIST-001"},
        total_amount=Decimal("1200.00"),
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )

    response = returns_authenticated_client.get(
        "/api/v1/returns/portal-challan-requests/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
        },
    )
    assert response.status_code == 200
    items = response.data["data"]
    assert len(items) == 1
    assert items[0]["cpin"] == "CPIN-LIST-001"
    assert items[0]["status"] == "submitted"


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_CHALLAN_GENERATION=True)
def test_validate_portal_challan_returns_valid_true_on_success(monkeypatch, returns_authenticated_client, returns_context):
    ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    create_ready_whitebooks_auth_session(context=returns_context, txn="txn-challan-validate")

    from apps.integrations.whitebooks.client import WhiteBooksClient

    def mock_validate_challan_reason(self, **kwargs):
        assert kwargs["ret_period"] == "042026"
        assert kwargs["payload"]["chln_rsn"] == "RET3B"
        return {"status_cd": "1", "status_desc": "Validated"}

    monkeypatch.setattr(WhiteBooksClient, "validate_challan_reason", mock_validate_challan_reason)

    response = returns_authenticated_client.post(
        "/api/v1/returns/validate-portal-challan/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
            "challan_reason": "RET3B",
            "payment_mode": "OTC",
            "bank_code": "ICIC",
            "sub_payment_mode": "CQ",
            "mobile_number": "9876543210",
            "address": "123 Example Street, Bengaluru",
            "cgst_tax_amount": "250.00",
            "igst_tax_amount": "500.00",
            "sgst_tax_amount": "250.00",
            "cess_tax_amount": "0.00",
        },
        format="json",
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["valid"] is True
    assert payload["computed_total_amount"] == "1000.00"
    assert AuditLog.objects.filter(action="portal_challan.validated").exists()


@pytest.mark.django_db
@override_settings(WHITEBOOKS_ENABLE_CHALLAN_GENERATION=True)
def test_validate_portal_challan_returns_valid_false_on_submission_error(monkeypatch, returns_authenticated_client, returns_context):
    ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type="gstr3b",
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    create_ready_whitebooks_auth_session(context=returns_context, txn="txn-challan-validate-fail")

    from apps.integrations.whitebooks.client import WhiteBooksClient
    from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError

    def mock_validate_challan_reason(self, **kwargs):
        raise WhiteBooksSubmissionError("Invalid challan reason for the selected period.")

    monkeypatch.setattr(WhiteBooksClient, "validate_challan_reason", mock_validate_challan_reason)

    response = returns_authenticated_client.post(
        "/api/v1/returns/validate-portal-challan/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
            "return_type": "gstr3b",
            "challan_reason": "BADCODE",
            "payment_mode": "OTC",
            "bank_code": "ICIC",
            "sub_payment_mode": "CQ",
            "mobile_number": "9876543210",
            "address": "123 Example Street, Bengaluru",
            "cgst_tax_amount": "250.00",
            "igst_tax_amount": "500.00",
            "sgst_tax_amount": "250.00",
            "cess_tax_amount": "0.00",
        },
        format="json",
    )
    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["valid"] is False
    assert "Invalid challan reason" in payload["error_message"]
    assert AuditLog.objects.filter(action="portal_challan.validation_failed").exists()


@pytest.mark.django_db
def test_gstr1_summary_includes_advance_sections(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="advance_received",
        document_type="receipt_voucher",
        reference_number="AR-001",
        counterparty_gstin="",
        counterparty_name="Advance Customer",
        taxable_value="10000.00",
        igst_amount="1800.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="11800.00",
        place_of_supply="27",
        metadata={
            "line_items": [
                {
                    "taxable_value": "10000.00",
                    "igst_amount": "1800.00",
                    "cgst_amount": "0.00",
                    "sgst_amount": "0.00",
                    "cess_amount": "0.00",
                    "total_amount": "11800.00",
                    "rate": "18.00",
                }
            ]
        },
    )
    create_transaction(
        context=returns_context,
        transaction_type="advance_adjusted",
        document_type="advance_adjustment",
        reference_number="AA-001",
        counterparty_gstin="",
        counterparty_name="Advance Customer",
        taxable_value="4000.00",
        igst_amount="720.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="4720.00",
        place_of_supply="27",
        metadata={
            "advance_reference": "AR-001",
            "line_items": [
                {
                    "taxable_value": "4000.00",
                    "igst_amount": "720.00",
                    "cgst_amount": "0.00",
                    "sgst_amount": "0.00",
                    "cess_amount": "0.00",
                    "total_amount": "4720.00",
                    "rate": "18.00",
                }
            ]
        },
    )

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    sections = prepared.summary_snapshot["sections"]
    outward = prepared.summary_snapshot["outward_supplies"]

    assert sections["advances_received"]["row_count"] == 1
    assert sections["advances_received"]["taxable_value"] == "10000.00"
    assert sections["advances_received"]["rows"][0]["place_of_supply"] == "27"
    assert sections["advances_received"]["rows"][0]["supply_type"] == "INTER"
    assert sections["advances_adjusted"]["row_count"] == 1
    assert sections["advances_adjusted"]["tax_amount"] == "720.00"
    assert outward["advance_received_taxable_value"] == "10000.00"
    assert outward["advance_received_tax_amount"] == "1800.00"
    assert outward["advance_adjusted_taxable_value"] == "4000.00"
    assert outward["advance_adjusted_tax_amount"] == "720.00"


@pytest.mark.django_db
def test_gstr1_summary_includes_export_sections(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="EXP-001",
        counterparty_gstin="",
        counterparty_name="Overseas Buyer",
        taxable_value="25000.00",
        igst_amount="4500.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="29500.00",
        place_of_supply="96",
        metadata={
            "special_supply_type": "export_wpay",
            "port_code": "INBLR4",
            "shipping_bill_number": "SB-001",
            "shipping_bill_date": "2026-04-20",
            "line_items": [
                {
                    "taxable_value": "25000.00",
                    "igst_amount": "4500.00",
                    "cgst_amount": "0.00",
                    "sgst_amount": "0.00",
                    "cess_amount": "0.00",
                    "total_amount": "29500.00",
                    "rate": "18.00",
                }
            ],
        },
    )
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="SEZ-001",
        counterparty_gstin="29SEZAA1234F1Z5",
        counterparty_name="SEZ Unit",
        taxable_value="10000.00",
        igst_amount="1800.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="11800.00",
        place_of_supply="29",
        metadata={"special_supply_type": "sez_wpay"},
    )

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    sections = prepared.summary_snapshot["sections"]
    outward = prepared.summary_snapshot["outward_supplies"]

    assert sections["exports"]["row_count"] == 2
    assert sections["exports"]["taxable_value"] == "35000.00"
    special_types = {row["special_supply_type"] for row in sections["exports"]["rows"]}
    assert {"export_wpay", "sez_wpay"} == special_types
    assert outward["export_taxable_value"] == "35000.00"
    assert outward["export_tax_amount"] == "6300.00"
    assert sections["b2b"]["document_count"] == 0
    assert sections["b2cs"]["document_count"] == 0


@pytest.mark.django_db
def test_return_readiness_flags_incomplete_advance_rows(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="advance_received",
        document_type="receipt_voucher",
        reference_number="AR-BAD-001",
        counterparty_gstin="",
        counterparty_name="Advance Customer",
        taxable_value="5000.00",
        igst_amount="0.00",
        cgst_amount="450.00",
        sgst_amount="450.00",
        total_amount="5900.00",
        place_of_supply="",
        metadata={},
    )
    create_transaction(
        context=returns_context,
        transaction_type="advance_adjusted",
        document_type="advance_adjustment",
        reference_number="AA-BAD-001",
        counterparty_gstin="",
        counterparty_name="Advance Customer",
        taxable_value="5000.00",
        igst_amount="0.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="5000.00",
        place_of_supply="29",
        metadata={},
    )

    response = returns_authenticated_client.get(
        f"/api/v1/returns/readiness/?workspace={returns_context['workspace'].id}&client={returns_context['client'].id}&gstin={returns_context['gstin'].id}&compliance_period={returns_context['compliance_period'].id}"
    )
    assert response.status_code == 200
    issues = response.data["data"]["gstr1"]["issues"]
    issue_codes = {issue["code"] for issue in issues}
    assert "advance_pos_missing" in issue_codes
    assert "advance_rate_missing" in issue_codes
    assert "advance_reference_missing" in issue_codes


@pytest.mark.django_db
def test_return_readiness_flags_incomplete_special_supply_rows(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="SEZ-BAD-001",
        counterparty_gstin="",
        counterparty_name="SEZ Unit",
        taxable_value="10000.00",
        igst_amount="1800.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="11800.00",
        place_of_supply="29",
        metadata={"special_supply_type": "sez_wpay"},
    )
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="EXP-BAD-001",
        counterparty_gstin="",
        counterparty_name="Overseas Buyer",
        taxable_value="12000.00",
        igst_amount="2160.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="14160.00",
        place_of_supply="96",
        metadata={"special_supply_type": "export_wpay"},
    )

    response = returns_authenticated_client.get(
        f"/api/v1/returns/readiness/?workspace={returns_context['workspace'].id}&client={returns_context['client'].id}&gstin={returns_context['gstin'].id}&compliance_period={returns_context['compliance_period'].id}"
    )
    assert response.status_code == 200
    issues = response.data["data"]["gstr1"]["issues"]
    issue_codes = {issue["code"] for issue in issues}
    assert "special_supply_gstin_missing" in issue_codes
    assert "export_reference_missing" in issue_codes


@pytest.mark.django_db
def test_gstr1_summary_includes_amendment_and_ecommerce_sections(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="ECOM-001",
        counterparty_gstin="",
        counterparty_name="Marketplace Customer",
        taxable_value="8000.00",
        cgst_amount="720.00",
        sgst_amount="720.00",
        igst_amount="0.00",
        total_amount="9440.00",
        place_of_supply="29",
        metadata={"ecommerce_gstin": "29ECOM1234F1Z5", "ecommerce_section": "table_14"},
    )
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="AMD-001",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="Amended Buyer",
        taxable_value="6000.00",
        cgst_amount="540.00",
        sgst_amount="540.00",
        igst_amount="0.00",
        total_amount="7080.00",
        place_of_supply="29",
        metadata={
            "is_amendment": True,
            "original_document_number": "INV-OLD-001",
            "original_document_date": "2026-03-28",
            "original_period": "2026-03",
            "original_counterparty_gstin": "29ABCDE1234F1Z5",
        },
    )

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    sections = prepared.summary_snapshot["sections"]
    outward = prepared.summary_snapshot["outward_supplies"]

    assert sections["ecommerce"]["row_count"] == 1
    assert sections["ecommerce"]["rows"][0]["ecommerce_gstin"] == "29ECOM1234F1Z5"
    assert sections["amendments"]["row_count"] == 1
    assert sections["amendments"]["rows"][0]["target_section"] == "b2b"
    assert sections["amendments"]["rows"][0]["documents"][0]["original_document_number"] == "INV-OLD-001"
    assert outward["ecommerce_taxable_value"] == "8000.00"
    assert outward["amendment_taxable_value"] == "6000.00"


@pytest.mark.django_db
def test_return_readiness_flags_missing_amendment_and_ecommerce_links(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="ECOM-BAD-001",
        counterparty_gstin="",
        counterparty_name="Marketplace Customer",
        taxable_value="5000.00",
        cgst_amount="450.00",
        sgst_amount="450.00",
        igst_amount="0.00",
        total_amount="5900.00",
        place_of_supply="29",
        metadata={"ecommerce_section": "table_15"},
    )
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="AMD-BAD-001",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="Amended Buyer",
        taxable_value="3000.00",
        cgst_amount="270.00",
        sgst_amount="270.00",
        igst_amount="0.00",
        total_amount="3540.00",
        place_of_supply="29",
        metadata={"is_amendment": True},
    )

    response = returns_authenticated_client.get(
        f"/api/v1/returns/readiness/?workspace={returns_context['workspace'].id}&client={returns_context['client'].id}&gstin={returns_context['gstin'].id}&compliance_period={returns_context['compliance_period'].id}"
    )
    assert response.status_code == 200
    issue_codes = {issue["code"] for issue in response.data["data"]["gstr1"]["issues"]}
    assert "ecommerce_gstin_missing" in issue_codes
    assert "amendment_reference_missing" in issue_codes


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
    assert itc_summary["books_itc"] == "360.00"
    assert itc_summary["reflected_itc"] == "540.00"
    assert itc_summary["claim_ready_itc"] == "180.00"
    assert itc_summary["pending_review_itc"] == "180.00"
    assert itc_summary["blocked_itc"] == "0.00"
    assert itc_summary["eligible_itc"] == "180.00"
    assert itc_summary["itc_at_risk"] == "180.00"
    assert itc_summary["deferred_blocked_itc"] == "180.00"
    assert itc_summary["unresolved_mismatch_count"] == 1
    assert itc_summary["claim_ready_count"] == 1
    assert itc_summary["pending_review_count"] == 1
    assert itc_summary["blocked_count"] == 0
    assert itc_summary["net_tax_payable"] == "720.00"
    reconciliation_summary = prepared.summary_snapshot["reconciliation"]
    assert reconciliation_summary["itc_ready_count"] == 1
    assert reconciliation_summary["itc_pending_review_count"] == 1
    assert reconciliation_summary["itc_blocked_count"] == 1
    assert prepared.summary_snapshot["period_exceptions"]["count"] == 1
    assert prepared.summary_snapshot["period_exceptions"]["documents"][0]["document_number"] == "P-EXC-001"


@pytest.mark.django_db
def test_gstr3b_summary_honors_review_decisions(returns_authenticated_client, returns_context):
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-002", taxable_value="5000.00", cgst_amount="450.00", sgst_amount="450.00", total_amount="5900.00")
    run = create_reconciliation_run_with_items(context=returns_context)
    partial_item = run.items.filter(match_status=ReconciliationItem.MatchStatus.PARTIAL_MATCH).first()
    blocked_item = run.items.filter(match_status=ReconciliationItem.MatchStatus.MISSING_IN_BOOKS).first()
    partial_item.review_decision = ReconciliationItem.ReviewDecision.CLAIM_NOW
    partial_item.save(update_fields=["review_decision", "updated_at"])
    blocked_item.review_decision = ReconciliationItem.ReviewDecision.DEFER
    blocked_item.save(update_fields=["review_decision", "updated_at"])

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    itc_summary = prepared.summary_snapshot["itc_summary"]
    reconciliation_summary = prepared.summary_snapshot["reconciliation"]
    assert itc_summary["claim_ready_itc"] == "360.00"
    assert itc_summary["pending_review_itc"] == "0.00"
    assert itc_summary["pending_2b_itc"] == "180.00"
    assert itc_summary["deferred_blocked_itc"] == "180.00"
    assert itc_summary["eligible_itc"] == "360.00"
    assert itc_summary["itc_at_risk"] == "0.00"
    assert itc_summary["net_tax_payable"] == "540.00"
    assert reconciliation_summary["manual_review_decision_count"] == 2
    assert reconciliation_summary["manual_claim_now_count"] == 1
    assert reconciliation_summary["manual_defer_count"] == 1
    assert reconciliation_summary["manual_blocked_count"] == 0
    assert reconciliation_summary["manual_vendor_followup_count"] == 0


@pytest.mark.django_db
def test_gstr3b_summary_surfaces_prior_period_deferred_items(returns_authenticated_client, returns_context):
    previous_period = CompliancePeriod.objects.create(
        gstin=returns_context["gstin"],
        period="2026-03",
        return_type="GSTR-3B",
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    previous_run = ReconciliationRun.objects.create(
        workspace=returns_context["workspace"],
        client=returns_context["client"],
        gstin=returns_context["gstin"],
        compliance_period=previous_period,
        run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
        status=ReconciliationRun.RunStatus.COMPLETED,
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    create_transaction(context=returns_context, transaction_type="sales", reference_number="S-003", taxable_value="5000.00", cgst_amount="450.00", sgst_amount="450.00", total_amount="5900.00")
    previous_books = create_transaction(
        context=returns_context,
        compliance_period=previous_period,
        transaction_type="purchase",
        reference_number="P-PRIOR-001",
        taxable_value="1000.00",
        cgst_amount="90.00",
        sgst_amount="90.00",
        total_amount="1180.00",
    )
    previous_portal = create_transaction(
        context=returns_context,
        compliance_period=previous_period,
        transaction_type="gstr_2b",
        reference_number="P-PRIOR-001",
        taxable_value="1000.00",
        cgst_amount="90.00",
        sgst_amount="90.00",
        total_amount="1180.00",
    )
    ReconciliationItem.objects.create(
        reconciliation_run=previous_run,
        books_transaction=previous_books,
        portal_transaction=previous_portal,
        match_status=ReconciliationItem.MatchStatus.PARTIAL_MATCH,
        mismatch_reason=ReconciliationItem.MismatchReason.TAX_AMOUNT_MISMATCH,
        itc_status=ReconciliationItem.ITCStatus.ITC_PENDING_REVIEW,
        review_decision=ReconciliationItem.ReviewDecision.DEFER,
        action_status=ReconciliationItem.ActionStatus.DEFERRED,
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    reconciliation_summary = prepared.summary_snapshot["reconciliation"]
    assert reconciliation_summary["prior_period_deferred_period"] == "2026-03"
    assert reconciliation_summary["prior_period_deferred_count"] == 1
    assert reconciliation_summary["prior_period_deferred_itc"] == "180.00"
    assert reconciliation_summary["prior_period_deferred_run_id"] == str(previous_run.id)


@pytest.mark.django_db
def test_gstr7_summary(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="tds_deducted",
        reference_number="TDS-7001",
        document_type="tds_entry",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="Deductee One",
        taxable_value="100000.00",
        cgst_amount="500.00",
        sgst_amount="500.00",
        igst_amount="0.00",
        total_amount="100000.00",
    )
    create_transaction(
        context=returns_context,
        transaction_type="tds_deducted",
        reference_number="TDS-7002",
        document_type="tds_entry",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="Deductee One",
        taxable_value="25000.00",
        cgst_amount="125.00",
        sgst_amount="125.00",
        igst_amount="0.00",
        total_amount="25000.00",
    )
    create_transaction(
        context=returns_context,
        transaction_type="tds_deducted",
        reference_number="TDS-7003",
        document_type="tds_entry",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Deductee Two",
        taxable_value="40000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="800.00",
        total_amount="40000.00",
    )

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr7"), format="json")

    assert response.status_code == 200
    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    snapshot = prepared.summary_snapshot
    summary = snapshot["tds_summary"]

    assert snapshot["return_type"] == "gstr7"
    assert snapshot["summary_version"] == "gstr7.monthly.v1"
    assert summary["document_count"] == 3
    assert summary["deductee_count"] == 2
    assert summary["payment_amount"] == "165000.00"
    assert summary["taxable_value"] == "165000.00"
    assert summary["cgst_amount"] == "625.00"
    assert summary["sgst_amount"] == "625.00"
    assert summary["igst_amount"] == "800.00"
    assert summary["tds_amount"] == "2050.00"
    assert snapshot["deductees"]["row_count"] == 2
    assert snapshot["deductees"]["rows"][0]["document_count"] == 1
    assert snapshot["deductees"]["rows"][1]["document_count"] == 2


@pytest.mark.django_db
def test_return_readiness_surfaces_gstr7_tds_signals(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="tds_deducted",
        reference_number="TDS-7701",
        document_type="tds_entry",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="Deductee One",
        taxable_value="100000.00",
        cgst_amount="500.00",
        sgst_amount="500.00",
        total_amount="100000.00",
    )
    create_transaction(
        context=returns_context,
        transaction_type="tds_deducted",
        reference_number="TDS-7701",
        document_type="tds_entry",
        counterparty_gstin="",
        counterparty_name="Deductee Missing GSTIN",
        taxable_value="0.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        total_amount="0.00",
    )

    response = returns_authenticated_client.get(
        "/api/v1/returns/readiness/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(returns_context["compliance_period"].id),
        },
        format="json",
    )

    assert response.status_code == 200
    gstr7 = response.data["data"]["gstr7"]
    issue_codes = {issue["code"] for issue in gstr7["issues"]}
    assert gstr7["return_type"] == "gstr7"
    assert gstr7["status"] == "blocked"
    assert not gstr7["can_prepare"]
    assert "missing_deductee_gstin" in issue_codes
    assert "zero_tds_amount" in issue_codes
    assert "zero_payment_amount" in issue_codes
    assert "duplicate_tds_document_numbers" in issue_codes
    assert gstr7["metrics"]["document_count"] == 2
    assert gstr7["metrics"]["deductee_count"] == 1


@pytest.mark.django_db
def test_gstr9_summary_aggregates_monthly_gstr1_and_gstr3b(returns_authenticated_client, returns_context):
    may_period = CompliancePeriod.objects.create(
        gstin=returns_context["gstin"],
        period="2026-05",
        return_type="GSTR-3B",
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )

    april_gstr1 = ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={
            "outward_supplies": {
                "total_taxable_value": "1000.00",
                "total_tax_amount": "180.00",
            },
            "sections": {
                "amendments": {
                    "document_count": 1,
                }
            },
            "period_exceptions": {
                "count": 1,
            },
        },
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
    )
    may_gstr1 = ReturnPreparation.objects.create(
        compliance_period=may_period,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.FILED,
        summary_snapshot={
            "outward_supplies": {
                "total_taxable_value": "2000.00",
                "total_tax_amount": "360.00",
            },
            "sections": {
                "amendments": {
                    "document_count": 2,
                }
            },
            "period_exceptions": {
                "count": 2,
            },
        },
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
    )
    april_gstr3b = ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={
            "outward_supplies": {
                "outward_taxable_value": "1000.00",
                "outward_tax_liability": "180.00",
            },
            "itc_summary": {
                "books_itc": "300.00",
                "reflected_itc": "280.00",
                "claim_ready_itc": "240.00",
                "pending_2b_itc": "20.00",
                "pending_review_itc": "30.00",
                "blocked_itc": "10.00",
                "timing_difference_itc": "10.00",
                "vendor_followup_required_itc": "30.00",
                "itc_at_risk": "50.00",
                "net_tax_payable": "100.00",
                "unresolved_mismatch_count": 1,
            },
            "reconciliation": {
                "partial_match_count": 1,
                "missing_in_books_count": 0,
                "missing_in_portal_count": 1,
                "duplicate_count": 0,
                "manual_review_decision_count": 1,
            },
            "period_exceptions": {
                "count": 0,
            },
        },
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
    )
    may_gstr3b = ReturnPreparation.objects.create(
        compliance_period=may_period,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION,
        summary_snapshot={
            "outward_supplies": {
                "outward_taxable_value": "1000.00",
                "outward_tax_liability": "180.00",
            },
            "itc_summary": {
                "books_itc": "400.00",
                "reflected_itc": "360.00",
                "claim_ready_itc": "300.00",
                "pending_2b_itc": "20.00",
                "pending_review_itc": "40.00",
                "blocked_itc": "20.00",
                "timing_difference_itc": "10.00",
                "vendor_followup_required_itc": "10.00",
                "itc_at_risk": "60.00",
                "net_tax_payable": "120.00",
                "unresolved_mismatch_count": 2,
            },
            "reconciliation": {
                "partial_match_count": 1,
                "missing_in_books_count": 1,
                "missing_in_portal_count": 0,
                "duplicate_count": 0,
                "manual_review_decision_count": 2,
            },
            "period_exceptions": {
                "count": 0,
            },
        },
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
    )

    response = returns_authenticated_client.post(
        "/api/v1/returns/prepare/",
        {
            "workspace": str(returns_context["workspace"].id),
            "client": str(returns_context["client"].id),
            "gstin": str(returns_context["gstin"].id),
            "compliance_period": str(may_period.id),
            "return_type": "gstr9",
        },
        format="json",
    )
    assert response.status_code == 200

    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    snapshot = prepared.summary_snapshot

    assert prepared.return_type == ReturnPreparation.ReturnType.GSTR9
    assert snapshot["return_type"] == "gstr9"
    assert snapshot["summary_version"] == "gstr9.annual.v1"
    assert snapshot["financial_year"] == "2026-27"
    assert snapshot["anchor_period"] == "2026-05"

    source_months = snapshot["source_months"]
    assert source_months["expected_periods"] == ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
    assert source_months["available_periods"] == ["2026-04", "2026-05"]
    assert source_months["gstr1_prepared_periods"] == ["2026-04", "2026-05"]
    assert source_months["gstr3b_prepared_periods"] == ["2026-04", "2026-05"]
    assert source_months["blocked_source_periods"] == ["2026-05"]
    assert source_months["failed_source_periods"] == []
    assert source_months["filed_source_periods"] == ["2026-05"]
    assert source_months["missing_periods"][0] == "2026-06"

    assert snapshot["outward_summary"]["gstr1_taxable_value"] == "3000.00"
    assert snapshot["outward_summary"]["gstr1_tax_amount"] == "540.00"
    assert snapshot["outward_summary"]["gstr3b_outward_taxable_value"] == "2000.00"
    assert snapshot["outward_summary"]["gstr3b_outward_tax_liability"] == "360.00"
    assert snapshot["outward_summary"]["annual_taxable_value"] == "3000.00"
    assert snapshot["outward_summary"]["annual_tax_liability"] == "360.00"

    assert snapshot["itc_summary"]["books_itc"] == "700.00"
    assert snapshot["itc_summary"]["reflected_itc"] == "640.00"
    assert snapshot["itc_summary"]["claim_ready_itc"] == "540.00"
    assert snapshot["itc_summary"]["pending_2b_itc"] == "40.00"
    assert snapshot["itc_summary"]["pending_review_itc"] == "70.00"
    assert snapshot["itc_summary"]["blocked_itc"] == "30.00"
    assert snapshot["itc_summary"]["timing_difference_itc"] == "20.00"
    assert snapshot["itc_summary"]["vendor_followup_required_itc"] == "40.00"
    assert snapshot["itc_summary"]["itc_at_risk"] == "110.00"

    assert snapshot["liability_summary"]["net_tax_payable"] == "220.00"
    assert snapshot["liability_summary"]["annual_tax_liability"] == "360.00"
    assert snapshot["liability_summary"]["annual_claim_ready_itc"] == "540.00"

    assert snapshot["annual_sections"]["notes_and_amendments"]["amendment_document_count"] == 3
    assert snapshot["annual_sections"]["source_exceptions"]["period_exception_count"] == 3
    assert snapshot["annual_sections"]["source_exceptions"]["missing_month_count"] == 10
    assert snapshot["annual_sections"]["source_exceptions"]["blocked_source_count"] == 1
    assert snapshot["annual_sections"]["source_exceptions"]["failed_source_count"] == 0
    assert snapshot["annual_sections"]["source_exceptions"]["unresolved_mismatch_count"] == 3
    assert snapshot["annual_sections"]["source_exceptions"]["manual_review_decision_count"] == 3

    assert snapshot["warnings_summary"]["warning_count"] >= 2
    assert {item["code"] for item in snapshot["warnings_summary"]["items"]} == {
        "missing_source_months",
        "blocked_source_months",
    }

    assert set(snapshot["source_trace"]["gstr1_return_ids"]) == {str(april_gstr1.id), str(may_gstr1.id)}
    assert set(snapshot["source_trace"]["gstr3b_return_ids"]) == {str(april_gstr3b.id), str(may_gstr3b.id)}


@pytest.mark.django_db
def test_gstr9c_summary_compares_gstr9_against_annual_books(returns_authenticated_client, returns_context):
    create_transaction(
        context=returns_context,
        transaction_type="sales",
        reference_number="APR-SALE-001",
        total_amount="1180.00",
        taxable_value="1000.00",
        cgst_amount="90.00",
        sgst_amount="90.00",
        metadata={"hsn_code": "8471", "uqc": "PCS", "quantity": "2"},
    )
    create_transaction(
        context=returns_context,
        transaction_type="purchase",
        reference_number="APR-PUR-001",
        total_amount="590.00",
        taxable_value="500.00",
        cgst_amount="45.00",
        sgst_amount="45.00",
    )
    returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr1"), format="json")
    returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr3b"), format="json")
    returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr9"), format="json")

    response = returns_authenticated_client.post("/api/v1/returns/prepare/", prepare_payload(returns_context, "gstr9c"), format="json")
    assert response.status_code == 200

    prepared = ReturnPreparation.objects.get(pk=response.data["data"]["id"])
    snapshot = prepared.summary_snapshot
    assert prepared.return_type == ReturnPreparation.ReturnType.GSTR9C
    assert snapshot["return_type"] == "gstr9c"
    assert snapshot["summary_version"] == "gstr9c.compare.v1"
    assert snapshot["books_summary"]["outward_taxable_value"] == "1000.00"
    assert snapshot["books_summary"]["itc_amount"] == "90.00"
    assert snapshot["gstr9_summary"]["annual_taxable_value"] == "1000.00"
    assert snapshot["comparison_summary"]["outward_taxable_variance"] == "0.00"
    assert snapshot["comparison_summary"]["claim_ready_itc_variance"] == "90.00"
    assert snapshot["source_trace"]["gstr9_return_id"]


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
def test_mark_filed_flow_updates_linked_manual_gstr9_filing(returns_authenticated_client, returns_context):
    prepared = ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR9,
        status=ReturnPreparation.PreparationStatus.APPROVED,
        summary_snapshot={
            "return_type": "gstr9",
            "financial_year": "2026-27",
            "warnings_summary": {"warning_count": 0, "items": []},
            "source_trace": {"gstr1_return_ids": [], "gstr3b_return_ids": [], "gstr1_months": [], "gstr3b_months": []},
        },
        prepared_by=returns_context["user"],
        approved_by=returns_context["user"],
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    filing = ReturnFiling.objects.create(
        workspace=returns_context["workspace"],
        client=returns_context["client"],
        gstin=returns_context["gstin"],
        compliance_period=returns_context["compliance_period"],
        prepared_return=prepared,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
        status=ReturnFiling.FilingStatus.APPROVED,
        readiness_snapshot={"manual_filing_only": True},
        approved_by=returns_context["user"],
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )

    filed_response = returns_authenticated_client.post(
        f"/api/v1/returns/{prepared.id}/mark-filed/",
        {"arn": "ARN-G9-123"},
        format="json",
    )
    assert filed_response.status_code == 200

    prepared.refresh_from_db()
    filing.refresh_from_db()
    assert prepared.status == ReturnPreparation.PreparationStatus.FILED
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert filing.arn == "ARN-G9-123"
    assert filing.filed_by == returns_context["user"]
    assert filing.filed_at is not None
    assert filing.arn_received_at is not None
    assert filing.last_status_sync_at is not None
    assert AuditLog.objects.filter(action="return_filing.marked_filed_manually", entity_id=filing.id).exists()


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
    assert "blocked_itc_rows" in issue_codes
    assert "pending_review_itc" in issue_codes
    unresolved_issue = next(issue for issue in payload["gstr3b"]["issues"] if issue["code"] == "unresolved_reconciliation_items")
    assert unresolved_issue["suggested_fix"]["mode"] == "row_review"


@pytest.mark.django_db
def test_return_readiness_surfaces_gstr9_annual_rollup_signals(returns_authenticated_client, returns_context):
    may_period = CompliancePeriod.objects.create(
        gstin=returns_context["gstin"],
        period="2026-05",
        return_type="GSTR-3B",
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
    )
    ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.READY_FOR_REVIEW,
        summary_snapshot={"outward_supplies": {"total_taxable_value": "1000.00", "total_tax_amount": "180.00"}},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
    )
    ReturnPreparation.objects.create(
        compliance_period=returns_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.FILED,
        summary_snapshot={"outward_supplies": {"outward_taxable_value": "1000.00", "outward_tax_liability": "180.00"}},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
    )
    ReturnPreparation.objects.create(
        compliance_period=may_period,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION,
        summary_snapshot={"outward_supplies": {"outward_taxable_value": "1000.00", "outward_tax_liability": "180.00"}},
        created_by=returns_context["user"],
        updated_by=returns_context["user"],
        prepared_by=returns_context["user"],
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
    gstr9 = response.data["data"]["gstr9"]
    issue_codes = {issue["code"] for issue in gstr9["issues"]}
    assert gstr9["return_type"] == "gstr9"
    assert gstr9["status"] == "blocked"
    assert not gstr9["can_prepare"]
    assert "annual_anchor_not_year_end" in issue_codes
    assert "missing_gstr1_source_months" in issue_codes
    assert "missing_gstr3b_source_months" in issue_codes
    assert "blocked_source_months" in issue_codes
    assert gstr9["metrics"]["financial_year"] == "2026-27"
    assert gstr9["metrics"]["gstr1_prepared_month_count"] == 1
    assert gstr9["metrics"]["gstr3b_prepared_month_count"] == 2
    assert gstr9["metrics"]["blocked_source_month_count"] == 1
    assert gstr9["metrics"]["filed_source_month_count"] == 1


@pytest.mark.django_db
def test_return_readiness_surfaces_gstr9c_dependency_signals(returns_authenticated_client, returns_context):
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
    gstr9c = response.data["data"]["gstr9c"]
    issue_codes = {issue["code"] for issue in gstr9c["issues"]}
    assert gstr9c["return_type"] == "gstr9c"
    assert gstr9c["status"] == "blocked"
    assert not gstr9c["can_prepare"]
    assert "missing_gstr9_anchor_return" in issue_codes


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
