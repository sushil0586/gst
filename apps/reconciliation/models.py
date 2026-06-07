from django.conf import settings
from django.db import models

from apps.clients.models import Client
from apps.common.models import BaseModel
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN
from apps.workspaces.models import Workspace


class ReconciliationRun(BaseModel):
    class RunStatus(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    class RunType(models.TextChoices):
        GSTR_2B_PURCHASE = "gstr_2b_purchase", "GSTR-2B Purchase"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="reconciliation_runs", null=True, blank=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="reconciliation_runs", null=True, blank=True)
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="reconciliation_runs", null=True, blank=True)
    compliance_period = models.ForeignKey(CompliancePeriod, on_delete=models.CASCADE, related_name="reconciliation_runs")
    run_type = models.CharField(max_length=32, choices=RunType.choices, default=RunType.GSTR_2B_PURCHASE)
    status = models.CharField(max_length=32, choices=RunStatus.choices, default=RunStatus.QUEUED)
    notes = models.TextField(blank=True)
    matched_count = models.PositiveIntegerField(default=0)
    mismatch_count = models.PositiveIntegerField(default=0)
    partial_match_count = models.PositiveIntegerField(default=0)
    missing_in_books_count = models.PositiveIntegerField(default=0)
    missing_in_portal_count = models.PositiveIntegerField(default=0)
    duplicate_count = models.PositiveIntegerField(default=0)
    total_tax_difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_itc_at_risk = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    itc_ready_count = models.PositiveIntegerField(default=0)
    itc_pending_2b_count = models.PositiveIntegerField(default=0)
    itc_pending_review_count = models.PositiveIntegerField(default=0)
    itc_blocked_count = models.PositiveIntegerField(default=0)
    itc_timing_difference_count = models.PositiveIntegerField(default=0)
    itc_vendor_followup_required_count = models.PositiveIntegerField(default=0)
    processed_at = models.DateTimeField(null=True, blank=True)
    error_summary = models.JSONField(default=dict, blank=True)
    is_stale = models.BooleanField(default=False)
    invalidated_at = models.DateTimeField(null=True, blank=True)
    invalidated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="reconciliation_runs_invalidated",
        null=True,
        blank=True,
    )
    invalidation_reason = models.CharField(max_length=128, blank=True)

    class Meta:
        db_table = "reconciliation_runs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["run_type", "status"]),
        ]


