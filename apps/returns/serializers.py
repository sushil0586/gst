from rest_framework import serializers

from apps.returns.models import PortalChallanRequest, ProviderReturnSummarySnapshot, ReturnPreparation


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


class PortalFilingReadinessRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    return_type = serializers.ChoiceField(choices=ReturnPreparation.ReturnType.choices, default=ReturnPreparation.ReturnType.GSTR3B)


class PortalChallanRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    return_type = serializers.ChoiceField(choices=ReturnPreparation.ReturnType.choices, default=ReturnPreparation.ReturnType.GSTR3B)
    challan_reason = serializers.CharField(max_length=32)
    payment_mode = serializers.CharField(max_length=16)
    bank_code = serializers.CharField(required=False, allow_blank=True, max_length=16)
    sub_payment_mode = serializers.CharField(required=False, allow_blank=True, max_length=16)
    mobile_number = serializers.CharField(max_length=32)
    address = serializers.CharField(max_length=255)
    cgst_tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    igst_tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    sgst_tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    cess_tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    allow_duplicate_generation = serializers.BooleanField(required=False, default=False)


class PortalChallanListRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    return_type = serializers.ChoiceField(choices=ReturnPreparation.ReturnType.choices, default=ReturnPreparation.ReturnType.GSTR3B)


class ProviderSummaryCompareRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    return_type = serializers.ChoiceField(choices=ReturnPreparation.ReturnType.choices, default=ReturnPreparation.ReturnType.GSTR3B)


class PortalChallanRecordSerializer(serializers.ModelSerializer):
    workspace = serializers.UUIDField(source="compliance_period.gstin.client.workspace_id", read_only=True)
    client = serializers.UUIDField(source="compliance_period.gstin.client_id", read_only=True)
    gstin = serializers.UUIDField(source="compliance_period.gstin_id", read_only=True)
    gstin_value = serializers.CharField(source="compliance_period.gstin.gstin", read_only=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)

    class Meta:
        model = PortalChallanRequest
        fields = [
            "id",
            "workspace",
            "client",
            "gstin",
            "gstin_value",
            "compliance_period",
            "compliance_period_label",
            "provider",
            "return_type",
            "status",
            "cpin",
            "challan_reason",
            "challan_period",
            "payment_mode",
            "bank_code",
            "sub_payment_mode",
            "taxpayer_name",
            "address",
            "mobile_number",
            "request_payload",
            "response_payload",
            "total_amount",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProviderReturnSummarySnapshotSerializer(serializers.ModelSerializer):
    workspace = serializers.UUIDField(source="compliance_period.gstin.client.workspace_id", read_only=True)
    client = serializers.UUIDField(source="compliance_period.gstin.client_id", read_only=True)
    gstin = serializers.UUIDField(source="compliance_period.gstin_id", read_only=True)
    gstin_value = serializers.CharField(source="compliance_period.gstin.gstin", read_only=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)

    class Meta:
        model = ProviderReturnSummarySnapshot
        fields = [
            "id",
            "workspace",
            "client",
            "gstin",
            "gstin_value",
            "compliance_period",
            "compliance_period_label",
            "prepared_return",
            "auth_session",
            "provider",
            "return_type",
            "fetched_at",
            "status",
            "threshold_amount",
            "internal_summary",
            "provider_response",
            "normalized_provider_summary",
            "comparison_summary",
            "error_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
