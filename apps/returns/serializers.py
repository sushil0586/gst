from rest_framework import serializers

from apps.returns.models import ReturnPreparation


class ReturnPreparationSerializer(serializers.ModelSerializer):
    workspace = serializers.UUIDField(source="compliance_period.gstin.client.workspace_id", read_only=True)
    workspace_name = serializers.CharField(source="compliance_period.gstin.client.workspace.name", read_only=True)
    client = serializers.UUIDField(source="compliance_period.gstin.client_id", read_only=True)
    client_name = serializers.CharField(source="compliance_period.gstin.client.legal_name", read_only=True)
    gstin = serializers.UUIDField(source="compliance_period.gstin_id", read_only=True)
    gstin_value = serializers.CharField(source="compliance_period.gstin.gstin", read_only=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    prepared_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    filed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ReturnPreparation
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
            "return_type",
            "status",
            "summary_snapshot",
            "prepared_by",
            "prepared_by_name",
            "approved_by",
            "approved_by_name",
            "filed_by",
            "filed_by_name",
            "filed_at",
            "arn",
            "is_blocked_by_stale_reconciliation",
            "blocking_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def _get_user_name(self, user):
        if user is None:
            return None
        full_name = user.get_full_name().strip()
        return full_name or user.username

    def get_prepared_by_name(self, obj):
        return self._get_user_name(obj.prepared_by)

    def get_approved_by_name(self, obj):
        return self._get_user_name(obj.approved_by)

    def get_filed_by_name(self, obj):
        return self._get_user_name(obj.filed_by)


class ReturnPreparationRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    return_type = serializers.ChoiceField(choices=ReturnPreparation.ReturnType.choices)


class ReturnApprovalSerializer(serializers.Serializer):
    pass


class ReturnMarkFiledSerializer(serializers.Serializer):
    arn = serializers.CharField(required=False, allow_blank=True, max_length=64)


class ReturnReadinessRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