class ReconciliationItem(BaseModel):
    class MatchStatus(models.TextChoices):
        MATCHED = "matched", "Matched"
        PARTIAL_MATCH = "partial_match", "Partial Match"
        MISMATCH = "mismatch", "Mismatch"
        MISSING_IN_BOOKS = "missing_in_books", "Missing in Books"
        MISSING_IN_PORTAL = "missing_in_portal", "Missing in Portal"
        DUPLICATE_IN_BOOKS = "duplicate_in_books", "Duplicate in Books"
        DUPLICATE_IN_PORTAL = "duplicate_in_portal", "Duplicate in Portal"

    class MismatchReason(models.TextChoices):
        GSTIN_MISMATCH = "gstin_mismatch", "GSTIN Mismatch"
        DOCUMENT_NUMBER_MISMATCH = "document_number_mismatch", "Document Number Mismatch"
        DATE_MISMATCH = "date_mismatch", "Date Mismatch"
        TAXABLE_VALUE_MISMATCH = "taxable_value_mismatch", "Taxable Value Mismatch"
        TAX_AMOUNT_MISMATCH = "tax_amount_mismatch", "Tax Amount Mismatch"
        TOTAL_AMOUNT_MISMATCH = "total_amount_mismatch", "Total Amount Mismatch"
        DUPLICATE_INVOICE = "duplicate_invoice", "Duplicate Invoice"
        MISSING_IN_BOOKS = "missing_in_books", "Missing in Books"
        MISSING_IN_PORTAL = "missing_in_portal", "Missing in Portal"

    class ActionStatus(models.TextChoices):
        OPEN = "open", "Open"
        ASSIGNED = "assigned", "Assigned"
        RESOLVED = "resolved", "Resolved"
        DEFERRED = "deferred", "Deferred"
        IGNORED = "ignored", "Ignored"

    class IssueBucket(models.TextChoices):
        READY = "ready", "Ready / Matched"
        TIMING_DIFFERENCE = "timing_difference", "Timing Difference"
        VENDOR_FOLLOW_UP = "vendor_follow_up", "Vendor Follow-up"
        BOOKS_CORRECTION = "books_correction", "Books Correction"
        VALUE_REVIEW = "value_review", "Value Review"
        DOCUMENT_REVIEW = "document_review", "Document Review"
        DUPLICATE_CLEANUP = "duplicate_cleanup", "Duplicate Cleanup"
        ISSUE_REVIEW = "issue_review", "General Review"

    class PeriodRelationship(models.TextChoices):
        SAME_PERIOD = "same_period", "Same Period"
        PRIOR_PERIOD = "prior_period", "Prior Period"
        NEXT_PERIOD = "next_period", "Next Period"
        UNKNOWN = "unknown", "Unknown"

    class ITCStatus(models.TextChoices):
        ITC_READY = "itc_ready", "ITC Ready"
        ITC_PENDING_2B = "itc_pending_2b", "ITC Pending 2B"
        ITC_PENDING_REVIEW = "itc_pending_review", "ITC Pending Review"
        ITC_BLOCKED = "itc_blocked", "ITC Blocked"
        ITC_TIMING_DIFFERENCE = "itc_timing_difference", "ITC Timing Difference"
        ITC_VENDOR_FOLLOWUP_REQUIRED = "itc_vendor_followup_required", "ITC Vendor Follow-up Required"

    class ReviewDecision(models.TextChoices):
        AUTO = "auto", "Auto"
        CLAIM_NOW = "claim_now", "Claim Now"
        DEFER = "defer", "Defer"
        BLOCKED = "blocked", "Blocked"
        VENDOR_FOLLOW_UP = "vendor_follow_up", "Vendor Follow-up"

    reconciliation_run = models.ForeignKey(ReconciliationRun, on_delete=models.CASCADE, related_name="items")
    books_transaction = models.ForeignKey(
        GSTTransaction,
        on_delete=models.SET_NULL,
        related_name="reconciliation_books_items",
        null=True,
        blank=True,
    )
    portal_transaction = models.ForeignKey(
        GSTTransaction,
        on_delete=models.SET_NULL,
        related_name="reconciliation_portal_items",
        null=True,
        blank=True,
    )
    match_status = models.CharField(max_length=32, choices=MatchStatus.choices, default=MatchStatus.MATCHED)
    mismatch_reason = models.CharField(max_length=64, choices=MismatchReason.choices, blank=True)
    tax_difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    taxable_difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_difference = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    action_status = models.CharField(max_length=32, choices=ActionStatus.choices, default=ActionStatus.OPEN)
    issue_bucket = models.CharField(max_length=32, choices=IssueBucket.choices, default=IssueBucket.ISSUE_REVIEW)
    recommended_next_action = models.CharField(max_length=96, blank=True)
    period_relationship = models.CharField(max_length=24, choices=PeriodRelationship.choices, default=PeriodRelationship.UNKNOWN)
    itc_status = models.CharField(max_length=40, choices=ITCStatus.choices, default=ITCStatus.ITC_PENDING_REVIEW)
    review_decision = models.CharField(max_length=24, choices=ReviewDecision.choices, default=ReviewDecision.AUTO)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="reconciliation_items_assigned",
        null=True,
        blank=True,
    )
    remarks = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    derived_from_stale_source = models.BooleanField(default=False)

    class Meta:
        db_table = "reconciliation_items"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["reconciliation_run", "match_status"]),
            models.Index(fields=["reconciliation_run", "action_status"]),
            models.Index(fields=["reconciliation_run", "issue_bucket"]),
            models.Index(fields=["reconciliation_run", "itc_status"]),
            models.Index(fields=["reconciliation_run", "review_decision"]),
            models.Index(fields=["assigned_to"]),
            models.Index(fields=["mismatch_reason"]),
        ]
