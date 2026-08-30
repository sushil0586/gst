from django.conf import settings
from django.db import models

from apps.clients.models import Client
from apps.common.models import BaseModel
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.gstins.models import GSTIN
from apps.workspaces.models import Workspace


class IMSActionBatch(BaseModel):
    class ActionType(models.TextChoices):
        SAVE = "save", "Save"
        RESET = "reset", "Reset"

    class BatchStatus(models.TextChoices):
        REQUESTED = "requested", "Requested"
        SUBMITTED = "submitted", "Submitted"
        FAILED = "failed", "Failed"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="ims_action_batches")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="ims_action_batches")
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="ims_action_batches", null=True, blank=True)
    auth_session = models.ForeignKey(
        ProviderAuthSession,
        on_delete=models.SET_NULL,
        related_name="ims_action_batches",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, choices=ReturnFiling.Provider.choices, default=ReturnFiling.Provider.WHITEBOOKS)
    action_type = models.CharField(max_length=16, choices=ActionType.choices)
    ret_period = models.CharField(max_length=6)
    status = models.CharField(max_length=24, choices=BatchStatus.choices, default=BatchStatus.REQUESTED)
    provider_transaction_id = models.CharField(max_length=128, blank=True)
    request_payload_hash = models.CharField(max_length=128, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="ims_action_batches_requested",
        null=True,
        blank=True,
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ims_action_batches"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["gstin", "ret_period"]),
            models.Index(fields=["action_type", "status"]),
            models.Index(fields=["provider_transaction_id"]),
        ]
