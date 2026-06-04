from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.approvals.models import ApprovalRequest

User = get_user_model()


class ApprovalRequestSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True, allow_null=True)
    requested_to_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
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
            "entity_type",
            "entity_id",
            "requested_to",
            "requested_to_name",
            "status",
            "comments",
            "resolution_comments",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_name",
            "client_name",
            "gstin_value",
            "compliance_period_label",
            "requested_to_name",
            "resolved_by",
            "resolved_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "workspace": {"required": True, "allow_null": False},
            "client": {"required": True, "allow_null": False},
            "entity_type": {"required": True},
            "entity_id": {"required": True, "allow_null": False},
        }

    def validate_requested_to(self, value):
        if value is None:
            return value
        workspace = self.initial_data.get("workspace")
        if workspace and not value.workspace_memberships.filter(workspace_id=workspace, is_active=True).exists():
            raise serializers.ValidationError("Reviewer must belong to the selected workspace.")
        return value

    def get_requested_to_name(self, obj):
        if obj.requested_to is None:
            return None
        full_name = obj.requested_to.get_full_name().strip()
        return full_name or obj.requested_to.username

    def get_resolved_by_name(self, obj):
        if obj.resolved_by is None:
            return None
        full_name = obj.resolved_by.get_full_name().strip()
        return full_name or obj.resolved_by.username


class ApprovalActionSerializer(serializers.Serializer):
    comments = serializers.CharField(required=False, allow_blank=True)
