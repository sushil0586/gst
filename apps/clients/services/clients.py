from django.db import transaction
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.clients.models import Client, ClientContact
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.gstins.models import GSTIN, GSTINTaxpayerProfile


def create_client(*, serializer, user):
    instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="client.created",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.id,
        metadata={"legal_name": instance.legal_name},
    )
    return instance


def update_client(*, serializer, user):
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="client.updated",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.id,
        metadata={"legal_name": instance.legal_name},
    )
    return instance


def deactivate_client(*, instance, user):
    active_transaction_count = GSTTransaction.objects.filter(client=instance, is_active=True).count()
    if active_transaction_count > 0:
        raise serializers.ValidationError(
            {"client": "This client cannot be deleted because active transactions exist against it."}
        )

    instance.is_active = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "updated_by", "updated_at"])
    GSTIN.objects.filter(client=instance, is_active=True).update(is_active=False, updated_by=user)
    CompliancePeriod.objects.filter(gstin__client=instance, is_active=True).update(is_active=False, updated_by=user)
    record_audit_log(
        actor=user,
        action="client.deleted",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.id,
        metadata={"transaction_count": active_transaction_count},
    )


@transaction.atomic
def create_client_bootstrap(*, validated_data, user):
    workspace_id = validated_data.pop("workspace")
    gstin_value = validated_data.pop("gstin", "")
    registration_type = validated_data.pop("registration_type", "")
    state_code = validated_data.pop("state_code", "")
    whitebooks_gst_username = validated_data.pop("whitebooks_gst_username", "")
    taxpayer_lookup_payload = validated_data.pop("taxpayer_lookup_payload", None)

    client = Client.objects.create(
        **validated_data,
        workspace_id=workspace_id,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="client.created",
        entity=client,
        workspace_id=client.workspace_id,
        client_id=client.id,
        metadata={"legal_name": client.legal_name, "source": "bootstrap"},
    )

    gstin = None
    taxpayer_profile = None
    if gstin_value:
        gstin = GSTIN.objects.create(
            client=client,
            gstin=gstin_value,
            registration_type=registration_type or "regular",
            state_code=state_code or gstin_value[:2],
            whitebooks_gst_username=whitebooks_gst_username or "",
            created_by=user,
            updated_by=user,
        )
        record_audit_log(
            actor=user,
            action="gstin.created",
            entity=gstin,
            workspace_id=client.workspace_id,
            client_id=client.id,
            metadata={"gstin": gstin.gstin, "source": "client_bootstrap"},
        )
        if taxpayer_lookup_payload:
            taxpayer_profile = upsert_gstin_taxpayer_profile(
                gstin=gstin,
                raw_payload=taxpayer_lookup_payload,
                user=user,
            )
    return {
        "client": client,
        "gstin": gstin,
        "taxpayer_profile": taxpayer_profile,
    }


def upsert_gstin_taxpayer_profile(*, gstin, raw_payload, user):
    payload = raw_payload if isinstance(raw_payload, dict) else {}
    candidate = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    principal_address = candidate.get("pradr", {}) if isinstance(candidate, dict) else {}
    defaults = {
        "legal_name": str(candidate.get("lgnm", "") or ""),
        "trade_name": str(candidate.get("tradeNam", "") or candidate.get("trdnam", "") or ""),
        "registration_type": str(candidate.get("dty", "") or ""),
        "status": str(candidate.get("sts", "") or ""),
        "constitution": str(candidate.get("ctb", "") or ""),
        "registration_date": str(candidate.get("rgdt", "") or ""),
        "last_updated_date": str(candidate.get("lstupdt", "") or ""),
        "state_jurisdiction_code": str(candidate.get("stjCd", "") or ""),
        "state_jurisdiction_name": str(candidate.get("stj", "") or ""),
        "center_jurisdiction_code": str(candidate.get("ctjCd", "") or ""),
        "center_jurisdiction_name": str(candidate.get("ctj", "") or ""),
        "principal_address": principal_address if isinstance(principal_address, dict) else {},
        "additional_addresses": candidate.get("adadr", []) if isinstance(candidate.get("adadr"), list) else [],
        "nature_of_business": candidate.get("nba", []) if isinstance(candidate.get("nba"), list) else [],
        "einvoice_status": str(candidate.get("einvoiceStatus", "") or ""),
        "raw_payload": payload,
        "updated_by": user,
    }
    profile, created = GSTINTaxpayerProfile.objects.update_or_create(
        gstin=gstin,
        defaults=defaults | ({"created_by": user} if not GSTINTaxpayerProfile.objects.filter(gstin=gstin).exists() else {}),
    )
    record_audit_log(
        actor=user,
        action="gstin.taxpayer_profile_saved" if created else "gstin.taxpayer_profile_updated",
        entity=profile,
        workspace_id=gstin.client.workspace_id,
        client_id=gstin.client_id,
        metadata={"gstin": gstin.gstin},
    )
    return profile


def create_client_contact(*, serializer, user):
    with transaction.atomic():
        client = serializer.validated_data["client"]
        is_primary = serializer.validated_data.get("is_primary", False)
        if is_primary:
            ClientContact.objects.filter(client=client, is_active=True, is_primary=True).update(is_primary=False)
        instance = serializer.save(created_by=user, updated_by=user)
    record_audit_log(
        actor=user,
        action="client_contact.created",
        entity=instance,
        workspace_id=instance.client.workspace_id,
        client_id=instance.client_id,
        metadata={"name": instance.name, "is_primary": instance.is_primary},
    )
    return instance


def update_client_contact(*, serializer, user):
    with transaction.atomic():
        client = serializer.instance.client
        is_primary = serializer.validated_data.get("is_primary", serializer.instance.is_primary)
        if is_primary:
            ClientContact.objects.filter(client=client, is_active=True, is_primary=True).exclude(pk=serializer.instance.pk).update(is_primary=False)
        instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="client_contact.updated",
        entity=instance,
        workspace_id=instance.client.workspace_id,
        client_id=instance.client_id,
        metadata={"name": instance.name, "is_primary": instance.is_primary},
    )
    return instance


def deactivate_client_contact(*, instance, user):
    instance.is_active = False
    instance.is_primary = False
    instance.updated_by = user
    instance.save(update_fields=["is_active", "is_primary", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="client_contact.deleted",
        entity=instance,
        workspace_id=instance.client.workspace_id,
        client_id=instance.client_id,
        metadata={"name": instance.name},
    )
