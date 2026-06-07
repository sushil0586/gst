from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.approvals.models import ApprovalRequest
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import (
    ProviderRolloutPolicy,
    OperationalAlertRoutingRule,
    ReturnFiling,
    ReturnFilingAttempt,
    ReturnFilingEvent,
    ReturnFilingIncidentNote,
    ReturnFilingOffset,
    ReturnFilingOffsetLine,
    WhiteBooksAuthSession,
)
from apps.filings.providers.base import FilingProvider, ProviderCapabilitySet
from apps.filings.providers.registry import get_filing_provider
from apps.filings.services.provider_auth import request_provider_otp_session, verify_provider_otp_session, refresh_provider_auth_session
from apps.filings.services.auth_session_freshness import (
    get_provider_auth_session_freshness,
    is_provider_auth_session_live_enabled,
)
from apps.filings.services.filings import process_return_filing
from apps.gstins.models import GSTIN
from apps.integrations.whitebooks.exceptions import WhiteBooksSessionLimitError, WhiteBooksSubmissionError
from apps.integrations.whitebooks.mappers import map_return_filing_to_whitebooks_payload
from apps.integrations.whitebooks.provider import WhiteBooksProvider
from apps.integrations.whitebooks.types import WhiteBooksSession
from apps.organizations.models import Organization
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace
from apps.gst_transactions.models import GSTTransaction

User = get_user_model()


@pytest.fixture
def filings_api_client():
    return APIClient()


@pytest.fixture(autouse=True)
def filings_whitebooks_defaults(settings):
    settings.WHITEBOOKS_SANDBOX_MODE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR7_FILE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR9_FILE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR9C_FILE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE = False


@pytest.fixture
def filings_user(db):
    return User.objects.create_user(username="filings", email="filings@example.com", password="strong-pass-123")


@pytest.fixture
def filings_authenticated_client(filings_api_client, filings_user):
    filings_api_client.force_authenticate(user=filings_user)
    return filings_api_client


@pytest.fixture
def filings_context(filings_user):
    organization = Organization.objects.create(name="Filings Org", code="FILORG", created_by=filings_user, updated_by=filings_user)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Filings Workspace",
        code="FIL-WS",
        created_by=filings_user,
        updated_by=filings_user,
    )
    WorkspaceMembership.objects.create(
        user=filings_user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=filings_user,
        updated_by=filings_user,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Filings Client Pvt Ltd",
        trade_name="Filings Client",
        client_code="FIL001",
        pan="ABCDE1234P",
        created_by=filings_user,
        updated_by=filings_user,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234P1Z5",
        registration_type="regular",
        state_code="29",
        created_by=filings_user,
        updated_by=filings_user,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-3B",
        created_by=filings_user,
        updated_by=filings_user,
    )
    prepared_return = ReturnPreparation.objects.create(
        compliance_period=compliance_period,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnPreparation.PreparationStatus.APPROVED,
        summary_snapshot={"outward_supplies": {"taxable_value": "1000.00"}},
        prepared_by=filings_user,
        approved_by=filings_user,
        created_by=filings_user,
        updated_by=filings_user,
    )
    approval_request = ApprovalRequest.objects.create(
        workspace=workspace,
        client=client,
        gstin=gstin,
        compliance_period=compliance_period,
        entity_type=ApprovalRequest.EntityType.RETURN_PREPARATION,
        entity_id=prepared_return.id,
        status=ApprovalRequest.ApprovalStatus.APPROVED,
        resolved_by=filings_user,
        created_by=filings_user,
        updated_by=filings_user,
    )
    return {
        "user": filings_user,
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
        "prepared_return": prepared_return,
        "approval_request": approval_request,
    }


def create_ready_whitebooks_auth_session(filings_context, **overrides):
    params = {
        "workspace": filings_context["workspace"],
        "client": filings_context["client"],
        "gstin": filings_context["gstin"],
        "provider": ReturnFiling.Provider.WHITEBOOKS,
        "email": "ops@example.com",
        "txn": "txn-ready-001",
        "status": WhiteBooksAuthSession.SessionStatus.SESSION_ACTIVE,
        "response_contract_confirmed": True,
        "verified_at": timezone.now(),
        "initiated_by": filings_context["user"],
        "verified_by": filings_context["user"],
        "created_by": filings_context["user"],
        "updated_by": filings_context["user"],
    }
    params.update(overrides)
    return WhiteBooksAuthSession.objects.create(**params)


@pytest.mark.django_db
def test_return_filing_models_support_attempts_and_events(filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.CREATED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    event = ReturnFilingEvent.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        event_type="filing.created",
        old_status="",
        new_status=ReturnFiling.FilingStatus.APPROVED,
        actor=filings_context["user"],
        metadata={"provider": ReturnFiling.Provider.WHITEBOOKS},
    )

    assert filing.prepared_return == filings_context["prepared_return"]
    assert filing.attempts.count() == 1
    assert filing.events.count() == 1


@pytest.mark.django_db
def test_start_filing_api_requires_live_confirmed_provider_auth_session(filings_authenticated_client, filings_context):
    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": filings_context["prepared_return"].return_type,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Started from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "Request OTP and verify a live filing session" in str(response.data["errors"]["provider_auth"][0])


