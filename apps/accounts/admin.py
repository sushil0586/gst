from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import Group
from django.contrib.auth.admin import GroupAdmin

from apps.accounts.models import WorkspaceMembership
from apps.common.admin import BaseTenantAdminMixin

User = get_user_model()


class WorkspaceMembershipInline(admin.TabularInline):
    model = WorkspaceMembership
    fk_name = "user"
    extra = 0
    autocomplete_fields = ("workspace",)
    fields = ("workspace", "role", "is_active", "created_at")
    readonly_fields = ("created_at",)
    show_change_link = True


@admin.register(WorkspaceMembership)
class WorkspaceMembershipAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("user", "workspace", "role", "is_active", "created_at")
    list_filter = ("role", "is_active", "workspace")
    search_fields = ("user__username", "user__email", "workspace__name", "workspace__code")
    ordering = ("workspace__name", "user__username")
    autocomplete_fields = ("user", "workspace")
    fieldsets = (
        (None, {"fields": ("user", "workspace", "role", "is_active")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )


try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    inlines = [WorkspaceMembershipInline]
    list_display = ("username", "email", "first_name", "last_name", "is_staff", "is_active")
    search_fields = ("username", "first_name", "last_name", "email")
    ordering = ("username",)


try:
    admin.site.unregister(Group)
except admin.sites.NotRegistered:
    pass

admin.site.register(Group, GroupAdmin)
