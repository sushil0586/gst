from rest_framework import serializers

from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.workspaces.models import Workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = [
            "id",
            "organization",
            "name",
            "code",
            "timezone",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class WorkspaceContextClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = [
            "id",
            "workspace",
            "legal_name",
            "trade_name",
            "client_code",
            "pan",
            "email",
            "is_active",
        ]
        read_only_fields = fields


class WorkspaceContextGSTINSerializer(serializers.ModelSerializer):
    class Meta:
        model = GSTIN
        fields = [
            "id",
            "client",
            "gstin",
            "registration_type",
            "state_code",
            "whitebooks_gst_username",
            "is_active",
        ]
        read_only_fields = fields


class WorkspaceContextCompliancePeriodSerializer(serializers.ModelSerializer):
    locked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CompliancePeriod
        fields = [
            "id",
            "gstin",
            "period",
            "return_type",
            "status",
            "due_date",
            "is_locked",
            "locked_at",
            "locked_by",
            "locked_by_name",
            "is_active",
        ]
        read_only_fields = fields

    def get_locked_by_name(self, obj):
        if obj.locked_by is None:
            return None
        full_name = obj.locked_by.get_full_name().strip()
        return full_name or obj.locked_by.username


class WorkspaceContextSerializer(serializers.Serializer):
    workspace = WorkspaceSerializer()
    clients = WorkspaceContextClientSerializer(many=True)
    gstins = WorkspaceContextGSTINSerializer(many=True)
    periods = WorkspaceContextCompliancePeriodSerializer(many=True)