@pytest.mark.django_db
def test_start_filing_api_opens_manual_gstr9_record_without_provider_auth(filings_authenticated_client, filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9
    filings_context["prepared_return"].status = ReturnPreparation.PreparationStatus.APPROVED
    filings_context["prepared_return"].save(update_fields=["return_type", "status", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": ReturnPreparation.ReturnType.GSTR9,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Opened annual filing record from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 200
    filing = ReturnFiling.objects.get(prepared_return=filings_context["prepared_return"])
    assert filing.status == ReturnFiling.FilingStatus.APPROVED
    assert filing.return_type == ReturnPreparation.ReturnType.GSTR9


@pytest.mark.django_db
def test_start_filing_api_requires_provider_auth_for_gstr9_when_live_save_enabled(settings, filings_authenticated_client, filings_context):
    settings.WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE = True
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9
    filings_context["prepared_return"].status = ReturnPreparation.PreparationStatus.APPROVED
    filings_context["prepared_return"].summary_snapshot = {
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {},
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "status", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": ReturnPreparation.ReturnType.GSTR9,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Started annual live filing from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "Request OTP and verify a live filing session" in str(response.data["errors"]["provider_auth"][0])


@pytest.mark.django_db
def test_start_filing_api_requires_provider_auth_for_gstr7(filings_authenticated_client, filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR7
    filings_context["prepared_return"].status = ReturnPreparation.PreparationStatus.APPROVED
    filings_context["prepared_return"].save(update_fields=["return_type", "status", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-7"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": ReturnPreparation.ReturnType.GSTR7,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "Request OTP and verify a live filing session" in str(response.data["errors"]["provider_auth"][0])


@pytest.mark.django_db
def test_start_filing_api_opens_manual_gstr9c_record_without_provider_auth(filings_authenticated_client, filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9C
    filings_context["prepared_return"].status = ReturnPreparation.PreparationStatus.APPROVED
    filings_context["prepared_return"].save(update_fields=["return_type", "status", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9C"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": ReturnPreparation.ReturnType.GSTR9C,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Opened annual comparison filing record from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 200
    filing = ReturnFiling.objects.get(prepared_return=filings_context["prepared_return"])
    assert filing.status == ReturnFiling.FilingStatus.APPROVED
    assert filing.return_type == ReturnPreparation.ReturnType.GSTR9C
    assert filing.attempts.count() == 0
    assert filing.readiness_snapshot["manual_filing_only"] is True
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.manual_tracking_opened").exists()
    assert AuditLog.objects.filter(action="return_filing.manual_tracking_opened", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_start_filing_api_requires_provider_auth_for_gstr9c_when_live_save_enabled(settings, filings_authenticated_client, filings_context):
    settings.WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE = True
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9C
    filings_context["prepared_return"].status = ReturnPreparation.PreparationStatus.APPROVED
    filings_context["prepared_return"].summary_snapshot = {
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "status", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9C"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": ReturnPreparation.ReturnType.GSTR9C,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Started annual 9C live filing from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "Request OTP and verify a live filing session" in str(response.data["errors"]["provider_auth"][0])


@pytest.mark.django_db
def test_start_filing_api_prefers_verified_auth_session_over_newer_failed_sessions(
    filings_authenticated_client,
    filings_context,
):
    create_ready_whitebooks_auth_session(
        filings_context,
        created_at=timezone.now() - timedelta(minutes=2),
        updated_at=timezone.now() - timedelta(minutes=2),
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="",
        status=WhiteBooksAuthSession.SessionStatus.FAILED,
        response_contract_confirmed=False,
        initiated_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="",
        status=WhiteBooksAuthSession.SessionStatus.FAILED,
        response_contract_confirmed=False,
        initiated_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": filings_context["prepared_return"].return_type,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Ready to file after a successful OTP verification.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["status"] == "success"


@pytest.mark.django_db
def test_enqueue_return_filing_uses_inline_processing_when_celery_is_eager(monkeypatch, settings, filings_context):
    from apps.filings.services import filings as filings_service
    from apps.filings.tasks import process_return_filing_task

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=filings_context["prepared_return"].return_type,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    called = {}

    def fake_process_return_filing(*, filing_id, actor_id=None):
        called["filing_id"] = str(filing_id)
        called["actor_id"] = actor_id
        return {"filing_id": str(filing_id), "status": ReturnFiling.FilingStatus.QUEUED_FOR_FILING}

    def fail_apply_async(*args, **kwargs):
        raise AssertionError("apply_async should not be used when CELERY_TASK_ALWAYS_EAGER is true")

    settings.CELERY_TASK_ALWAYS_EAGER = True
    monkeypatch.setattr(filings_service, "process_return_filing", fake_process_return_filing)
    monkeypatch.setattr(process_return_filing_task, "apply_async", fail_apply_async)

    filings_service.enqueue_return_filing(filing=filing, actor=filings_context["user"])

    assert called == {
        "filing_id": str(filing.id),
        "actor_id": filings_context["user"].id,
    }


@pytest.mark.django_db
def test_start_filing_api_requeues_queued_filing_after_fresh_confirmed_auth(monkeypatch, filings_authenticated_client, filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=filings_context["prepared_return"].return_type,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        request_summary={"provider": filing.provider, "return_type": filing.return_type},
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-ready")

    captured = {}

    def fake_enqueue_return_filing(*, filing, actor):
        captured["filing_id"] = str(filing.id)
        captured["actor_id"] = actor.id if actor else None

    monkeypatch.setattr("apps.filings.services.filings.enqueue_return_filing", fake_enqueue_return_filing)

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": filings_context["prepared_return"].return_type,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Started from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["message"] == "Filing queued"
    assert response.data["data"]["id"] == str(filing.id)
    assert captured["filing_id"] == str(filing.id)
    assert AuditLog.objects.filter(action="return_filing.requeued_after_auth_refresh", entity_id=filing.id).exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.requeued_after_auth_refresh").exists()


@pytest.mark.django_db
def test_start_filing_api_blocks_restarting_queued_filing_when_auth_session_is_stale(settings, filings_authenticated_client, filings_context):
    settings.WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES = 30
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=filings_context["prepared_return"].return_type,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        request_summary={"provider": ReturnFiling.Provider.WHITEBOOKS, "return_type": filings_context["prepared_return"].return_type},
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(
        filings_context,
        txn="txn-stale-restart",
        verified_at=timezone.now() - timezone.timedelta(minutes=45),
    )

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": filings_context["prepared_return"].return_type,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Started from returns workspace.",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "earlier queued filing attempt" in str(response.data["errors"]["provider_auth"][0])
    assert "older than 30 minutes" in str(response.data["errors"]["provider_auth"][0])


@pytest.mark.django_db
def test_return_filing_offset_models_support_versioned_allocation_profiles(filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.CREATED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    offset_profile = ReturnFilingOffset.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 75.0}]},
        liability_snapshot={"outward_tax_liability": "180.00"},
        ledger_snapshot={"credit_ledger": [{"id": "cr-001", "balance": "75.00"}]},
        allocation_summary={"igst": "75.00"},
        notes="Prepared for controlled offset replay.",
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    offset_line = ReturnFilingOffsetLine.objects.create(
        offset_profile=offset_profile,
        line_number=1,
        source_ledger_type=ReturnFilingOffsetLine.LedgerType.CREDIT,
        source_ledger_id="cr-001",
        liability_ledger_id="liab-001",
        tax_head=ReturnFilingOffsetLine.TaxHead.IGST,
        amount="75.00",
        metadata={"sequence": 1},
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    assert filing.offset_profiles.count() == 1
    assert offset_profile.lines.count() == 1
    assert offset_line.tax_head == ReturnFilingOffsetLine.TaxHead.IGST
    assert offset_profile.provider_payload["liab_ldg_id"] == "liab-001"


def test_provider_registry_can_be_extended_without_core_workflow_changes(monkeypatch):
    class FakeProvider(FilingProvider):
        provider_code = "fake"

        def prepare_payload(self, filing):
            return {"provider": "fake"}

        def submit_return(self, filing):
            raise NotImplementedError

        def get_status(self, filing):
            return {"submission_state": "submitted"}

        def get_capabilities(self, filing=None, payload=None):
            return ProviderCapabilitySet(sandbox_mode=True, supported_operations={"save": True})

    from apps.filings.providers import registry as provider_registry

    monkeypatch.setitem(provider_registry.PROVIDER_REGISTRY, "fake", FakeProvider)

    provider = get_filing_provider("fake")

    assert isinstance(provider, FakeProvider)
    assert provider.get_capabilities().supported_operations["save"] is True


@pytest.mark.django_db
def test_demo_gsp_provider_end_to_end_filing_works_through_registry(filings_context):
    from apps.filings.services.filings import process_return_filing

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.DEMO_GSP,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id.startswith("demo-ref-")
    assert attempt.request_summary["provider_stage"] == "demo_saved"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.demo_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.demo_saved").exists()


@pytest.mark.django_db
def test_provider_auth_service_works_with_registry_provider(monkeypatch, filings_context):
    class FakeSession:
        def __init__(self):
            self.raw_response = {"status": "ok", "header": {"txn": "fake-txn-001"}}
            self.metadata = {"txn": "fake-txn-001", "response_contract_confirmed": True}

        @property
        def response_contract_confirmed(self):
            return True

    class FakeAuthProvider(FilingProvider):
        provider_code = "fake"

        def prepare_payload(self, filing):
            return {}

        def submit_return(self, filing):
            raise NotImplementedError

        def get_status(self, filing):
            return {}

        def request_otp(self, *, email: str, state_code: str | None = None):
            return {"status": "requested", "header": {"txn": "fake-txn-001"}, "email": email, "state_code": state_code}

        def exchange_otp_for_session(self, *, email: str, otp: str, txn: str, state_code: str | None = None):
            return FakeSession()

    from apps.filings.providers import registry as provider_registry

    monkeypatch.setitem(provider_registry.PROVIDER_REGISTRY, "fake", FakeAuthProvider)

    auth_session = request_provider_otp_session(
        validated_data={
            "workspace": filings_context["workspace"].id,
            "client": filings_context["client"].id,
            "gstin": filings_context["gstin"].id,
            "provider": "fake",
            "email": "ops@example.com",
        },
        user=filings_context["user"],
    )

    assert auth_session.provider == "fake"
    assert auth_session.status == WhiteBooksAuthSession.SessionStatus.OTP_REQUESTED
    assert auth_session.txn == "fake-txn-001"
    assert AuditLog.objects.filter(action="fake_auth.otp_requested", entity_id=auth_session.id).exists()

    verified_session = verify_provider_otp_session(
        auth_session=auth_session,
        otp="575757",
        txn="fake-txn-001",
        user=filings_context["user"],
    )

    assert verified_session.status == WhiteBooksAuthSession.SessionStatus.SESSION_ACTIVE
    assert verified_session.response_contract_confirmed is True
    assert AuditLog.objects.filter(action="fake_auth.auth_token_received", entity_id=auth_session.id).exists()


@pytest.mark.django_db
def test_provider_auth_service_derives_state_code_from_gstin(monkeypatch, filings_context):
    captured = {}

    class FakeSession:
        def __init__(self):
            self.raw_response = {"status": "ok", "header": {"txn": "fake-txn-002"}}
            self.metadata = {"txn": "fake-txn-002", "response_contract_confirmed": True}

        @property
        def response_contract_confirmed(self):
            return True

    class FakeAuthProvider(FilingProvider):
        provider_code = "fake_state"

        def prepare_payload(self, filing):
            return {}

        def submit_return(self, filing):
            raise NotImplementedError

        def get_status(self, filing):
            return {}

        def request_otp(self, *, email: str, state_code: str | None = None, gst_username: str | None = None):
            captured["request_state_code"] = state_code
            captured["request_gst_username"] = gst_username
            return {"status": "requested", "header": {"txn": "fake-txn-002"}}

        def exchange_otp_for_session(
            self,
            *,
            email: str,
            otp: str,
            txn: str,
            state_code: str | None = None,
            gst_username: str | None = None,
        ):
            captured["verify_state_code"] = state_code
            captured["verify_gst_username"] = gst_username
            return FakeSession()

    from apps.filings.providers import registry as provider_registry

    monkeypatch.setitem(provider_registry.PROVIDER_REGISTRY, "fake_state", FakeAuthProvider)
    filings_context["gstin"].whitebooks_gst_username = "MH_NT2.1642"
    filings_context["gstin"].save(update_fields=["whitebooks_gst_username"])

    auth_session = request_provider_otp_session(
        validated_data={
            "workspace": filings_context["workspace"].id,
            "client": filings_context["client"].id,
            "gstin": filings_context["gstin"].id,
            "provider": "fake_state",
            "email": "ops@example.com",
            "gstin_instance": filings_context["gstin"],
        },
        user=filings_context["user"],
    )

    verified_session = verify_provider_otp_session(
        auth_session=auth_session,
        otp="575757",
        txn="fake-txn-002",
        user=filings_context["user"],
    )

    assert captured["request_state_code"] == filings_context["gstin"].state_code
    assert captured["request_gst_username"] == "MH_NT2.1642"
    assert captured["verify_state_code"] == filings_context["gstin"].state_code
    assert captured["verify_gst_username"] == "MH_NT2.1642"
    assert verified_session.session_metadata["state_code"] == filings_context["gstin"].state_code
    assert verified_session.session_metadata["gst_username"] == "MH_NT2.1642"


@pytest.mark.django_db
def test_provider_auth_sessions_api_alias_supports_demo_provider(filings_authenticated_client, filings_context):
    response = filings_authenticated_client.post(
        "/api/v1/provider-auth-sessions/request-otp/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "provider": ReturnFiling.Provider.DEMO_GSP,
            "email": "demo-ops@example.com",
        },
        format="json",
    )

    assert response.status_code == 200
    auth_session = WhiteBooksAuthSession.objects.get(pk=response.data["data"]["id"])
    assert auth_session.provider == ReturnFiling.Provider.DEMO_GSP
    assert auth_session.status == WhiteBooksAuthSession.SessionStatus.OTP_REQUESTED
    assert response.data["message"] == "Provider OTP requested"


@pytest.mark.django_db
def test_start_filing_api_creates_filing_attempt_and_event(filings_authenticated_client, filings_context):
    create_ready_whitebooks_auth_session(filings_context)
    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": ReturnPreparation.ReturnType.GSTR3B,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
            "confirmation_note": "Ready to file in sandbox.",
        },
        format="json",
    )
    assert response.status_code == 200
    filing = ReturnFiling.objects.get(pk=response.data["data"]["id"])
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert filing.attempts.count() == 1
    assert filing.events.count() >= 3
    assert filing.readiness_snapshot["validated_for_filing"] is True
    assert filing.provider_reference_id.startswith("wb-ref-")
    assert filing.arn.startswith("ARN-")
    assert AuditLog.objects.filter(action="return_filing.queued", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.submitted", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.filed", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_process_return_filing_can_lock_record_inside_service_transaction(filings_context):
    create_ready_whitebooks_auth_session(filings_context)
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        idempotency_key=f"{filing.id}:1",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    assert result["filing_id"] == str(filing.id)
    assert filing.status == ReturnFiling.FilingStatus.FILED


@pytest.mark.django_db
def test_start_filing_api_is_idempotent_for_active_snapshot(filings_authenticated_client, filings_context):
    create_ready_whitebooks_auth_session(filings_context)
    payload = {
        "workspace": str(filings_context["workspace"].id),
        "client": str(filings_context["client"].id),
        "gstin": str(filings_context["gstin"].id),
        "compliance_period": str(filings_context["compliance_period"].id),
        "prepared_return": str(filings_context["prepared_return"].id),
        "return_type": ReturnPreparation.ReturnType.GSTR3B,
        "provider": ReturnFiling.Provider.WHITEBOOKS,
        "approval_request": str(filings_context["approval_request"].id),
    }
    first = filings_authenticated_client.post("/api/v1/filings/start/", payload, format="json")
    second = filings_authenticated_client.post("/api/v1/filings/start/", payload, format="json")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.data["data"]["id"] == second.data["data"]["id"]
    assert ReturnFiling.objects.count() == 1
    assert ReturnFilingAttempt.objects.count() == 1


@pytest.mark.django_db
def test_list_and_detail_filing_apis(filings_authenticated_client, filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingEvent.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        event_type="filing.queued",
        old_status="",
        new_status=filing.status,
        actor=filings_context["user"],
        metadata={},
    )

    list_response = filings_authenticated_client.get(
        "/api/v1/filings/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
        },
    )
    detail_response = filings_authenticated_client.get(f"/api/v1/filings/{filing.id}/")
    attempts_response = filings_authenticated_client.get(f"/api/v1/filings/{filing.id}/attempts/")
    events_response = filings_authenticated_client.get(f"/api/v1/filings/{filing.id}/events/")

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    assert attempts_response.status_code == 200
    assert events_response.status_code == 200
    assert list_response.data["data"][0]["id"] == str(filing.id)
    assert detail_response.data["data"]["id"] == str(filing.id)
    assert attempts_response.data["data"][0]["attempt_number"] == 1
    assert events_response.data["data"][0]["event_type"] == "filing.queued"


@pytest.mark.django_db
def test_process_return_filing_task_moves_attempt_to_submitted_state(filings_context):
    from apps.filings.services.filings import process_return_filing

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.COMPLETED
    assert filing.provider_reference_id


@pytest.mark.django_db
def test_resync_filing_api_marks_filing_and_return_as_filed(filings_authenticated_client, filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-ref-test",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER,
        provider_request_id="wb-ref-test",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    response = filings_authenticated_client.post(f"/api/v1/filings/{filing.id}/resync/", {}, format="json")

    assert response.status_code == 200
    filing.refresh_from_db()
    attempt.refresh_from_db()
    filings_context["prepared_return"].refresh_from_db()
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert filing.arn.startswith("ARN-")
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.COMPLETED
    assert filings_context["prepared_return"].status == ReturnPreparation.PreparationStatus.FILED
    assert filings_context["prepared_return"].arn == filing.arn


@pytest.mark.django_db
def test_retry_filing_api_creates_new_attempt_and_resubmits(filings_authenticated_client, filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.NEEDS_RETRY,
        error_summary={"code": "whitebooks_temporary_error", "message": "Temporary failure"},
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        failure_code="whitebooks_temporary_error",
        failure_message="Temporary failure",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    response = filings_authenticated_client.post(
        f"/api/v1/filings/{filing.id}/retry/",
        {"comments": "Retry after temporary failure"},
        format="json",
    )

    assert response.status_code == 200
    filing.refresh_from_db()
    attempts = list(filing.attempts.order_by("attempt_number"))
    assert len(attempts) == 2
    assert attempts[1].attempt_number == 2
    assert attempts[1].status == ReturnFilingAttempt.AttemptStatus.COMPLETED
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert AuditLog.objects.filter(action="return_filing.retry_requested", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_process_return_filing_marks_session_limit_as_actionable_auth_failure(monkeypatch, filings_context):
    from apps.filings.services.filings import process_return_filing

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    def raise_session_limit(self, filing):
        raise WhiteBooksSessionLimitError("Maximum session allowed for user with this GSP account exceeded.")

    monkeypatch.setattr(WhiteBooksProvider, "submit_return", raise_session_limit)

    with pytest.raises(WhiteBooksSessionLimitError):
        process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert filing.status == ReturnFiling.FilingStatus.FAILED
    assert filing.error_summary["code"] == "whitebooks_session_limit"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.failure_code == "whitebooks_session_limit"


@pytest.mark.django_db
def test_request_whitebooks_otp_api_creates_auth_session(monkeypatch, settings, filings_authenticated_client, filings_context):
    override = {}

    def fake_request_otp(self, email):
        override["email"] = email
        return {
            "status_cd": "1",
            "status_desc": "user name exists",
            "header": {"txn": "2ac85ae689ce442180b2079bb7169897"},
        }

    monkeypatch.setattr(WhiteBooksProvider, "request_otp", fake_request_otp)

    response = filings_authenticated_client.post(
        "/api/v1/whitebooks-auth-sessions/request-otp/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "email": "ops@example.com",
        },
        format="json",
    )

    assert response.status_code == 200
    auth_session = WhiteBooksAuthSession.objects.get(pk=response.data["data"]["id"])
    assert auth_session.status == WhiteBooksAuthSession.SessionStatus.OTP_REQUESTED
    assert auth_session.txn == "2ac85ae689ce442180b2079bb7169897"
    assert auth_session.otp_request_payload["status_cd"] == "1"
    assert auth_session.otp_request_payload["status_desc"] == "user name exists"
    assert auth_session.email == settings.WHITEBOOKS_CONTACT_EMAIL
    assert override["email"] == settings.WHITEBOOKS_CONTACT_EMAIL
    assert AuditLog.objects.filter(action="whitebooks_auth.otp_requested", entity_id=auth_session.id).exists()


@pytest.mark.django_db
def test_verify_whitebooks_otp_api_stores_unresolved_auth_token_payload(monkeypatch, filings_authenticated_client, filings_context):
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-otp-001",
        status=WhiteBooksAuthSession.SessionStatus.OTP_REQUESTED,
        initiated_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    def fake_exchange(self, email, otp, txn):
        return WhiteBooksSession(
            mode="live",
            authenticated=True,
            raw_response={"status_cd": "1", "data": {"unknown_token_key": "abc123"}},
            metadata={"txn": txn, "response_contract_confirmed": False},
        )

    monkeypatch.setattr(WhiteBooksProvider, "exchange_otp_for_session", fake_exchange)

    response = filings_authenticated_client.post(
        f"/api/v1/whitebooks-auth-sessions/{auth_session.id}/verify-otp/",
        {"otp": "575757"},
        format="json",
    )

    assert response.status_code == 200
    auth_session.refresh_from_db()
    assert auth_session.status == WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED
    assert auth_session.response_contract_confirmed is False
    assert auth_session.auth_token_payload["data"]["unknown_token_key"] == "abc123"
    assert auth_session.session_metadata["txn"] == "txn-otp-001"
    assert AuditLog.objects.filter(action="whitebooks_auth.auth_token_received", entity_id=auth_session.id).exists()


@pytest.mark.django_db
def test_refresh_provider_auth_session_updates_verified_session(monkeypatch, filings_context):
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-refresh-001",
        status=WhiteBooksAuthSession.SessionStatus.SESSION_ACTIVE,
        response_contract_confirmed=True,
        auth_token_payload={"status_cd": "1", "header": {"txn": "txn-refresh-001"}},
        session_metadata={"txn": "txn-refresh-001", "response_contract_confirmed": True},
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    class FakeSession:
        def __init__(self):
            self.raw_response = {"status_cd": "1", "status_desc": "refresh ok", "header": {"txn": "txn-refresh-001"}}
            self.metadata = {
                "txn": "txn-refresh-001",
                "response_contract_confirmed": True,
                "session_credentials_present": True,
            }

        @property
        def response_contract_confirmed(self):
            return True

    def fake_refresh(self, *, email, txn, state_code=None, gst_username=None):
        return FakeSession()

    monkeypatch.setattr(WhiteBooksProvider, "refresh_auth_session", fake_refresh)

    refreshed = refresh_provider_auth_session(auth_session=auth_session, txn="", user=filings_context["user"])

    assert refreshed.status == WhiteBooksAuthSession.SessionStatus.SESSION_ACTIVE
    assert refreshed.response_contract_confirmed is True
    assert refreshed.auth_token_payload["status_desc"] == "refresh ok"
    assert refreshed.session_metadata["refresh_confirmed"] is True
    assert AuditLog.objects.filter(action="whitebooks_auth.refreshed", entity_id=auth_session.id).exists()


@pytest.mark.django_db
def test_refresh_whitebooks_auth_session_api(monkeypatch, filings_authenticated_client, filings_context):
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-refresh-api-001",
        status=WhiteBooksAuthSession.SessionStatus.SESSION_ACTIVE,
        response_contract_confirmed=True,
        auth_token_payload={"status_cd": "1", "header": {"txn": "txn-refresh-api-001"}},
        session_metadata={"txn": "txn-refresh-api-001", "response_contract_confirmed": True},
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    def fake_refresh(self, *, email, txn, state_code=None, gst_username=None):
        return WhiteBooksSession(
            mode="live",
            authenticated=True,
            raw_response={"status_cd": "1", "status_desc": "refresh ok", "header": {"txn": txn}},
            metadata={"txn": txn, "response_contract_confirmed": True, "session_credentials_present": True},
        )

    monkeypatch.setattr(WhiteBooksProvider, "refresh_auth_session", fake_refresh)

    response = filings_authenticated_client.post(
        f"/api/v1/whitebooks-auth-sessions/{auth_session.id}/refresh-token/",
        {},
        format="json",
    )

    assert response.status_code == 200
    auth_session.refresh_from_db()
    assert auth_session.session_metadata["refresh_confirmed"] is True
    assert response.data["message"] == "Provider auth session refreshed"


@pytest.mark.django_db
def test_whitebooks_success_payload_with_txn_is_treated_as_live_enabled(filings_context):
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-docx-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        auth_token_payload={
            "status_cd": "1",
            "status_desc": "If authentication succeeds",
            "header": {"txn": "txn-docx-001"},
        },
        session_metadata={
            "resolution_status": "session_credentials_missing_from_confirmed_auth_response",
            "session_credentials_present": False,
        },
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    assert is_provider_auth_session_live_enabled(auth_session=auth_session) is True


@pytest.mark.django_db
def test_unverified_auth_session_has_no_expiry_window(filings_context):
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="aadishb3@gmail.com",
        status=WhiteBooksAuthSession.SessionStatus.CREATED,
        initiated_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    freshness = get_provider_auth_session_freshness(auth_session=auth_session)

    assert freshness["verified_at"] is None
    assert freshness["expires_at"] is None
    assert freshness["is_stale"] is True


@pytest.mark.django_db
def test_whitebooks_mapper_builds_gstr1_retsave_payload_from_transactions(filings_context):
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-001",
        transaction_date="2026-04-05",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="B2B Buyer",
        taxable_value="1000.00",
        igst_amount="180.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="29",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={"line_items": [{"taxable_value": "1000.00", "igst_amount": "180.00", "rate": "18"}]},
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-002",
        transaction_date="2026-04-06",
        counterparty_gstin="",
        counterparty_name="Retail Customer",
        taxable_value="500.00",
        cgst_amount="45.00",
        sgst_amount="45.00",
        tax_amount="90.00",
        total_amount="590.00",
        place_of_supply="29",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="ECOM-001",
        transaction_date="2026-04-06",
        counterparty_gstin="",
        counterparty_name="Marketplace Customer",
        taxable_value="8000.00",
        cgst_amount="720.00",
        sgst_amount="720.00",
        tax_amount="1440.00",
        total_amount="9440.00",
        place_of_supply="29",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={
            "ecommerce_gstin": "29ECOM1234F1Z5",
            "ecommerce_section": "table_14",
            "line_items": [{"taxable_value": "8000.00", "cgst_amount": "720.00", "sgst_amount": "720.00", "rate": "18"}],
        },
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-003",
        transaction_date="2026-04-07",
        counterparty_gstin="",
        counterparty_name="Large Interstate Customer",
        taxable_value="300000.00",
        igst_amount="54000.00",
        tax_amount="54000.00",
        total_amount="354000.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={"line_items": [{"taxable_value": "300000.00", "igst_amount": "54000.00", "rate": "18"}]},
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="EXP-001",
        transaction_date="2026-04-07",
        counterparty_gstin="",
        counterparty_name="Overseas Buyer",
        taxable_value="25000.00",
        igst_amount="4500.00",
        tax_amount="4500.00",
        total_amount="29500.00",
        place_of_supply="96",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={"special_supply_type": "export_wpay", "port_code": "INBLR4", "shipping_bill_number": "SB-001", "shipping_bill_date": "2026-04-07", "line_items": [{"taxable_value": "25000.00", "igst_amount": "4500.00", "rate": "18", "total_amount": "29500.00"}]},
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="AMD-001",
        transaction_date="2026-04-08",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="B2B Buyer",
        taxable_value="6000.00",
        igst_amount="1080.00",
        tax_amount="1080.00",
        total_amount="7080.00",
        place_of_supply="29",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={
            "is_amendment": True,
            "original_document_number": "S-001",
            "original_document_date": "2026-03-31",
            "original_period": "032026",
            "line_items": [{"taxable_value": "6000.00", "igst_amount": "1080.00", "rate": "18"}],
        },
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="EXPA-001",
        transaction_date="2026-04-08",
        counterparty_gstin="",
        counterparty_name="Overseas Buyer",
        taxable_value="5000.00",
        igst_amount="900.00",
        tax_amount="900.00",
        total_amount="5900.00",
        place_of_supply="96",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={
            "is_amendment": True,
            "special_supply_type": "export_wpay",
            "original_document_number": "EXP-0001",
            "original_document_date": "2026-03-31",
            "original_period": "032026",
            "port_code": "INBLR4",
            "shipping_bill_number": "SB-001A",
            "shipping_bill_date": "2026-04-08",
            "line_items": [{"taxable_value": "5000.00", "igst_amount": "900.00", "rate": "18", "total_amount": "5900.00"}],
        },
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="credit_note",
        document_type="credit_note",
        reference_number="CN-A001",
        transaction_date="2026-04-08",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="B2B Buyer",
        taxable_value="100.00",
        igst_amount="18.00",
        tax_amount="18.00",
        total_amount="118.00",
        place_of_supply="29",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={
            "is_amendment": True,
            "original_document_number": "CN-0001",
            "original_document_date": "2026-03-31",
            "original_period": "032026",
            "line_items": [{"taxable_value": "100.00", "igst_amount": "18.00", "rate": "18"}],
        },
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="advance_received",
        document_type="receipt_voucher",
        reference_number="AR-001",
        transaction_date="2026-04-08",
        counterparty_gstin="",
        counterparty_name="Advance Customer",
        taxable_value="10000.00",
        igst_amount="1800.00",
        tax_amount="1800.00",
        total_amount="11800.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={"line_items": [{"taxable_value": "10000.00", "igst_amount": "1800.00", "rate": "18", "total_amount": "11800.00"}]},
    )
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="advance_adjusted",
        document_type="advance_adjustment",
        reference_number="AA-001",
        transaction_date="2026-04-09",
        counterparty_gstin="",
        counterparty_name="Advance Customer",
        taxable_value="4000.00",
        igst_amount="720.00",
        tax_amount="720.00",
        total_amount="4720.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        metadata={"advance_reference": "AR-001", "line_items": [{"taxable_value": "4000.00", "igst_amount": "720.00", "rate": "18", "total_amount": "4720.00"}]},
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR1
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "340500.00",
            "total_tax_amount": "61290.00",
        }
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks_ret_period"] == "042026"
    assert payload["whitebooks"]["readiness"]["save_supported"] is True
    assert payload["whitebooks"]["readiness"]["file_supported"] is True
    assert payload["whitebooks"]["operations"]["save"]["fp"] == "042026"
    assert payload["whitebooks"]["operations"]["save"]["gt"] == 340500.0
    assert payload["whitebooks"]["operations"]["save"]["b2b"][0]["ctin"] == "29ABCDE1234F1Z5"
    assert payload["whitebooks"]["operations"]["save"]["b2cl"][0]["pos"] == "27"
    assert payload["whitebooks"]["operations"]["save"]["b2cl"][0]["inv"][0]["inum"] == "S-003"
    assert payload["whitebooks"]["operations"]["save"]["b2cs"][0]["txval"] == 500.0
    assert payload["whitebooks"]["operations"]["save"]["b2cs"][1]["etin"] == "29ECOM1234F1Z5"
    assert payload["whitebooks"]["operations"]["save"]["b2ba"][0]["ctin"] == "29ABCDE1234F1Z5"
    assert payload["whitebooks"]["operations"]["save"]["b2ba"][0]["inv"][0]["inum"] == "AMD-001"
    assert payload["whitebooks"]["operations"]["save"]["cdnra"][0]["ctin"] == "29ABCDE1234F1Z5"
    assert payload["whitebooks"]["operations"]["save"]["cdnra"][0]["nt"][0]["ont_num"] == "CN-0001"
    assert payload["whitebooks"]["operations"]["save"]["exp"][0]["exp_typ"] == "WPAY"
    assert payload["whitebooks"]["operations"]["save"]["exp"][0]["inv"][0]["inum"] == "EXP-001"
    assert payload["whitebooks"]["operations"]["save"]["expa"][0]["exp_typ"] == "WPAY"
    assert payload["whitebooks"]["operations"]["save"]["expa"][0]["inv"][0]["oinum"] == "EXP-0001"
    assert payload["whitebooks"]["operations"]["save"]["at"][0]["pos"] == "27"
    assert payload["whitebooks"]["operations"]["save"]["at"][0]["itms"][0]["ad_amt"] == 10000.0
    assert payload["whitebooks"]["operations"]["save"]["txpd"][0]["itms"][0]["ad_amt"] == 4000.0
    amended_invoice = next(
        invoice
        for entry in payload["whitebooks"]["operations"]["save"]["b2ba"]
        if entry["ctin"] == "29ABCDE1234F1Z5"
        for invoice in entry["inv"]
        if invoice["inum"] == "AMD-001"
    )
    assert amended_invoice["oinum"] == "S-001"
    assert amended_invoice["oidt"] == "31-03-2026"
    assert amended_invoice["ofp"] == "032026"
    assert payload["whitebooks"]["operations"]["proceed"]["type"] == "GSTR1"
    assert payload["whitebooks"]["operations"]["proceed"]["isNil"] == "N"
    assert payload["whitebooks"]["operations"]["file"]["gstin"] == filings_context["gstin"].gstin
    assert payload["whitebooks"]["operations"]["file"]["ret_period"] == "042026"
    assert payload["whitebooks"]["operations"]["file"]["newSumFlag"] is True
    assert len(payload["whitebooks"]["operations"]["file"]["chksum"]) == 64
    assert len(payload["whitebooks"]["operations"]["file"]["sec_sum"]) >= 9
    section_names = {section["sec_nm"] for section in payload["whitebooks"]["operations"]["file"]["sec_sum"]}
    assert {"B2B", "B2CL", "B2CS", "B2BA", "CDNRA", "AT", "TXPD", "EXP", "EXPA"}.issubset(section_names)
    b2b_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "B2B")
    b2ba_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "B2BA")
    b2cl_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "B2CL")
    cdnra_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "CDNRA")
    at_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "AT")
    txpd_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "TXPD")
    exp_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "EXP")
    expa_section = next(section for section in payload["whitebooks"]["operations"]["file"]["sec_sum"] if section["sec_nm"] == "EXPA")
    assert b2b_section["ttl_rec"] == 1
    assert b2b_section["ttl_val"] == 1000.0
    assert b2b_section["ttl_igst"] == 180.0
    assert len(b2b_section["chksum"]) == 64
    assert b2b_section["sub_sections"][0]["sec_nm"].startswith("B2B_29ABCDE1234F1Z5")
    assert b2ba_section["ttl_rec"] == 1
    assert b2ba_section["ttl_val"] == 6000.0
    assert b2ba_section["ttl_igst"] == 1080.0
    assert b2cl_section["ttl_rec"] == 1
    assert b2cl_section["ttl_val"] == 300000.0
    assert b2cl_section["ttl_igst"] == 54000.0
    assert b2cl_section["sub_sections"][0]["sec_nm"] == "B2CL_27"
    assert cdnra_section["ttl_rec"] == 1
    assert cdnra_section["ttl_val"] == -100.0
    assert cdnra_section["ttl_igst"] == -18.0
    assert at_section["ttl_rec"] == 1
    assert at_section["ttl_val"] == 10000.0
    assert at_section["ttl_igst"] == 1800.0
    assert txpd_section["ttl_rec"] == 1
    assert txpd_section["ttl_val"] == 4000.0
    assert txpd_section["ttl_igst"] == 720.0
    assert exp_section["ttl_rec"] == 1
    assert exp_section["ttl_val"] == 25000.0
    assert exp_section["ttl_igst"] == 4500.0
    assert expa_section["ttl_rec"] == 1
    assert expa_section["ttl_val"] == 5000.0
    assert expa_section["ttl_igst"] == 900.0


@pytest.mark.django_db
def test_whitebooks_mapper_builds_gstr3b_retsave_payload_with_explicit_blockers(filings_context):
    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-101",
        transaction_date="2026-04-10",
        counterparty_gstin="",
        counterparty_name="Retail Customer",
        taxable_value="5000.00",
        igst_amount="900.00",
        tax_amount="900.00",
        total_amount="5900.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "5000.00",
            "outward_tax_liability": "900.00",
        },
        "itc_summary": {
            "eligible_itc": "180.00",
            "net_tax_payable": "720.00",
        },
    }
    filing.prepared_return.save(update_fields=["summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks_ret_period"] == "042026"
    assert payload["whitebooks"]["readiness"]["save_supported"] is True
    assert payload["whitebooks"]["readiness"]["offset_supported"] is False
    assert len(payload["whitebooks"]["readiness"]["blockers"]) >= 2
    assert payload["whitebooks"]["operations"]["save"]["sup_details"]["osup_det"]["txval"] == 5000.0
    assert payload["whitebooks"]["operations"]["save"]["itc_elg"]["itc_net"]["iamt"] == 180.0
    assert payload["whitebooks"]["operations"]["track"]["type"] == "GSTR3B"


@pytest.mark.django_db
def test_whitebooks_mapper_builds_gstr7_retsave_payload_from_summary_snapshot(filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR7
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr7",
        "summary_version": "gstr7.monthly.v1",
        "tds_summary": {
            "document_count": 3,
            "deductee_count": 2,
            "payment_amount": "165000.00",
            "taxable_value": "165000.00",
            "igst_amount": "800.00",
            "cgst_amount": "625.00",
            "sgst_amount": "625.00",
            "tds_amount": "2050.00",
        },
        "deductees": {
            "row_count": 2,
            "rows": [
                {
                    "deductee_gstin": "27ABCDE1234F1Z5",
                    "deductee_name": "Deductee Two",
                    "document_count": 1,
                    "payment_amount": "40000.00",
                    "taxable_value": "40000.00",
                    "igst_amount": "800.00",
                    "cgst_amount": "0.00",
                    "sgst_amount": "0.00",
                    "tds_amount": "800.00",
                    "transaction_ids": ["1"],
                },
                {
                    "deductee_gstin": "29ABCDE1234F1Z5",
                    "deductee_name": "Deductee One",
                    "document_count": 2,
                    "payment_amount": "125000.00",
                    "taxable_value": "125000.00",
                    "igst_amount": "0.00",
                    "cgst_amount": "625.00",
                    "sgst_amount": "625.00",
                    "tds_amount": "1250.00",
                    "transaction_ids": ["2", "3"],
                },
            ],
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR7,
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["readiness"]["save_supported"] is True
    assert payload["whitebooks"]["readiness"]["file_supported"] is False
    assert "validated tax_pay and offset mapping" in payload["whitebooks"]["readiness"]["blockers"][0]
    assert payload["whitebooks"]["operations"]["save"]["gstin"] == "29ABCDE1234P1Z5"
    assert payload["whitebooks"]["operations"]["save"]["fp"] == "042026"
    assert payload["whitebooks"]["operations"]["save"]["tdsa"] == []
    assert payload["whitebooks"]["operations"]["save"]["tds"][0]["gstin_ded"] == "27ABCDE1234F1Z5"
    assert payload["whitebooks"]["operations"]["save"]["tds"][0]["amt_ded"] == 40000.0
    assert payload["whitebooks"]["operations"]["save"]["tds"][1]["gstin_ded"] == "29ABCDE1234F1Z5"
    assert payload["whitebooks"]["operations"]["status"]["rettype"] == "GSTR7"
    assert payload["whitebooks"]["operations"]["track"]["type"] == "GSTR7"


@pytest.mark.django_db
def test_whitebooks_mapper_uses_explicit_gstr9_save_payload_when_present(filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9",
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {
                "b2c": {"txval": 1000, "iamt": 0, "camt": 90, "samt": 90, "csamt": 0},
            },
            "table5": {
                "zero_rtd": {"txval": 200},
            },
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["readiness"]["save_supported"] is True
    assert payload["whitebooks"]["readiness"]["file_supported"] is False
    assert payload["whitebooks"]["operations"]["save"]["fp"] == "032026"
    assert payload["whitebooks"]["operations"]["save"]["table4"]["b2c"]["txval"] == 1000
    assert payload["whitebooks"]["operations"]["status"]["rettype"] == "GSTR9"
    assert payload["whitebooks"]["operations"]["track"]["type"] == "GSTR9"


@pytest.mark.django_db
def test_whitebooks_mapper_uses_explicit_gstr9_file_payload_when_present(filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9",
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {},
        },
        "whitebooks_gstr9_file_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "isnil": "N",
            "table4": {},
            "tax_pay": [],
            "offset": [],
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["readiness"]["file_supported"] is True
    assert payload["whitebooks"]["operations"]["file"]["fp"] == "032026"
    assert payload["whitebooks"]["operations"]["file"]["tax_pay"] == []


@pytest.mark.django_db
def test_whitebooks_mapper_uses_explicit_gstr9c_save_payload_when_present(filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9C
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9c",
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9C,
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["readiness"]["save_supported"] is True
    assert payload["whitebooks"]["readiness"]["file_supported"] is False
    assert payload["whitebooks"]["operations"]["save"]["gstr9cdata"]["audited_data"]["fp"] == "032026"
    assert payload["whitebooks"]["operations"]["status"]["rettype"] == "GSTR9C"
    assert payload["whitebooks"]["operations"]["track"]["type"] == "GSTR9C"


@pytest.mark.django_db
def test_whitebooks_mapper_uses_explicit_gstr9c_file_payload_when_present(filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9C
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9c",
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
        "whitebooks_gstr9c_file_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9C,
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["readiness"]["file_supported"] is True
    assert payload["whitebooks"]["operations"]["file"]["gstr9cdata"]["audited_data"]["fp"] == "032026"


@pytest.mark.django_db
def test_whitebooks_mapper_uses_explicit_gstr7_file_payload_when_present(filings_context):
    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR7
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr7",
        "summary_version": "gstr7.monthly.v1",
        "deductees": {"rows": []},
        "whitebooks_gstr7_file_payload": {
            "gstin": "29ABCDE1234P1Z5",
            "fp": "042026",
            "tds": {"ttl_igst": 0.0, "ttl_cgst": 625.0, "ttl_sgst": 625.0, "ttl_amtDed": 125000.0, "no_rec": 2},
            "tdsa": {"ttl_igst": 0.0, "ttl_cgst": 0.0, "ttl_sgst": 0.0, "ttl_amtDed": 0.0, "no_rec": 0},
            "tax_pay": [],
            "offset": [],
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR7,
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["readiness"]["file_supported"] is True
    assert payload["whitebooks"]["operations"]["file"]["fp"] == "042026"
    assert payload["whitebooks"]["operations"]["file"]["tax_pay"] == []


@pytest.mark.django_db
def test_whitebooks_mapper_uses_ready_gstr3b_offset_profile_when_present(filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "5000.00",
            "outward_tax_liability": "900.00",
        },
        "itc_summary": {
            "eligible_itc": "180.00",
            "net_tax_payable": "720.00",
        },
    }
    filing.prepared_return.save(update_fields=["summary_snapshot", "updated_at"])
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 180.0}]},
        liability_snapshot={"outward_tax_liability": "900.00"},
        allocation_summary={"igst": "180.00"},
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["operations"]["offset"] == {
        "liab_ldg_id": "liab-001",
        "offset": [{"head": "igst", "amount": 180.0}],
    }
    assert payload["whitebooks"]["readiness"]["offset_supported"] is True
    assert any("retfile payload should follow validated post-offset values" in blocker for blocker in payload["whitebooks"]["readiness"]["blockers"])


@pytest.mark.django_db
def test_whitebooks_mapper_uses_ready_gstr3b_file_payload_when_present(filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={
            "offset_payload": {"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 180.0}]},
            "file_payload": {"liab_ldg_id": "liab-001", "setoff": [{"head": "igst", "amount": 180.0}]},
        },
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    payload = map_return_filing_to_whitebooks_payload(filing)

    assert payload["whitebooks"]["operations"]["offset"] == {
        "liab_ldg_id": "liab-001",
        "offset": [{"head": "igst", "amount": 180.0}],
    }
    assert payload["whitebooks"]["operations"]["file"] == {
        "liab_ldg_id": "liab-001",
        "setoff": [{"head": "igst", "amount": 180.0}],
    }
    assert payload["whitebooks"]["readiness"]["offset_supported"] is True
    assert payload["whitebooks"]["readiness"]["file_supported"] is True


@pytest.mark.django_db
def test_live_gstr1_save_uses_verified_whitebooks_auth_session(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = False
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-LIVE-001",
        transaction_date="2026-04-05",
        counterparty_gstin="29ABCDE1234F1Z5",
        counterparty_name="B2B Buyer",
        taxable_value="1000.00",
        igst_amount="180.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="29",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=GSTIN.objects.create(
            client=filings_context["client"],
            gstin="29ABCDE1234P9Z9",
            registration_type="regular",
            state_code="29",
            created_by=filings_context["user"],
            updated_by=filings_context["user"],
        ),
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="other@example.com",
        txn="txn-live-other",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    captured = {}

    def fake_save_gstr1_return(self, *, email, gstin, ret_period, txn, payload):
        captured.update(
            {
                "email": email,
                "gstin": gstin,
                "ret_period": ret_period,
                "txn": txn,
                "payload": payload,
            }
        )
        return {"status_cd": "1", "ref_id": "wb-save-001", "header": {"client_secret": "secret-value", "txn": txn}}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr1_return", fake_save_gstr1_return)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == auth_session.txn
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert attempt.request_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["save_response"]["header"]["client_secret"] == "[REDACTED]"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_save_requested", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.draft_saved", entity_id=filing.id).exists()
    assert captured["email"] == "ops@example.com"
    assert captured["txn"] == "txn-live-001"
    assert captured["ret_period"] == "042026"
    assert captured["payload"]["fp"] == "042026"


@pytest.mark.django_db
def test_live_gstr1_save_rejects_stale_whitebooks_auth_session(settings, filings_context):
    from django.utils import timezone

    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES = 30
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-stale-001",
        status=WhiteBooksAuthSession.SessionStatus.SESSION_ACTIVE,
        verified_at=timezone.now() - timezone.timedelta(minutes=45),
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    with pytest.raises(WhiteBooksSubmissionError) as exc_info:
        process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert "older than 30 minutes" in str(exc_info.value)
    assert filing.status == ReturnFiling.FilingStatus.FAILED
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.failure_code == "whitebooks_submission_error"


def test_whitebooks_provider_capabilities_follow_flags_and_payload_readiness(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR1
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1500.00",
            "total_tax_amount": "270.00",
        }
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.sandbox_mode is False
    assert capabilities.auth_session_required is True
    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["proceed"] is True
    assert capabilities.supported_operations["file"] is False
    assert provider.planned_submission_stage(filing) == "proceeded_to_file"


def test_whitebooks_provider_capabilities_enable_live_file_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR1
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1500.00",
            "total_tax_amount": "270.00",
        }
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.supported_operations["file"] is True
    assert provider.planned_submission_stage(filing) == "file_requested"


def test_whitebooks_provider_capabilities_enable_live_gstr3b_save_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR3B
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "1500.00",
            "outward_tax_liability": "270.00",
        },
        "itc_summary": {
            "eligible_itc": "100.00",
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.sandbox_mode is False
    assert capabilities.auth_session_required is True
    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["proceed"] is False
    assert capabilities.supported_operations["file"] is False
    assert capabilities.supported_operations["offset"] is False
    assert provider.planned_submission_stage(filing) == "draft_saved"


def test_whitebooks_provider_capabilities_enable_live_gstr7_save_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR7,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR7
    filing.prepared_return.summary_snapshot = {
        "deductees": {
            "rows": [
                {
                    "deductee_gstin": "29ABCDE1234F1Z5",
                    "payment_amount": "1000.00",
                    "igst_amount": "0.00",
                    "cgst_amount": "10.00",
                    "sgst_amount": "10.00",
                }
            ]
        }
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.sandbox_mode is False
    assert capabilities.auth_session_required is True
    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["file"] is False
    assert capabilities.supported_operations["offset"] is False
    assert provider.planned_submission_stage(filing) == "draft_saved"


def test_whitebooks_provider_capabilities_enable_live_gstr9_save_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR9
    filing.prepared_return.summary_snapshot = {
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {},
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.sandbox_mode is False
    assert capabilities.auth_session_required is True
    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["file"] is False
    assert capabilities.supported_operations["offset"] is False
    assert provider.planned_submission_stage(filing) == "draft_saved"


def test_whitebooks_provider_capabilities_enable_live_gstr9_file_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR9_FILE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR9
    filing.prepared_return.summary_snapshot = {
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {},
        },
        "whitebooks_gstr9_file_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "isnil": "N",
            "table4": {},
            "tax_pay": [],
            "offset": [],
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["file"] is True
    assert provider.planned_submission_stage(filing) == "file_requested"


def test_whitebooks_provider_capabilities_enable_live_gstr9c_save_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9C,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR9C
    filing.prepared_return.summary_snapshot = {
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.sandbox_mode is False
    assert capabilities.auth_session_required is True
    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["file"] is False
    assert capabilities.supported_operations["offset"] is False
    assert provider.planned_submission_stage(filing) == "draft_saved"


def test_whitebooks_provider_capabilities_enable_live_gstr9c_file_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR9C_FILE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9C,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR9C
    filing.prepared_return.summary_snapshot = {
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
        "whitebooks_gstr9c_file_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["file"] is True
    assert provider.planned_submission_stage(filing) == "file_requested"


def test_whitebooks_provider_capabilities_enable_live_gstr7_file_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR7_FILE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR7,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR7
    filing.prepared_return.summary_snapshot = {
        "deductees": {"rows": []},
        "whitebooks_gstr7_file_payload": {
            "gstin": "29ABCDE1234P1Z5",
            "fp": "042026",
            "tds": {"ttl_igst": 0.0, "ttl_cgst": 625.0, "ttl_sgst": 625.0, "ttl_amtDed": 125000.0, "no_rec": 2},
            "tdsa": {"ttl_igst": 0.0, "ttl_cgst": 0.0, "ttl_sgst": 0.0, "ttl_amtDed": 0.0, "no_rec": 0},
            "tax_pay": [],
            "offset": [],
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["file"] is True
    assert provider.planned_submission_stage(filing) == "file_requested"


def test_whitebooks_provider_capabilities_enable_live_gstr3b_offset_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR3B
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "1500.00",
            "outward_tax_liability": "270.00",
        },
        "itc_summary": {
            "eligible_itc": "100.00",
        },
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 100.0}]},
        liability_snapshot={"outward_tax_liability": "270.00"},
        allocation_summary={"igst": "100.00"},
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["save"] is True
    assert capabilities.supported_operations["offset"] is True
    assert provider.planned_submission_stage(filing) == "offset_applied"


def test_whitebooks_provider_capabilities_enable_live_gstr3b_file_when_flagged(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={
            "offset_payload": {"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 100.0}]},
            "file_payload": {"liab_ldg_id": "liab-001", "setoff": [{"head": "igst", "amount": 100.0}]},
        },
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is True
    assert capabilities.supported_operations["offset"] is True
    assert capabilities.supported_operations["file"] is True
    assert provider.planned_submission_stage(filing) == "file_requested"


def test_whitebooks_provider_capabilities_require_tenant_rollout_when_enforced(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.FILING_ENFORCE_TENANT_ROLLOUT = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing.prepared_return.return_type = ReturnPreparation.ReturnType.GSTR1
    filing.prepared_return.summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1500.00",
            "total_tax_amount": "270.00",
        }
    }
    filing.prepared_return.save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is False
    assert capabilities.rollout_enabled is False
    assert capabilities.rollout_reason == "No active tenant rollout policy allows live filing for this provider context."
    assert capabilities.supported_operations["proceed"] is False
    assert capabilities.supported_operations["file"] is False
    assert provider.planned_submission_stage(filing) == "submitted"


def test_whitebooks_provider_capabilities_allow_tenant_specific_rollout(settings, filings_context):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE = True
    settings.FILING_ENFORCE_TENANT_ROLLOUT = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={
            "offset_payload": {"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 100.0}]},
            "file_payload": {"liab_ldg_id": "liab-001", "setoff": [{"head": "igst", "amount": 100.0}]},
        },
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ProviderRolloutPolicy.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        enable_live_submission=True,
        enable_live_status_sync=True,
        notes="Pilot GSTIN enabled for live 3B filing.",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    payload = map_return_filing_to_whitebooks_payload(filing)
    provider = WhiteBooksProvider()
    capabilities = provider.get_capabilities(filing=filing, payload=payload)

    assert capabilities.live_submission_enabled is True
    assert capabilities.live_status_sync_enabled is True
    assert capabilities.rollout_enabled is True
    assert capabilities.supported_operations["offset"] is True
    assert capabilities.supported_operations["file"] is True
    assert provider.planned_submission_stage(filing) == "file_requested"


@pytest.mark.django_db
def test_live_status_sync_respects_tenant_rollout_policy(settings, filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.FILING_ENFORCE_TENANT_ROLLOUT = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-3b-file-rollout-001",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        provider_request_id="wb-3b-file-rollout-001",
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "operations_completed": ["draft_saved", "offset_applied", "file_requested"],
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-rollout-sync-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ProviderRolloutPolicy.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        enable_live_submission=True,
        enable_live_status_sync=False,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    status = WhiteBooksProvider().get_status(filing)

    assert status["submission_state"] == ReturnFiling.FilingStatus.SUBMITTED
    assert status["raw_response"]["provider_stage"] == "file_requested"
    assert status["raw_response"]["next_action"] == "review_rollout_controls"
    assert "blocked by tenant rollout policy" in status["raw_response"]["message"].lower()

    attempt = filing.attempts.order_by("-attempt_number").first()
    attempt.response_summary = {**attempt.response_summary, **status["raw_response"]}
    attempt.save(update_fields=["response_summary", "updated_at"])
    data = ReturnFilingSerializer(instance=filing).data
    assert data["support_actions_summary"]["recommended_action"] == "review_rollout_controls"
    assert "rollout controls" in data["support_actions_summary"]["summary_reason"].lower()
    assert data["rollout_policy_summary"]["enforced"] is True
    assert data["rollout_policy_summary"]["policy_present"] is True
    assert data["rollout_policy_summary"]["live_submission_allowed"] is True
    assert data["rollout_policy_summary"]["live_status_sync_allowed"] is False
    assert data["rollout_policy_summary"]["policy_scope"] == ["workspace", "client", "gstin", "return_type"]


@pytest.mark.django_db
def test_return_filing_serializer_exposes_missing_rollout_policy_summary(settings, filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    settings.FILING_ENFORCE_TENANT_ROLLOUT = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.APPROVED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(instance=filing).data

    assert data["rollout_policy_summary"]["enforced"] is True
    assert data["rollout_policy_summary"]["policy_present"] is False
    assert data["rollout_policy_summary"]["live_submission_allowed"] is False
    assert "no active tenant rollout policy" in data["rollout_policy_summary"]["submission_reason"].lower()


@pytest.mark.django_db
def test_return_filing_serializer_exposes_operational_alerts_and_incident_notes(settings, filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    settings.FILING_ENFORCE_TENANT_ROLLOUT = True

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
        last_status_sync_at=timezone.now() - timezone.timedelta(hours=2),
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "next_action": "review_rollout_controls",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingIncidentNote.objects.create(
        return_filing=filing,
        title="Provider timeout under review",
        note="Support is checking whether WhiteBooks accepted the filing.",
        severity=ReturnFilingIncidentNote.Severity.CRITICAL,
        status=ReturnFilingIncidentNote.Status.OPEN,
        alert_code="provider_timeout",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(instance=filing).data

    alert_codes = {alert["code"] for alert in data["operational_alerts"]}
    assert "rollout_controls_blocked" in alert_codes
    assert "confirmation_pending" in alert_codes
    assert "stale_status_sync" in alert_codes
    assert data["incident_notes"][0]["title"] == "Provider timeout under review"
    assert data["incident_notes"][0]["alert_code"] == "provider_timeout"


@pytest.mark.django_db
def test_return_filing_alert_escalation_routes_recipients_and_sends_email(settings, filings_context):
    from apps.filings.services.filings import escalate_return_filing_operational_alerts

    settings.FILING_ALERT_EMAIL_ENABLED = True
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

    reviewer = User.objects.create_user(username="opsreview", email="opsreview@example.com", password="strong-pass-123")
    WorkspaceMembership.objects.create(
        user=reviewer,
        workspace=filings_context["workspace"],
        role=WorkspaceRole.REVIEWER,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    OperationalAlertRoutingRule.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        alert_code="confirmation_pending",
        minimum_severity=ReturnFilingIncidentNote.Severity.WARNING,
        target_role=WorkspaceRole.REVIEWER,
        notes="Escalate confirmation-pending GSTR-3B filings to review operations.",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        last_status_sync_at=timezone.now(),
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        request_summary={"provider_stage": "file_requested"},
        response_summary={"provider_stage": "file_requested", "next_action": "resync_for_arn_or_status"},
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    incident_note = escalate_return_filing_operational_alerts(
        filing=filing,
        user=filings_context["user"],
        comments="Escalating confirmation-pending filing to review operations.",
    )
    incident_note.refresh_from_db()

    assert incident_note.title == "Operational alerts escalated"
    assert incident_note.alert_code == "confirmation_pending"
    assert incident_note.metadata["routed_recipients"][0]["email"] == "opsreview@example.com"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.alerts_escalated").exists()
    assert AuditLog.objects.filter(action="return_filing.alerts_escalated", entity_id=filing.id).exists()
    assert len(mail.outbox) == 1
    assert "confirmation-pending" in mail.outbox[0].body.lower()


@pytest.mark.django_db
def test_return_filing_alert_routing_summary_uses_default_roles_when_no_rule_matches(settings, filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    settings.FILING_DEFAULT_ALERT_RECIPIENT_ROLES = [WorkspaceRole.REVIEWER, WorkspaceRole.MANAGER]

    reviewer = User.objects.create_user(username="defreview", email="defreview@example.com", password="strong-pass-123")
    manager = User.objects.create_user(username="defmanager", email="defmanager@example.com", password="strong-pass-123")
    WorkspaceMembership.objects.create(
        user=reviewer,
        workspace=filings_context["workspace"],
        role=WorkspaceRole.REVIEWER,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WorkspaceMembership.objects.create(
        user=manager,
        workspace=filings_context["workspace"],
        role=WorkspaceRole.MANAGER,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        request_summary={"provider_stage": "file_requested"},
        response_summary={"provider_stage": "file_requested", "next_action": "resync_for_arn_or_status"},
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(instance=filing).data

    assert data["alert_routing_summary"]["routing_mode"] == "default"
    assert data["alert_routing_summary"]["matched_rules"] == []
    recipient_emails = {recipient["email"] for recipient in data["alert_routing_summary"]["recipients"]}
    assert recipient_emails == {"defreview@example.com", "defmanager@example.com"}


@pytest.mark.django_db
def test_live_gstr1_status_sync_does_not_auto_mark_filed(settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="txn-live-001",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER,
        provider_request_id="txn-live-001",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert result["submission_state"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.status_synced").exists()
    assert AuditLog.objects.filter(action="return_filing.status_synced", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_live_gstr1_status_sync_preserves_partial_progress_metadata(settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.NEEDS_RETRY,
        provider_reference_id="txn-live-004",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        provider_request_id="txn-live-004",
        request_summary={"provider_stage": "draft_saved"},
        response_summary={
            "provider_stage": "draft_saved",
            "operations_completed": ["draft_saved"],
            "next_action": "retry_filing",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.NEEDS_RETRY
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["operations_completed"] == ["draft_saved"]
    assert attempt.response_summary["next_action"] == "retry_filing"
    assert attempt.provider_status_raw["next_action"] == "retry_filing"


@pytest.mark.django_db
def test_live_gstr1_file_requested_status_sync_marks_filed_when_arn_is_returned(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-file-001",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        provider_request_id="wb-file-001",
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "operations_completed": ["draft_saved", "proceeded_to_file", "file_requested"],
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-005",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    monkeypatch.setattr(
        WhiteBooksClient,
        "get_return_status",
        lambda self, **kwargs: {"status_cd": "1", "data": {"arn": "ARNWB1234567890"}},
    )
    monkeypatch.setattr(
        WhiteBooksClient,
        "track_return",
        lambda self, **kwargs: {"status_cd": "1", "status_desc": "Return filed successfully"},
    )

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    filings_context["prepared_return"].refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.FILED
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert filing.arn == "ARNWB1234567890"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.COMPLETED
    assert attempt.response_summary["status_response"]["data"]["arn"] == "ARNWB1234567890"
    assert attempt.response_summary["track_response"]["status_desc"] == "Return filed successfully"
    assert filings_context["prepared_return"].status == ReturnPreparation.PreparationStatus.FILED
    assert filings_context["prepared_return"].arn == "ARNWB1234567890"


@pytest.mark.django_db
def test_live_gstr1_file_requested_status_sync_falls_back_to_public_track(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-file-public-track-001",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        provider_request_id="wb-file-public-track-001",
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "operations_completed": ["draft_saved", "proceeded_to_file", "file_requested"],
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-public-track-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    observed = {}

    monkeypatch.setattr(
        WhiteBooksClient,
        "get_return_status",
        lambda self, **kwargs: {"status_cd": "1", "data": {}},
    )
    monkeypatch.setattr(
        WhiteBooksClient,
        "track_return",
        lambda self, **kwargs: {"status_cd": "1", "status_desc": "Confirmation pending"},
    )

    def fake_track_return_public(self, **kwargs):
        observed["fy"] = kwargs.get("fy")
        observed["type"] = kwargs.get("return_type")
        return {"status_cd": "1", "data": {"arn": "ARNPUBLIC1234567890"}, "status_desc": "Return filed successfully"}

    monkeypatch.setattr(WhiteBooksClient, "track_return_public", fake_track_return_public)

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    filings_context["prepared_return"].refresh_from_db()
    assert observed["fy"] == "2026-27"
    assert observed["type"] == "GSTR1"
    assert result["status"] == ReturnFiling.FilingStatus.FILED
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert filing.arn == "ARNPUBLIC1234567890"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.COMPLETED
    assert attempt.response_summary["public_track_response"]["data"]["arn"] == "ARNPUBLIC1234567890"
    assert filings_context["prepared_return"].status == ReturnPreparation.PreparationStatus.FILED
    assert filings_context["prepared_return"].arn == "ARNPUBLIC1234567890"


@pytest.mark.django_db
def test_live_gstr1_file_requested_status_sync_marks_failed_when_provider_reports_failure(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-file-002",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        provider_request_id="wb-file-002",
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "operations_completed": ["draft_saved", "proceeded_to_file", "file_requested"],
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-006",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    monkeypatch.setattr(
        WhiteBooksClient,
        "get_return_status",
        lambda self, **kwargs: {"status_cd": "0", "error": {"error_cd": "RET404", "message": "Return filing rejected by provider"}},
    )
    monkeypatch.setattr(
        WhiteBooksClient,
        "track_return",
        lambda self, **kwargs: {"status_cd": "0", "status_desc": "Return rejected"},
    )

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.FAILED
    assert filing.status == ReturnFiling.FilingStatus.FAILED
    assert filing.error_summary["code"] == "RET404"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.failure_code == "RET404"
    assert attempt.response_summary["failure_summary"]["code"] == "RET404"
    assert attempt.response_summary["status_response"]["error"]["message"] == "Return filing rejected by provider"
    assert AuditLog.objects.filter(action="return_filing.status_sync_failed", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_live_gstr3b_file_requested_status_sync_marks_filed_when_arn_is_returned(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-3b-file-arn-001",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        provider_request_id="wb-3b-file-arn-001",
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "operations_completed": ["draft_saved", "offset_applied", "file_requested"],
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-3b-sync-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    observed = {}

    def fake_get_return_status(self, **kwargs):
        observed["rettype"] = kwargs.get("rettype")
        return {"status_cd": "1", "data": {"arn": "ARNWB3B1234567890"}}

    monkeypatch.setattr(WhiteBooksClient, "get_return_status", fake_get_return_status)
    monkeypatch.setattr(
        WhiteBooksClient,
        "track_return",
        lambda self, **kwargs: {"status_cd": "1", "status_desc": "GSTR-3B return filed successfully"},
    )

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    filings_context["prepared_return"].refresh_from_db()
    assert observed["rettype"] == "GSTR3B"
    assert result["status"] == ReturnFiling.FilingStatus.FILED
    assert filing.status == ReturnFiling.FilingStatus.FILED
    assert filing.arn == "ARNWB3B1234567890"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.COMPLETED
    assert attempt.response_summary["status_response"]["data"]["arn"] == "ARNWB3B1234567890"
    assert attempt.response_summary["track_response"]["status_desc"] == "GSTR-3B return filed successfully"
    assert filings_context["prepared_return"].status == ReturnPreparation.PreparationStatus.FILED
    assert filings_context["prepared_return"].arn == "ARNWB3B1234567890"


@pytest.mark.django_db
def test_live_gstr3b_file_requested_status_sync_marks_failed_when_provider_reports_failure(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import sync_return_filing_status
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        provider_reference_id="wb-3b-file-fail-001",
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        provider_request_id="wb-3b-file-fail-001",
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "operations_completed": ["draft_saved", "offset_applied", "file_requested"],
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-3b-sync-002",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    observed = {}

    def fake_get_return_status(self, **kwargs):
        observed["rettype"] = kwargs.get("rettype")
        return {"status_cd": "0", "error": {"error_cd": "RET3B409", "message": "GSTR-3B filing rejected by provider"}}

    monkeypatch.setattr(WhiteBooksClient, "get_return_status", fake_get_return_status)
    monkeypatch.setattr(
        WhiteBooksClient,
        "track_return",
        lambda self, **kwargs: {"status_cd": "0", "status_desc": "GSTR-3B return rejected"},
    )

    result = sync_return_filing_status(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert observed["rettype"] == "GSTR3B"
    assert result["status"] == ReturnFiling.FilingStatus.FAILED
    assert filing.status == ReturnFiling.FilingStatus.FAILED
    assert filing.error_summary["code"] == "RET3B409"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.failure_code == "RET3B409"
    assert attempt.response_summary["failure_summary"]["code"] == "RET3B409"
    assert attempt.response_summary["status_response"]["error"]["message"] == "GSTR-3B filing rejected by provider"
    assert AuditLog.objects.filter(action="return_filing.status_sync_failed", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_return_filing_serializer_exposes_retry_recovery_actions(filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.NEEDS_RETRY,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        response_summary={
            "provider_stage": "draft_saved",
            "next_action": "retry_filing",
            "failure_summary": {"retryable": True},
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(filing).data

    assert data["recovery_actions"]["can_retry"] is True
    assert data["recovery_actions"]["can_resync"] is False
    assert data["recovery_actions"]["recommended_action"] == "retry_filing"


@pytest.mark.django_db
def test_return_filing_serializer_exposes_resync_recovery_actions_for_confirmation_pending(filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "next_action": "resync_for_arn_or_status",
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(filing).data

    assert data["recovery_actions"]["can_retry"] is False
    assert data["recovery_actions"]["can_resync"] is True
    assert data["recovery_actions"]["recommended_action"] == "resync_status"


@pytest.mark.django_db
def test_return_filing_serializer_exposes_intervention_history(filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.FAILED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingEvent.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        event_type="filing.proceed_failed",
        old_status=ReturnFiling.FilingStatus.SUBMITTED,
        new_status=ReturnFiling.FilingStatus.FAILED,
        actor=filings_context["user"],
        metadata={"message": "WhiteBooks rejected the proceed step."},
    )
    ReturnFilingEvent.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        event_type="filing.recovery_requeued",
        old_status=ReturnFiling.FilingStatus.FAILED,
        new_status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        actor=filings_context["user"],
        metadata={"comments": "Support reviewed the provider rejection and requeued it."},
    )

    data = ReturnFilingSerializer(filing).data

    assert len(data["intervention_history"]) == 2
    assert data["intervention_history"][0]["event_type"] == "filing.recovery_requeued"
    assert data["intervention_history"][0]["label"] == "requeued after review"
    assert data["intervention_history"][0]["note"] == "Support reviewed the provider rejection and requeued it."
    assert data["intervention_history"][1]["event_type"] == "filing.proceed_failed"
    assert data["intervention_history"][1]["label"] == "proceed to file failed"


@pytest.mark.django_db
def test_return_filing_serializer_exposes_provider_evidence_summary(filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.FAILED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        request_summary={"provider_stage": "proceeded_to_file"},
        response_summary={
            "provider_stage": "proceeded_to_file",
            "message": "Proceed step rejected by WhiteBooks.",
            "next_action": "review_provider_error",
            "auth_session_id": "session-123",
            "operations_requested": ["save", "proceed"],
            "operations_completed": ["draft_saved"],
            "operations_failed": ["proceed"],
            "save_response": {"status_cd": "1"},
            "failure_summary": {
                "code": "whitebooks_proceed_rejected",
                "message": "Proceed step rejected by WhiteBooks.",
                "retryable": False,
            },
        },
        failure_code="whitebooks_proceed_rejected",
        failure_message="Proceed step rejected by WhiteBooks.",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(filing).data

    assert data["provider_evidence_summary"]["provider_stage"] == "proceeded_to_file"
    assert data["provider_evidence_summary"]["latest_message"] == "Proceed step rejected by WhiteBooks."
    assert data["provider_evidence_summary"]["next_action"] == "review_provider_error"
    assert data["provider_evidence_summary"]["auth_session_id"] == "session-123"
    assert data["provider_evidence_summary"]["operations_completed"] == ["draft_saved"]
    assert data["provider_evidence_summary"]["operations_failed"] == ["proceed"]
    assert data["provider_evidence_summary"]["evidence_available"]["save_response"] is True
    assert data["provider_evidence_summary"]["evidence_available"]["status_response"] is False
    assert data["provider_evidence_summary"]["latest_failure"]["code"] == "whitebooks_proceed_rejected"
    assert data["provider_evidence_summary"]["latest_failure"]["retryable"] is False


@pytest.mark.django_db
def test_return_filing_serializer_exposes_support_actions_summary(filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.FAILED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        response_summary={
            "provider_stage": "proceeded_to_file",
            "next_action": "review_provider_error",
            "failure_summary": {"code": "RET404", "message": "Rejected", "retryable": False},
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    data = ReturnFilingSerializer(filing).data
    actions = {item["action"]: item for item in data["support_actions_summary"]["actions"]}

    assert data["support_actions_summary"]["recommended_action"] == "review_provider_error"
    assert actions["retry"]["allowed"] is False
    assert actions["resync"]["allowed"] is False
    assert actions["requeue_after_review"]["allowed"] is True


@pytest.mark.django_db
def test_return_filing_serializer_exposes_support_status_summary(filings_context):
    from apps.filings.serializers import ReturnFilingSerializer

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "message": "Await ARN confirmation.",
            "next_action": "resync_for_arn_or_status",
            "status_response": {"status_cd": "1"},
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingEvent.objects.create(
        return_filing=filing,
        filing_attempt=attempt,
        event_type="filing.status_synced",
        old_status=ReturnFiling.FilingStatus.SUBMITTED,
        new_status=ReturnFiling.FilingStatus.SUBMITTED,
        actor=filings_context["user"],
        metadata={"message": "Provider status checked."},
    )

    data = ReturnFilingSerializer(filing).data

    assert data["support_status_summary"]["filing_status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert data["support_status_summary"]["provider_stage"] == "file_requested"
    assert data["support_status_summary"]["recommended_action"] == "resync_status"
    assert data["support_status_summary"]["latest_message"] == "Await ARN confirmation."
    assert data["support_status_summary"]["has_provider_failure"] is False
    assert data["support_status_summary"]["intervention_count"] == 1
    assert data["support_status_summary"]["evidence_flags"]["status_response"] is True


@pytest.mark.django_db
def test_filing_operations_endpoint_returns_unresolved_filings_only_by_default(filings_authenticated_client, filings_context):
    resolved_prepared_return = ReturnPreparation.objects.create(
        compliance_period=filings_context["compliance_period"],
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnPreparation.PreparationStatus.FILED,
        summary_snapshot={"outward_supplies": {"taxable_value": "500.00"}},
        prepared_by=filings_context["user"],
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=resolved_prepared_return,
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.FILED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    actionable_filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=actionable_filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS,
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "message": "Await ARN confirmation.",
            "next_action": "resync_for_arn_or_status",
            "status_response": {"status_cd": "1"},
        },
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    response = filings_authenticated_client.get(
        "/api/v1/filings/operations/",
        {"workspace": str(filings_context["workspace"].id)},
    )

    assert response.status_code == 200
    assert response.data["pagination"]["count"] == 1
    assert response.data["data"][0]["id"] == str(actionable_filing.id)
    assert response.data["data"][0]["support_status_summary"]["recommended_action"] == "resync_status"


@pytest.mark.django_db
def test_requeue_return_filing_after_review_creates_new_attempt(monkeypatch, filings_context):
    from apps.filings.services.filings import requeue_return_filing_after_review

    monkeypatch.setattr("apps.filings.services.filings.enqueue_return_filing", lambda **kwargs: None)

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.FAILED,
        error_summary={"code": "RET404", "message": "Rejected"},
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        failure_code="RET404",
        failure_message="Rejected",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    requeue_return_filing_after_review(
        filing=filing,
        user=filings_context["user"],
        comments="Reviewed provider evidence and approved replay.",
    )

    filing.refresh_from_db()
    attempts = list(filing.attempts.order_by("attempt_number"))
    assert filing.status == ReturnFiling.FilingStatus.QUEUED_FOR_FILING
    assert filing.error_summary == {}
    assert len(attempts) == 2
    assert attempts[1].request_summary["support_requeue"] is True
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.recovery_requeued").exists()
    assert AuditLog.objects.filter(action="return_filing.recovery_requeued", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_requeue_after_review_api_requeues_failed_filing(monkeypatch, filings_authenticated_client, filings_context):
    monkeypatch.setattr("apps.filings.services.filings.enqueue_return_filing", lambda **kwargs: None)

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.FAILED,
        error_summary={"code": "RET404", "message": "Rejected"},
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        failure_code="RET404",
        failure_message="Rejected",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    response = filings_authenticated_client.post(
        f"/api/v1/filings/{filing.id}/requeue-after-review/",
        {"comments": "Support reviewed provider rejection and approved a controlled replay."},
        format="json",
    )

    assert response.status_code == 200
    filing.refresh_from_db()
    assert filing.status == ReturnFiling.FilingStatus.QUEUED_FOR_FILING


@pytest.mark.django_db
def test_create_and_resolve_incident_note_api(filings_authenticated_client, filings_context):
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.SUBMITTED,
        approved_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    create_response = filings_authenticated_client.post(
        f"/api/v1/filings/{filing.id}/incident-notes/",
        {
            "title": "Delayed ARN follow-up",
            "note": "Support will resync after confirming the provider queue.",
            "severity": "warning",
            "alert_code": "delayed_arn",
        },
        format="json",
    )

    assert create_response.status_code == 200
    note_id = create_response.data["data"]["id"]
    filing.refresh_from_db()
    assert filing.incident_notes.count() == 1
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.incident_note_created").exists()
    assert AuditLog.objects.filter(action="return_filing.incident_note_created", entity_id=filing.id).exists()

    list_response = filings_authenticated_client.get(f"/api/v1/filings/{filing.id}/incident-notes/")
    assert list_response.status_code == 200
    assert list_response.data["data"][0]["title"] == "Delayed ARN follow-up"

    resolve_response = filings_authenticated_client.post(
        f"/api/v1/filings/{filing.id}/incident-notes/{note_id}/resolve/",
        {"status": "resolved"},
        format="json",
    )
    assert resolve_response.status_code == 200
    assert resolve_response.data["data"]["status"] == "resolved"

    note = filing.incident_notes.get(pk=note_id)
    assert note.status == ReturnFilingIncidentNote.Status.RESOLVED
    assert note.resolved_by_id == filings_context["user"].id
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.incident_note_resolved").exists()
    assert AuditLog.objects.filter(action="return_filing.incident_note_resolved", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_filer_role_is_blocked_from_support_only_filing_actions(filings_context):
    filer = User.objects.create_user(username="filingonly", email="filingonly@example.com", password="strong-pass-123")
    WorkspaceMembership.objects.create(
        user=filer,
        workspace=filings_context["workspace"],
        role=WorkspaceRole.FILER,
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.FAILED,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.FAILED,
        request_summary={"provider_stage": "file_requested"},
        response_summary={
            "provider_stage": "file_requested",
            "next_action": "review_provider_error",
            "failure_summary": {"message": "Provider rejected the filing.", "retryable": False, "code": "RET404"},
        },
        failure_code="RET404",
        failure_message="Provider rejected the filing.",
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    client = APIClient()
    client.force_authenticate(user=filer)

    incident_response = client.post(
        f"/api/v1/filings/{filing.id}/incident-notes/",
        {"title": "Blocked", "note": "Trying support path as filer.", "severity": "warning"},
        format="json",
    )
    escalate_response = client.post(
        f"/api/v1/filings/{filing.id}/escalate-alerts/",
        {"comments": "Trying escalation as filer."},
        format="json",
    )
    requeue_response = client.post(
        f"/api/v1/filings/{filing.id}/requeue-after-review/",
        {"comments": "Trying requeue as filer."},
        format="json",
    )

    assert incident_response.status_code == 403
    assert escalate_response.status_code == 403
    assert requeue_response.status_code == 400
    assert "does not allow" in str(requeue_response.data)


@pytest.mark.django_db
def test_start_filing_blocks_same_approver_when_maker_checker_enforced(filings_authenticated_client, filings_context, monkeypatch, settings):
    monkeypatch.setattr("apps.filings.services.filings.enqueue_return_filing", lambda **kwargs: None)
    settings.FILING_ENFORCE_MAKER_CHECKER = True
    create_ready_whitebooks_auth_session(filings_context)

    filings_context["prepared_return"].approved_by = filings_context["user"]
    filings_context["prepared_return"].save(update_fields=["approved_by", "updated_at"])

    response = filings_authenticated_client.post(
        "/api/v1/filings/start/",
        {
            "workspace": str(filings_context["workspace"].id),
            "client": str(filings_context["client"].id),
            "gstin": str(filings_context["gstin"].id),
            "compliance_period": str(filings_context["compliance_period"].id),
            "prepared_return": str(filings_context["prepared_return"].id),
            "return_type": filings_context["prepared_return"].return_type,
            "provider": ReturnFiling.Provider.WHITEBOOKS,
            "approval_request": str(filings_context["approval_request"].id),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "maker-checker policy blocks the same user" in str(response.data).lower()


@pytest.mark.django_db
def test_live_gstr1_save_and_proceed_records_provider_stage_and_events(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-1"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-002",
        transaction_date="2026-04-11",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-002",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    captured = {}

    def fake_save_gstr1_return(self, *, email, gstin, ret_period, txn, payload):
        captured["save"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "header": {"txn": txn}}

    def fake_proceed_gstr1_filing(self, *, email, gstin, retperiod, txn, is_nil="N"):
        captured["proceed"] = {
            "email": email,
            "gstin": gstin,
            "retperiod": retperiod,
            "txn": txn,
            "is_nil": is_nil,
        }
        return {"status_cd": "1", "status_desc": "Proceed accepted", "ref_id": "wb-proceed-001"}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr1_return", fake_save_gstr1_return)
    monkeypatch.setattr(WhiteBooksClient, "proceed_gstr1_filing", fake_proceed_gstr1_filing)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == auth_session.txn
    assert attempt.request_summary["provider_stage"] == "proceeded_to_file"
    assert attempt.response_summary["provider_stage"] == "proceeded_to_file"
    assert attempt.response_summary["operations_requested"] == ["save", "proceed"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "proceeded_to_file"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["operation_outcomes"]["proceed"]["status"] == "completed"
    assert "proceed_response" in attempt.response_summary
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.proceed_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.proceeded_to_file").exists()
    assert AuditLog.objects.filter(action="return_filing.proceed_requested", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.proceeded_to_file", entity_id=filing.id).exists()
    assert captured["save"]["txn"] == "txn-live-002"
    assert captured["proceed"]["txn"] == "txn-live-002"
    assert captured["proceed"]["is_nil"] == "N"


@pytest.mark.django_db
def test_live_gstr3b_save_records_provider_stage_and_events(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR3B
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "1000.00",
            "outward_tax_liability": "180.00",
        },
        "itc_summary": {
            "eligible_itc": "75.00",
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-3B"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-3B-001",
        transaction_date="2026-04-11",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-3b-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    captured = {}

    def fake_save_gstr3b_return(self, *, email, gstin, ret_period, txn, payload):
        captured["save"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "header": {"txn": txn}, "status_desc": "3B draft saved"}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr3b_return", fake_save_gstr3b_return)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == auth_session.txn
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert attempt.request_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["operations_requested"] == ["save"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["operation_outcomes"]["save"]["status"] == "completed"
    assert attempt.response_summary["next_action"] == "await_offset_automation"
    assert "save_response" in attempt.response_summary
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_save_requested", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.draft_saved", entity_id=filing.id).exists()
    assert captured["save"]["txn"] == "txn-live-3b-001"


@pytest.mark.django_db
def test_live_gstr7_save_records_provider_stage_and_events(monkeypatch, settings, filings_context):
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR7
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr7",
        "summary_version": "gstr7.monthly.v1",
        "tds_summary": {
            "document_count": 1,
            "deductee_count": 1,
            "payment_amount": "100000.00",
            "taxable_value": "100000.00",
            "igst_amount": "0.00",
            "cgst_amount": "500.00",
            "sgst_amount": "500.00",
            "tds_amount": "1000.00",
        },
        "deductees": {
            "row_count": 1,
            "rows": [
                {
                    "deductee_gstin": "29ABCDE1234F1Z5",
                    "deductee_name": "Deductee One",
                    "document_count": 1,
                    "payment_amount": "100000.00",
                    "taxable_value": "100000.00",
                    "igst_amount": "0.00",
                    "cgst_amount": "500.00",
                    "sgst_amount": "500.00",
                    "tds_amount": "1000.00",
                    "transaction_ids": ["1"],
                }
            ],
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-7"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR7,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-g7-001")

    captured = {}

    def fake_save_gstr7_return(self, *, email, gstin, ret_period, txn, payload):
        captured["save"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "status_desc": "Saved", "header": {"txn": txn}}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr7_return", fake_save_gstr7_return)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "txn-live-g7-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert attempt.request_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["operations_requested"] == ["save"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["next_action"] == "await_gstr7_final_filing_contract_validation"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_saved", entity_id=filing.id).exists()
    assert captured["save"]["txn"] == "txn-live-g7-001"


@pytest.mark.django_db
def test_live_gstr9_save_records_provider_stage_and_events(monkeypatch, settings, filings_context):
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9",
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {},
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-g9-001")

    captured = {}

    def fake_save_gstr9_return(self, *, email, gstin, ret_period, txn, payload):
        captured["save"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "status_desc": "Saved", "header": {"txn": txn}}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr9_return", fake_save_gstr9_return)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "txn-live-g9-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert attempt.request_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["operations_requested"] == ["save"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["next_action"] == "await_gstr9_final_filing_contract_validation"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_saved", entity_id=filing.id).exists()
    assert captured["save"]["txn"] == "txn-live-g9-001"


@pytest.mark.django_db
def test_live_gstr9_file_request_moves_attempt_to_awaiting_status(monkeypatch, settings, filings_context):
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR9_FILE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9",
        "summary_version": "gstr9.annual.v1",
        "whitebooks_gstr9_save_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "table4": {},
        },
        "whitebooks_gstr9_file_payload": {
            "gstin": filings_context["gstin"].gstin,
            "fp": "032026",
            "isnil": "N",
            "table4": {},
            "tax_pay": [],
            "offset": [],
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-g9-file-001")

    monkeypatch.setattr(WhiteBooksClient, "save_gstr9_return", lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"]}})
    monkeypatch.setattr(WhiteBooksClient, "file_gstr9_return", lambda self, **kwargs: {"status_cd": "1", "status_desc": "File request accepted", "ref_id": "wb-g9-file-001"})

    process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()

    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "wb-g9-file-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS
    assert attempt.response_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "file_requested"]
    assert attempt.response_summary["next_action"] == "resync_for_arn_or_status"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_submitted").exists()


@pytest.mark.django_db
def test_live_gstr9c_save_records_provider_stage_and_events(monkeypatch, settings, filings_context):
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9C
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9c",
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9C"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9C,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-g9c-001")

    captured = {}

    def fake_save_gstr9c_return(self, *, email, gstin, ret_period, txn, payload):
        captured["save"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "status_desc": "Saved", "header": {"txn": txn}}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr9c_return", fake_save_gstr9c_return)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "txn-live-g9c-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert attempt.request_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["operations_requested"] == ["save"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["next_action"] == "await_gstr9c_final_filing_contract_validation"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_saved", entity_id=filing.id).exists()
    assert captured["save"]["txn"] == "txn-live-g9c-001"


@pytest.mark.django_db
def test_live_gstr9c_file_request_moves_attempt_to_awaiting_status(monkeypatch, settings, filings_context):
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR9C_FILE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR9C
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr9c",
        "summary_version": "gstr9c.compare.v1",
        "whitebooks_gstr9c_save_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
        "whitebooks_gstr9c_file_payload": {
            "gstr9cdata": {
                "audited_data": {
                    "gstin": filings_context["gstin"].gstin,
                    "fp": "032026",
                    "act_name": "Companies Act",
                    "isauditor": "Y",
                    "table5": {},
                }
            }
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-9C"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR9C,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-g9c-file-001")

    monkeypatch.setattr(WhiteBooksClient, "save_gstr9c_return", lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"]}})
    monkeypatch.setattr(WhiteBooksClient, "file_gstr9c_return", lambda self, **kwargs: {"status_cd": "1", "status_desc": "File request accepted", "ref_id": "wb-g9c-file-001"})

    process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()

    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "wb-g9c-file-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS
    assert attempt.response_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "file_requested"]
    assert attempt.response_summary["next_action"] == "resync_for_arn_or_status"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_submitted").exists()


@pytest.mark.django_db
def test_live_gstr7_file_request_moves_attempt_to_awaiting_status(monkeypatch, settings, filings_context):
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR7_FILE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR7
    filings_context["prepared_return"].summary_snapshot = {
        "return_type": "gstr7",
        "summary_version": "gstr7.monthly.v1",
        "tds_summary": {
            "document_count": 1,
            "deductee_count": 1,
            "payment_amount": "100000.00",
            "taxable_value": "100000.00",
            "igst_amount": "0.00",
            "cgst_amount": "500.00",
            "sgst_amount": "500.00",
            "tds_amount": "1000.00",
        },
        "deductees": {
            "row_count": 1,
            "rows": [
                {
                    "deductee_gstin": "29ABCDE1234F1Z5",
                    "deductee_name": "Deductee One",
                    "document_count": 1,
                    "payment_amount": "100000.00",
                    "taxable_value": "100000.00",
                    "igst_amount": "0.00",
                    "cgst_amount": "500.00",
                    "sgst_amount": "500.00",
                    "tds_amount": "1000.00",
                    "transaction_ids": ["1"],
                }
            ],
        },
        "whitebooks_gstr7_file_payload": {
            "gstin": "29ABCDE1234P1Z5",
            "fp": "042026",
            "tds": {"ttl_igst": 0.0, "ttl_cgst": 500.0, "ttl_sgst": 500.0, "ttl_amtDed": 100000.0, "no_rec": 1},
            "tdsa": {"ttl_igst": 0.0, "ttl_cgst": 0.0, "ttl_sgst": 0.0, "ttl_amtDed": 0.0, "no_rec": 0},
            "tax_pay": [],
            "offset": [],
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-7"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR7,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    create_ready_whitebooks_auth_session(filings_context, txn="txn-live-g7-file-001")

    monkeypatch.setattr(WhiteBooksClient, "save_gstr7_return", lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"]}})
    monkeypatch.setattr(WhiteBooksClient, "file_gstr7_return", lambda self, **kwargs: {"status_cd": "1", "status_desc": "File request accepted", "ref_id": "wb-g7-file-001"})

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "wb-g7-file-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS
    assert attempt.request_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "file_requested"]
    assert attempt.response_summary["next_action"] == "resync_for_arn_or_status"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_submitted").exists()


@pytest.mark.django_db
def test_live_gstr3b_offset_records_provider_stage_and_events(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR3B
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "1000.00",
            "outward_tax_liability": "180.00",
        },
        "itc_summary": {
            "eligible_itc": "75.00",
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-3B"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-3B-002",
        transaction_date="2026-04-12",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 75.0}]},
        liability_snapshot={"outward_tax_liability": "180.00"},
        allocation_summary={"igst": "75.00"},
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-3b-002",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    captured = {}

    def fake_save_gstr3b_return(self, *, email, gstin, ret_period, txn, payload):
        captured["save"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "header": {"txn": txn}, "status_desc": "3B draft saved"}

    def fake_offset_gstr3b_liability(self, *, email, gstin, ret_period, txn, payload):
        captured["offset"] = {
            "email": email,
            "gstin": gstin,
            "ret_period": ret_period,
            "txn": txn,
            "payload": payload,
        }
        return {"status_cd": "1", "header": {"txn": txn}, "status_desc": "3B offset applied"}

    monkeypatch.setattr(WhiteBooksClient, "save_gstr3b_return", fake_save_gstr3b_return)
    monkeypatch.setattr(WhiteBooksClient, "offset_gstr3b_liability", fake_offset_gstr3b_liability)

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == auth_session.txn
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.SUBMITTED_TO_PROVIDER
    assert attempt.request_summary["provider_stage"] == "offset_applied"
    assert attempt.response_summary["provider_stage"] == "offset_applied"
    assert attempt.response_summary["operations_requested"] == ["save", "offset"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "offset_applied"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["operation_outcomes"]["offset"]["status"] == "completed"
    assert attempt.response_summary["next_action"] == "await_gstr3b_final_filing_automation"
    assert "offset_response" in attempt.response_summary
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.offset_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.offset_applied").exists()
    assert AuditLog.objects.filter(action="return_filing.offset_requested", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.offset_applied", entity_id=filing.id).exists()
    assert captured["save"]["txn"] == "txn-live-3b-002"
    assert captured["offset"]["txn"] == "txn-live-3b-002"
    assert captured["offset"]["payload"] == {"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 75.0}]}


@pytest.mark.django_db
def test_live_gstr3b_file_request_moves_attempt_to_awaiting_status(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR3B
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "outward_taxable_value": "1000.00",
            "outward_tax_liability": "180.00",
        },
        "itc_summary": {
            "eligible_itc": "75.00",
        },
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-3B"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-3B-003",
        transaction_date="2026-04-13",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    ReturnFilingOffset.objects.create(
        return_filing=filing,
        version=1,
        status=ReturnFilingOffset.OffsetStatus.READY,
        provider_payload={
            "offset_payload": {"liab_ldg_id": "liab-001", "offset": [{"head": "igst", "amount": 75.0}]},
            "file_payload": {"liab_ldg_id": "liab-001", "setoff": [{"head": "igst", "amount": 75.0}]},
        },
        confirmed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    auth_session = WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-3b-003",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    monkeypatch.setattr(WhiteBooksClient, "save_gstr3b_return", lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"]}})
    monkeypatch.setattr(WhiteBooksClient, "offset_gstr3b_liability", lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"]}})
    monkeypatch.setattr(WhiteBooksClient, "file_gstr3b_return", lambda self, **kwargs: {"status_cd": "1", "status_desc": "File request accepted", "ref_id": "wb-3b-file-001"})

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "wb-3b-file-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS
    assert attempt.request_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["operations_requested"] == ["save", "offset", "file"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "offset_applied", "file_requested"]
    assert attempt.response_summary["operations_failed"] == []
    assert attempt.response_summary["operation_outcomes"]["file"]["status"] == "submitted"
    assert attempt.response_summary["next_action"] == "resync_for_arn_or_status"
    assert "file_response" in attempt.response_summary
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_submitted").exists()
    assert AuditLog.objects.filter(action="return_filing.file_requested", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.file_submitted", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_live_gstr1_file_request_moves_attempt_to_awaiting_status(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-1"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-004",
        transaction_date="2026-04-13",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-004",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    monkeypatch.setattr(WhiteBooksClient, "save_gstr1_return", lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"]}})
    monkeypatch.setattr(WhiteBooksClient, "proceed_gstr1_filing", lambda self, **kwargs: {"status_cd": "1", "status_desc": "Proceed accepted"})
    monkeypatch.setattr(WhiteBooksClient, "file_gstr1_return", lambda self, **kwargs: {"status_cd": "1", "status_desc": "File request accepted", "ref_id": "wb-file-001"})

    result = process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert result["status"] == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.status == ReturnFiling.FilingStatus.SUBMITTED
    assert filing.provider_reference_id == "wb-file-001"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.AWAITING_STATUS
    assert attempt.request_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["provider_stage"] == "file_requested"
    assert attempt.response_summary["operations_completed"] == ["draft_saved", "proceeded_to_file", "file_requested"]
    assert attempt.response_summary["next_action"] == "resync_for_arn_or_status"
    assert "file_response" in attempt.response_summary
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_requested").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.file_submitted").exists()
    assert AuditLog.objects.filter(action="return_filing.file_requested", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.file_submitted", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_live_gstr1_proceed_failure_preserves_draft_save_evidence(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient
    from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-1"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-003",
        transaction_date="2026-04-12",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-003",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    monkeypatch.setattr(
        WhiteBooksClient,
        "save_gstr1_return",
        lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"], "client_secret": "secret-value"}},
    )

    def fail_proceed(self, **kwargs):
        raise WhiteBooksSubmissionError("Proceed step rejected by WhiteBooks.")

    monkeypatch.setattr(WhiteBooksClient, "proceed_gstr1_filing", fail_proceed)

    with pytest.raises(WhiteBooksSubmissionError):
        process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert filing.status == ReturnFiling.FilingStatus.FAILED
    assert filing.provider_reference_id == "txn-live-003"
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["operations_requested"] == ["save", "proceed"]
    assert attempt.response_summary["operations_completed"] == ["draft_saved"]
    assert attempt.response_summary["operations_failed"] == ["proceed"]
    assert attempt.response_summary["operation_outcomes"]["proceed"]["retryable"] is False
    assert attempt.response_summary["failure_summary"]["retryable"] is False
    assert attempt.failure_code == "whitebooks_proceed_rejected"
    assert attempt.response_summary["save_response"]["header"]["client_secret"] == "[REDACTED]"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_saved").exists()
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.proceed_failed").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_saved", entity_id=filing.id).exists()
    assert AuditLog.objects.filter(action="return_filing.proceed_failed", entity_id=filing.id).exists()


@pytest.mark.django_db
def test_live_gstr1_temporary_proceed_failure_marks_retryable(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.client import WhiteBooksClient
    from apps.integrations.whitebooks.exceptions import WhiteBooksStepError, WhiteBooksTemporaryError

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = True
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "29"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.6"

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])
    filings_context["compliance_period"].return_type = "GSTR-1"
    filings_context["compliance_period"].save(update_fields=["return_type", "updated_at"])

    GSTTransaction.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="INV-003A",
        transaction_date="2026-04-12",
        counterparty_gstin="27ABCDE1234F1Z5",
        counterparty_name="Buyer Co",
        taxable_value="1000.00",
        cgst_amount="0.00",
        sgst_amount="0.00",
        igst_amount="180.00",
        cess_amount="0.00",
        tax_amount="180.00",
        total_amount="1180.00",
        place_of_supply="27",
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-003a",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    monkeypatch.setattr(
        WhiteBooksClient,
        "save_gstr1_return",
        lambda self, **kwargs: {"status_cd": "1", "header": {"txn": kwargs["txn"], "client_secret": "secret-value"}},
    )

    def fail_proceed_temporarily(self, **kwargs):
        raise WhiteBooksTemporaryError("WhiteBooks proceed endpoint timed out.")

    monkeypatch.setattr(WhiteBooksClient, "proceed_gstr1_filing", fail_proceed_temporarily)

    with pytest.raises(WhiteBooksStepError):
        process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert filing.status == ReturnFiling.FilingStatus.NEEDS_RETRY
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.failure_code == "whitebooks_proceed_temporary_error"
    assert attempt.response_summary["provider_stage"] == "draft_saved"
    assert attempt.response_summary["failure_summary"]["retryable"] is True
    assert attempt.response_summary["operation_outcomes"]["proceed"]["retryable"] is True
    assert attempt.response_summary["next_action"] == "retry_filing"


@pytest.mark.django_db
def test_live_gstr1_save_fails_fast_when_required_config_is_missing(monkeypatch, settings, filings_context):
    from apps.filings.services.filings import process_return_filing
    from apps.integrations.whitebooks.exceptions import WhiteBooksConfigurationError

    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = True
    settings.WHITEBOOKS_API_SECRET = ""

    filings_context["prepared_return"].return_type = ReturnPreparation.ReturnType.GSTR1
    filings_context["prepared_return"].summary_snapshot = {
        "outward_supplies": {
            "total_taxable_value": "1000.00",
            "total_tax_amount": "180.00",
        }
    }
    filings_context["prepared_return"].save(update_fields=["return_type", "summary_snapshot", "updated_at"])

    filing = ReturnFiling.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        compliance_period=filings_context["compliance_period"],
        prepared_return=filings_context["prepared_return"],
        approval_request=filings_context["approval_request"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=ReturnPreparation.ReturnType.GSTR1,
        status=ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
        approved_by=filings_context["user"],
        filed_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    attempt = ReturnFilingAttempt.objects.create(
        return_filing=filing,
        attempt_number=1,
        status=ReturnFilingAttempt.AttemptStatus.QUEUED,
        triggered_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )
    WhiteBooksAuthSession.objects.create(
        workspace=filings_context["workspace"],
        client=filings_context["client"],
        gstin=filings_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@example.com",
        txn="txn-live-001",
        status=WhiteBooksAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED,
        initiated_by=filings_context["user"],
        verified_by=filings_context["user"],
        created_by=filings_context["user"],
        updated_by=filings_context["user"],
    )

    with pytest.raises(WhiteBooksConfigurationError):
        process_return_filing(filing_id=filing.id, actor_id=filings_context["user"].id)

    filing.refresh_from_db()
    attempt.refresh_from_db()
    assert filing.status == ReturnFiling.FilingStatus.FAILED
    assert attempt.status == ReturnFilingAttempt.AttemptStatus.FAILED
    assert attempt.failure_code == "whitebooks_configuration_error"
    assert ReturnFilingEvent.objects.filter(return_filing=filing, event_type="filing.draft_save_failed").exists()
    assert AuditLog.objects.filter(action="return_filing.draft_save_failed", entity_id=filing.id).exists()
