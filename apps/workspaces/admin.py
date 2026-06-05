from django.contrib import admin

from apps.accounts.models import WorkspaceMembership
from apps.clients.models import Client
from apps.common.admin import BaseTenantAdminMixin
from apps.imports.models import ImportTemplate
from apps.workspaces.models import Workspace


class ClientInline(admin.TabularInline):
    model = Client
    extra = 0
    fields = ("legal_name", "client_code", "pan", "email", "is_active")
    show_change_link = True


class WorkspaceMembershipInline(admin.TabularInline):
    model = WorkspaceMembership
    extra = 0
    autocomplete_fields = ("user",)
    fields = ("user", "role", "is_active", "created_at")
    readonly_fields = ("created_at",)
    show_change_link = True


class ImportTemplateInline(admin.TabularInline):
    model = ImportTemplate
    extra = 0
    fields = ("name", "import_type", "source_type", "is_default", "is_active")
    show_change_link = True


@admin.register(Workspace)
class WorkspaceAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("name", "office_label", "code", "organization", "city", "timezone", "client_count", "member_count", "is_active")
    list_filter = ("organization", "timezone", "state", "is_active")
    search_fields = ("name", "office_label", "code", "organization__name", "city", "contact_email", "contact_phone")
    ordering = ("organization__name", "name")
    autocomplete_fields = ("organization",)
    inlines = [ClientInline, WorkspaceMembershipInline, ImportTemplateInline]
    fieldsets = (
        (None, {"fields": ("organization", "name", "office_label", "code", "timezone", "is_active")}),
        ("Office details", {"fields": ("address_line_1", "address_line_2", "city", "state", "postal_code", "contact_email", "contact_phone")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("organization").prefetch_related("clients", "memberships")

    @admin.display(description="Clients")
    def client_count(self, obj):
        return obj.clients.count()

    @admin.display(description="Members")
    def member_count(self, obj):
        return obj.memberships.count()
