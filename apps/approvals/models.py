from django.conf import settings
from django.db import models

from apps.clients.models import Client
from apps.common.models import BaseModel
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.workspaces.models import Workspace


class ApprovalRequest(BaseModel):
    class ApprovalStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    class EntityType(models.TextChoices):
        IMPORT_BATCH = "import_batch", "Import Batch"
        RECONCILIATION_RUN = "reconciliation_run", "Reconciliation Run"
        RETURN_PREPARATION = "return_preparation", "Return Preparation"
        COMPLIANCE_PERIOD = "compliance_period", "Compliance Period"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="approval_requests", null=True, blank=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="approval_requests", null=True, blank=True)
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="approval_requests", null=True, blank=True)
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.SET_NULL,
        related_name="approval_requests",
        null=True,
        blank=True,
    )
    entity_type = models.CharField(max_length=32, choices=EntityType.choices, blank=True)
    entity_id = models.UUIDField(null=True, blank=True)
    requested_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approval_requests_received",
    )
    status = models.CharField(max_length=32, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING)
    comments = models.TextField(blank=True)
    resolution_comments = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approval_requests_resolved",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "approval_requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["entity_type", "entity_id"]),
            models.Index(fields=["requested_to", "status"]),
        ]
