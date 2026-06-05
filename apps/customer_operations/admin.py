from django.contrib import admin

from apps.common.admin import BaseTenantAdminMixin
from apps.customer_operations.models import OperationalFollowUp


@admin.register(OperationalFollowUp)
class OperationalFollowUpAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "title",
        "client",
        "gstin",
        "compliance_period",
        "pending_with",
        "status",
        "priority",
        "assigned_to",
        "due_at",
        "is_active",
    )
    list_filter = ("workspace", "status", "pending_with", "priority", "follow_up_type", "is_active")
    search_fields = (
        "title",
        "reason",
        "client__legal_name",
        "gstin__gstin",
        "contact_name_snapshot",
        "mobile_number_snapshot",
    )
    autocomplete_fields = (
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "return_preparation",
        "return_filing",
        "notice",
        "contact",
        "assigned_to",
        "completed_by",
    )
    readonly_fields = BaseTenantAdminMixin.readonly_fields
    fieldsets = (
        (
            "Scope",
            {
                "fields": (
                    "workspace",
                    "client",
                    "gstin",
                    "compliance_period",
                    "return_preparation",
                    "return_filing",
                    "notice",
                )
            },
        ),
        (
            "Follow-up",
            {
                "fields": (
                    "title",
                    "reason",
                    "follow_up_type",
                    "pending_with",
                    "status",
                    "priority",
                    "assigned_to",
                    "due_at",
                    "next_action",
                    "notes",
                    "closed_reason",
                )
            },
        ),
        (
            "Customer Contact",
            {
                "fields": (
                    "contact",
                    "contact_name_snapshot",
                    "mobile_number_snapshot",
                    "email_snapshot",
                    "last_contacted_at",
                )
            },
        ),
        ("Closure", {"fields": ("completed_at", "completed_by", "escalated_at", "is_active")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )
