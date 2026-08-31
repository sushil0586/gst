from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.customer_operations.models import OperationalFollowUp
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.gstins.models import GSTIN
from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError
from apps.notices.models import Notice, NoticeSyncEvent
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def notices_api_client():
    return APIClient()


@pytest.fixture
def notices_context(db):
    owner = User.objects.create_user(
        username="notices-owner",
        email="notices-owner@example.com",
        password="strong-pass-123",
    )
    viewer = User.objects.create_user(
        username="notices-viewer",
        email="notices-viewer@example.com",
        password="strong-pass-123",
    )
    assignee = User.objects.create_user(
        username="notices-assignee",
        email="notices-assignee@example.com",
        password="strong-pass-123",
        first_name="Assigned",
        last_name="Operator",
    )
    outsider = User.objects.create_user(
        username="notices-outsider",
        email="notices-outsider@example.com",
        password="strong-pass-123",
    )
    organization = Organization.objects.create(
        name="Notices Test Org",
        code="NOTICES-ORG",
        created_by=owner,
        updated_by=owner,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name="Notices Test Workspace",
        code="NOTICES-WS",
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
    WorkspaceMembership.objects.create(
        user=assignee,
        workspace=workspace,
        role=WorkspaceRole.MANAGER,
        created_by=owner,
        updated_by=owner,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Notice Client Private Limited",
        trade_name="Notice Client",
        client_code="NOTICE001",
        pan="ABCDE1234F",
        email="ops@notice.example.com",
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
    return {
        "owner": owner,
        "viewer": viewer,
        "assignee": assignee,
        "outsider": outsider,
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
    }


@pytest.fixture
def notices_owner_client(notices_api_client, notices_context):
    notices_api_client.force_authenticate(user=notices_context["owner"])
    return notices_api_client


@pytest.mark.django_db
def test_owner_can_create_notice(notices_owner_client, notices_context):
    response = notices_owner_client.post(
        "/api/v1/notices/",
        {
            "gstin": str(notices_context["gstin"].id),
            "reference_number": "ASMT-10/2026/1184",
            "title": "Mismatch in outward supplies",
            "description": "Please explain the variance in outward tax liability.",
            "status": "open",
        },
        format="json",
    )

    assert response.status_code == 201
    payload = response.data["data"]
    assert payload["reference_number"] == "ASMT-10/2026/1184"
    assert payload["client_name"] == notices_context["client"].legal_name
    assert payload["gstin_value"] == notices_context["gstin"].gstin
    assert Notice.objects.filter(reference_number="ASMT-10/2026/1184").exists()


@pytest.mark.django_db
def test_notices_list_supports_workspace_client_and_gstin_filters(notices_owner_client, notices_context):
    other_client = Client.objects.create(
        workspace=notices_context["workspace"],
        legal_name="Other Client",
        trade_name="Other",
        client_code="NOTICE002",
        pan="FGHIJ5678K",
        email="other@notice.example.com",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    other_gstin = GSTIN.objects.create(
        client=other_client,
        gstin="27FGHIJ5678K1Z1",
        registration_type="regular",
        state_code="27",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="NOTICE-001",
        title="Primary notice",
        status="open",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    Notice.objects.create(
        gstin=other_gstin,
        reference_number="NOTICE-002",
        title="Secondary notice",
        status="responded",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    workspace_response = notices_owner_client.get(
        "/api/v1/notices/",
        {"workspace": str(notices_context["workspace"].id)},
    )
    client_response = notices_owner_client.get(
        "/api/v1/notices/",
        {"client": str(notices_context["client"].id)},
    )
    gstin_response = notices_owner_client.get(
        "/api/v1/notices/",
        {"gstin": str(notices_context["gstin"].id)},
    )

    assert workspace_response.status_code == 200
    assert workspace_response.data["pagination"]["count"] == 2
    assert client_response.data["pagination"]["count"] == 1
    assert client_response.data["data"][0]["reference_number"] == "NOTICE-001"
    assert gstin_response.data["pagination"]["count"] == 1
    assert gstin_response.data["data"][0]["gstin_value"] == notices_context["gstin"].gstin


@pytest.mark.django_db
def test_owner_can_update_notice_due_date_status_and_assignee(notices_owner_client, notices_context):
    notice = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="NOTICE-003",
        title="Action required",
        status="open",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    response = notices_owner_client.patch(
        f"/api/v1/notices/{notice.id}/",
        {
            "status": "responded",
            "due_date": "2026-06-12",
            "assigned_to": notices_context["assignee"].id,
            "description": "Draft response prepared and review assigned.",
        },
        format="json",
    )

    assert response.status_code == 200
    payload = response.data["data"]
    assert payload["status"] == "responded"
    assert payload["due_date"] == "2026-06-12"
    assert payload["assigned_to"] == notices_context["assignee"].id
    assert payload["assigned_to_name"] == "Assigned Operator"


@pytest.mark.django_db
def test_notice_rejects_assignee_outside_workspace(notices_owner_client, notices_context):
    response = notices_owner_client.post(
        "/api/v1/notices/",
        {
            "gstin": str(notices_context["gstin"].id),
            "reference_number": "ASMT-10/2026/9999",
            "title": "Invalid assignment test",
            "assigned_to": notices_context["outsider"].id,
            "status": "open",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "assigned_to" in response.data["errors"]


@pytest.fixture
def notices_whitebooks_auth_session(notices_context):
    return ProviderAuthSession.objects.create(
        workspace=notices_context["workspace"],
        client=notices_context["client"],
        gstin=notices_context["gstin"],
        provider=ReturnFiling.Provider.WHITEBOOKS,
        email="ops@notice.example.com",
        txn="txn-notice-123",
        status=ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
        response_contract_confirmed=True,
        verified_at=timezone.now(),
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )


@pytest.mark.django_db
def test_owner_can_sync_whitebooks_notices(
    monkeypatch,
    notices_owner_client,
    notices_context,
    notices_whitebooks_auth_session,
):
    captured = {}

    def fake_notice_list(self, **kwargs):
        captured.update(kwargs)
        return {
            "status_cd": "1",
            "data": [
                {
                    "refId": "WB-NTC-001",
                    "noticeType": "ASMT-10",
                    "status": "OPEN",
                    "dueDate": "10/09/2026",
                    "description": "Explain outward supply mismatch.",
                }
            ],
        }

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_list", fake_notice_list)

    response = notices_owner_client.post(
        "/api/v1/notices/sync-whitebooks/",
        {
            "workspace": str(notices_context["workspace"].id),
            "client": str(notices_context["client"].id),
            "gstin": str(notices_context["gstin"].id),
            "auth_session": str(notices_whitebooks_auth_session.id),
            "date": "2026-08-30",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["created_count"] == 1
    assert response.data["data"]["updated_count"] == 0
    assert captured["gstin"] == notices_context["gstin"].gstin
    assert captured["date"] == "30/08/2026"
    assert captured["email"] == notices_whitebooks_auth_session.email
    assert captured["txn"] == notices_whitebooks_auth_session.txn

    notice = Notice.objects.get(reference_number="WB-NTC-001")
    assert notice.provider == ReturnFiling.Provider.WHITEBOOKS
    assert notice.provider_reference_id == "WB-NTC-001"
    assert notice.provider_notice_type == "ASMT-10"
    assert notice.provider_status == "OPEN"
    assert notice.provider_due_date.isoformat() == "2026-09-10"
    assert notice.due_date.isoformat() == "2026-09-10"
    assert notice.provider_synced_at is not None
    assert AuditLog.objects.filter(action="notice.whitebooks_sync_created", entity_id=notice.id).exists()

    sync_event = NoticeSyncEvent.objects.get(event_type=NoticeSyncEvent.EventType.LIST_SYNC)
    assert sync_event.gstin == notices_context["gstin"]
    assert sync_event.status == NoticeSyncEvent.EventStatus.SUCCESS
    assert sync_event.initiated_by == notices_context["owner"]
    assert sync_event.counters["created_count"] == 1
    assert sync_event.provider_payload["status_cd"] == "1"


@pytest.mark.django_db
def test_whitebooks_notice_sync_explicit_txn_ignores_stale_stored_session(
    monkeypatch,
    notices_owner_client,
    notices_context,
    notices_whitebooks_auth_session,
):
    notices_whitebooks_auth_session.verified_at = timezone.now() - timedelta(hours=7)
    notices_whitebooks_auth_session.save(update_fields=["verified_at", "updated_at"])
    captured = {}

    def fake_notice_list(self, **kwargs):
        captured.update(kwargs)
        return {"status_cd": "1", "notices": []}

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_list", fake_notice_list)

    response = notices_owner_client.post(
        "/api/v1/notices/sync-whitebooks/",
        {
            "workspace": str(notices_context["workspace"].id),
            "client": str(notices_context["client"].id),
            "gstin": str(notices_context["gstin"].id),
            "txn": "manual-fresh-txn",
            "date": "2026-08-30",
        },
        format="json",
    )

    assert response.status_code == 200
    assert captured["txn"] == "manual-fresh-txn"
    assert response.data["data"]["synced_count"] == 0


@pytest.mark.django_db
def test_whitebooks_notice_resync_preserves_local_workflow_fields(
    monkeypatch,
    notices_owner_client,
    notices_context,
    notices_whitebooks_auth_session,
):
    existing = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="WB-NTC-002",
        title="Manual title",
        description="Manual response notes.",
        status="escalated",
        due_date="2026-09-20",
        assigned_to=notices_context["assignee"],
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    def fake_notice_list(self, **kwargs):
        return {
            "status_cd": "1",
            "notices": [
                {
                    "refId": "WB-NTC-002",
                    "noticeType": "DRC-01",
                    "status": "CLOSED",
                    "dueDate": "12/09/2026",
                    "description": "Provider description",
                }
            ],
        }

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_list", fake_notice_list)

    response = notices_owner_client.post(
        "/api/v1/notices/sync-whitebooks/",
        {
            "workspace": str(notices_context["workspace"].id),
            "client": str(notices_context["client"].id),
            "gstin": str(notices_context["gstin"].id),
            "auth_session": str(notices_whitebooks_auth_session.id),
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["created_count"] == 0
    assert response.data["data"]["updated_count"] == 1
    existing.refresh_from_db()
    assert Notice.objects.filter(reference_number="WB-NTC-002").count() == 1
    assert existing.title == "Manual title"
    assert existing.description == "Manual response notes."
    assert existing.status == "escalated"
    assert existing.due_date.isoformat() == "2026-09-20"
    assert existing.assigned_to == notices_context["assignee"]
    assert existing.provider_status == "CLOSED"
    assert existing.provider_due_date.isoformat() == "2026-09-12"
    assert AuditLog.objects.filter(action="notice.whitebooks_sync_updated", entity_id=existing.id).exists()


@pytest.mark.django_db
def test_whitebooks_notice_sync_failure_is_recorded(
    monkeypatch,
    notices_owner_client,
    notices_context,
    notices_whitebooks_auth_session,
):
    def fake_notice_list(self, **kwargs):
        raise WhiteBooksSubmissionError("WhiteBooks notice list fetch failed.")

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_list", fake_notice_list)

    response = notices_owner_client.post(
        "/api/v1/notices/sync-whitebooks/",
        {
            "workspace": str(notices_context["workspace"].id),
            "client": str(notices_context["client"].id),
            "gstin": str(notices_context["gstin"].id),
            "auth_session": str(notices_whitebooks_auth_session.id),
            "date": "2026-08-30",
        },
        format="json",
    )

    assert response.status_code == 400
    failure_event = NoticeSyncEvent.objects.get(
        gstin=notices_context["gstin"],
        event_type=NoticeSyncEvent.EventType.LIST_SYNC,
        status=NoticeSyncEvent.EventStatus.FAILED,
    )
    assert failure_event.error_message == "WhiteBooks notice list fetch failed."
    assert failure_event.counters["row_count"] == 0


@pytest.mark.django_db
def test_viewer_cannot_sync_whitebooks_notices(notices_api_client, notices_context, notices_whitebooks_auth_session):
    notices_api_client.force_authenticate(user=notices_context["viewer"])

    response = notices_api_client.post(
        "/api/v1/notices/sync-whitebooks/",
        {
            "workspace": str(notices_context["workspace"].id),
            "client": str(notices_context["client"].id),
            "gstin": str(notices_context["gstin"].id),
            "auth_session": str(notices_whitebooks_auth_session.id),
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_owner_can_fetch_whitebooks_notice_detail(
    monkeypatch,
    notices_owner_client,
    notices_context,
    notices_whitebooks_auth_session,
):
    notice = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="WB-NTC-003",
        title="Provider notice",
        status="open",
        provider=ReturnFiling.Provider.WHITEBOOKS,
        provider_reference_id="WB-NTC-003",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    captured = {}

    def fake_notice_details(self, **kwargs):
        captured.update(kwargs)
        return {
            "status_cd": "1",
            "data": {
                "refId": "WB-NTC-003",
                "noticeType": "DRC-01",
                "status": "REPLIED",
                "dueDate": "15/09/2026",
                "summary": "Detailed notice body from provider.",
            },
        }

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_details", fake_notice_details)

    response = notices_owner_client.post(
        f"/api/v1/notices/{notice.id}/fetch-whitebooks-detail/",
        {"auth_session": str(notices_whitebooks_auth_session.id)},
        format="json",
    )

    assert response.status_code == 200
    assert captured["reference_id"] == "WB-NTC-003"
    assert captured["gstin"] == notices_context["gstin"].gstin
    notice.refresh_from_db()
    assert notice.provider_detail_payload["data"]["summary"] == "Detailed notice body from provider."
    assert notice.provider_detail_synced_at is not None
    assert notice.provider_notice_type == "DRC-01"
    assert notice.provider_status == "REPLIED"
    assert notice.provider_due_date.isoformat() == "2026-09-15"
    assert notice.due_date.isoformat() == "2026-09-15"
    assert response.data["data"]["provider_detail_synced_at"] is not None
    assert AuditLog.objects.filter(action="notice.whitebooks_detail_fetched", entity_id=notice.id).exists()
    assert NoticeSyncEvent.objects.filter(
        notice=notice,
        event_type=NoticeSyncEvent.EventType.DETAIL_FETCH,
        status=NoticeSyncEvent.EventStatus.SUCCESS,
        provider_reference_id="WB-NTC-003",
    ).exists()


@pytest.mark.django_db
def test_whitebooks_notice_detail_failure_is_recorded(
    monkeypatch,
    notices_owner_client,
    notices_context,
    notices_whitebooks_auth_session,
):
    notice = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="WB-NTC-004",
        title="Provider notice failure",
        status="open",
        provider=ReturnFiling.Provider.WHITEBOOKS,
        provider_reference_id="WB-NTC-004",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    def fake_notice_details(self, **kwargs):
        raise WhiteBooksSubmissionError("WhiteBooks notice detail fetch failed.")

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_details", fake_notice_details)

    response = notices_owner_client.post(
        f"/api/v1/notices/{notice.id}/fetch-whitebooks-detail/",
        {"auth_session": str(notices_whitebooks_auth_session.id)},
        format="json",
    )

    assert response.status_code == 400
    notice.refresh_from_db()
    assert notice.provider_last_error == "WhiteBooks notice detail fetch failed."
    assert AuditLog.objects.filter(action="notice.whitebooks_detail_failed", entity_id=notice.id).exists()
    failure_event = NoticeSyncEvent.objects.get(
        notice=notice,
        event_type=NoticeSyncEvent.EventType.DETAIL_FETCH,
        status=NoticeSyncEvent.EventStatus.FAILED,
    )
    assert failure_event.error_message == "WhiteBooks notice detail fetch failed."


@pytest.mark.django_db
def test_owner_can_create_or_reuse_notice_follow_up(notices_owner_client, notices_context):
    notice = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="WB-NTC-005",
        title="Notice response required",
        status="open",
        due_date=timezone.localdate(),
        assigned_to=notices_context["assignee"],
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    first_response = notices_owner_client.post(f"/api/v1/notices/{notice.id}/ensure-follow-up/", {}, format="json")
    second_response = notices_owner_client.post(f"/api/v1/notices/{notice.id}/ensure-follow-up/", {}, format="json")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.data["data"]["created"] is True
    assert second_response.data["data"]["created"] is False
    assert OperationalFollowUp.objects.filter(notice=notice, is_active=True).count() == 1

    follow_up = OperationalFollowUp.objects.get(notice=notice)
    assert follow_up.follow_up_type == OperationalFollowUp.FollowUpType.NOTICE_DOCUMENT_REQUEST
    assert follow_up.priority == OperationalFollowUp.Priority.CRITICAL
    assert follow_up.assigned_to == notices_context["assignee"]
    assert AuditLog.objects.filter(action="notice.follow_up_created", entity_id=notice.id).exists()
    assert AuditLog.objects.filter(action="notice.follow_up_reused", entity_id=notice.id).exists()
    assert NoticeSyncEvent.objects.filter(
        notice=notice,
        event_type=NoticeSyncEvent.EventType.FOLLOW_UP,
        status=NoticeSyncEvent.EventStatus.SUCCESS,
    ).count() == 2

    detail_response = notices_owner_client.get(f"/api/v1/notices/{notice.id}/")
    assert detail_response.status_code == 200
    assert detail_response.data["data"]["open_follow_up_count"] == 1
    assert detail_response.data["data"]["overdue_follow_up_count"] == 0
    assert detail_response.data["data"]["latest_follow_up_id"] == str(follow_up.id)
    assert detail_response.data["data"]["latest_follow_up_priority"] == "critical"


@pytest.mark.django_db
def test_owner_can_view_notice_sync_history(notices_owner_client, notices_context):
    notice = Notice.objects.create(
        gstin=notices_context["gstin"],
        reference_number="WB-NTC-HISTORY",
        title="History notice",
        status="open",
        provider=ReturnFiling.Provider.WHITEBOOKS,
        provider_reference_id="WB-NTC-HISTORY",
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )
    NoticeSyncEvent.objects.create(
        gstin=notices_context["gstin"],
        notice=notice,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        event_type=NoticeSyncEvent.EventType.DETAIL_FETCH,
        status=NoticeSyncEvent.EventStatus.SUCCESS,
        reference_number=notice.reference_number,
        provider_reference_id=notice.provider_reference_id,
        message="WhiteBooks notice detail fetched.",
        counters={"detail_count": 1},
        initiated_by=notices_context["owner"],
        created_by=notices_context["owner"],
        updated_by=notices_context["owner"],
    )

    response = notices_owner_client.get(
        "/api/v1/notices/sync-history/",
        {
            "workspace": str(notices_context["workspace"].id),
            "client": str(notices_context["client"].id),
            "gstin": str(notices_context["gstin"].id),
            "notice": str(notice.id),
        },
    )

    assert response.status_code == 200
    assert response.data["pagination"]["count"] == 1
    payload = response.data["data"][0]
    assert payload["reference_number"] == "WB-NTC-HISTORY"
    assert payload["event_type"] == NoticeSyncEvent.EventType.DETAIL_FETCH
    assert payload["status"] == NoticeSyncEvent.EventStatus.SUCCESS
    assert payload["initiated_by_name"] == notices_context["owner"].username


@pytest.mark.django_db
def test_scheduled_notice_syncs_runs_only_when_enabled(
    monkeypatch,
    settings,
    notices_context,
    notices_whitebooks_auth_session,
):
    from apps.notices.services.notices import process_scheduled_notice_syncs

    disabled_result = process_scheduled_notice_syncs()
    assert disabled_result["enabled"] is False

    settings.WHITEBOOKS_NOTICE_SYNC_ENABLED = True

    def fake_notice_list(self, **kwargs):
        return {
            "status_cd": "1",
            "notices": [
                {
                    "refId": "WB-SCHEDULED-001",
                    "noticeType": "ASMT-10",
                    "status": "OPEN",
                    "dueDate": "20/09/2026",
                }
            ],
        }

    monkeypatch.setattr("apps.integrations.whitebooks.client.WhiteBooksClient.get_notice_list", fake_notice_list)

    result = process_scheduled_notice_syncs(actor=notices_context["owner"])

    assert result["enabled"] is True
    assert result["processed_count"] == 1
    assert result["synced_count"] == 1
    assert result["created_count"] == 1
    assert result["failed_count"] == 0
    assert Notice.objects.filter(reference_number="WB-SCHEDULED-001").exists()
