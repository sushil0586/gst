from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.workspaces.models import Workspace


class ImportTemplate(BaseModel):
    class ImportType(models.TextChoices):
        SALES = "sales", "Sales"
        PURCHASE = "purchase", "Purchase"
        CREDIT_NOTE = "credit_note", "Credit Note"
        DEBIT_NOTE = "debit_note", "Debit Note"
        ADVANCE_RECEIVED = "advance_received", "Advance Received"
        ADVANCE_ADJUSTED = "advance_adjusted", "Advance Adjusted"
        GSTR_2B = "gstr_2b", "GSTR-2B"

    class SourceType(models.TextChoices):
        EXCEL = "excel", "Excel"
        CSV = "csv", "CSV"
        PROVIDER = "provider", "Provider"

    name = models.CharField(max_length=255)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="import_templates")
    import_type = models.CharField(max_length=32, choices=ImportType.choices)
    source_type = models.CharField(max_length=16, choices=SourceType.choices)
    column_mapping = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "import_templates"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name", "import_type", "source_type"],
                name="unique_import_template_per_workspace_type",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "import_type", "source_type"]),
            models.Index(fields=["workspace", "is_default"]),
        ]


class ImportBatch(BaseModel):
    class BatchStatus(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        VALIDATED = "validated", "Validated"
        PROCESSED = "processed", "Processed"
        CORRECTED = "corrected", "Corrected"
        SUPERSEDED = "superseded", "Superseded"
        DISCARDED = "discarded", "Discarded"
        LOCKED = "locked", "Locked"
        FAILED = "failed", "Failed"

    class ImportType(models.TextChoices):
        SALES = "sales", "Sales"
        PURCHASE = "purchase", "Purchase"
        CREDIT_NOTE = "credit_note", "Credit Note"
        DEBIT_NOTE = "debit_note", "Debit Note"
        ADVANCE_RECEIVED = "advance_received", "Advance Received"
        ADVANCE_ADJUSTED = "advance_adjusted", "Advance Adjusted"
        GSTR_2B = "gstr_2b", "GSTR-2B"

    class SourceType(models.TextChoices):
        EXCEL = "excel", "Excel"
        CSV = "csv", "CSV"
        PROVIDER = "provider", "Provider"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="import_batches", null=True, blank=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="import_batches", null=True, blank=True)
    gstin = models.ForeignKey(GSTIN, on_delete=models.SET_NULL, related_name="import_batches", null=True, blank=True)
    import_template = models.ForeignKey(
        "imports.ImportTemplate",
        on_delete=models.SET_NULL,
        related_name="import_batches",
        null=True,
        blank=True,
    )
    compliance_period = models.ForeignKey(CompliancePeriod, on_delete=models.CASCADE, related_name="import_batches")
    import_type = models.CharField(max_length=32, choices=ImportType.choices, default=ImportType.SALES)
    source_type = models.CharField(max_length=16, choices=SourceType.choices)
    file = models.FileField(upload_to="import_batches/%Y/%m/%d/", null=True, blank=True)
    file_name = models.CharField(max_length=255)
    source_metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=32, choices=BatchStatus.choices, default=BatchStatus.UPLOADED)
    total_rows = models.PositiveIntegerField(default=0)
    processed_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    error_summary = models.JSONField(default=dict, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    celery_task_id = models.CharField(max_length=255, blank=True)
    superseded_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="superseded_batches",
        null=True,
        blank=True,
    )
    supersedes_batch = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="replacement_batches",
        null=True,
        blank=True,
    )
    corrected_at = models.DateTimeField(null=True, blank=True)
    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="import_batches_corrected",
        null=True,
        blank=True,
    )
    invalidation_reason = models.CharField(max_length=128, blank=True)

    class Meta:
        db_table = "import_batches"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "status"]),
            models.Index(fields=["client", "status"]),
            models.Index(fields=["compliance_period", "status"]),
            models.Index(fields=["import_type", "source_type"]),
        ]


class ImportRowError(BaseModel):
    class Severity(models.TextChoices):
        ERROR = "error", "Error"
        WARNING = "warning", "Warning"

    import_batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name="row_errors")
    row_number = models.PositiveIntegerField()
    field_name = models.CharField(max_length=128)
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.ERROR)
    error_code = models.CharField(max_length=64, blank=True)
    error_message = models.TextField()
    raw_row = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "import_row_errors"
        ordering = ["row_number"]
        indexes = [
            models.Index(fields=["import_batch", "row_number"]),
            models.Index(fields=["import_batch", "severity"]),
        ]
