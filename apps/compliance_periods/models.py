from django.db import models
from django.conf import settings

from apps.common.models import BaseModel
from apps.gstins.models import GSTIN


class CompliancePeriod(BaseModel):
    class PeriodStatus(models.TextChoices):
        OPEN = "open", "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        CLOSED = "closed", "Closed"

    gstin = models.ForeignKey(GSTIN, on_delete=models.CASCADE, related_name="compliance_periods")
    period = models.CharField(max_length=7, help_text="Format: YYYY-MM")
    return_type = models.CharField(max_length=32, default="GSTR-3B")
    status = models.CharField(max_length=32, choices=PeriodStatus.choices, default=PeriodStatus.OPEN)
    due_date = models.DateField(null=True, blank=True)
    is_locked = models.BooleanField(default=False, db_index=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="locked_compliance_periods",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "compliance_periods"
        ordering = ["-period"]
        constraints = [
            models.UniqueConstraint(fields=["gstin", "period", "return_type"], name="unique_period_per_return"),
        ]
        indexes = [
            models.Index(fields=["gstin", "period"]),
            models.Index(fields=["status"]),
            models.Index(fields=["is_locked"]),
        ]

    def __str__(self):
        return f"{self.gstin} - {self.period}"
