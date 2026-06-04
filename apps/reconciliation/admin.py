from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin, ReadOnlyTabularInline, pretty_json
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun


class ReconciliationItemInline(ReadOnlyTabularInline):
    model = ReconciliationItem
    fields = (
        "books_transaction",
        "portal_transaction",
        "match_status",
        "mismatch_reason",
        "tax_difference",
        "action_status",
        "assigned_to",
    )
    readonly_fields = fields


@admin.register(ReconciliationRun)
class ReconciliationRunAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "id",
        "run_type",
        "status",
        "workspace",
        "client",
        "compliance_period",
        "matched_count",
        "mismatch_count",
        "partial_match_count",
        "missing_in_books_count",
        "missing_in_portal_count",
        "duplicate_count",
        "total_itc_at_risk",
        "processed_at",
    )
    list_filter = ("status", "run_type", "workspace", "client")
    search_fields = ("id", "client__legal_name", "gstin__gstin", "compliance_period__period")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = ("workspace", "client", "gstin", "compliance_period")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "status",
        "matched_count",
        "mismatch_count",
        "partial_match_count",
        "missing_in_books_count",
        "missing_in_portal_count",
        "duplicate_count",
        "total_tax_difference",
        "total_itc_at_risk",
        "processed_at",
        "error_summary",
        "error_summary_pretty",
    )
    inlines = [ReconciliationItemInline]
    fieldsets = (
        ("Context", {"fields": ("workspace", "client", "gstin", "compliance_period", "run_type", "status", "notes")}),
        (
            "Summary",
            {
                "fields": (
                    "matched_count",
                    "mismatch_count",
                    "partial_match_count",
                    "missing_in_books_count",
                    "missing_in_portal_count",
                    "duplicate_count",
                    "total_tax_difference",
                    "total_itc_at_risk",
                    "processed_at",
                )
            },
        ),
        ("Processing", {"fields": ("error_summary", "error_summary_pretty"), "classes": ("collapse",)}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("workspace", "client", "gstin", "compliance_period")

    @admin.display(description="Error summary preview")
    def error_summary_pretty(self, obj):
        return pretty_json(obj.error_summary)


@admin.register(ReconciliationItem)
class ReconciliationItemAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "reconciliation_run",
        "match_status",
        "mismatch_reason",
        "action_status",
        "assigned_to",
        "counterparty_name",
        "counterparty_gstin",
        "books_reference",
        "portal_reference",
        "tax_difference",
    )
    list_filter = ("match_status", "action_status", "mismatch_reason", "assigned_to")
    search_fields = (
        "books_transaction__reference_number",
        "portal_transaction__reference_number",
        "books_transaction__counterparty_gstin",
        "portal_transaction__counterparty_gstin",
        "books_transaction__counterparty_name",
        "portal_transaction__counterparty_name",
    )
    ordering = ("-created_at",)
    autocomplete_fields = (
        "reconciliation_run",
        "books_transaction",
        "portal_transaction",
        "assigned_to",
    )
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "match_status",
        "mismatch_reason",
        "tax_difference",
        "taxable_difference",
        "total_difference",
        "metadata",
        "metadata_pretty",
        "counterparty_name",
        "counterparty_gstin",
    )
    fieldsets = (
        (
            "Reconciliation item",
            {
                "fields": (
                    "reconciliation_run",
                    "books_transaction",
                    "portal_transaction",
                    "match_status",
                    "mismatch_reason",
                    "action_status",
                    "assigned_to",
                    "remarks",
                )
            },
        ),
        (
            "Context",
            {"fields": ("counterparty_name", "counterparty_gstin", "tax_difference", "taxable_difference", "total_difference")},
        ),
        ("Metadata", {"fields": ("metadata", "metadata_pretty"), "classes": ("collapse",)}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "reconciliation_run",
            "assigned_to",
            "books_transaction",
            "portal_transaction",
        )

    @admin.display(description="Vendor")
    def counterparty_name(self, obj):
        transaction = obj.books_transaction or obj.portal_transaction
        return transaction.counterparty_name if transaction else "-"

    @admin.display(description="GSTIN")
    def counterparty_gstin(self, obj):
        transaction = obj.books_transaction or obj.portal_transaction
        return transaction.counterparty_gstin if transaction else "-"

    @admin.display(description="Books invoice")
    def books_reference(self, obj):
        return getattr(obj.books_transaction, "reference_number", "-")

    @admin.display(description="2B invoice")
    def portal_reference(self, obj):
        return getattr(obj.portal_transaction, "reference_number", "-")

    @admin.display(description="Metadata preview")
    def metadata_pretty(self, obj):
        return pretty_json(obj.metadata)
