from django.conf import settings
from django.db import models

from apps.clients.models import Client
from apps.common.models import BaseModel
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch
from apps.workspaces.models import Workspace


class GSTTransaction(BaseModel):
    class TransactionStatus(models.TextChoices):
        IMPORTED = "imported", "Imported"
        REVIEW = "review", "Review"
        LOCKED = "locked", "Locked"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="gst_transactions", null=True, blank=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="gst_transactions", null=True, blank=True)
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="gst_transactions", null=True, blank=True)
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.SET_NULL,
        related_name="gst_transactions",
        null=True,
        blank=True,
    )
    transaction_type = models.CharField(max_length=32)
    document_type = models.CharField(max_length=32, default="invoice")
    reference_number = models.CharField(max_length=64)
    transaction_date = models.DateField()
    counterparty_gstin = models.CharField(max_length=15, blank=True)
    counterparty_name = models.CharField(max_length=255, blank=True)
    taxable_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    sgst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cess_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    place_of_supply = models.CharField(max_length=128, blank=True)
    reverse_charge = models.BooleanField(default=False)
    import_batch = models.ForeignKey(
        ImportBatch,
        on_delete=models.SET_NULL,
        related_name="transactions",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=32, choices=TransactionStatus.choices, default=TransactionStatus.IMPORTED)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "gst_transactions"
        ordering = ["-transaction_date", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "client", "transaction_date"]),
            models.Index(fields=["gstin", "compliance_period"]),
            models.Index(fields=["transaction_type", "transaction_date"]),
            models.Index(fields=["reference_number"]),
            models.Index(fields=["import_batch"]),
        ]


class TransactionReviewSnapshot(BaseModel):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="transaction_review_snapshots")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="transaction_review_snapshots")
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="transaction_review_snapshots", null=True, blank=True)
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.CASCADE,
        related_name="transaction_review_snapshots",
    )
    name = models.CharField(max_length=120, blank=True)
    filters = models.JSONField(default=dict, blank=True)
    bucket_counts = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "transaction_review_snapshots"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "client", "created_at"]),
            models.Index(fields=["compliance_period", "created_at"]),
        ]


class TransactionRemediationAssignment(BaseModel):
    class AssignmentStatus(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        RESOLVED = "resolved", "Resolved"
        DEFERRED = "deferred", "Deferred"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="transaction_remediation_assignments")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="transaction_remediation_assignments")
    gstin = models.ForeignKey(
        GSTIN,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_assignments",
        null=True,
        blank=True,
    )
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.CASCADE,
        related_name="transaction_remediation_assignments",
    )
    snapshot = models.ForeignKey(
        TransactionReviewSnapshot,
        on_delete=models.SET_NULL,
        related_name="assignments",
        null=True,
        blank=True,
    )
    bucket_code = models.CharField(max_length=64, blank=True)
    title = models.CharField(max_length=160)
    transaction_ids = models.JSONField(default=list, blank=True)
    filters = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=32, choices=AssignmentStatus.choices, default=AssignmentStatus.OPEN)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_assignments",
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    escalated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_assignments_escalated",
        null=True,
        blank=True,
    )
    escalation_notes = models.TextField(blank=True)

    class Meta:
        db_table = "transaction_remediation_assignments"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "client", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["bucket_code"]),
            models.Index(fields=["escalated_at"]),
        ]


class TransactionRemediationFollowUp(BaseModel):
    class FollowUpType(models.TextChoices):
        REMINDER = "reminder", "Reminder"
        MANAGER_REVIEW = "manager_review", "Manager Review"
        ESCALATION_CHECK = "escalation_check", "Escalation Check"
        CLOSE_CHECKPOINT = "close_checkpoint", "Close Checkpoint"

    class FollowUpStatus(models.TextChoices):
        OPEN = "open", "Open"
        SENT = "sent", "Sent"
        COMPLETED = "completed", "Completed"
        DISMISSED = "dismissed", "Dismissed"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="transaction_remediation_follow_ups")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="transaction_remediation_follow_ups")
    gstin = models.ForeignKey(
        GSTIN,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_follow_ups",
        null=True,
        blank=True,
    )
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.CASCADE,
        related_name="transaction_remediation_follow_ups",
    )
    assignment = models.ForeignKey(
        TransactionRemediationAssignment,
        on_delete=models.CASCADE,
        related_name="follow_ups",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_follow_ups",
        null=True,
        blank=True,
    )
    follow_up_type = models.CharField(max_length=32, choices=FollowUpType.choices, default=FollowUpType.REMINDER)
    status = models.CharField(max_length=32, choices=FollowUpStatus.choices, default=FollowUpStatus.OPEN)
    title = models.CharField(max_length=160)
    notes = models.TextField(blank=True)
    remind_at = models.DateTimeField()
    last_notified_at = models.DateTimeField(null=True, blank=True)
    reminder_count = models.PositiveIntegerField(default=0)
    auto_escalated_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_follow_ups_completed",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "transaction_remediation_follow_ups"
        ordering = ["remind_at", "-created_at"]
        indexes = [
            models.Index(fields=["workspace", "client", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["assignment", "status"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["remind_at"]),
            models.Index(fields=["last_notified_at"]),
        ]


class TransactionRemediationDigest(BaseModel):
    class DeliveryChannel(models.TextChoices):
        IN_APP = "in_app", "In App"
        EMAIL_PREVIEW = "email_preview", "Email Preview"
        EMAIL = "email", "Email"

    class DigestStatus(models.TextChoices):
        GENERATED = "generated", "Generated"
        DISPATCHED = "dispatched", "Dispatched"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        FAILED = "failed", "Failed"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="transaction_remediation_digests")
    generated_for = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_digests_for",
        null=True,
        blank=True,
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_digests_generated",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=160)
    delivery_channel = models.CharField(max_length=32, choices=DeliveryChannel.choices, default=DeliveryChannel.IN_APP)
    status = models.CharField(max_length=32, choices=DigestStatus.choices, default=DigestStatus.GENERATED)
    summary = models.JSONField(default=dict, blank=True)
    rendered_payload = models.JSONField(default=dict, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    dispatched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_digests_dispatched",
        null=True,
        blank=True,
    )
    dispatch_error = models.TextField(blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="transaction_remediation_digests_acknowledged",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "transaction_remediation_digests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["generated_for", "status"]),
            models.Index(fields=["delivery_channel"]),
            models.Index(fields=["dispatched_at"]),
        ]
