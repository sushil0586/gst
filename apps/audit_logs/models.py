from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class AuditLog(BaseModel):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
        null=True,
        blank=True,
    )
    workspace_id_ref = models.UUIDField(null=True, blank=True)
    client_id_ref = models.UUIDField(null=True, blank=True)
    gstin_id_ref = models.UUIDField(null=True, blank=True)
    compliance_period_id_ref = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=64)
    entity_type = models.CharField(max_length=64)
    entity_id = models.UUIDField()
    metadata = models.JSONField(default=dict, blank=True)
    before_state = models.JSONField(default=dict, blank=True)
    after_state = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace_id_ref", "action"]),
            models.Index(fields=["client_id_ref", "action"]),
            models.Index(fields=["gstin_id_ref", "action"]),
            models.Index(fields=["compliance_period_id_ref", "action"]),
            models.Index(fields=["entity_type", "entity_id"]),
        ]
