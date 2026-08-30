from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.gstins.models import GSTIN


class Notice(BaseModel):
    gstin = models.ForeignKey(GSTIN, on_delete=models.CASCADE, related_name="notices")
    reference_number = models.CharField(max_length=64)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=32, default="open")
    due_date = models.DateField(null=True, blank=True)
    provider = models.CharField(max_length=32, blank=True, default="")
    provider_reference_id = models.CharField(max_length=128, blank=True)
    provider_notice_type = models.CharField(max_length=128, blank=True)
    provider_status = models.CharField(max_length=128, blank=True)
    provider_due_date = models.DateField(null=True, blank=True)
    provider_payload = models.JSONField(default=dict, blank=True)
    provider_detail_payload = models.JSONField(default=dict, blank=True)
    provider_synced_at = models.DateTimeField(null=True, blank=True)
    provider_detail_synced_at = models.DateTimeField(null=True, blank=True)
    provider_last_error = models.TextField(blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_notices",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "notices"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["gstin", "reference_number"], name="unique_notice_reference_per_gstin"),
        ]
        indexes = [
            models.Index(fields=["gstin", "status"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["provider", "provider_reference_id"]),
            models.Index(fields=["provider_synced_at"]),
            models.Index(fields=["provider_detail_synced_at"]),
        ]


class NoticeSyncEvent(BaseModel):
    class EventType(models.TextChoices):
        LIST_SYNC = "list_sync", "List sync"
        DETAIL_FETCH = "detail_fetch", "Detail fetch"
        FOLLOW_UP = "follow_up", "Follow-up"

    class EventStatus(models.TextChoices):
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    gstin = models.ForeignKey(GSTIN, on_delete=models.CASCADE, related_name="notice_sync_events")
    notice = models.ForeignKey(Notice, on_delete=models.SET_NULL, related_name="sync_events", null=True, blank=True)
    provider = models.CharField(max_length=32, default="whitebooks")
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    status = models.CharField(max_length=32, choices=EventStatus.choices)
    reference_number = models.CharField(max_length=64, blank=True)
    provider_reference_id = models.CharField(max_length=128, blank=True)
    message = models.TextField(blank=True)
    counters = models.JSONField(default=dict, blank=True)
    provider_payload = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="notice_sync_events_initiated",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "notice_sync_events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["gstin", "event_type"]),
            models.Index(fields=["notice", "event_type"]),
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["created_at"]),
        ]
