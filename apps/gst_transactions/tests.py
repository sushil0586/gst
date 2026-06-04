from decimal import Decimal

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import (
    GSTTransaction,
    TransactionRemediationAssignment,
    TransactionRemediationDigest,
    TransactionRemediationFollowUp,
    TransactionReviewSnapshot,
)
from apps.gst_transactions.services.digests import generate_scheduled_remediation_digests
from apps.gst_transactions.services.follow_ups import process_due_follow_up_reminders
from apps.gstins.models import GSTIN
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


@pytest.fixture
def transaction_api_client():
    return APIClient()


@pytest.fixture
def transaction_user(db):
    return User.objects.create_user(username="reviewer", email="reviewer@example.com", password="strong-pass-123")


@pytest.fixture
def transaction_authenticated_client(transaction_api_client, transaction_user):
    transaction_api_client.force_authenticate(user=transaction_user)
    return transaction_api_client


@pytest.fixture
def transaction_context(transaction_user):
    teammate = User.objects.create_user(username="closer", email="closer@example.com", password="strong-pass-123")
    organization = Organization.objects.create(name="Txn Org", code="TXNORG", created_by=transaction_user, updated_by=transaction_user)
    workspace = Workspace.objects.create(
        organization=organization,
        name="Txn Workspace",
        code="TXN-WS",
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    WorkspaceMembership.objects.create(
        user=transaction_user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    WorkspaceMembership.objects.create(
        user=teammate,
        workspace=workspace,
        role=WorkspaceRole.MANAGER,
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    client = Client.objects.create(
        workspace=workspace,
        legal_name="Txn Client Pvt Ltd",
        trade_name="Txn Client",
        client_code="TXN001",
        pan="ABCDE1234X",
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    gstin = GSTIN.objects.create(
        client=client,
        gstin="29ABCDE1234X1Z5",
        registration_type="regular",
        state_code="29",
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    compliance_period = CompliancePeriod.objects.create(
        gstin=gstin,
        period="2026-04",
        return_type="GSTR-1",
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    transaction = GSTTransaction.objects.create(
        workspace=workspace,
        client=client,
        gstin=gstin,
        compliance_period=compliance_period,
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-9001",
        transaction_date="2026-04-18",
        counterparty_gstin="29ABCDE7777F1Z5",
        counterparty_name="Original Customer",
        taxable_value=Decimal("1000.00"),
        cgst_amount=Decimal("90.00"),
        sgst_amount=Decimal("90.00"),
        tax_amount=Decimal("180.00"),
        total_amount=Decimal("1180.00"),
        status=GSTTransaction.TransactionStatus.IMPORTED,
        metadata={
            "hsn_code": "7203",
            "description": "Steel Goods",
            "uqc": "KGS",
            "quantity": "25.00",
            "line_items": [
                {
                    "hsn_code": "7203",
                    "description": "Steel Goods",
                    "uqc": "KGS",
                    "quantity": "25.00",
                    "is_service": False,
                    "supply_category": "taxable",
                    "ecommerce_gstin": "",
                    "taxable_value": "1000.00",
                    "cgst_amount": "90.00",
                    "sgst_amount": "90.00",
                    "igst_amount": "0.00",
                    "cess_amount": "0.00",
                    "total_amount": "1180.00",
                }
            ],
        },
        created_by=transaction_user,
        updated_by=transaction_user,
    )
    return {
        "user": transaction_user,
        "teammate": teammate,
        "workspace": workspace,
        "client": client,
        "gstin": gstin,
        "compliance_period": compliance_period,
        "transaction": transaction,
    }


@pytest.mark.django_db
def test_patch_transaction_updates_filing_metadata(transaction_authenticated_client, transaction_context):
    response = transaction_authenticated_client.patch(
        f"/api/v1/gst-transactions/{transaction_context['transaction'].id}/",
        {
            "counterparty_name": "Updated Customer",
            "place_of_supply": "27",
            "document_type": "invoice",
            "reverse_charge": True,
            "status": "review",
            "metadata": {
                "line_items": [
                    {
                        "hsn_code": "7306",
                        "description": "Updated Pipes",
                        "uqc": "PCS",
                        "quantity": "12",
                        "is_service": False,
                        "supply_category": "taxable",
                        "ecommerce_gstin": "29ECOM1234F1Z5",
                        "taxable_value": "1000.00",
                        "cgst_amount": "90.00",
                        "sgst_amount": "90.00",
                        "igst_amount": "0.00",
                        "cess_amount": "0.00",
                        "total_amount": "1180.00",
                    }
                ]
            },
        },
        format="json",
    )
    assert response.status_code == 200
    transaction = GSTTransaction.objects.get(pk=transaction_context["transaction"].id)
    assert transaction.counterparty_name == "Updated Customer"
    assert transaction.place_of_supply == "27"
    assert transaction.reverse_charge is True
    assert transaction.status == "review"
    assert transaction.metadata["hsn_code"] == "7306"
    assert transaction.metadata["uqc"] == "PCS"
    assert transaction.metadata["quantity"] == "12.00"
    assert transaction.metadata["line_items"][0]["description"] == "Updated Pipes"
    assert AuditLog.objects.filter(action="gst_transaction.corrected", entity_id=transaction.id).exists()


@pytest.mark.django_db
def test_patch_transaction_is_blocked_for_locked_period(transaction_authenticated_client, transaction_context):
    transaction_context["compliance_period"].is_locked = True
    transaction_context["compliance_period"].save(update_fields=["is_locked"])

    response = transaction_authenticated_client.patch(
        f"/api/v1/gst-transactions/{transaction_context['transaction'].id}/",
        {
            "counterparty_name": "Blocked Update",
        },
        format="json",
    )
    assert response.status_code == 400
    transaction_context["transaction"].refresh_from_db()
    assert transaction_context["transaction"].counterparty_name == "Original Customer"


@pytest.mark.django_db
def test_transaction_list_can_filter_by_ids(transaction_authenticated_client, transaction_context):
    second_transaction = GSTTransaction.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-9002",
        transaction_date="2026-04-19",
        counterparty_name="Second Customer",
        taxable_value=Decimal("500.00"),
        cgst_amount=Decimal("45.00"),
        sgst_amount=Decimal("45.00"),
        tax_amount=Decimal("90.00"),
        total_amount=Decimal("590.00"),
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    response = transaction_authenticated_client.get(
        "/api/v1/gst-transactions/",
        {
            "ids": f"{transaction_context['transaction'].id},{second_transaction.id}",
        },
    )
    assert response.status_code == 200
    returned_ids = {item["id"] for item in response.data["data"]}
    assert returned_ids == {str(transaction_context["transaction"].id), str(second_transaction.id)}


@pytest.mark.django_db
def test_bulk_correct_transactions_updates_selected_rows(transaction_authenticated_client, transaction_context):
    second_transaction = GSTTransaction.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        transaction_type="sales",
        document_type="invoice",
        reference_number="S-9010",
        transaction_date="2026-04-20",
        counterparty_name="Bulk Customer",
        taxable_value=Decimal("700.00"),
        cgst_amount=Decimal("63.00"),
        sgst_amount=Decimal("63.00"),
        tax_amount=Decimal("126.00"),
        total_amount=Decimal("826.00"),
        metadata={
            "line_items": [
                {
                    "hsn_code": "",
                    "description": "Bulk Goods",
                    "uqc": "",
                    "quantity": "",
                    "is_service": False,
                    "supply_category": "",
                    "ecommerce_gstin": "",
                    "taxable_value": "700.00",
                    "cgst_amount": "63.00",
                    "sgst_amount": "63.00",
                    "igst_amount": "0.00",
                    "cess_amount": "0.00",
                    "total_amount": "826.00",
                }
            ]
        },
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    response = transaction_authenticated_client.post(
        "/api/v1/gst-transactions/bulk-correct/",
        {
            "ids": [str(transaction_context["transaction"].id), str(second_transaction.id)],
            "place_of_supply": "27",
            "status": "review",
            "metadata_updates": {
                "hsn_code": "7306",
                "uqc": "PCS",
                "supply_category": "taxable",
            },
        },
        format="json",
    )
    assert response.status_code == 200
    transaction_context["transaction"].refresh_from_db()
    second_transaction.refresh_from_db()
    for transaction in (transaction_context["transaction"], second_transaction):
        assert transaction.place_of_supply == "27"
        assert transaction.status == "review"
        assert transaction.metadata["hsn_code"] == "7306"
        assert transaction.metadata["uqc"] == "PCS"
        assert transaction.metadata["line_items"][0]["supply_category"] == "taxable"
    assert AuditLog.objects.filter(action="gst_transaction.bulk_corrected").count() == 2


@pytest.mark.django_db
def test_transaction_review_snapshot_lifecycle(transaction_authenticated_client, transaction_context):
    create_response = transaction_authenticated_client.post(
        "/api/v1/gst-transaction-review-snapshots/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "client": str(transaction_context["client"].id),
            "gstin": str(transaction_context["gstin"].id),
            "compliance_period": str(transaction_context["compliance_period"].id),
            "name": "April close checkpoint",
            "filters": {
                "selectedBatchId": "all",
                "transactionType": "sales",
                "status": "review",
            },
            "bucket_counts": {
                "missing_hsn": 3,
                "missing_uqc": 1,
            },
        },
        format="json",
    )
    assert create_response.status_code == 201
    snapshot_id = create_response.data["data"]["id"]
    snapshot = TransactionReviewSnapshot.objects.get(pk=snapshot_id)
    assert snapshot.name == "April close checkpoint"
    assert snapshot.bucket_counts["missing_hsn"] == 3
    assert AuditLog.objects.filter(action="transaction_review_snapshot.created", entity_id=snapshot.id).exists()

    list_response = transaction_authenticated_client.get(
        "/api/v1/gst-transaction-review-snapshots/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "client": str(transaction_context["client"].id),
            "compliance_period": str(transaction_context["compliance_period"].id),
        },
    )
    assert list_response.status_code == 200
    assert list_response.data["data"][0]["id"] == snapshot_id

    delete_response = transaction_authenticated_client.delete(
        f"/api/v1/gst-transaction-review-snapshots/{snapshot_id}/"
    )
    assert delete_response.status_code == 200
    assert not TransactionReviewSnapshot.objects.filter(pk=snapshot_id).exists()
    assert AuditLog.objects.filter(action="transaction_review_snapshot.deleted", entity_id=snapshot_id).exists()


@pytest.mark.django_db
def test_workspace_members_list_returns_workspace_users(transaction_authenticated_client, transaction_context):
    response = transaction_authenticated_client.get(
        "/api/v1/workspace-members/",
        {"workspace": str(transaction_context["workspace"].id)},
    )
    assert response.status_code == 200
    usernames = {item["username"] for item in response.data["data"]}
    assert usernames == {"reviewer", "closer"}


@pytest.mark.django_db
def test_transaction_remediation_assignment_lifecycle(transaction_authenticated_client, transaction_context):
    create_response = transaction_authenticated_client.post(
        "/api/v1/gst-transaction-remediation-assignments/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "client": str(transaction_context["client"].id),
            "gstin": str(transaction_context["gstin"].id),
            "compliance_period": str(transaction_context["compliance_period"].id),
            "bucket_code": "missing_hsn",
            "title": "Fill missing HSN for April",
            "transaction_ids": [str(transaction_context["transaction"].id)],
            "filters": {"status": "review"},
            "status": "open",
            "assigned_to": transaction_context["teammate"].id,
            "notes": "Close before filing export.",
        },
        format="json",
    )
    assert create_response.status_code == 201
    assignment_id = create_response.data["data"]["id"]
    assignment = TransactionRemediationAssignment.objects.get(pk=assignment_id)
    assert assignment.bucket_code == "missing_hsn"
    assert assignment.assigned_to_id == transaction_context["teammate"].id
    assert AuditLog.objects.filter(action="transaction_remediation_assignment.created", entity_id=assignment.id).exists()

    update_response = transaction_authenticated_client.patch(
        f"/api/v1/gst-transaction-remediation-assignments/{assignment_id}/",
        {"status": "in_progress", "notes": "Started remediation"},
        format="json",
    )
    assert update_response.status_code == 200
    assignment.refresh_from_db()
    assert assignment.status == "in_progress"
    assert assignment.notes == "Started remediation"
    assert AuditLog.objects.filter(action="transaction_remediation_assignment.updated", entity_id=assignment.id).exists()

    list_response = transaction_authenticated_client.get(
        "/api/v1/gst-transaction-remediation-assignments/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "client": str(transaction_context["client"].id),
            "compliance_period": str(transaction_context["compliance_period"].id),
        },
    )
    assert list_response.status_code == 200
    assert list_response.data["data"][0]["id"] == assignment_id

    delete_response = transaction_authenticated_client.delete(
        f"/api/v1/gst-transaction-remediation-assignments/{assignment_id}/"
    )
    assert delete_response.status_code == 200
    assert not TransactionRemediationAssignment.objects.filter(pk=assignment_id).exists()
    assert AuditLog.objects.filter(action="transaction_remediation_assignment.deleted", entity_id=assignment_id).exists()


@pytest.mark.django_db
def test_transaction_remediation_assignment_rejects_outsider_assignee(transaction_authenticated_client, transaction_context):
    outsider = User.objects.create_user(username="outsider", email="outsider@example.com", password="strong-pass-123")
    response = transaction_authenticated_client.post(
        "/api/v1/gst-transaction-remediation-assignments/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "client": str(transaction_context["client"].id),
            "gstin": str(transaction_context["gstin"].id),
            "compliance_period": str(transaction_context["compliance_period"].id),
            "bucket_code": "missing_hsn",
            "title": "Invalid assignment",
            "transaction_ids": [str(transaction_context["transaction"].id)],
            "filters": {},
            "status": "open",
            "assigned_to": outsider.id,
        },
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_transaction_remediation_assignment_escalation_flow(transaction_authenticated_client, transaction_context):
    assignment = TransactionRemediationAssignment.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        bucket_code="missing_hsn",
        title="Escalation target",
        transaction_ids=[str(transaction_context["transaction"].id)],
        filters={"status": "review"},
        status="open",
        assigned_to=transaction_context["teammate"],
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )

    escalate_response = transaction_authenticated_client.post(
        f"/api/v1/gst-transaction-remediation-assignments/{assignment.id}/escalate/",
        {"escalation_notes": "Missing metadata still unresolved before filing."},
        format="json",
    )
    assert escalate_response.status_code == 200
    assignment.refresh_from_db()
    assert assignment.escalated_at is not None
    assert assignment.escalated_by_id == transaction_context["user"].id
    assert assignment.escalation_notes == "Missing metadata still unresolved before filing."
    assert AuditLog.objects.filter(action="transaction_remediation_assignment.escalated", entity_id=assignment.id).exists()

    list_response = transaction_authenticated_client.get(
        "/api/v1/gst-transaction-remediation-assignments/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "client": str(transaction_context["client"].id),
            "compliance_period": str(transaction_context["compliance_period"].id),
            "is_escalated": "true",
        },
    )
    assert list_response.status_code == 200
    assert list_response.data["data"][0]["id"] == str(assignment.id)

    clear_response = transaction_authenticated_client.post(
        f"/api/v1/gst-transaction-remediation-assignments/{assignment.id}/clear-escalation/",
        {},
        format="json",
    )
    assert clear_response.status_code == 200
    assignment.refresh_from_db()
    assert assignment.escalated_at is None
    assert assignment.escalated_by is None
    assert assignment.escalation_notes == ""
    assert AuditLog.objects.filter(action="transaction_remediation_assignment.escalation_cleared", entity_id=assignment.id).exists()


