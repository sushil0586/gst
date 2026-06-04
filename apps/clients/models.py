from django.db import models

from apps.common.models import BaseModel
from apps.workspaces.models import Workspace


class Client(BaseModel):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="clients")
    legal_name = models.CharField(max_length=255)
    trade_name = models.CharField(max_length=255, blank=True)
    client_code = models.CharField(max_length=64)
    pan = models.CharField(max_length=10)
    email = models.EmailField(blank=True)

    class Meta:
        db_table = "clients"
        ordering = ["legal_name"]
        constraints = [
            models.UniqueConstraint(fields=["workspace", "client_code"], name="unique_client_code_per_workspace"),
        ]
        indexes = [
            models.Index(fields=["workspace", "legal_name"]),
            models.Index(fields=["workspace", "client_code"]),
            models.Index(fields=["pan"]),
        ]

    def __str__(self):
        return self.legal_name
