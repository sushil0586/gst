import json

from django.contrib import admin
from django.utils.html import format_html


AUDIT_READONLY_FIELDS = ("id", "created_at", "updated_at", "created_by", "updated_by")


class BaseTenantAdminMixin:
    list_per_page = 25
    readonly_fields = AUDIT_READONLY_FIELDS

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        if hasattr(queryset, "select_related"):
            return queryset
        return queryset


class ReadOnlyTabularInline(admin.TabularInline):
    extra = 0
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class AuditReadonlyAdminMixin(BaseTenantAdminMixin):
    actions = None

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


def pretty_json(value):
    if not value:
        return "-"
    return format_html(
        "<pre style='white-space: pre-wrap; max-width: 72rem; overflow-x: auto; margin: 0;'>{}</pre>",
        json.dumps(value, indent=2, sort_keys=True, default=str),
    )
