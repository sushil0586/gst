from django.conf import settings
from rest_framework import serializers

from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.integrations.whitebooks.client import WhiteBooksClient


def _get_latest_auth_session(*, workspace, client, gstin):
    queryset = ProviderAuthSession.objects.filter(
        workspace=workspace,
        client=client,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        is_active=True,
    )
    if gstin is not None:
        queryset = queryset.filter(gstin=gstin)
    return queryset.order_by("-verified_at", "-updated_at", "-created_at").first()


def resolve_ims_provider_context(*, validated_data):
    workspace = validated_data["workspace"]
    client = validated_data["client"]
    gstin = validated_data["gstin"]
    auth_session = validated_data.get("auth_session") or _get_latest_auth_session(
        workspace=workspace,
        client=client,
        gstin=gstin,
    )
    txn = str(validated_data.get("txn") or getattr(auth_session, "txn", "") or "").strip()
    email = str(
        validated_data.get("email")
        or getattr(auth_session, "email", "")
        or validated_data.get("resolved_email")
        or settings.WHITEBOOKS_CONTACT_EMAIL
        or ""
    ).strip()

    if not txn:
        raise serializers.ValidationError(
            {"txn": "A verified WhiteBooks auth session or explicit txn is required before using IMS APIs."}
        )

    if auth_session is not None:
        freshness = get_provider_auth_session_freshness(auth_session=auth_session)
        if freshness["is_stale"]:
            raise serializers.ValidationError({"auth_session": freshness["stale_reason"]})

    return {
        "client": WhiteBooksClient(),
        "email": email,
        "txn": txn,
        "gstin_value": gstin.gstin,
        "state_code": gstin.state_code,
        "gst_username": gstin.whitebooks_gst_username or None,
    }


def ims_save(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    payload = {
        "rtin": context["gstin_value"],
        "reqtyp": "SAVE",
        "invdata": validated_data["invdata"],
    }
    response = context["client"].ims_save(
        email=context["email"],
        gstin=context["gstin_value"],
        ret_period=validated_data["ret_period"],
        txn=context["txn"],
        payload=payload,
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_reset(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    payload = {
        "rtin": context["gstin_value"],
        "reqtyp": "RESET",
        "invdata": validated_data["invdata"],
    }
    response = context["client"].ims_reset(
        email=context["email"],
        gstin=context["gstin_value"],
        ret_period=validated_data["ret_period"],
        txn=context["txn"],
        payload=payload,
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_status(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_status(
        email=context["email"],
        gstin=context["gstin_value"],
        int_tran_id=validated_data["int_tran_id"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_invoices(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_invoices(
        email=context["email"],
        gstin=context["gstin_value"],
        section=validated_data["section"],
        status=validated_data["status"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_invoices_count(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_invoices_count(
        email=context["email"],
        gstin=context["gstin_value"],
        goods_type=validated_data["goods_type"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_supplier_invoices(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_supplier_invoices(
        email=context["email"],
        gstin=context["gstin_value"],
        ret_period=validated_data["ret_period"],
        section=validated_data["section"],
        rtn_type=validated_data["rtn_type"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_rejected_invoices(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_rejected_invoices(
        email=context["email"],
        gstin=context["gstin_value"],
        ret_period=validated_data["ret_period"],
        section=validated_data["section"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)


def ims_get_file(*, validated_data):
    context = resolve_ims_provider_context(validated_data=validated_data)
    response = context["client"].ims_get_file(
        email=context["email"],
        gstin=context["gstin_value"],
        token=validated_data["token"],
        txn=context["txn"],
        state_code=context["state_code"],
        gst_username=context["gst_username"],
    )
    return context["client"].sanitize_response_payload(response)