@pytest.mark.django_db
def test_transaction_remediation_follow_up_lifecycle(transaction_authenticated_client, transaction_context):
    assignment = TransactionRemediationAssignment.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        bucket_code="missing_hsn",
        title="Follow-up target",
        transaction_ids=[str(transaction_context["transaction"].id)],
        filters={"status": "review"},
        status="open",
        assigned_to=transaction_context["teammate"],
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    create_response = transaction_authenticated_client.post(
        "/api/v1/gst-transaction-remediation-follow-ups/",
        {
          "workspace": str(transaction_context["workspace"].id),
          "client": str(transaction_context["client"].id),
          "gstin": str(transaction_context["gstin"].id),
          "compliance_period": str(transaction_context["compliance_period"].id),
          "assignment": str(assignment.id),
          "assigned_to": transaction_context["teammate"].id,
          "follow_up_type": "manager_review",
          "status": "open",
          "title": "Check unresolved metadata tomorrow",
          "notes": "Need confirmation before export.",
          "remind_at": "2026-04-21T10:00:00Z",
        },
        format="json",
    )
    assert create_response.status_code == 201
    follow_up_id = create_response.data["data"]["id"]
    follow_up = TransactionRemediationFollowUp.objects.get(pk=follow_up_id)
    assert follow_up.assignment_id == assignment.id
    assert follow_up.follow_up_type == "manager_review"
    assert AuditLog.objects.filter(action="transaction_remediation_follow_up.created", entity_id=follow_up.id).exists()

    complete_response = transaction_authenticated_client.post(
        f"/api/v1/gst-transaction-remediation-follow-ups/{follow_up_id}/mark-completed/",
        {},
        format="json",
    )
    assert complete_response.status_code == 200
    follow_up.refresh_from_db()
    assert follow_up.status == "completed"
    assert follow_up.completed_by_id == transaction_context["user"].id
    assert AuditLog.objects.filter(action="transaction_remediation_follow_up.completed", entity_id=follow_up.id).exists()

    dismiss_response = transaction_authenticated_client.post(
        f"/api/v1/gst-transaction-remediation-follow-ups/{follow_up_id}/dismiss/",
        {"notes": "No longer needed"},
        format="json",
    )
    assert dismiss_response.status_code == 200
    follow_up.refresh_from_db()
    assert follow_up.status == "dismissed"
    assert follow_up.notes == "No longer needed"
    assert AuditLog.objects.filter(action="transaction_remediation_follow_up.dismissed", entity_id=follow_up.id).exists()


