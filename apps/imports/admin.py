from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin, ReadOnlyTabularInline, pretty_json
from apps.imports.models import ImportBatch, ImportRowError, ImportTemplate


class ImportTemplateInline(admin.TabularInline):
    model = ImportTemplate
    extra = 0
    fields = ("name", "import_type", "source_type", "is_default", "is_active")
    show_change_link = True


class ImportRowErrorInline(ReadOnlyTabularInline):
    model = ImportRowError
    fields = ("row_number", "field_name", "severity", "error_code", "error_message")
    readonly_fields = fields


@admin.register(ImportTemplate)
class ImportTemplateAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("name", "workspace", "import_type", "source_type", "is_default", "is_active")
    list_filter = ("workspace", "import_type", "source_type", "is_default", "is_active")
    search_fields = ("name", "workspace__name")
    ordering = ("workspace__name", "name")
    autocomplete_fields = ("workspace",)
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("column_mapping_pretty",)
    fieldsets = (
        (None, {"fields": ("workspace", "name", "import_type", "source_type", "is_default", "is_active")}),
        ("Mapping", {"fields": ("column_mapping", "column_mapping_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    @admin.display(description="Column mapping preview")
    def column_mapping_pretty(self, obj):
        return pretty_json(obj.column_mapping)


@admin.register(ImportBatch)
class ImportBatchAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "file_name",
        "import_type",
        "source_type",
        "status",
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "valid_rows",
        "invalid_rows",
        "processed_at",
    )
    list_filter = ("status", "import_type", "source_type", "workspace", "client")
    search_fields = ("file_name", "client__legal_name", "gstin__gstin", "celery_task_id")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = ("workspace", "client", "gstin", "compliance_period", "import_template")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "file_name",
        "status",
        "total_rows",
        "processed_rows",
        "valid_rows",
        "invalid_rows",
        "error_summary",
        "processed_at",
        "celery_task_id",
        "error_summary_pretty",
        "transaction_count",
    )
    inlines = [ImportRowErrorInline]
    fieldsets = (
        (
            "Import",
            {
                "fields": (
                    "workspace",
                    "client",
                    "gstin",
                    "compliance_period",
                    "import_template",
                    "import_type",
                    "source_type",
                    "file",
                    "file_name",
                    "status",
                )
            },
        ),
        (
            "Processing",
            {
                "fields": (
                    "total_rows",
                    "processed_rows",
                    "valid_rows",
                    "invalid_rows",
                    "transaction_count",
                    "processed_at",
                    "celery_task_id",
                )
            },
        ),
        ("Errors", {"fields": ("error_summary", "error_summary_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "workspace", "client", "gstin", "compliance_period", "import_template"
        ).prefetch_related("transactions", "row_errors")

    @admin.display(description="Transactions")
    def transaction_count(self, obj):
        return obj.transactions.count()

    @admin.display(description="Error summary preview")
    def error_summary_pretty(self, obj):
        return pretty_json(obj.error_summary)


@admin.register(ImportRowError)
class ImportRowErrorAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("import_batch", "row_number", "field_name", "severity", "error_code")
    list_filter = ("severity", "field_name", "import_batch__import_type")
    search_fields = ("import_batch__file_name", "field_name", "error_code", "error_message")
    ordering = ("import_batch", "row_number")
    autocomplete_fields = ("import_batch",)
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("raw_row_pretty",)
    fieldsets = (
        (None, {"fields": ("import_batch", "row_number", "field_name", "severity", "error_code", "error_message")}),
        ("Raw row", {"fields": ("raw_row", "raw_row_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    @admin.display(description="Raw row preview")
    def raw_row_pretty(self, obj):
        return pretty_json(obj.raw_row)
