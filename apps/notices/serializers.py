from rest_framework import serializers

from apps.accounts.models import WorkspaceMembership
from apps.gstins.models import GSTIN
from apps.notices.models import Notice


class NoticeSerializer(serializers.ModelSerializer):
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    client_id = serializers.UUIDField(source="gstin.client_id", read_only=True)
    client_name = serializers.CharField(source="gstin.client.legal_name", read_only=True)
    workspace_id = serializers.UUIDField(source="gstin.client.workspace_id", read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    assigned_to_email = serializers.EmailField(source="assigned_to.email", read_only=True, allow_null=True)

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
            "assigned_to",
            "assigned_to_name",
            "assigned_to_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

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
