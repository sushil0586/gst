from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from apps.clients.models import Client, ClientContact
from apps.common.admin import BaseTenantAdminMixin
from apps.gstins.models import GSTIN


class GSTINInline(admin.TabularInline):
    model = GSTIN
    extra = 0
    fields = ("gstin", "registration_type", "state_code", "is_active")
    show_change_link = True


class ClientContactInline(admin.TabularInline):
    model = ClientContact
    extra = 0
    fields = (
        "name",
        "designation",
        "mobile_number",
        "alternate_mobile_number",
        "email",
        "preferred_contact_mode",
        "is_primary",
        "is_active",
    )
    show_change_link = True


@admin.register(ClientContact)
class ClientContactAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("name", "client", "designation", "mobile_number", "email", "preferred_contact_mode", "is_primary", "is_active")
    list_filter = ("client__workspace", "preferred_contact_mode", "is_primary", "is_active")
    search_fields = ("name", "designation", "mobile_number", "alternate_mobile_number", "email", "client__legal_name")
    ordering = ("client__workspace__name", "client__legal_name", "name")
    autocomplete_fields = ("client",)
    readonly_fields = BaseTenantAdminMixin.readonly_fields


@admin.register(Client)
class ClientAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("legal_name", "client_code", "workspace", "pan", "gstin_count", "period_count", "is_active")
    list_filter = ("workspace", "is_active")
    search_fields = ("legal_name", "trade_name", "client_code", "pan", "email", "workspace__name")
    ordering = ("workspace__name", "legal_name")
    autocomplete_fields = ("workspace",)
    inlines = [GSTINInline, ClientContactInline]
    fieldsets = (
        ("Client", {"fields": ("workspace", "legal_name", "trade_name", "client_code", "pan", "email", "is_active")}),
        (
            "Related",
            {
                "fields": ("gstin_count", "compliance_periods_link"),
            },
        ),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("gstin_count", "compliance_periods_link")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("workspace").prefetch_related("gstins__compliance_periods")

    @admin.display(description="GSTINs")
    def gstin_count(self, obj):
        return obj.gstins.count()

    @admin.display(description="Compliance periods")
    def period_count(self, obj):
        return sum(gstin.compliance_periods.count() for gstin in obj.gstins.all())

    @admin.display(description="Compliance periods")
    def compliance_periods_link(self, obj):
        url = (
            reverse("admin:compliance_periods_complianceperiod_changelist")
            + f"?gstin__client__id__exact={obj.id}"
        )
        return format_html('<a href="{}">View compliance periods for this client</a>', url)
