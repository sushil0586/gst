from rest_framework import serializers

from apps.gstins.models import GSTIN, GSTINTaxpayerProfile


def workspace_has_gstin(*, workspace_id, gstin_value, exclude_gstin_id=None):
    queryset = GSTIN.objects.filter(
        client__workspace_id=workspace_id,
        gstin=gstin_value,
        is_active=True,
    )
    if exclude_gstin_id is not None:
        queryset = queryset.exclude(pk=exclude_gstin_id)
    return queryset.exists()


class GSTINSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    workspace_id = serializers.UUIDField(source="client.workspace_id", read_only=True)

    class Meta:
        model = GSTIN
        fields = [
            "id",
            "client",
            "client_name",
            "workspace_id",
            "gstin",
            "registration_type",
            "state_code",
            "whitebooks_gst_username",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_gstin(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        client = attrs.get("client") or getattr(self.instance, "client", None)
        if client is None:
            raise serializers.ValidationError({"client": "Client is required."})

        gstin_value = attrs.get("gstin", getattr(self.instance, "gstin", "")).strip().upper()
        if workspace_has_gstin(
            workspace_id=client.workspace_id,
            gstin_value=gstin_value,
            exclude_gstin_id=getattr(self.instance, "id", None),
        ):
            raise serializers.ValidationError({"gstin": "This GSTIN already exists in the selected workspace."})

        attrs["gstin"] = gstin_value
        return attrs


class GSTINTaxpayerProfileSerializer(serializers.ModelSerializer):
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)

    class Meta:
        model = GSTINTaxpayerProfile
        fields = [
            "id",
            "gstin",
            "gstin_value",
            "legal_name",
            "trade_name",
            "registration_type",
            "status",
            "constitution",
            "registration_date",
            "last_updated_date",
            "state_jurisdiction_code",
            "state_jurisdiction_name",
            "center_jurisdiction_code",
            "center_jurisdiction_name",
            "principal_address",
            "additional_addresses",
            "nature_of_business",
            "einvoice_status",
            "raw_payload",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TaxpayerSearchRequestSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    gstin = serializers.CharField(min_length=15, max_length=15)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_gstin(self, value):
        return value.strip().upper()


class TaxpayerSearchResultSerializer(serializers.Serializer):
    gstin = serializers.CharField()
    pan = serializers.CharField(allow_blank=True)
    legal_name = serializers.CharField(allow_blank=True)
    trade_name = serializers.CharField(allow_blank=True)
    state_code = serializers.CharField(allow_blank=True)
    registration_type = serializers.CharField(allow_blank=True)
    status = serializers.CharField(allow_blank=True)
    raw_payload = serializers.JSONField()
