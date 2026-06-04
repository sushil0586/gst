from django.db import models

from apps.clients.models import Client
from apps.common.models import BaseModel


class GSTIN(BaseModel):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="gstins")
    gstin = models.CharField(max_length=15, unique=True)
    registration_type = models.CharField(max_length=64, default="regular")
    state_code = models.CharField(max_length=2)
    whitebooks_gst_username = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "gstins"
        ordering = ["gstin"]
        indexes = [
            models.Index(fields=["client", "gstin"]),
            models.Index(fields=["state_code"]),
        ]

    def __str__(self):
        return self.gstin


class GSTINTaxpayerProfile(BaseModel):
    gstin = models.OneToOneField(GSTIN, on_delete=models.CASCADE, related_name="taxpayer_profile")
    legal_name = models.CharField(max_length=255, blank=True, default="")
    trade_name = models.CharField(max_length=255, blank=True, default="")
    registration_type = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=64, blank=True, default="")
    constitution = models.CharField(max_length=128, blank=True, default="")
    registration_date = models.CharField(max_length=32, blank=True, default="")
    last_updated_date = models.CharField(max_length=32, blank=True, default="")
    state_jurisdiction_code = models.CharField(max_length=64, blank=True, default="")
    state_jurisdiction_name = models.CharField(max_length=255, blank=True, default="")
    center_jurisdiction_code = models.CharField(max_length=64, blank=True, default="")
    center_jurisdiction_name = models.CharField(max_length=255, blank=True, default="")
    principal_address = models.JSONField(default=dict, blank=True)
    additional_addresses = models.JSONField(default=list, blank=True)
    nature_of_business = models.JSONField(default=list, blank=True)
    einvoice_status = models.CharField(max_length=64, blank=True, default="")
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "gstin_taxpayer_profiles"
        ordering = ["gstin__gstin"]

    def __str__(self):
        return f"{self.gstin.gstin} taxpayer profile"
