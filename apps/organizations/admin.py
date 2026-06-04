from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace


class WorkspaceInline(admin.TabularInline):
    model = Workspace
    extra = 0
    fields = ("name", "code", "timezone", "is_active")
    show_change_link = True


@admin.register(Organization)
class OrganizationAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("name", "code", "workspace_count", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
    ordering = ("name",)
    inlines = [WorkspaceInline]
    fieldsets = (
        (None, {"fields": ("name", "code", "is_active")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("workspaces")

    @admin.display(ordering="name", description="Workspaces")
    def workspace_count(self, obj):
        return obj.workspaces.count()
