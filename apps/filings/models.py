from django.conf import settings
from django.db import models

from apps.accounts.models import WorkspaceRole
from apps.approvals.models import ApprovalRequest
from apps.clients.models import Client
from apps.common.models import BaseModel
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace


class ReturnFiling(BaseModel):
    class Provider(models.TextChoices):
        WHITEBOOKS = "whitebooks", "WhiteBooks"
        DEMO_GSP = "demo_gsp", "Demo GSP"

    class FilingStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        READY_FOR_REVIEW = "ready_for_review", "Ready For Review"
        APPROVED = "approved", "Approved"
        QUEUED_FOR_FILING = "queued_for_filing", "Queued For Filing"
        SUBMITTED = "submitted", "Submitted"
        ARN_RECEIVED = "arn_received", "ARN Received"
        FILED = "filed", "Filed"
        FAILED = "failed", "Failed"
        NEEDS_RETRY = "needs_retry", "Needs Retry"
        CANCELLED = "cancelled", "Cancelled"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="return_filings")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="return_filings")
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="return_filings", null=True, blank=True)
    compliance_period = models.ForeignKey(CompliancePeriod, on_delete=models.CASCADE, related_name="return_filings")
    prepared_return = models.ForeignKey(
        ReturnPreparation,
        on_delete=models.CASCADE,
        related_name="filings",
    )
    approval_request = models.ForeignKey(
        ApprovalRequest,
        on_delete=models.SET_NULL,
        related_name="authorized_filings",
        null=True,
        blank=True,
    )
    provider = models.CharField(max_length=32, choices=Provider.choices, default=Provider.WHITEBOOKS)
    return_type = models.CharField(max_length=32, choices=ReturnPreparation.ReturnType.choices)
    status = models.CharField(max_length=32, choices=FilingStatus.choices, default=FilingStatus.DRAFT)
    prepared_snapshot_version = models.PositiveIntegerField(default=1)
    provider_reference_id = models.CharField(max_length=128, blank=True)
    provider_acknowledgement_id = models.CharField(max_length=128, blank=True)
    arn = models.CharField(max_length=64, blank=True)
    readiness_snapshot = models.JSONField(default=dict, blank=True)
    error_summary = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    arn_received_at = models.DateTimeField(null=True, blank=True)
    filed_at = models.DateTimeField(null=True, blank=True)
    last_status_sync_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="filings_approved",
        null=True,
        blank=True,
    )
    filed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="filings_filed",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "return_filings"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["prepared_return", "prepared_snapshot_version"],
                condition=models.Q(is_active=True),
                name="unique_active_filing_per_snapshot",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["gstin", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["arn"]),
            models.Index(fields=["provider_reference_id"]),
        ]


class ReturnFilingAttempt(BaseModel):
    class AttemptStatus(models.TextChoices):
        CREATED = "created", "Created"
        QUEUED = "queued", "Queued"
        IN_PROGRESS = "in_progress", "In Progress"
        SUBMITTED_TO_PROVIDER = "submitted_to_provider", "Submitted To Provider"
        AWAITING_STATUS = "awaiting_status", "Awaiting Status"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    return_filing = models.ForeignKey(ReturnFiling, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveIntegerField()
    status = models.CharField(max_length=32, choices=AttemptStatus.choices, default=AttemptStatus.CREATED)
    provider_request_id = models.CharField(max_length=128, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    request_payload_hash = models.CharField(max_length=128, blank=True)
    request_summary = models.JSONField(default=dict, blank=True)
    response_summary = models.JSONField(default=dict, blank=True)
    provider_status_raw = models.JSONField(default=dict, blank=True)
    failure_code = models.CharField(max_length=64, blank=True)
    failure_message = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="filing_attempts_triggered",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "return_filing_attempts"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["return_filing", "attempt_number"],
                name="unique_attempt_number_per_filing",
            ),
        ]
        indexes = [
            models.Index(fields=["return_filing", "attempt_number"]),
            models.Index(fields=["status"]),
            models.Index(fields=["provider_request_id"]),
            models.Index(fields=["started_at"]),
            models.Index(fields=["completed_at"]),
        ]


