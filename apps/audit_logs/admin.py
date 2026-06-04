from django.contrib import admin

from apps.audit_logs.models import AuditLog
from apps.common.admin import AuditReadonlyAdminMixin, pretty_json


@admin.register(AuditLog)
class AuditLogAdmin(AuditReadonlyAdminMixin, admin.ModelAdmin):
    list_display = ("created_at", "actor", "action", "entity_type", "entity_id", "client_id_ref", "gstin_id_ref")
    list_filter = ("action", "entity_type", "created_at")
    search_fields = ("action", "entity_type", "entity_id", "actor__username", "actor__email")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = ("actor",)
    readonly_fields = AuditReadonlyAdminMixin.readonly_fields + (
        "metadata_pretty",
        "before_state_pretty",
        "after_state_pretty",
    )
    fieldsets = (
        (
            "Audit log",
            {
                "fields": (
                    "actor",
                    "action",
                    "entity_type",
                    "entity_id",
                    "workspace_id_ref",
                    "client_id_ref",
                    "gstin_id_ref",
                    "compliance_period_id_ref",
                )
            },
        ),
        ("Metadata", {"fields": ("metadata", "metadata_pretty"), "classes": ("collapse",)}),
        ("Before", {"fields": ("before_state", "before_state_pretty"), "classes": ("collapse",)}),
        ("After", {"fields": ("after_state", "after_state_pretty"), "classes": ("collapse",)}),
        ("Audit", {"fields": AuditReadonlyAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("actor")

    @admin.display(description="Metadata preview")
    def metadata_pretty(self, obj):
        return pretty_json(obj.metadata)

    @admin.display(description="Before state preview")
    def before_state_pretty(self, obj):
        return pretty_json(obj.before_state)

    @admin.display(description="After state preview")
    def after_state_pretty(self, obj):
        return pretty_json(obj.after_state)
