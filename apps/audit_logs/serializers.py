from rest_framework import serializers

from apps.audit_logs.models import AuditLog
from apps.common.security import sanitize_json


class AuditLogListSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_name",
            "workspace_id_ref",
            "client_id_ref",
            "gstin_id_ref",
            "compliance_period_id_ref",
            "action",
            "entity_type",
            "entity_id",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor is None:
            return "System"
        full_name = obj.actor.get_full_name().strip()
        return full_name or obj.actor.username


class AuditLogSerializer(AuditLogListSerializer):
    metadata = serializers.SerializerMethodField()
    before_state = serializers.SerializerMethodField()
    after_state = serializers.SerializerMethodField()

    class Meta(AuditLogListSerializer.Meta):
        fields = AuditLogListSerializer.Meta.fields + [
            "metadata",
            "before_state",
            "after_state",
        ]

    def get_metadata(self, obj):
        return sanitize_json(obj.metadata or {})

    def get_before_state(self, obj):
        return sanitize_json(obj.before_state or {})

    def get_after_state(self, obj):
        return sanitize_json(obj.after_state or {})