@pytest.mark.django_db
def test_transaction_remediation_digest_generation_and_acknowledgement(transaction_authenticated_client, transaction_context):
    assignment = TransactionRemediationAssignment.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        bucket_code="missing_hsn",
        title="Digest queue",
        transaction_ids=[str(transaction_context["transaction"].id)],
        filters={"status": "review"},
        status="open",
        assigned_to=transaction_context["teammate"],
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    TransactionRemediationFollowUp.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        assignment=assignment,
        assigned_to=transaction_context["teammate"],
        follow_up_type="reminder",
        status="open",
        title="Digest follow-up",
        remind_at="2026-04-20T10:00:00Z",
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    create_response = transaction_authenticated_client.post(
        "/api/v1/gst-transaction-remediation-digests/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "generated_for": transaction_context["teammate"].id,
            "title": "Daily close digest",
            "delivery_channel": "in_app",
        },
        format="json",
    )
    assert create_response.status_code == 201
    digest_id = create_response.data["data"]["id"]
    digest = TransactionRemediationDigest.objects.get(pk=digest_id)
    assert digest.generated_by_id == transaction_context["user"].id
    assert digest.generated_for_id == transaction_context["teammate"].id
    assert digest.status == TransactionRemediationDigest.DigestStatus.DISPATCHED
    assert digest.summary["metrics"]["open_assignment_count"] >= 1
    assert digest.rendered_payload["subject"].startswith("GST close digest")
    assert digest.dispatched_at is not None
    assert digest.dispatched_by_id == transaction_context["user"].id
    assert AuditLog.objects.filter(action="transaction_remediation_digest.generated", entity_id=digest.id).exists()
    assert AuditLog.objects.filter(action="transaction_remediation_digest.dispatched", entity_id=digest.id).exists()

    acknowledge_response = transaction_authenticated_client.post(
        f"/api/v1/gst-transaction-remediation-digests/{digest_id}/acknowledge/",
        {},
        format="json",
    )
    assert acknowledge_response.status_code == 200
    digest.refresh_from_db()
    assert digest.status == "acknowledged"
    assert digest.acknowledged_by_id == transaction_context["user"].id
    assert AuditLog.objects.filter(action="transaction_remediation_digest.acknowledged", entity_id=digest.id).exists()


