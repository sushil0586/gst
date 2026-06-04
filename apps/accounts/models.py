from django.conf import settings
from django.db import models

from apps.common.models import BaseModel
from apps.workspaces.models import Workspace


class WorkspaceRole(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    MANAGER = "manager", "Manager"
    ACCOUNTANT = "accountant", "Accountant"
    REVIEWER = "reviewer", "Reviewer"
    FILER = "filer", "Filer"
    SENIOR_CA = "senior_ca", "Senior CA"
    VIEWER = "viewer", "Viewer"


class WorkspaceMembership(BaseModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workspace_memberships")
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=32, choices=WorkspaceRole.choices)

    class Meta:
        db_table = "accounts_workspace_memberships"
        constraints = [
            models.UniqueConstraint(fields=["user", "workspace"], name="unique_workspace_membership"),
        ]
        indexes = [
            models.Index(fields=["workspace", "role"]),
            models.Index(fields=["user", "role"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.workspace} ({self.role})"
