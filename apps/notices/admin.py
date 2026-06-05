from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin
from apps.notices.models import Notice


@admin.register(Notice)
class NoticeAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("reference_number", "title", "gstin", "status", "due_date", "assigned_to", "created_at")
    list_filter = ("status", "gstin__client__workspace", "assigned_to")
    search_fields = ("reference_number", "title", "description", "gstin__gstin")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = ("gstin", "assigned_to")
    fieldsets = (
        (None, {"fields": ("gstin", "reference_number", "title", "description", "status", "due_date", "assigned_to", "is_active")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("gstin", "gstin__client")
