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
        GSTR7 = "gstr7", "GSTR-7"
        GSTR9 = "gstr9", "GSTR-9"
        GSTR9C = "gstr9c", "GSTR-9C"

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


class PortalLedgerSnapshot(BaseModel):
    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.CASCADE,
        related_name="portal_ledger_snapshots",
    )
    prepared_return = models.ForeignKey(
        ReturnPreparation,
        on_delete=models.SET_NULL,
        related_name="portal_ledger_snapshots",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, default="whitebooks")
    return_type = models.CharField(max_length=32, choices=ReturnPreparation.ReturnType.choices)
    auth_session = models.ForeignKey(
        "filings.WhiteBooksAuthSession",
        on_delete=models.SET_NULL,
        related_name="portal_ledger_snapshots",
        null=True,
        blank=True,
    )
    fetched_at = models.DateTimeField()
    computed_summary = models.JSONField(default=dict, blank=True)
    balance_response = models.JSONField(default=dict, blank=True)
    taxpayable_response = models.JSONField(default=dict, blank=True)
    cash_ledger_response = models.JSONField(default=dict, blank=True)
    itc_ledger_response = models.JSONField(default=dict, blank=True)
    liability_ledger_response = models.JSONField(default=dict, blank=True)
    challan_reference = models.CharField(max_length=64, blank=True)
    challan_history_response = models.JSONField(default=dict, blank=True)
    challan_summary_response = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "portal_ledger_snapshots"
        ordering = ["-fetched_at", "-created_at"]
        indexes = [
            models.Index(fields=["compliance_period", "return_type", "provider"]),
            models.Index(fields=["auth_session", "provider"]),
            models.Index(fields=["fetched_at"]),
        ]


class PortalChallanRequest(BaseModel):
    class RequestStatus(models.TextChoices):
        CREATED = "created", "Created"
        SUBMITTED = "submitted", "Submitted"
        FAILED = "failed", "Failed"

    compliance_period = models.ForeignKey(
        CompliancePeriod,
        on_delete=models.CASCADE,
        related_name="portal_challan_requests",
    )
    prepared_return = models.ForeignKey(
        ReturnPreparation,
        on_delete=models.SET_NULL,
        related_name="portal_challan_requests",
        null=True,
        blank=True,
    )
    auth_session = models.ForeignKey(
        "filings.WhiteBooksAuthSession",
        on_delete=models.SET_NULL,
        related_name="portal_challan_requests",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, default="whitebooks")
    return_type = models.CharField(max_length=32, choices=ReturnPreparation.ReturnType.choices)
    status = models.CharField(max_length=32, choices=RequestStatus.choices, default=RequestStatus.CREATED)
    cpin = models.CharField(max_length=64, blank=True)
    challan_reason = models.CharField(max_length=32)
    challan_period = models.CharField(max_length=16)
    payment_mode = models.CharField(max_length=16)
    bank_code = models.CharField(max_length=16, blank=True)
    sub_payment_mode = models.CharField(max_length=16, blank=True)
    taxpayer_name = models.CharField(max_length=128)
    address = models.CharField(max_length=255)
    mobile_number = models.CharField(max_length=32)
    request_payload = models.JSONField(default=dict, blank=True)
    response_payload = models.JSONField(default=dict, blank=True)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = "portal_challan_requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["compliance_period", "return_type", "provider"]),
            models.Index(fields=["status", "provider"]),
            models.Index(fields=["cpin"]),
        ]
