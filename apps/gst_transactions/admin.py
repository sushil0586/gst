from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin, pretty_json
from apps.gst_transactions.models import GSTTransaction


@admin.register(GSTTransaction)
class GSTTransactionAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "reference_number",
        "transaction_type",
        "document_type",
        "transaction_date",
        "client",
        "gstin",
        "counterparty_gstin",
        "counterparty_name",
        "taxable_value",
        "tax_amount",
        "status",
    )
    list_filter = (
        "transaction_type",
        "document_type",
        "status",
        "reverse_charge",
        "workspace",
        "client",
        "gstin",
    )
    search_fields = ("reference_number", "counterparty_gstin", "counterparty_name", "place_of_supply")
    ordering = ("-transaction_date", "-created_at")
    date_hierarchy = "transaction_date"
    autocomplete_fields = ("workspace", "client", "gstin", "compliance_period", "import_batch")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("metadata_pretty",)
    fieldsets = (
        (
            "Transaction",
            {
                "fields": (
                    "workspace",
                    "client",
                    "gstin",
                    "compliance_period",
                    "import_batch",
                    "transaction_type",
                    "document_type",
                    "reference_number",
                    "transaction_date",
                    "status",
                )
            },
        ),
        (
            "Counterparty",
            {"fields": ("counterparty_gstin", "counterparty_name", "place_of_supply", "reverse_charge")},
        ),
        (
            "Amounts",
            {
                "fields": (
                    "taxable_value",
                    "cgst_amount",
                    "sgst_amount",
                    "igst_amount",
                    "cess_amount",
                    "tax_amount",
                    "total_amount",
                )
            },
        ),
        ("Metadata", {"fields": ("metadata", "metadata_pretty"), "classes": ("collapse",)}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "workspace", "client", "gstin", "compliance_period", "import_batch"
        )

    @admin.display(description="Metadata preview")
    def metadata_pretty(self, obj):
        return pretty_json(obj.metadata)
