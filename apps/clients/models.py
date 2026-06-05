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


class ClientContact(BaseModel):
    class PreferredContactMode(models.TextChoices):
        CALL = "call", "Call"
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="contacts")
    name = models.CharField(max_length=255)
    designation = models.CharField(max_length=128, blank=True)
    mobile_number = models.CharField(max_length=32, blank=True)
    alternate_mobile_number = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    is_primary = models.BooleanField(default=False)
    preferred_contact_mode = models.CharField(
        max_length=32,
        choices=PreferredContactMode.choices,
        default=PreferredContactMode.CALL,
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "client_contacts"
        ordering = ["-is_primary", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["client"],
                condition=models.Q(is_active=True, is_primary=True),
                name="unique_active_primary_contact_per_client",
            ),
        ]
        indexes = [
            models.Index(fields=["client", "is_primary"]),
            models.Index(fields=["mobile_number"]),
            models.Index(fields=["email"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.client.legal_name})"
