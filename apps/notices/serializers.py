from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import WorkspaceMembership
from apps.clients.models import Client
from apps.customer_operations.models import OperationalFollowUp
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.gstins.models import GSTIN
from apps.notices.models import Notice, NoticeSyncEvent
from apps.workspaces.models import Workspace


class NoticeSerializer(serializers.ModelSerializer):
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    client_id = serializers.UUIDField(source="gstin.client_id", read_only=True)
    client_name = serializers.CharField(source="gstin.client.legal_name", read_only=True)
    workspace_id = serializers.UUIDField(source="gstin.client.workspace_id", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    assigned_to_email = serializers.EmailField(source="assigned_to.email", read_only=True, allow_null=True)
    open_follow_up_count = serializers.SerializerMethodField()
    overdue_follow_up_count = serializers.SerializerMethodField()
    latest_follow_up_id = serializers.SerializerMethodField()
    latest_follow_up_title = serializers.SerializerMethodField()
    latest_follow_up_status = serializers.SerializerMethodField()
    latest_follow_up_priority = serializers.SerializerMethodField()
    latest_follow_up_due_at = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = [
            "id",
            "gstin",
            "gstin_value",
            "client_id",
            "client_name",
            "workspace_id",
            "reference_number",
            "title",
            "description",
            "status",
            "due_date",
            "provider",
            "provider_reference_id",
            "provider_notice_type",
            "provider_status",
            "provider_due_date",
            "provider_payload",
            "provider_detail_payload",
            "provider_synced_at",
            "provider_detail_synced_at",
            "provider_last_error",
            "assigned_to",
            "assigned_to_name",
            "assigned_to_email",
            "open_follow_up_count",
            "overdue_follow_up_count",
            "latest_follow_up_id",
            "latest_follow_up_title",
            "latest_follow_up_status",
            "latest_follow_up_priority",
            "latest_follow_up_due_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "provider",
            "provider_reference_id",
            "provider_notice_type",
            "provider_status",
            "provider_due_date",
            "provider_payload",
            "provider_detail_payload",
            "provider_synced_at",
            "provider_detail_synced_at",
            "provider_last_error",
            "open_follow_up_count",
            "overdue_follow_up_count",
            "latest_follow_up_id",
            "latest_follow_up_title",
            "latest_follow_up_status",
            "latest_follow_up_priority",
            "latest_follow_up_due_at",
            "created_at",
            "updated_at",
        ]

    def get_assigned_to_name(self, obj):
        if obj.assigned_to is None:
            return None
        full_name = obj.assigned_to.get_full_name().strip()
        return full_name or obj.assigned_to.username

    def validate_assigned_to(self, value):
        if value is None:
            return value
        gstin_id = self.initial_data.get("gstin") if "gstin" in self.initial_data else None
        workspace_id = None
        if gstin_id:
            try:
                workspace_id = GSTIN.objects.select_related("client").get(pk=gstin_id).client.workspace_id
            except GSTIN.DoesNotExist:
                workspace_id = None
        elif self.instance is not None:
            workspace_id = self.instance.gstin.client.workspace_id

        if workspace_id and not WorkspaceMembership.objects.filter(
            user=value,
            workspace_id=workspace_id,
            is_active=True,
        ).exists():
            raise serializers.ValidationError("Assignee must belong to the selected workspace.")
        return value

    def get_open_follow_up_count(self, obj):
        return self._open_follow_ups(obj).count()

    def get_overdue_follow_up_count(self, obj):
        return self._open_follow_ups(obj).filter(due_at__lt=timezone.now()).count()

    def get_latest_follow_up_id(self, obj):
        follow_up = self._latest_follow_up(obj)
        return str(follow_up.id) if follow_up else None

    def get_latest_follow_up_title(self, obj):
        follow_up = self._latest_follow_up(obj)
        return follow_up.title if follow_up else None

    def get_latest_follow_up_status(self, obj):
        follow_up = self._latest_follow_up(obj)
        return follow_up.status if follow_up else None

    def get_latest_follow_up_priority(self, obj):
        follow_up = self._latest_follow_up(obj)
        return follow_up.priority if follow_up else None

    def get_latest_follow_up_due_at(self, obj):
        follow_up = self._latest_follow_up(obj)
        return follow_up.due_at.isoformat() if follow_up else None

    def _latest_follow_up(self, obj):
        return self._open_follow_ups(obj).order_by("due_at", "-created_at").first()

    def _open_follow_ups(self, obj):
        return obj.operational_follow_ups.filter(is_active=True).exclude(
            status__in=[
                OperationalFollowUp.FollowUpStatus.COMPLETED,
                OperationalFollowUp.FollowUpStatus.CANCELLED,
            ]
        )


class NoticeSyncEventSerializer(serializers.ModelSerializer):
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    client_id = serializers.UUIDField(source="gstin.client_id", read_only=True)
    client_name = serializers.CharField(source="gstin.client.legal_name", read_only=True)
    workspace_id = serializers.UUIDField(source="gstin.client.workspace_id", read_only=True)
    initiated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = NoticeSyncEvent
        fields = [
            "id",
            "gstin",
            "gstin_value",
            "client_id",
            "client_name",
            "workspace_id",
            "notice",
            "reference_number",
            "provider",
            "event_type",
            "status",
            "provider_reference_id",
            "message",
            "counters",
            "provider_payload",
            "error_message",
            "initiated_by",
            "initiated_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_initiated_by_name(self, obj):
        if obj.initiated_by is None:
            return "System"
        full_name = obj.initiated_by.get_full_name().strip()
        return full_name or obj.initiated_by.username


class WhiteBooksNoticeSyncSerializer(serializers.Serializer):
    workspace = serializers.PrimaryKeyRelatedField(queryset=Workspace.objects.all())
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.select_related("workspace"))
    gstin = serializers.PrimaryKeyRelatedField(queryset=GSTIN.objects.select_related("client__workspace"))
    auth_session = serializers.PrimaryKeyRelatedField(
        queryset=ProviderAuthSession.objects.select_related("workspace", "client", "gstin"),
        required=False,
        allow_null=True,
    )
    email = serializers.EmailField(required=False, allow_blank=True)
    txn = serializers.CharField(required=False, allow_blank=True, max_length=128)
    date = serializers.DateField(required=False)

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
                raise serializers.ValidationError(
                    {"auth_session": "Auth session does not belong to the selected GSTIN."}
                )
            freshness = get_provider_auth_session_freshness(auth_session=auth_session)
            if freshness["is_stale"]:
                raise serializers.ValidationError({"auth_session": freshness["stale_reason"]})

        attrs["resolved_email"] = attrs.get("email") or (
            auth_session.email if auth_session is not None else settings.WHITEBOOKS_CONTACT_EMAIL
        )
        return attrs


class WhiteBooksNoticeDetailFetchSerializer(serializers.Serializer):
    auth_session = serializers.PrimaryKeyRelatedField(
        queryset=ProviderAuthSession.objects.select_related("workspace", "client", "gstin"),
        required=False,
        allow_null=True,
    )
    email = serializers.EmailField(required=False, allow_blank=True)
    txn = serializers.CharField(required=False, allow_blank=True, max_length=128)

    def validate(self, attrs):
        notice = self.context["notice"]
        auth_session = attrs.get("auth_session")

        if auth_session is not None:
            if auth_session.provider != ReturnFiling.Provider.WHITEBOOKS:
                raise serializers.ValidationError({"auth_session": "Only WhiteBooks auth sessions are supported."})
            if auth_session.workspace_id != notice.gstin.client.workspace_id or auth_session.client_id != notice.gstin.client_id:
                raise serializers.ValidationError(
                    {"auth_session": "Auth session does not belong to the selected workspace and client."}
                )
            if auth_session.gstin_id and auth_session.gstin_id != notice.gstin_id:
                raise serializers.ValidationError(
                    {"auth_session": "Auth session does not belong to the selected GSTIN."}
                )
            freshness = get_provider_auth_session_freshness(auth_session=auth_session)
            if freshness["is_stale"]:
                raise serializers.ValidationError({"auth_session": freshness["stale_reason"]})

        attrs["resolved_email"] = attrs.get("email") or (
            auth_session.email if auth_session is not None else settings.WHITEBOOKS_CONTACT_EMAIL
        )
        return attrs