@pytest.mark.django_db
def test_transaction_remediation_email_digest_sends_mail(transaction_authenticated_client, transaction_context, settings):
    settings.DEFAULT_FROM_EMAIL = "GST Compliance <no-reply@example.com>"
    assignment = TransactionRemediationAssignment.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        bucket_code="missing_hsn",
        title="Email digest queue",
        transaction_ids=[str(transaction_context["transaction"].id)],
        filters={"status": "review"},
        status="open",
        assigned_to=transaction_context["teammate"],
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    TransactionRemediationFollowUp.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        assignment=assignment,
        assigned_to=transaction_context["teammate"],
        follow_up_type="reminder",
        status="open",
        title="Email digest follow-up",
        remind_at="2026-04-20T10:00:00Z",
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )

    create_response = transaction_authenticated_client.post(
        "/api/v1/gst-transaction-remediation-digests/",
        {
            "workspace": str(transaction_context["workspace"].id),
            "generated_for": transaction_context["teammate"].id,
            "title": "Daily close email digest",
            "delivery_channel": "email",
        },
        format="json",
    )

    assert create_response.status_code == 201
    digest = TransactionRemediationDigest.objects.get(pk=create_response.data["data"]["id"])
    assert digest.status == TransactionRemediationDigest.DigestStatus.DISPATCHED
    assert digest.rendered_payload["recipient_email"] == transaction_context["teammate"].email
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [transaction_context["teammate"].email]
    assert "GST close digest" in mail.outbox[0].subject


