from rest_framework import serializers

from apps.compliance_periods.models import CompliancePeriod


class CompliancePeriodSerializer(serializers.ModelSerializer):
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    client_id = serializers.UUIDField(source="gstin.client_id", read_only=True)
    client_name = serializers.CharField(source="gstin.client.legal_name", read_only=True)
    locked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CompliancePeriod
        fields = [
            "id",
            "gstin",
            "gstin_value",
            "client_id",
            "client_name",
            "period",
            "return_type",
            "status",
            "due_date",
            "is_locked",
            "locked_at",
            "locked_by",
            "locked_by_name",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_locked_by_name(self, obj):
        if obj.locked_by is None:
            return None
        full_name = obj.locked_by.get_full_name().strip()
        return full_name or obj.locked_by.username
