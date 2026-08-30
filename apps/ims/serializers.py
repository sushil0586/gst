from django.conf import settings
from rest_framework import serializers

from apps.clients.models import Client
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.gstins.models import GSTIN
from apps.ims.models import IMSActionBatch
from apps.workspaces.models import Workspace

IMS_RETURN_PERIOD_REGEX = r"^(0[1-9]|1[0-2])\d{4}$"
IMS_SECTION_CHOICES = (
    "B2B",
    "B2BA",
    "CN",
    "CNA",
    "DN",
    "DNA",
    "ECOM",
    "ECOMA",
    "IMPG",
    "IMPS",
)
IMS_STATUS_CHOICES = (
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "NO_ACTION",
)
IMS_GOODS_TYPE_CHOICES = (
    "GOODS",
    "SERVICES",
)
IMS_RETURN_TYPE_CHOICES = (
    "GSTR1",
    "GSTR1A",
)


class IMSBaseSerializer(serializers.Serializer):
    workspace = serializers.PrimaryKeyRelatedField(queryset=Workspace.objects.all())
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.select_related("workspace"))
    gstin = serializers.PrimaryKeyRelatedField(queryset=GSTIN.objects.select_related("client__workspace"))
    auth_session = serializers.PrimaryKeyRelatedField(
        queryset=ProviderAuthSession.objects.select_related("workspace", "client", "gstin"),
        required=False,
        allow_null=True,
    )
    txn = serializers.CharField(required=False, allow_blank=True, max_length=128)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        workspace = attrs["workspace"]
        client = attrs["client"]
        gstin = attrs["gstin"]
        auth_session = attrs.get("auth_session")

        if client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Client does not belong to the selected workspace."})

        if gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})

        if auth_session is not None:
            if auth_session.provider != ReturnFiling.Provider.WHITEBOOKS:
                raise serializers.ValidationError({"auth_session": "Only WhiteBooks auth sessions are supported."})
            if auth_session.workspace_id != workspace.id or auth_session.client_id != client.id:
                raise serializers.ValidationError(
                    {"auth_session": "Auth session does not belong to the selected workspace and client."}
                )
            if auth_session.gstin_id and auth_session.gstin_id != gstin.id:
                raise serializers.ValidationError({"auth_session": "Auth session does not belong to the selected GSTIN."})
            freshness = get_provider_auth_session_freshness(auth_session=auth_session)
            if freshness["is_stale"]:
                raise serializers.ValidationError({"auth_session": freshness["stale_reason"]})

        attrs["resolved_email"] = attrs.get("email") or (
            auth_session.email if auth_session is not None else settings.WHITEBOOKS_CONTACT_EMAIL
        )
        return attrs


class IMSSaveSerializer(IMSBaseSerializer):
    ret_period = serializers.RegexField(
        IMS_RETURN_PERIOD_REGEX,
        min_length=6,
        max_length=6,
        error_messages={"invalid": "ret_period must use WhiteBooks MMYYYY format."},
    )
    invdata = serializers.JSONField()

    def validate_invdata(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("invdata must be a JSON object.")
        return value


class IMSResetSerializer(IMSSaveSerializer):
    pass


class IMSActionBatchListRequestSerializer(IMSBaseSerializer):
    ret_period = serializers.RegexField(
        IMS_RETURN_PERIOD_REGEX,
        required=False,
        allow_blank=True,
        error_messages={"invalid": "ret_period must use WhiteBooks MMYYYY format."},
    )


class IMSActionBatchSerializer(serializers.ModelSerializer):
    workspace = serializers.UUIDField(source="workspace_id", read_only=True)
    client = serializers.UUIDField(source="client_id", read_only=True)
    gstin = serializers.UUIDField(source="gstin_id", read_only=True)
    auth_session = serializers.UUIDField(source="auth_session_id", read_only=True)

    class Meta:
        model = IMSActionBatch
        fields = [
            "id",
            "workspace",
            "client",
            "gstin",
            "auth_session",
            "provider",
            "action_type",
            "ret_period",
            "status",
            "provider_transaction_id",
            "request_payload_hash",
            "error_message",
            "requested_by",
            "submitted_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class IMSStatusSerializer(IMSBaseSerializer):
    int_tran_id = serializers.CharField(max_length=128)


class IMSInvoicesSerializer(IMSBaseSerializer):
    section = serializers.ChoiceField(choices=IMS_SECTION_CHOICES)
    status = serializers.ChoiceField(choices=IMS_STATUS_CHOICES)


class IMSInvoicesCountSerializer(IMSBaseSerializer):
    goods_type = serializers.ChoiceField(choices=IMS_GOODS_TYPE_CHOICES)


class IMSSupplierInvoicesSerializer(IMSBaseSerializer):
    ret_period = serializers.RegexField(
        IMS_RETURN_PERIOD_REGEX,
        error_messages={"invalid": "ret_period must use WhiteBooks MMYYYY format."},
    )
    section = serializers.ChoiceField(choices=IMS_SECTION_CHOICES)
    rtn_type = serializers.ChoiceField(choices=IMS_RETURN_TYPE_CHOICES)

    def validate_ret_period(self, value):
        if len(value) != 6:
            raise serializers.ValidationError("ret_period must use WhiteBooks MMYYYY format.")
        return value


class IMSRejectedInvoicesSerializer(IMSBaseSerializer):
    ret_period = serializers.RegexField(
        IMS_RETURN_PERIOD_REGEX,
        error_messages={"invalid": "ret_period must use WhiteBooks MMYYYY format."},
    )
    section = serializers.ChoiceField(choices=IMS_SECTION_CHOICES)

    def validate_ret_period(self, value):
        if len(value) != 6:
            raise serializers.ValidationError("ret_period must use WhiteBooks MMYYYY format.")
        return value


class IMSFileSerializer(IMSBaseSerializer):
    token = serializers.CharField(max_length=255)
