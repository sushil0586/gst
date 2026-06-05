from django.conf import settings
from django.db import models

from apps.clients.models import Client, ClientContact
from apps.common.models import BaseModel
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ReturnFiling
from apps.gstins.models import GSTIN
from apps.notices.models import Notice
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace


class OperationalFollowUp(BaseModel):
    class FollowUpType(models.TextChoices):
        DATA_REQUEST = "data_request", "Data Request"
        APPROVAL_REQUEST = "approval_request", "Approval Request"
        OTP_COORDINATION = "otp_coordination", "OTP Coordination"
        PAYMENT_CONFIRMATION = "payment_confirmation", "Payment Confirmation"
        NOTICE_DOCUMENT_REQUEST = "notice_document_request", "Notice Document Request"
        RETURN_FILING_CONFIRMATION = "return_filing_confirmation", "Return Filing Confirmation"
        MISMATCH_RESOLUTION = "mismatch_resolution", "Mismatch Resolution"
        GENERAL = "general", "General"

    class PendingWith(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        CA_TEAM = "ca_team", "CA Team"
        REVIEWER = "reviewer", "Reviewer"
        PROVIDER = "provider", "Provider"
        GOVERNMENT_PORTAL = "government_portal", "Government Portal"

    class FollowUpStatus(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        WAITING = "waiting", "Waiting"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        ESCALATED = "escalated", "Escalated"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="operational_follow_ups")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="operational_follow_ups")
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="operational_follow_ups", null=True, blank=True)
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups",
        null=True,
        blank=True,
    )
    return_preparation = models.ForeignKey(
        ReturnPreparation,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups",
        null=True,
        blank=True,
    )
    return_filing = models.ForeignKey(
        ReturnFiling,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups",
        null=True,
        blank=True,
    )
    notice = models.ForeignKey(
        Notice,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups",
        null=True,
        blank=True,
    )
    contact = models.ForeignKey(
        ClientContact,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups",
        null=True,
        blank=True,
    )
    contact_name_snapshot = models.CharField(max_length=255, blank=True)
    mobile_number_snapshot = models.CharField(max_length=32, blank=True)
    email_snapshot = models.EmailField(blank=True)
    follow_up_type = models.CharField(max_length=32, choices=FollowUpType.choices, default=FollowUpType.GENERAL)
    reason = models.CharField(max_length=255)
    pending_with = models.CharField(max_length=32, choices=PendingWith.choices, default=PendingWith.CUSTOMER)
    status = models.CharField(max_length=32, choices=FollowUpStatus.choices, default=FollowUpStatus.OPEN)
    priority = models.CharField(max_length=32, choices=Priority.choices, default=Priority.MEDIUM)
    title = models.CharField(max_length=160)
    notes = models.TextField(blank=True)
    next_action = models.TextField(blank=True)
    due_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    last_contacted_at = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups_assigned",
        null=True,
        blank=True,
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="operational_follow_ups_completed",
        null=True,
        blank=True,
    )
    escalated_at = models.DateTimeField(null=True, blank=True)
    closed_reason = models.TextField(blank=True)

    class Meta:
        db_table = "operational_follow_ups"
        ordering = ["due_at", "-priority", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["workspace", "pending_with"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["gstin", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["priority", "status"]),
            models.Index(fields=["due_at"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.client.legal_name})"

