from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.gst_transactions.models import TransactionCorrection
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
    books_transaction_snapshot = serializers.SerializerMethodField()
    portal_transaction_snapshot = serializers.SerializerMethodField()
    latest_correction = serializers.SerializerMethodField()
    corrections_count = serializers.SerializerMethodField()

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
            "books_transaction_snapshot",
            "portal_transaction_snapshot",
            "match_status",
            "mismatch_reason",
            "tax_difference",
            "taxable_difference",
            "total_difference",
            "issue_bucket",
            "recommended_next_action",
            "period_relationship",
            "itc_status",
            "review_decision",
            "action_status",
            "assigned_to",
            "assigned_to_name",
            "remarks",
            "latest_correction",
            "corrections_count",
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
            "books_transaction_snapshot",
            "portal_transaction_snapshot",
            "match_status",
            "mismatch_reason",
            "tax_difference",
            "taxable_difference",
            "total_difference",
            "issue_bucket",
            "recommended_next_action",
            "period_relationship",
            "itc_status",
            "review_decision",
            "assigned_to_name",
            "latest_correction",
            "corrections_count",
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

    def get_books_transaction_snapshot(self, obj):
        return _serialize_transaction_snapshot(obj.books_transaction)

    def get_portal_transaction_snapshot(self, obj):
        return _serialize_transaction_snapshot(obj.portal_transaction)

    def get_latest_correction(self, obj):
        corrections = _get_prefetched_corrections(obj)
        correction = corrections[0] if corrections else None
        return _serialize_correction(correction)

    def get_corrections_count(self, obj):
        return len(_get_prefetched_corrections(obj))


class ReconciliationItemActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReconciliationItem
        fields = ["action_status", "review_decision", "assigned_to", "remarks"]

    def validate_assigned_to(self, value):
        if value is None:
            return value
        request = self.context.get("request")
        run = self.instance.reconciliation_run if self.instance else None
        workspace_id = run.workspace_id if run else None
        if workspace_id and not value.workspace_memberships.filter(workspace_id=workspace_id, is_active=True).exists():
            raise serializers.ValidationError("Assigned user must belong to the run workspace.")
        return value


class ReconciliationItemBooksCorrectionSerializer(serializers.Serializer):
    reason_code = serializers.ChoiceField(
        choices=[
            "books_entry_error",
            "document_alignment",
            "tax_amount_correction",
            "vendor_clarification",
            "other",
        ]
    )
    reason_note = serializers.CharField(allow_blank=False, trim_whitespace=True)
    reference_number = serializers.CharField(required=False, allow_blank=False, max_length=64)
    transaction_date = serializers.DateField(required=False)
    counterparty_gstin = serializers.CharField(required=False, allow_blank=True, max_length=15)
    counterparty_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    taxable_value = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    cgst_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    sgst_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    igst_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    cess_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    total_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    place_of_supply = serializers.CharField(required=False, allow_blank=True, max_length=128)
    reverse_charge = serializers.BooleanField(required=False)

    def validate(self, attrs):
        editable_fields = {
            "reference_number",
            "transaction_date",
            "counterparty_gstin",
            "counterparty_name",
            "taxable_value",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "cess_amount",
            "total_amount",
            "place_of_supply",
            "reverse_charge",
        }
        if not any(field in attrs for field in editable_fields):
            raise serializers.ValidationError("At least one books-side field must be updated.")
        return attrs


class ReconciliationItemBooksCreateSerializer(serializers.Serializer):
    reason_code = serializers.ChoiceField(
        choices=[
            "missing_books_entry",
            "late_booking",
            "portal_confirmed_booking",
            "vendor_clarification",
            "other",
        ]
    )
    reason_note = serializers.CharField(allow_blank=False, trim_whitespace=True)
    reference_number = serializers.CharField(required=False, allow_blank=False, max_length=64)
    transaction_date = serializers.DateField(required=False)
    counterparty_gstin = serializers.CharField(required=False, allow_blank=True, max_length=15)
    counterparty_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    taxable_value = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    cgst_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    sgst_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    igst_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    cess_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    total_amount = serializers.DecimalField(required=False, max_digits=14, decimal_places=2)
    place_of_supply = serializers.CharField(required=False, allow_blank=True, max_length=128)
    reverse_charge = serializers.BooleanField(required=False)


