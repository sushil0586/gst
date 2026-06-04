from django.contrib import admin

from apps.common.admin import AuditReadonlyAdminMixin, BaseTenantAdminMixin, pretty_json
from apps.filings.models import (
    OperationalAlertRoutingRule,
    ProviderAuthSession,
    ProviderRolloutPolicy,
    ReturnFiling,
    ReturnFilingAttempt,
    ReturnFilingEvent,
    ReturnFilingIncidentNote,
    ReturnFilingOffset,
    ReturnFilingOffsetLine,
)


class ReturnFilingAttemptInline(admin.TabularInline):
    model = ReturnFilingAttempt
    extra = 0
    show_change_link = True
    fields = ("attempt_number", "status", "provider_request_id", "failure_code", "started_at", "completed_at")
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class ReturnFilingOffsetInline(admin.TabularInline):
    model = ReturnFilingOffset
    extra = 0
    show_change_link = True
    fields = ("version", "status", "filing_attempt", "confirmed_at", "confirmed_by")
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ReturnFiling)
class ReturnFilingAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "return_type",
        "status",
        "provider",
        "compliance_period",
        "arn",
        "provider_reference_id",
        "submitted_at",
        "filed_at",
        "created_at",
    )
    list_filter = ("return_type", "status", "provider", "compliance_period__gstin__client__workspace")
    search_fields = (
        "compliance_period__period",
        "compliance_period__gstin__gstin",
        "arn",
        "provider_reference_id",
    )
    ordering = ("-created_at",)
    autocomplete_fields = (
        "workspace",
        "client",
        "gstin",
        "compliance_period",
        "prepared_return",
        "approval_request",
        "approved_by",
        "filed_by",
    )
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "readiness_snapshot_pretty",
        "error_summary_pretty",
    )
    fieldsets = (
        (
            "Filing",
            {
                "fields": (
                    "workspace",
                    "client",
                    "gstin",
                    "compliance_period",
                    "prepared_return",
                    "prepared_snapshot_version",
                    "approval_request",
                    "provider",
                    "return_type",
                    "status",
                )
            },
        ),
        (
            "Provider State",
            {
                "fields": (
                    "provider_reference_id",
                    "provider_acknowledgement_id",
                    "arn",
                    "submitted_at",
                    "arn_received_at",
                    "filed_at",
                    "last_status_sync_at",
                )
            },
        ),
        ("Users", {"fields": ("approved_by", "filed_by")}),
        ("Snapshots", {"fields": ("readiness_snapshot", "readiness_snapshot_pretty", "error_summary", "error_summary_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )
    inlines = [ReturnFilingAttemptInline, ReturnFilingOffsetInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "workspace",
            "client",
            "gstin",
            "compliance_period",
            "prepared_return",
            "approval_request",
            "approved_by",
            "filed_by",
        )

    @admin.display(description="Readiness snapshot preview")
    def readiness_snapshot_pretty(self, obj):
        return pretty_json(obj.readiness_snapshot)

    @admin.display(description="Error summary preview")
    def error_summary_pretty(self, obj):
        return pretty_json(obj.error_summary)


@admin.register(ReturnFilingAttempt)
class ReturnFilingAttemptAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "return_filing",
        "attempt_number",
        "status",
        "provider_stage",
        "provider_request_id",
        "failure_code",
        "started_at",
        "completed_at",
    )
    list_filter = ("status", "return_filing__provider", "return_filing__compliance_period__gstin__client__workspace")
    search_fields = ("provider_request_id", "idempotency_key", "failure_code", "return_filing__arn")
    ordering = ("-created_at",)
    autocomplete_fields = ("return_filing", "triggered_by")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "request_summary_pretty",
        "response_summary_pretty",
        "provider_status_raw_pretty",
    )
    fieldsets = (
        (
            "Attempt",
            {
                "fields": (
                    "return_filing",
                    "attempt_number",
                    "status",
                    "provider_request_id",
                    "idempotency_key",
                    "request_payload_hash",
                    "triggered_by",
                )
            },
        ),
        ("Timing", {"fields": ("started_at", "submitted_at", "completed_at")}),
        ("Failures", {"fields": ("failure_code", "failure_message")}),
        ("Payloads", {"fields": ("request_summary", "request_summary_pretty", "response_summary", "response_summary_pretty")}),
        ("Provider State", {"fields": ("provider_status_raw", "provider_status_raw_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("return_filing", "triggered_by")

    @admin.display(description="Provider stage")
    def provider_stage(self, obj):
        if isinstance(obj.request_summary, dict):
            return obj.request_summary.get("provider_stage") or ""
        return ""

    @admin.display(description="Request summary preview")
    def request_summary_pretty(self, obj):
        return pretty_json(obj.request_summary)

    @admin.display(description="Response summary preview")
    def response_summary_pretty(self, obj):
        return pretty_json(obj.response_summary)

    @admin.display(description="Provider status preview")
    def provider_status_raw_pretty(self, obj):
        return pretty_json(obj.provider_status_raw)


@admin.register(ReturnFilingEvent)
class ReturnFilingEventAdmin(AuditReadonlyAdminMixin, admin.ModelAdmin):
    list_display = ("event_type", "return_filing", "filing_attempt", "old_status", "new_status", "actor", "created_at")
    list_filter = ("event_type", "new_status", "return_filing__provider")
    search_fields = ("event_type", "return_filing__arn", "return_filing__provider_reference_id")
    ordering = ("-created_at",)
    autocomplete_fields = ("return_filing", "filing_attempt", "actor")
    readonly_fields = ("return_filing", "filing_attempt", "event_type", "old_status", "new_status", "actor", "metadata", "metadata_pretty", "created_at")
    fieldsets = (
        ("Event", {"fields": ("return_filing", "filing_attempt", "event_type", "old_status", "new_status", "actor", "created_at")}),
        ("Metadata", {"fields": ("metadata", "metadata_pretty")}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("return_filing", "filing_attempt", "actor")

    @admin.display(description="Metadata preview")
    def metadata_pretty(self, obj):
        return pretty_json(obj.metadata)


@admin.register(ProviderAuthSession)
class ProviderAuthSessionAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("email", "txn", "status", "provider", "gstin", "response_contract_confirmed", "last_requested_at", "verified_at", "created_at")
    list_filter = ("status", "provider", "response_contract_confirmed", "workspace")
    search_fields = ("email", "txn", "client__legal_name", "gstin__gstin")
    ordering = ("-created_at",)
    autocomplete_fields = ("workspace", "client", "gstin", "initiated_by", "verified_by")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "otp_request_payload_pretty",
        "auth_token_payload_pretty",
        "session_metadata_pretty",
        "error_summary_pretty",
    )
    fieldsets = (
        ("Context", {"fields": ("workspace", "client", "gstin", "provider", "email", "txn", "status")}),
        ("Users", {"fields": ("initiated_by", "verified_by")}),
        ("Timing", {"fields": ("last_requested_at", "verified_at")}),
        (
            "Payloads",
            {
                "fields": (
                    "otp_request_payload",
                    "otp_request_payload_pretty",
                    "auth_token_payload",
                    "auth_token_payload_pretty",
                    "session_metadata",
                    "session_metadata_pretty",
                )
            },
        ),
        ("Errors", {"fields": ("error_summary", "error_summary_pretty", "response_contract_confirmed")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("workspace", "client", "gstin", "initiated_by", "verified_by")

    @admin.display(description="OTP request payload preview")
    def otp_request_payload_pretty(self, obj):
        return pretty_json(obj.otp_request_payload)

    @admin.display(description="Auth token payload preview")
    def auth_token_payload_pretty(self, obj):
        return pretty_json(obj.auth_token_payload)

    @admin.display(description="Session metadata preview")
    def session_metadata_pretty(self, obj):
        return pretty_json(obj.session_metadata)

    @admin.display(description="Error summary preview")
    def error_summary_pretty(self, obj):
        return pretty_json(obj.error_summary)


@admin.register(ProviderRolloutPolicy)
class ProviderRolloutPolicyAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "workspace",
        "client",
        "gstin",
        "provider",
        "return_type",
        "enable_live_submission",
        "enable_live_status_sync",
        "effective_from",
        "effective_to",
        "created_at",
    )
    list_filter = ("provider", "return_type", "enable_live_submission", "enable_live_status_sync", "workspace")
    search_fields = ("client__legal_name", "gstin__gstin", "workspace__name", "notes")
    ordering = ("workspace_id", "provider", "-created_at")
    autocomplete_fields = ("workspace", "client", "gstin")
    readonly_fields = BaseTenantAdminMixin.readonly_fields
    fieldsets = (
        (
            "Scope",
            {
                "fields": (
                    "workspace",
                    "client",
                    "gstin",
                    "provider",
                    "return_type",
                )
            },
        ),
        (
            "Controls",
            {
                "fields": (
                    "enable_live_submission",
                    "enable_live_status_sync",
                    "effective_from",
                    "effective_to",
                    "notes",
                )
            },
        ),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )


@admin.register(ReturnFilingIncidentNote)
class ReturnFilingIncidentNoteAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "title",
        "return_filing",
        "severity",
        "status",
        "alert_code",
        "resolved_at",
        "resolved_by",
        "created_at",
    )
    list_filter = ("severity", "status", "return_filing__provider", "return_filing__workspace")
    search_fields = ("title", "note", "alert_code", "return_filing__provider_reference_id", "return_filing__arn")
    ordering = ("-created_at",)
    autocomplete_fields = ("return_filing", "resolved_by")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + ("metadata_pretty",)
    fieldsets = (
        ("Incident", {"fields": ("return_filing", "title", "note", "severity", "status", "alert_code")}),
        ("Resolution", {"fields": ("resolved_at", "resolved_by")}),
        ("Metadata", {"fields": ("metadata", "metadata_pretty")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("return_filing", "resolved_by")

    @admin.display(description="Metadata preview")
    def metadata_pretty(self, obj):
        return pretty_json(obj.metadata)


@admin.register(OperationalAlertRoutingRule)
class OperationalAlertRoutingRuleAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = (
        "workspace",
        "provider",
        "return_type",
        "alert_code",
        "minimum_severity",
        "target_role",
        "is_active",
    )
    list_filter = ("provider", "return_type", "minimum_severity", "target_role", "workspace")
    search_fields = ("workspace__name", "client__legal_name", "gstin__gstin", "alert_code", "notes")
    ordering = ("workspace__name", "provider", "target_role", "-created_at")
    autocomplete_fields = ("workspace", "client", "gstin")


class ReturnFilingOffsetLineInline(admin.TabularInline):
    model = ReturnFilingOffsetLine
    extra = 0
    fields = ("line_number", "source_ledger_type", "source_ledger_id", "liability_ledger_id", "tax_head", "amount")
    readonly_fields = ()
    autocomplete_fields = ()


@admin.register(ReturnFilingOffset)
class ReturnFilingOffsetAdmin(BaseTenantAdminMixin, admin.ModelAdmin):
    list_display = ("return_filing", "version", "status", "filing_attempt", "confirmed_at", "confirmed_by", "created_at")
    list_filter = ("status", "return_filing__provider", "return_filing__compliance_period__gstin__client__workspace")
    search_fields = ("return_filing__provider_reference_id", "return_filing__arn", "notes")
    ordering = ("-created_at",)
    autocomplete_fields = ("return_filing", "filing_attempt", "confirmed_by")
    readonly_fields = BaseTenantAdminMixin.readonly_fields + (
        "provider_payload_pretty",
        "liability_snapshot_pretty",
        "ledger_snapshot_pretty",
        "allocation_summary_pretty",
    )
    fieldsets = (
        ("Offset", {"fields": ("return_filing", "filing_attempt", "version", "status", "confirmed_at", "confirmed_by")}),
        ("Payloads", {"fields": ("provider_payload", "provider_payload_pretty", "liability_snapshot", "liability_snapshot_pretty")}),
        ("Allocation", {"fields": ("ledger_snapshot", "ledger_snapshot_pretty", "allocation_summary", "allocation_summary_pretty", "notes")}),
        ("Audit", {"fields": BaseTenantAdminMixin.readonly_fields, "classes": ("collapse",)}),
    )
    inlines = [ReturnFilingOffsetLineInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("return_filing", "filing_attempt", "confirmed_by")

    @admin.display(description="Provider payload preview")
    def provider_payload_pretty(self, obj):
        return pretty_json(obj.provider_payload)

    @admin.display(description="Liability snapshot preview")
    def liability_snapshot_pretty(self, obj):
        return pretty_json(obj.liability_snapshot)

    @admin.display(description="Ledger snapshot preview")
    def ledger_snapshot_pretty(self, obj):
        return pretty_json(obj.ledger_snapshot)

    @admin.display(description="Allocation summary preview")
    def allocation_summary_pretty(self, obj):
        return pretty_json(obj.allocation_summary)
