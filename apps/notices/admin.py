from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin
from apps.notices.models import Notice, NoticeSyncEvent


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


@admin.register(NoticeSyncEvent)
class NoticeSyncEventAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("reference_number", "event_type", "status", "provider", "gstin", "initiated_by", "created_at")
    list_filter = ("event_type", "status", "provider", "gstin__client__workspace")
    search_fields = ("reference_number", "provider_reference_id", "message", "error_message", "gstin__gstin")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = ("gstin", "notice", "initiated_by")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("provider_payload", "counters")
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "gstin",
                    "notice",
                    "provider",
                    "event_type",
                    "status",
                    "reference_number",
                    "provider_reference_id",
                    "message",
                    "error_message",
                    "initiated_by",
                    "is_active",
                )
            },
        ),
        ("Payload", {"fields": ("counters", "provider_payload"), "classes": ("collapse",)}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("gstin", "gstin__client", "notice", "initiated_by")