class WhiteBooksAuthSession(BaseModel):
    class SessionStatus(models.TextChoices):
        CREATED = "created", "Created"
        OTP_REQUESTED = "otp_requested", "OTP Requested"
        AUTH_TOKEN_RECEIVED = "auth_token_received", "Auth Token Received"
        SESSION_ACTIVE = "session_active", "Session Active"
        FAILED = "failed", "Failed"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="whitebooks_auth_sessions")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="whitebooks_auth_sessions")
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="whitebooks_auth_sessions", null=True, blank=True)
    provider = models.CharField(max_length=32, choices=ReturnFiling.Provider.choices, default=ReturnFiling.Provider.WHITEBOOKS)
    email = models.EmailField()
    txn = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=32, choices=SessionStatus.choices, default=SessionStatus.CREATED)
    otp_request_payload = models.JSONField(default=dict, blank=True)
    auth_token_payload = models.JSONField(default=dict, blank=True)
    session_metadata = models.JSONField(default=dict, blank=True)
    error_summary = models.JSONField(default=dict, blank=True)
    response_contract_confirmed = models.BooleanField(default=False)
    last_requested_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="whitebooks_auth_sessions_initiated",
        null=True,
        blank=True,
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="whitebooks_auth_sessions_verified",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "whitebooks_auth_sessions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["gstin", "status"]),
            models.Index(fields=["provider", "status"]),
            models.Index(fields=["email"]),
            models.Index(fields=["txn"]),
        ]


# Provider-neutral alias for the existing auth-session model.
ProviderAuthSession = WhiteBooksAuthSession


class ReturnFilingOffset(BaseModel):
    class OffsetStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        READY = "ready", "Ready"
        APPLIED = "applied", "Applied"
        FAILED = "failed", "Failed"
        SUPERSEDED = "superseded", "Superseded"

    return_filing = models.ForeignKey(ReturnFiling, on_delete=models.CASCADE, related_name="offset_profiles")
    filing_attempt = models.ForeignKey(
        ReturnFilingAttempt,
        on_delete=models.SET_NULL,
        related_name="offset_profiles",
        null=True,
        blank=True,
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=32, choices=OffsetStatus.choices, default=OffsetStatus.DRAFT)
    provider_payload = models.JSONField(default=dict, blank=True)
    liability_snapshot = models.JSONField(default=dict, blank=True)
    ledger_snapshot = models.JSONField(default=dict, blank=True)
    allocation_summary = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="filing_offsets_confirmed",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "return_filing_offsets"
        ordering = ["-version", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["return_filing", "version"],
                condition=models.Q(is_active=True),
                name="unique_active_offset_version_per_filing",
            ),
        ]
        indexes = [
            models.Index(fields=["return_filing", "status"]),
            models.Index(fields=["filing_attempt", "status"]),
            models.Index(fields=["status", "confirmed_at"]),
        ]


class ReturnFilingOffsetLine(BaseModel):
    class LedgerType(models.TextChoices):
        LIABILITY = "liability", "Liability"
        CREDIT = "credit", "Credit"
        CASH = "cash", "Cash"

    class TaxHead(models.TextChoices):
        IGST = "igst", "IGST"
        CGST = "cgst", "CGST"
        SGST = "sgst", "SGST"
        CESS = "cess", "CESS"
        INTEREST = "interest", "Interest"
        LATE_FEE = "late_fee", "Late Fee"

    offset_profile = models.ForeignKey(ReturnFilingOffset, on_delete=models.CASCADE, related_name="lines")
    line_number = models.PositiveIntegerField(default=1)
    source_ledger_type = models.CharField(max_length=32, choices=LedgerType.choices, default=LedgerType.LIABILITY)
    source_ledger_id = models.CharField(max_length=128, blank=True)
    liability_ledger_id = models.CharField(max_length=128, blank=True)
    tax_head = models.CharField(max_length=32, choices=TaxHead.choices)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "return_filing_offset_lines"
        ordering = ["line_number", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["offset_profile", "line_number"],
                condition=models.Q(is_active=True),
                name="unique_active_offset_line_number_per_profile",
            ),
        ]
        indexes = [
            models.Index(fields=["offset_profile", "tax_head"]),
            models.Index(fields=["source_ledger_type", "tax_head"]),
            models.Index(fields=["source_ledger_id"]),
            models.Index(fields=["liability_ledger_id"]),
        ]


