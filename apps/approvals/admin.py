from django.contrib import admin, messages

from apps.approvals.models import ApprovalRequest
from apps.approvals.services.approvals import (
    approve_approval_request,
    cancel_approval_request,
    reject_approval_request,
)
from apps.common.admin import BaseTenantAdminMixin


@admin.action(description="Approve selected pending approval requests")
def approve_requests(modeladmin, request, queryset):
    updated = 0
    for instance in queryset:
        try:
            approve_approval_request(instance=instance, user=request.user)
            updated += 1
        except Exception as exc:
            modeladmin.message_user(request, f"Could not approve {instance.id}: {exc}", level=messages.WARNING)
    if updated:
        modeladmin.message_user(request, f"Approved {updated} request(s).", level=messages.SUCCESS)


@admin.action(description="Reject selected pending approval requests")
def reject_requests(modeladmin, request, queryset):
    updated = 0
    for instance in queryset:
        try:
            reject_approval_request(instance=instance, user=request.user)
            updated += 1
        except Exception as exc:
            modeladmin.message_user(request, f"Could not reject {instance.id}: {exc}", level=messages.WARNING)
    if updated:
        modeladmin.message_user(request, f"Rejected {updated} request(s).", level=messages.SUCCESS)


@admin.action(description="Cancel selected pending approval requests")
def cancel_requests(modeladmin, request, queryset):
    updated = 0
    for instance in queryset:
        try:
            cancel_approval_request(instance=instance, user=request.user)
            updated += 1
        except Exception as exc:
            modeladmin.message_user(request, f"Could not cancel {instance.id}: {exc}", level=messages.WARNING)
    if updated:
        modeladmin.message_user(request, f"Cancelled {updated} request(s).", level=messages.SUCCESS)


@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "entity_type",
        "entity_id",
        "status",
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "requested_to",
        "resolved_by",
        "resolved_at",
    )
    list_filter = ("status", "entity_type", "workspace", "client", "compliance_period")
    search_fields = ("entity_id", "comments", "resolution_comments", "client__legal_name", "gstin__gstin")
    ordering = ("-created_at",)
    date_hierarchy = "created_at"
    autocomplete_fields = (
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "requested_to",
        "resolved_by",
    )
    actions = [approve_requests, reject_requests, cancel_requests]
    fieldsets = (
        (
            "Approval request",
            {
                "fields": (
                    "workspace",
                    "client",
                    "gstin",
                    "compliance_period",
                    "entity_type",
                    "entity_id",
                    "status",
                )
            },
        ),
        ("People", {"fields": ("requested_to", "resolved_by", "resolved_at")}),
        ("Comments", {"fields": ("comments", "resolution_comments")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "workspace", "client", "gstin", "compliance_period", "requested_to", "resolved_by"
        )