@pytest.mark.django_db
def test_generate_scheduled_remediation_digests_creates_once_per_day(transaction_context, settings):
    settings.CLOSE_MANAGER_DIGEST_DELIVERY_CHANNEL = "in_app"
    settings.CLOSE_MANAGER_DIGEST_RECIPIENT_ROLES = ["owner", "manager"]

    first_run = generate_scheduled_remediation_digests(actor=transaction_context["user"])
    second_run = generate_scheduled_remediation_digests(actor=transaction_context["user"])

    assert len(first_run) == 2
    assert len(second_run) == 0
    assert TransactionRemediationDigest.objects.filter(
        workspace=transaction_context["workspace"],
        title=f"Scheduled close digest • {timezone.localdate().isoformat()}",
    ).count() == 2


@pytest.mark.django_db
def test_send_close_manager_digests_command_generates_email_digests(transaction_context, settings):
    settings.DEFAULT_FROM_EMAIL = "GST Compliance <no-reply@example.com>"
    settings.CLOSE_MANAGER_DIGEST_RECIPIENT_ROLES = ["manager"]
    settings.CLOSE_MANAGER_DIGEST_DELIVERY_CHANNEL = "email"

    call_command(
        "send_close_manager_digests",
        workspace=str(transaction_context["workspace"].id),
        actor_username=transaction_context["user"].username,
    )

    digests = TransactionRemediationDigest.objects.filter(
        workspace=transaction_context["workspace"],
        delivery_channel="email",
    )
    assert digests.count() == 1
    digest = digests.first()
    assert digest.generated_for_id == transaction_context["teammate"].id
    assert digest.status == TransactionRemediationDigest.DigestStatus.DISPATCHED
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_process_due_follow_up_reminders_marks_sent_and_tracks_counts(transaction_context, settings):
    settings.REMEDIATION_FOLLOW_UP_DELIVERY_CHANNEL = "in_app"
    assignment = TransactionRemediationAssignment.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        bucket_code="missing_hsn",
        title="Reminder target",
        transaction_ids=[str(transaction_context["transaction"].id)],
        filters={"status": "review"},
        status="open",
        assigned_to=transaction_context["teammate"],
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    follow_up = TransactionRemediationFollowUp.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        assignment=assignment,
        assigned_to=transaction_context["teammate"],
        follow_up_type="reminder",
        status="open",
        title="Send reminder now",
        remind_at=timezone.now() - timedelta(hours=2),
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )

    processed = process_due_follow_up_reminders(actor=transaction_context["user"])
    follow_up.refresh_from_db()
    assert len(processed) == 1
    assert processed[0].id == follow_up.id
    assert follow_up.status == TransactionRemediationFollowUp.FollowUpStatus.SENT
    assert follow_up.reminder_count == 1
    assert follow_up.last_notified_at is not None
    assert AuditLog.objects.filter(action="transaction_remediation_follow_up.reminder_sent", entity_id=follow_up.id).exists()

    processed_again = process_due_follow_up_reminders(actor=transaction_context["user"])
    follow_up.refresh_from_db()
    assert processed_again == []
    assert follow_up.reminder_count == 1