class ProviderRolloutPolicy(BaseModel):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="provider_rollout_policies")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="provider_rollout_policies", null=True, blank=True)
    gstin = models.ForeignKey(GSTIN, on_delete=models.CASCADE, related_name="provider_rollout_policies", null=True, blank=True)
    provider = models.CharField(max_length=32, choices=ReturnFiling.Provider.choices, default=ReturnFiling.Provider.WHITEBOOKS)
    return_type = models.CharField(max_length=32, choices=ReturnPreparation.ReturnType.choices, blank=True)
    enable_live_submission = models.BooleanField(default=False)
    enable_live_status_sync = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    effective_from = models.DateTimeField(null=True, blank=True)
    effective_to = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "provider_rollout_policies"
        ordering = ["workspace_id", "provider", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "client", "gstin", "provider", "return_type"],
                condition=models.Q(is_active=True),
                name="unique_active_provider_rollout_policy_scope",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "provider", "is_active"]),
            models.Index(fields=["client", "provider", "is_active"]),
            models.Index(fields=["gstin", "provider", "is_active"]),
            models.Index(fields=["provider", "return_type", "is_active"]),
            models.Index(fields=["effective_from", "effective_to"]),
        ]


class ReturnFilingIncidentNote(BaseModel):
    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"

    return_filing = models.ForeignKey(ReturnFiling, on_delete=models.CASCADE, related_name="incident_notes")
    title = models.CharField(max_length=160)
    note = models.TextField()
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.WARNING)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    alert_code = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="filing_incident_notes_resolved",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "return_filing_incident_notes"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["return_filing", "status", "severity"]),
            models.Index(fields=["alert_code"]),
            models.Index(fields=["resolved_at"]),
        ]


class OperationalAlertRoutingRule(BaseModel):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="operational_alert_routing_rules")
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="operational_alert_routing_rules", null=True, blank=True)
    gstin = models.ForeignKey(GSTIN, on_delete=models.CASCADE, related_name="operational_alert_routing_rules", null=True, blank=True)
    provider = models.CharField(max_length=32, choices=ReturnFiling.Provider.choices, default=ReturnFiling.Provider.WHITEBOOKS)
    return_type = models.CharField(max_length=32, choices=ReturnPreparation.ReturnType.choices, blank=True)
    alert_code = models.CharField(max_length=64, blank=True)
    minimum_severity = models.CharField(
        max_length=16,
        choices=ReturnFilingIncidentNote.Severity.choices,
        default=ReturnFilingIncidentNote.Severity.WARNING,
    )
    target_role = models.CharField(max_length=32, choices=WorkspaceRole.choices)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "operational_alert_routing_rules"
        ordering = ["workspace_id", "provider", "target_role", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "client", "gstin", "provider", "return_type", "alert_code", "target_role"],
                condition=models.Q(is_active=True),
                name="unique_active_operational_alert_rule_scope",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "provider", "is_active"]),
            models.Index(fields=["client", "provider", "is_active"]),
            models.Index(fields=["gstin", "provider", "is_active"]),
            models.Index(fields=["provider", "return_type", "is_active"]),
            models.Index(fields=["alert_code", "minimum_severity"]),
            models.Index(fields=["target_role", "is_active"]),
        ]


class ReturnFilingEvent(models.Model):
    return_filing = models.ForeignKey(ReturnFiling, on_delete=models.CASCADE, related_name="events")
    filing_attempt = models.ForeignKey(
        ReturnFilingAttempt,
        on_delete=models.SET_NULL,
        related_name="events",
        null=True,
        blank=True,
    )
    event_type = models.CharField(max_length=64)
    old_status = models.CharField(max_length=32, blank=True)
    new_status = models.CharField(max_length=32, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="filing_events",
        null=True,
        blank=True,
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "return_filing_events"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["return_filing", "created_at"]),
            models.Index(fields=["filing_attempt", "created_at"]),
            models.Index(fields=["event_type", "created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} ({self.return_filing_id})"