class TransactionCorrectionSerializer(serializers.ModelSerializer):
    applied_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TransactionCorrection
        fields = [
            "id",
            "transaction",
            "reconciliation_item",
            "correction_scope",
            "status",
            "reason_code",
            "reason_note",
            "changed_fields",
            "before_snapshot",
            "after_snapshot",
            "applied_at",
            "applied_by",
            "applied_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_applied_by_name(self, obj):
        if obj.applied_by is None:
            return None
        full_name = obj.applied_by.get_full_name().strip()
        return full_name or obj.applied_by.username


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
            "itc_ready_count",
            "itc_pending_2b_count",
            "itc_pending_review_count",
            "itc_blocked_count",
            "itc_timing_difference_count",
            "itc_vendor_followup_required_count",
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
            "itc_ready_count",
            "itc_pending_2b_count",
            "itc_pending_review_count",
            "itc_blocked_count",
            "itc_timing_difference_count",
            "itc_vendor_followup_required_count",
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


def _serialize_transaction_snapshot(transaction):
    if transaction is None:
        return None
    return {
        "id": str(transaction.id),
        "transaction_type": transaction.transaction_type,
        "document_type": transaction.document_type,
        "reference_number": transaction.reference_number,
        "transaction_date": transaction.transaction_date.isoformat() if transaction.transaction_date else None,
        "counterparty_gstin": transaction.counterparty_gstin,
        "counterparty_name": transaction.counterparty_name,
        "taxable_value": str(transaction.taxable_value),
        "cgst_amount": str(transaction.cgst_amount),
        "sgst_amount": str(transaction.sgst_amount),
        "igst_amount": str(transaction.igst_amount),
        "cess_amount": str(transaction.cess_amount),
        "tax_amount": str(transaction.tax_amount),
        "total_amount": str(transaction.total_amount),
        "place_of_supply": transaction.place_of_supply,
        "reverse_charge": transaction.reverse_charge,
        "metadata": transaction.metadata or {},
        "created_at": transaction.created_at.isoformat() if transaction.created_at else None,
        "updated_at": transaction.updated_at.isoformat() if transaction.updated_at else None,
    }


def _serialize_correction(correction):
    if correction is None:
        return None
    applied_by_name = None
    if correction.applied_by is not None:
        full_name = correction.applied_by.get_full_name().strip()
        applied_by_name = full_name or correction.applied_by.username
    return {
        "id": str(correction.id),
        "transaction": str(correction.transaction_id),
        "reconciliation_item": str(correction.reconciliation_item_id) if correction.reconciliation_item_id else None,
        "correction_scope": correction.correction_scope,
        "status": correction.status,
        "reason_code": correction.reason_code,
        "reason_note": correction.reason_note,
        "changed_fields": correction.changed_fields or [],
        "before_snapshot": correction.before_snapshot or {},
        "after_snapshot": correction.after_snapshot or {},
        "applied_at": correction.applied_at.isoformat() if correction.applied_at else None,
        "applied_by": correction.applied_by_id,
        "applied_by_name": applied_by_name,
        "created_at": correction.created_at.isoformat() if correction.created_at else None,
        "updated_at": correction.updated_at.isoformat() if correction.updated_at else None,
    }


def _get_prefetched_corrections(obj):
    transaction = obj.books_transaction
    if transaction is None:
        return []
    cache_attr = "_prefetched_transaction_corrections"
    if hasattr(obj, cache_attr):
        return getattr(obj, cache_attr)
    corrections = list(transaction.corrections.all())
    setattr(obj, cache_attr, corrections)
    return corrections
