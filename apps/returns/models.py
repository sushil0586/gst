from django.db import models

from apps.common.models import BaseModel
from apps.compliance_periods.models import CompliancePeriod
from django.conf import settings


class ReturnPreparation(BaseModel):
    class PreparationStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        VALIDATING = "validating", "Validating"
        READY_FOR_REVIEW = "ready_for_review", "Ready for Review"
        BLOCKED_BY_STALE_RECONCILIATION = "blocked_by_stale_reconciliation", "Blocked by Stale Reconciliation"
        APPROVED = "approved", "Approved"
        FILED = "filed", "Filed"
        FAILED = "failed", "Failed"

    class ReturnType(models.TextChoices):
        GSTR1 = "gstr1", "GSTR-1"
        GSTR3B = "gstr3b", "GSTR-3B"

    compliance_period = models.ForeignKey(CompliancePeriod, on_delete=models.CASCADE, related_name="return_preparations")
    return_type = models.CharField(max_length=32, choices=ReturnType.choices)
    status = models.CharField(max_length=32, choices=PreparationStatus.choices, default=PreparationStatus.DRAFT)
    summary_snapshot = models.JSONField(default=dict, blank=True)
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="returns_prepared",
        null=True,
        blank=True,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="returns_approved",
        null=True,
        blank=True,
    )
    filed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="returns_filed",
        null=True,
        blank=True,
    )
    filed_at = models.DateTimeField(null=True, blank=True)
    arn = models.CharField(max_length=64, blank=True)
    is_blocked_by_stale_reconciliation = models.BooleanField(default=False)
    blocking_reason = models.CharField(max_length=128, blank=True)

    class Meta:
        db_table = "return_preparations"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["compliance_period", "return_type"],
                name="unique_return_preparation_per_period",
            ),
        ]
        indexes = [models.Index(fields=["compliance_period", "status"])]
