from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.reconciliation.models import ReconciliationItem, ReconciliationRun

User = get_user_model()


class ReconciliationItemSerializer(serializers.ModelSerializer):
    books_invoice = serializers.CharField(source="books_transaction.reference_number", read_only=True)
    portal_invoice = serializers.CharField(source="portal_transaction.reference_number", read_only=True)
    books_date = serializers.DateField(source="books_transaction.transaction_date", read_only=True)
    portal_date = serializers.DateField(source="portal_transaction.transaction_date", read_only=True)
    books_tax = serializers.DecimalField(source="books_transaction.tax_amount", max_digits=14, decimal_places=2, read_only=True)
    portal_tax = serializers.DecimalField(source="portal_transaction.tax_amount", max_digits=14, decimal_places=2, read_only=True)
    counterparty_name = serializers.SerializerMethodField()
    counterparty_gstin = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = ReconciliationItem
        fields = [
            "id",
            "reconciliation_run",
            "books_transaction",
            "portal_transaction",
            "books_invoice",
            "portal_invoice",
            "books_date",
            "portal_date",
            "books_tax",
            "portal_tax",
            "counterparty_name",
            "counterparty_gstin",
            "match_status",
            "mismatch_reason",
            "tax_difference",
            "taxable_difference",
            "total_difference",
            "action_status",
            "assigned_to",
            "assigned_to_name",
            "remarks",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reconciliation_run",
            "books_transaction",
            "portal_transaction",
            "books_invoice",
            "portal_invoice",
            "books_date",
            "portal_date",
            "books_tax",
            "portal_tax",
            "counterparty_name",
            "counterparty_gstin",
            "match_status",
            "mismatch_reason",
            "tax_difference",
            "taxable_difference",
            "total_difference",
            "assigned_to_name",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def get_counterparty_name(self, obj):
        transaction = obj.books_transaction or obj.portal_transaction
        return transaction.counterparty_name if transaction else ""

    def get_counterparty_gstin(self, obj):
        transaction = obj.books_transaction or obj.portal_transaction
        return transaction.counterparty_gstin if transaction else ""

    def get_assigned_to_name(self, obj):
        if obj.assigned_to is None:
            return None
        full_name = obj.assigned_to.get_full_name().strip()
        return full_name or obj.assigned_to.username


class ReconciliationItemActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationItem
        fields = ["action_status", "assigned_to", "remarks"]

    def validate_assigned_to(self, value):
        if value is None:
            return value
        request = self.context.get("request")
        run = self.instance.reconciliation_run if self.instance else None
        workspace_id = run.workspace_id if run else None
        if workspace_id and not value.workspace_memberships.filter(workspace_id=workspace_id, is_active=True).exists():
            raise serializers.ValidationError("Assigned user must belong to the run workspace.")
        return value


class ReconciliationRunSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    invalidated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ReconciliationRun
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "compliance_period",
            "compliance_period_label",
            "run_type",
            "status",
            "notes",
            "matched_count",
            "mismatch_count",
            "partial_match_count",
            "missing_in_books_count",
            "missing_in_portal_count",
            "duplicate_count",
            "total_tax_difference",
            "total_itc_at_risk",
            "processed_at",
            "error_summary",
            "is_stale",
            "invalidated_at",
            "invalidated_by",
            "invalidated_by_name",
            "invalidation_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_name",
            "client_name",
            "gstin_value",
            "compliance_period_label",
            "status",
            "matched_count",
            "mismatch_count",
            "partial_match_count",
            "missing_in_books_count",
            "missing_in_portal_count",
            "duplicate_count",
            "total_tax_difference",
            "total_itc_at_risk",
            "processed_at",
            "error_summary",
            "is_stale",
            "invalidated_at",
            "invalidated_by",
            "invalidated_by_name",
            "invalidation_reason",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        workspace = attrs["workspace"]
        client = attrs["client"]
        gstin = attrs.get("gstin")
        compliance_period = attrs["compliance_period"]

        if client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Client does not belong to the selected workspace."})
        if gstin and gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})
        if compliance_period.gstin.client_id != client.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected client."})
        if gstin and compliance_period.gstin_id != gstin.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected GSTIN."})
        return attrs

    def get_invalidated_by_name(self, obj):
        if obj.invalidated_by is None:
            return None
        full_name = obj.invalidated_by.get_full_name().strip()
        return full_name or obj.invalidated_by.username
