from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.models import WorkspaceMembership
from apps.gst_transactions.models import (
    GSTTransaction,
    TransactionRemediationAssignment,
    TransactionRemediationDigest,
    TransactionRemediationFollowUp,
    TransactionReviewSnapshot,
)
from apps.gst_transactions.services.transactions import validate_bulk_update_payload, validate_metadata_payload

User = get_user_model()


class GSTTransactionSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True, allow_null=True)
    document_number = serializers.CharField(source="reference_number", read_only=True)
    document_date = serializers.DateField(source="transaction_date", read_only=True)
    source_import_batch = serializers.UUIDField(source="import_batch_id", read_only=True, allow_null=True)

    class Meta:
        model = GSTTransaction
        fields = [
            "id",
            "workspace",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "compliance_period",
            "compliance_period_label",
            "transaction_type",
            "document_type",
            "document_number",
            "document_date",
            "counterparty_gstin",
            "counterparty_name",
            "taxable_value",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "cess_amount",
            "tax_amount",
            "total_amount",
            "place_of_supply",
            "reverse_charge",
            "source_import_batch",
            "status",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class GSTTransactionUpdateSerializer(serializers.ModelSerializer):
    metadata = serializers.JSONField(required=False)
    document_number = serializers.CharField(source="reference_number", read_only=True)
    document_date = serializers.DateField(source="transaction_date", read_only=True)

    class Meta:
        model = GSTTransaction
        fields = [
            "id",
            "transaction_type",
            "document_type",
            "document_number",
            "document_date",
            "counterparty_gstin",
            "counterparty_name",
            "place_of_supply",
            "reverse_charge",
            "status",
            "metadata",
        ]
        read_only_fields = ["id", "transaction_type", "document_number", "document_date"]

    def validate_metadata(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Metadata must be a JSON object.")
        return validate_metadata_payload(value)


class GSTTransactionBulkUpdateSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    place_of_supply = serializers.CharField(required=False, allow_blank=True)
    reverse_charge = serializers.BooleanField(required=False)
    status = serializers.ChoiceField(choices=GSTTransaction.TransactionStatus.choices, required=False)
    metadata_updates = serializers.JSONField(required=False)

    def validate(self, attrs):
        metadata_updates = attrs.get("metadata_updates")
        if metadata_updates is not None and not isinstance(metadata_updates, dict):
            raise serializers.ValidationError({"metadata_updates": "Metadata updates must be a JSON object."})
        if not any(key in attrs for key in ("place_of_supply", "reverse_charge", "status", "metadata_updates")):
            raise serializers.ValidationError("Provide at least one field to update.")
        return validate_bulk_update_payload(attrs)


class TransactionReviewSnapshotSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TransactionReviewSnapshot
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
            "name",
            "filters",
            "bucket_counts",
            "created_at",
            "created_by",
            "created_by_name",
        ]
        read_only_fields = ["id", "created_at", "created_by", "created_by_name", "workspace_name", "client_name", "gstin_value", "compliance_period_label"]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return getattr(obj.created_by, "full_name", None) or obj.created_by.get_full_name() or obj.created_by.username

    def validate_filters(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Filters must be a JSON object.")
        return value

    def validate_bucket_counts(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Bucket counts must be a JSON object.")
        return value


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.SerializerMethodField()
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = WorkspaceMembership
        fields = [
            "id",
            "workspace_id",
            "workspace_name",
            "user_id",
            "username",
            "email",
            "full_name",
            "role",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        full_name = obj.user.get_full_name().strip()
        return full_name or obj.user.username


class TransactionRemediationAssignmentSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    escalated_by_name = serializers.SerializerMethodField()
    transaction_count = serializers.SerializerMethodField()
    is_escalated = serializers.SerializerMethodField()

    class Meta:
        model = TransactionRemediationAssignment
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
            "snapshot",
            "bucket_code",
            "title",
            "transaction_ids",
            "transaction_count",
            "filters",
            "status",
            "assigned_to",
            "assigned_to_name",
            "notes",
            "is_escalated",
            "escalated_at",
            "escalated_by",
            "escalated_by_name",
            "escalation_notes",
            "created_at",
            "created_by",
            "created_by_name",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_name",
            "client_name",
            "gstin_value",
            "compliance_period_label",
            "transaction_count",
            "assigned_to_name",
            "is_escalated",
            "escalated_at",
            "escalated_by",
            "escalated_by_name",
            "created_at",
            "created_by",
            "created_by_name",
            "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        if obj.assigned_to is None:
            return None
        full_name = obj.assigned_to.get_full_name().strip()
        return full_name or obj.assigned_to.username

    def get_created_by_name(self, obj):
        if obj.created_by is None:
            return None
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.username

    def get_escalated_by_name(self, obj):
        if obj.escalated_by is None:
            return None
        full_name = obj.escalated_by.get_full_name().strip()
        return full_name or obj.escalated_by.username

    def get_transaction_count(self, obj):
        return len(obj.transaction_ids or [])

    def get_is_escalated(self, obj):
        return obj.escalated_at is not None

    def validate_assigned_to(self, value):
        if value is None:
            return value
        workspace_id = self.initial_data.get("workspace") or getattr(self.instance, "workspace_id", None)
        if workspace_id and not value.workspace_memberships.filter(workspace_id=workspace_id, is_active=True).exists():
            raise serializers.ValidationError("Assignee must belong to the selected workspace.")
        return value

    def validate_transaction_ids(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Transaction ids must be a list.")
        normalized = [str(item) for item in value if str(item).strip()]
        if not normalized:
            raise serializers.ValidationError("Select at least one transaction.")
        return normalized

    def validate_filters(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Filters must be a JSON object.")
        return value

    def validate(self, attrs):
        workspace = attrs.get("workspace") or getattr(self.instance, "workspace", None)
        client = attrs.get("client") or getattr(self.instance, "client", None)
        gstin = attrs.get("gstin") if "gstin" in attrs else getattr(self.instance, "gstin", None)
        compliance_period = attrs.get("compliance_period") or getattr(self.instance, "compliance_period", None)
        snapshot = attrs.get("snapshot") if "snapshot" in attrs else getattr(self.instance, "snapshot", None)

        if workspace and client and client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Client does not belong to the selected workspace."})
        if gstin and client and gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})
        if compliance_period and client and compliance_period.gstin.client_id != client.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected client."})
        if gstin and compliance_period and compliance_period.gstin_id != gstin.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected GSTIN."})
        if snapshot and workspace and snapshot.workspace_id != workspace.id:
            raise serializers.ValidationError({"snapshot": "Snapshot does not belong to the selected workspace."})
        return attrs


class TransactionRemediationEscalationSerializer(serializers.Serializer):
    escalation_notes = serializers.CharField(required=False, allow_blank=True)


class TransactionRemediationFollowUpSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    last_notified_at = serializers.DateTimeField(read_only=True)
    reminder_count = serializers.IntegerField(read_only=True)
    auto_escalated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = TransactionRemediationFollowUp
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
            "assignment",
            "assignment_title",
            "assigned_to",
            "assigned_to_name",
            "follow_up_type",
            "status",
            "title",
            "notes",
            "remind_at",
            "last_notified_at",
            "reminder_count",
            "auto_escalated_at",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "is_overdue",
            "created_at",
            "created_by",
            "created_by_name",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_name",
            "client_name",
            "gstin_value",
            "compliance_period_label",
            "assignment_title",
            "assigned_to_name",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "is_overdue",
            "created_at",
            "created_by",
            "created_by_name",
            "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        if obj.assigned_to is None:
            return None
        full_name = obj.assigned_to.get_full_name().strip()
        return full_name or obj.assigned_to.username

    def get_created_by_name(self, obj):
        if obj.created_by is None:
            return None
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.username

    def get_completed_by_name(self, obj):
        if obj.completed_by is None:
            return None
        full_name = obj.completed_by.get_full_name().strip()
        return full_name or obj.completed_by.username

    def get_is_overdue(self, obj):
        if obj.status in {TransactionRemediationFollowUp.FollowUpStatus.COMPLETED, TransactionRemediationFollowUp.FollowUpStatus.DISMISSED}:
            return False
        from django.utils import timezone

        return obj.remind_at <= timezone.now()

    def validate_assigned_to(self, value):
        if value is None:
            return value
        workspace_id = self.initial_data.get("workspace") or getattr(self.instance, "workspace_id", None)
        if workspace_id and not value.workspace_memberships.filter(workspace_id=workspace_id, is_active=True).exists():
            raise serializers.ValidationError("Assignee must belong to the selected workspace.")
        return value

    def validate(self, attrs):
        workspace = attrs.get("workspace") or getattr(self.instance, "workspace", None)
        client = attrs.get("client") or getattr(self.instance, "client", None)
        gstin = attrs.get("gstin") if "gstin" in attrs else getattr(self.instance, "gstin", None)
        compliance_period = attrs.get("compliance_period") or getattr(self.instance, "compliance_period", None)
        assignment = attrs.get("assignment") or getattr(self.instance, "assignment", None)

        if workspace and client and client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Client does not belong to the selected workspace."})
        if gstin and client and gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})
        if compliance_period and client and compliance_period.gstin.client_id != client.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected client."})
        if gstin and compliance_period and compliance_period.gstin_id != gstin.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected GSTIN."})
        if assignment and workspace and assignment.workspace_id != workspace.id:
            raise serializers.ValidationError({"assignment": "Assignment does not belong to the selected workspace."})
        if assignment and client and assignment.client_id != client.id:
            raise serializers.ValidationError({"assignment": "Assignment does not belong to the selected client."})
        if assignment and compliance_period and assignment.compliance_period_id != compliance_period.id:
            raise serializers.ValidationError({"assignment": "Assignment does not belong to the selected compliance period."})
        return attrs


class TransactionRemediationFollowUpStatusSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class TransactionRemediationDigestSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    generated_for_name = serializers.SerializerMethodField()
    generated_by_name = serializers.SerializerMethodField()
    dispatched_by_name = serializers.SerializerMethodField()
    acknowledged_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TransactionRemediationDigest
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "generated_for",
            "generated_for_name",
            "generated_by",
            "generated_by_name",
            "title",
            "delivery_channel",
            "status",
            "summary",
            "rendered_payload",
            "dispatched_at",
            "dispatched_by",
            "dispatched_by_name",
            "dispatch_error",
            "acknowledged_at",
            "acknowledged_by",
            "acknowledged_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_name",
            "generated_by",
            "generated_by_name",
            "rendered_payload",
            "dispatched_at",
            "dispatched_by",
            "dispatched_by_name",
            "dispatch_error",
            "acknowledged_at",
            "acknowledged_by",
            "acknowledged_by_name",
            "created_at",
            "updated_at",
        ]

    def get_generated_for_name(self, obj):
        if obj.generated_for is None:
            return None
        full_name = obj.generated_for.get_full_name().strip()
        return full_name or obj.generated_for.username

    def get_generated_by_name(self, obj):
        if obj.generated_by is None:
            return None
        full_name = obj.generated_by.get_full_name().strip()
        return full_name or obj.generated_by.username

    def get_acknowledged_by_name(self, obj):
        if obj.acknowledged_by is None:
            return None
        full_name = obj.acknowledged_by.get_full_name().strip()
        return full_name or obj.acknowledged_by.username

    def get_dispatched_by_name(self, obj):
        if obj.dispatched_by is None:
            return None
        full_name = obj.dispatched_by.get_full_name().strip()
        return full_name or obj.dispatched_by.username

    def validate(self, attrs):
        delivery_channel = attrs.get("delivery_channel")
        generated_for = attrs.get("generated_for")
        request = self.context.get("request")
        fallback_user = getattr(request, "user", None)
        recipient = generated_for or fallback_user
        if delivery_channel == TransactionRemediationDigest.DeliveryChannel.EMAIL and (
            recipient is None or not getattr(recipient, "email", "")
        ):
            raise serializers.ValidationError(
                {"generated_for": "Select a recipient with an email address before sending an email digest."}
            )
        return attrs


class TransactionRemediationDigestAcknowledgeSerializer(serializers.Serializer):
    pass