@pytest.mark.django_db
def test_process_due_follow_up_reminders_auto_escalates_overdue_assignment(transaction_context, settings):
    settings.REMEDIATION_FOLLOW_UP_DELIVERY_CHANNEL = "in_app"
    settings.REMEDIATION_AUTO_ESCALATION_ENABLED = True
    settings.REMEDIATION_AUTO_ESCALATION_DELAY_HOURS = 1
    assignment = TransactionRemediationAssignment.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        bucket_code="missing_hsn",
        title="Auto escalation target",
        transaction_ids=[str(transaction_context["transaction"].id)],
        filters={"status": "review"},
        status="open",
        assigned_to=transaction_context["teammate"],
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )
    follow_up = TransactionRemediationFollowUp.objects.create(
        workspace=transaction_context["workspace"],
        client=transaction_context["client"],
        gstin=transaction_context["gstin"],
        compliance_period=transaction_context["compliance_period"],
        assignment=assignment,
        assigned_to=transaction_context["teammate"],
        follow_up_type="manager_review",
        status="open",
        title="Escalate if still open",
        remind_at=timezone.now() - timedelta(hours=3),
        created_by=transaction_context["user"],
        updated_by=transaction_context["user"],
    )

    process_due_follow_up_reminders(actor=transaction_context["user"])
    assignment.refresh_from_db()
    follow_up.refresh_from_db()
    assert assignment.escalated_at is not None
    assert follow_up.auto_escalated_at is not None
    assert AuditLog.objects.filter(action="transaction_remediation_assignment.auto_escalated", entity_id=assignment.id).exists()
