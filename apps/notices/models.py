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
        ]
