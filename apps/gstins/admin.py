from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN, GSTINTaxpayerProfile


class CompliancePeriodInline(admin.TabularInline):
    model = CompliancePeriod
    extra = 0
    fields = ("period", "return_type", "status", "due_date", "is_locked")
    show_change_link = True


class GSTINTaxpayerProfileInline(admin.StackedInline):
    model = GSTINTaxpayerProfile
    extra = 0
    can_delete = False
    fields = (
        "legal_name",
        "trade_name",
        "registration_type",
        "status",
        "constitution",
        "registration_date",
        "last_updated_date",
        "state_jurisdiction_code",
        "state_jurisdiction_name",
        "center_jurisdiction_code",
        "center_jurisdiction_name",
        "einvoice_status",
        "nature_of_business",
        "principal_address",
        "additional_addresses",
        "raw_payload",
    )
    readonly_fields = fields


@admin.register(GSTIN)
class GSTINAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("gstin", "client", "registration_type", "state_code", "whitebooks_gst_username", "period_count", "is_active")
    list_filter = ("registration_type", "state_code", "is_active", "client__workspace")
    search_fields = ("gstin", "client__legal_name", "client__client_code", "client__pan")
    ordering = ("gstin",)
    autocomplete_fields = ("client",)
    inlines = [GSTINTaxpayerProfileInline, CompliancePeriodInline]
    fieldsets = (
        (None, {"fields": ("client", "gstin", "registration_type", "state_code", "whitebooks_gst_username", "is_active")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("client", "client__workspace").prefetch_related("compliance_periods")

    @admin.display(description="Periods")
    def period_count(self, obj):
        return obj.compliance_periods.count()


@admin.register(GSTINTaxpayerProfile)
class GSTINTaxpayerProfileAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("gstin", "legal_name", "registration_type", "status", "einvoice_status", "is_active")
    list_filter = ("registration_type", "status", "gstin__client__workspace")
    search_fields = ("gstin__gstin", "legal_name", "trade_name", "gstin__client__legal_name")
    autocomplete_fields = ("gstin",)
    readonly_fields = (
        "registration_date",
        "last_updated_date",
        "state_jurisdiction_code",
        "state_jurisdiction_name",
        "center_jurisdiction_code",
        "center_jurisdiction_name",
        "principal_address",
        "additional_addresses",
        "nature_of_business",
        "raw_payload",
    )
