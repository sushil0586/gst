from django.db import models

from apps.common.models import BaseModel


class Organization(BaseModel):
    name = models.CharField(max_length=255, unique=True)
    code = models.CharField(max_length=50, unique=True)

    class Meta:
        db_table = "organizations"
        ordering = ["name"]
        indexes = [models.Index(fields=["name"]), models.Index(fields=["code"])]

    def __str__(self):
        return self.name
