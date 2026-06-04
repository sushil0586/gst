from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin, pretty_json
from apps.returns.models import ReturnPreparation


@admin.register(ReturnPreparation)
class ReturnPreparationAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "return_type",
        "status",
        "compliance_period",
        "prepared_by",
        "approved_by",
        "filed_by",
        "filed_at",
        "arn",
        "created_at",
    )
    list_filter = ("return_type", "status", "compliance_period__gstin__client__workspace")
    search_fields = ("compliance_period__period", "compliance_period__gstin__gstin", "arn")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = ("compliance_period", "prepared_by", "approved_by", "filed_by")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "status",
        "summary_snapshot",
        "summary_snapshot_pretty",
        "prepared_by",
        "approved_by",
        "filed_by",
        "filed_at",
    )
    fieldsets = (
        ("Return", {"fields": ("compliance_period", "return_type", "status", "arn")}),
        ("Users", {"fields": ("prepared_by", "approved_by", "filed_by", "filed_at")}),
        ("Summary", {"fields": ("summary_snapshot", "summary_snapshot_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "compliance_period",
            "compliance_period__gstin",
            "prepared_by",
            "approved_by",
            "filed_by",
        )

    @admin.display(description="Summary preview")
    def summary_snapshot_pretty(self, obj):
        return pretty_json(obj.summary_snapshot)
