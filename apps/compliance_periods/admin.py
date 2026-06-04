from django.contrib import admin

from apps.approvals.models import ApprovalRequest
from apps.common.admin import BaseTenantAdminMixin, ReadOnlyTabularInline
from apps.compliance_periods.models import CompliancePeriod
from apps.imports.models import ImportBatch
from apps.reconciliation.models import ReconciliationRun
from apps.returns.models import ReturnPreparation


class ImportBatchInline(ReadOnlyTabularInline):
    model = ImportBatch
    fields = ("file_name", "import_type", "source_type", "status", "valid_rows", "invalid_rows", "processed_at")
    readonly_fields = fields


class ReconciliationRunInline(ReadOnlyTabularInline):
    model = ReconciliationRun
    fields = ("run_type", "status", "matched_count", "mismatch_count", "total_itc_at_risk", "processed_at")
    readonly_fields = fields


class ReturnPreparationInline(ReadOnlyTabularInline):
    model = ReturnPreparation
    fields = ("return_type", "status", "prepared_by", "approved_by", "filed_by", "filed_at", "arn")
    readonly_fields = fields


class ApprovalRequestInline(ReadOnlyTabularInline):
    model = ApprovalRequest
    fields = ("entity_type", "status", "requested_to", "resolved_by", "resolved_at")
    readonly_fields = fields


@admin.register(CompliancePeriod)
class CompliancePeriodAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("period", "gstin", "return_type", "status", "due_date", "is_locked", "locked_at", "locked_by")
    list_filter = ("status", "return_type", "is_locked", "gstin__client__workspace")
    search_fields = ("period", "gstin__gstin", "gstin__client__legal_name")
    ordering = ("-period",)
    date_hierarchy = "due_date"
    autocomplete_fields = ("gstin",)
    inlines = [ImportBatchInline, ReconciliationRunInline, ReturnPreparationInline, ApprovalRequestInline]
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("locked_at", "locked_by")
    fieldsets = (
        ("Period", {"fields": ("gstin", "period", "return_type", "status", "due_date", "is_locked")}),
        ("Locking", {"fields": ("locked_at", "locked_by")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("gstin", "gstin__client", "locked_by")
