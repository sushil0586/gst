from rest_framework import serializers

from apps.clients.models import Client, ClientContact
from apps.gstins.serializers import workspace_has_gstin
from apps.gstins.serializers import GSTINSerializer, GSTINTaxpayerProfileSerializer


class ClientSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    transaction_count = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "legal_name",
            "trade_name",
            "client_code",
            "pan",
            "email",
            "transaction_count",
            "can_delete",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_client_code(self, value):
        workspace_id = self.initial_data.get("workspace") or getattr(self.instance, "workspace_id", None)
        if not workspace_id:
            return value
        queryset = Client.objects.filter(workspace_id=workspace_id, client_code=value)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A client with this code already exists in the selected workspace.")
        return value

    def get_transaction_count(self, obj):
        annotated_value = getattr(obj, "transaction_count", None)
        if annotated_value is not None:
            return annotated_value
        return obj.gst_transactions.filter(is_active=True).count()

    def get_can_delete(self, obj):
        return self.get_transaction_count(obj) == 0


class ClientBootstrapSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    legal_name = serializers.CharField(min_length=2)
    trade_name = serializers.CharField(required=False, allow_blank=True)
    client_code = serializers.CharField(min_length=2)
    pan = serializers.CharField(min_length=10, max_length=10)
    email = serializers.EmailField(required=False, allow_blank=True)
    gstin = serializers.CharField(required=False, allow_blank=True, min_length=15, max_length=15)
    registration_type = serializers.CharField(required=False, allow_blank=True, default="")
    state_code = serializers.CharField(required=False, allow_blank=True, max_length=2, default="")
    whitebooks_gst_username = serializers.CharField(required=False, allow_blank=True, default="")
    taxpayer_lookup_payload = serializers.JSONField(required=False)

    def validate_pan(self, value):
        return value.strip().upper()

    def validate_gstin(self, value):
        return value.strip().upper()

    def validate_state_code(self, value):
        return value.strip().upper()

    def validate_client_code(self, value):
        workspace_id = self.initial_data.get("workspace")
        if workspace_id and Client.objects.filter(workspace_id=workspace_id, client_code=value).exists():
            raise serializers.ValidationError("A client with this code already exists in the selected workspace.")
        return value

    def validate(self, attrs):
        workspace_id = attrs.get("workspace")
        gstin = attrs.get("gstin", "")
        if gstin:
            attrs["state_code"] = attrs.get("state_code") or gstin[:2]
            attrs["registration_type"] = attrs.get("registration_type") or "regular"
            if workspace_id and workspace_has_gstin(workspace_id=workspace_id, gstin_value=gstin):
                raise serializers.ValidationError({"gstin": "This GSTIN already exists in the selected workspace."})
        else:
            attrs["registration_type"] = attrs.get("registration_type", "")
            attrs["state_code"] = attrs.get("state_code", "")
        return attrs


class ClientBootstrapResultSerializer(serializers.Serializer):
    client = ClientSerializer()
    gstin = GSTINSerializer(allow_null=True)
    taxpayer_profile = GSTINTaxpayerProfileSerializer(allow_null=True)


class ClientContactSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    workspace = serializers.UUIDField(source="client.workspace_id", read_only=True)

    class Meta:
        model = ClientContact
        fields = [
            "id",
            "client",
            "client_name",
            "workspace",
            "name",
            "designation",
            "mobile_number",
            "alternate_mobile_number",
            "email",
            "is_primary",
            "preferred_contact_mode",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "client_name", "workspace"]

    def validate(self, attrs):
        instance = self.instance
        client = attrs.get("client") or getattr(instance, "client", None)
        if client is None:
            raise serializers.ValidationError({"client": "Client is required."})

        mobile_number = (attrs.get("mobile_number") if "mobile_number" in attrs else getattr(instance, "mobile_number", "")).strip()
        alternate_mobile = (
            attrs.get("alternate_mobile_number")
            if "alternate_mobile_number" in attrs
            else getattr(instance, "alternate_mobile_number", "")
        ).strip()
        email = (attrs.get("email") if "email" in attrs else getattr(instance, "email", "")).strip()

        if not any([mobile_number, alternate_mobile, email]):
            raise serializers.ValidationError(
                "At least one customer contact channel is required: mobile number, alternate mobile number, or email."
            )

        attrs["mobile_number"] = mobile_number
        attrs["alternate_mobile_number"] = alternate_mobile
        attrs["email"] = email
        return attrs
