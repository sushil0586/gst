from django.db import models

from apps.common.models import BaseModel
from apps.organizations.models import Organization


class Workspace(BaseModel):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="workspaces")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")

    class Meta:
        db_table = "workspaces"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="unique_workspace_code_per_org"),
            models.UniqueConstraint(fields=["organization", "name"], name="unique_workspace_name_per_org"),
        ]
        indexes = [
            models.Index(fields=["organization", "name"]),
            models.Index(fields=["organization", "code"]),
        ]

    def __str__(self):
        return self.name
