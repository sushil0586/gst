from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError, WhiteBooksTemporaryError
from apps.returns.models import PortalChallanRequest, ReturnPreparation


def generate_portal_challan(
    *,
    workspace_id,
    client_id,
    gstin_id,
    compliance_period_id,
    return_type: str,
    challan_reason: str,
    payment_mode: str,
    bank_code: str,
    sub_payment_mode: str,
    mobile_number: str,
    address: str,
    cgst_tax_amount: Decimal,
    igst_tax_amount: Decimal,
    sgst_tax_amount: Decimal,
    cess_tax_amount: Decimal,
    actor,
) -> PortalChallanRequest:
    if not settings.WHITEBOOKS_ENABLE_CHALLAN_GENERATION:
        raise serializers.ValidationError("WhiteBooks challan generation is not enabled for this environment.")
    context = _build_challan_context(
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
        return_type=return_type,
        challan_reason=challan_reason,
        payment_mode=payment_mode,
        bank_code=bank_code,
        sub_payment_mode=sub_payment_mode,
        mobile_number=mobile_number,
        address=address,
        cgst_tax_amount=cgst_tax_amount,
        igst_tax_amount=igst_tax_amount,
        sgst_tax_amount=sgst_tax_amount,
        cess_tax_amount=cess_tax_amount,
    )
    compliance_period = context["compliance_period"]
    prepared_return = context["prepared_return"]
    auth_session = context["auth_session"]
    gstin = context["gstin"]
    challan_period = context["challan_period"]
    request_payload = context["request_payload"]
    total_amount = context["total_amount"]

    request_record = PortalChallanRequest.objects.create(
        compliance_period=compliance_period,
        prepared_return=prepared_return,
        auth_session=auth_session,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=return_type,
        status=PortalChallanRequest.RequestStatus.CREATED,
        challan_reason=challan_reason,
        challan_period=challan_period,
        payment_mode=payment_mode,
        bank_code=bank_code,
        sub_payment_mode=sub_payment_mode,
        taxpayer_name=gstin.client.legal_name,
        address=address,
        mobile_number=mobile_number,
        request_payload=request_payload,
        total_amount=total_amount,
        created_by=actor if getattr(actor, "is_authenticated", False) else None,
        updated_by=actor if getattr(actor, "is_authenticated", False) else None,
    )

    record_audit_log(
        actor=actor,
        action="portal_challan.requested",
        entity=request_record,
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
        metadata={"return_type": return_type, "provider": ReturnFiling.Provider.WHITEBOOKS},
        after_state={"status": request_record.status, "total_amount": str(total_amount)},
    )

    client = WhiteBooksClient()
    state_code = context["state_code"]
    gst_username = context["gst_username"]

    try:
        response_payload = client.sanitize_response_payload(
            client.generate_challan(
                email=settings.WHITEBOOKS_CONTACT_EMAIL,
                gstin=gstin.gstin,
                ret_period=challan_period,
                txn=auth_session.txn,
                payload=request_payload,
                state_code=state_code,
                gst_username=gst_username,
            )
        )
    except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        request_record.status = PortalChallanRequest.RequestStatus.FAILED
        request_record.error_message = str(exc)
        request_record.save(update_fields=["status", "error_message", "updated_at", "updated_by"])
        record_audit_log(
            actor=actor,
            action="portal_challan.failed",
            entity=request_record,
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            compliance_period_id=compliance_period_id,
            metadata={"return_type": return_type, "provider": ReturnFiling.Provider.WHITEBOOKS},
            before_state={"status": PortalChallanRequest.RequestStatus.CREATED},
            after_state={"status": request_record.status, "error_message": request_record.error_message},
        )
        raise

    request_record.status = PortalChallanRequest.RequestStatus.SUBMITTED
    request_record.response_payload = response_payload
    request_record.cpin = _extract_cpin(response_payload)
    request_record.save(update_fields=["status", "response_payload", "cpin", "updated_at", "updated_by"])
    record_audit_log(
        actor=actor,
        action="portal_challan.generated",
        entity=request_record,
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
        metadata={"return_type": return_type, "provider": ReturnFiling.Provider.WHITEBOOKS},
        before_state={"status": PortalChallanRequest.RequestStatus.CREATED},
        after_state={"status": request_record.status, "cpin": request_record.cpin},
    )
    return request_record


def validate_portal_challan(
    *,
    workspace_id,
    client_id,
    gstin_id,
    compliance_period_id,
    return_type: str,
    challan_reason: str,
    payment_mode: str,
    bank_code: str,
    sub_payment_mode: str,
    mobile_number: str,
    address: str,
    cgst_tax_amount: Decimal,
    igst_tax_amount: Decimal,
    sgst_tax_amount: Decimal,
    cess_tax_amount: Decimal,
    actor,
) -> dict[str, Any]:
    context = _build_challan_context(
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
        return_type=return_type,
        challan_reason=challan_reason,
        payment_mode=payment_mode,
        bank_code=bank_code,
        sub_payment_mode=sub_payment_mode,
        mobile_number=mobile_number,
        address=address,
        cgst_tax_amount=cgst_tax_amount,
        igst_tax_amount=igst_tax_amount,
        sgst_tax_amount=sgst_tax_amount,
        cess_tax_amount=cess_tax_amount,
    )
    client = WhiteBooksClient()
    try:
        response_payload = client.sanitize_response_payload(
            client.validate_challan_reason(
                email=settings.WHITEBOOKS_CONTACT_EMAIL,
                gstin=context["gstin"].gstin,
                ret_period=context["challan_period"],
                txn=context["auth_session"].txn,
                payload=context["request_payload"],
                state_code=context["state_code"],
                gst_username=context["gst_username"],
            )
        )
        record_audit_log(
            actor=actor,
            action="portal_challan.validated",
            entity=context["prepared_return"],
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            compliance_period_id=compliance_period_id,
            metadata={"return_type": return_type, "provider": ReturnFiling.Provider.WHITEBOOKS},
            after_state={"valid": True, "challan_reason": challan_reason},
        )
        return {
            "valid": True,
            "error_message": "",
            "provider_response": response_payload,
            "computed_total_amount": f"{context['total_amount']:.2f}",
        }
    except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        record_audit_log(
            actor=actor,
            action="portal_challan.validation_failed",
            entity=context["prepared_return"],
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            compliance_period_id=compliance_period_id,
            metadata={"return_type": return_type, "provider": ReturnFiling.Provider.WHITEBOOKS},
            after_state={"valid": False, "challan_reason": challan_reason, "error_message": str(exc)},
        )
        return {
            "valid": False,
            "error_message": str(exc),
            "provider_response": {},
            "computed_total_amount": f"{context['total_amount']:.2f}",
        }


def _get_latest_auth_session(*, workspace_id, client_id, gstin_id) -> ProviderAuthSession | None:
    auth_sessions = ProviderAuthSession.objects.filter(
        is_active=True,
        workspace_id=workspace_id,
        client_id=client_id,
        provider=ReturnFiling.Provider.WHITEBOOKS,
    )
    if gstin_id:
        auth_sessions = auth_sessions.filter(gstin_id=gstin_id)
    return auth_sessions.filter(
        status__in=[ProviderAuthSession.SessionStatus.AUTH_TOKEN_RECEIVED, ProviderAuthSession.SessionStatus.SESSION_ACTIVE]
    ).order_by("-verified_at", "-created_at").first()


def _to_whitebooks_period(period: str) -> str:
    value = str(period or "").strip()
    if len(value) >= 7 and value[4] == "-":
        return f"{value[5:7]}{value[:4]}"
    return value.replace("-", "")


def _decimal_to_int(value: Decimal | str | int | float) -> int:
    return int(_as_decimal(value).quantize(Decimal("1")))


def _as_decimal(value: Decimal | str | int | float) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value or "0"))


def _extract_cpin(payload: Any) -> str:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if str(key).lower() == "cpin" and value:
                return str(value).strip()
            extracted = _extract_cpin(value)
            if extracted:
                return extracted
    if isinstance(payload, list):
        for entry in payload:
            extracted = _extract_cpin(entry)
            if extracted:
                return extracted
    return ""


def _build_challan_context(
    *,
    workspace_id,
    client_id,
    gstin_id,
    compliance_period_id,
    return_type: str,
    challan_reason: str,
    payment_mode: str,
    bank_code: str,
    sub_payment_mode: str,
    mobile_number: str,
    address: str,
    cgst_tax_amount: Decimal,
    igst_tax_amount: Decimal,
    sgst_tax_amount: Decimal,
    cess_tax_amount: Decimal,
) -> dict[str, Any]:
    if return_type != ReturnPreparation.ReturnType.GSTR3B:
        raise serializers.ValidationError({"return_type": "Portal challan actions are currently enabled only for GSTR-3B."})
    compliance_period = (
        CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace")
        .get(pk=compliance_period_id)
    )
    if compliance_period.gstin.client.workspace_id != workspace_id:
        raise serializers.ValidationError({"workspace": "Compliance period does not belong to the selected workspace."})
    if compliance_period.gstin.client_id != client_id:
        raise serializers.ValidationError({"client": "Compliance period does not belong to the selected client."})
    if compliance_period.gstin_id != gstin_id:
        raise serializers.ValidationError({"gstin": "Compliance period does not belong to the selected GSTIN."})
    prepared_return = (
        ReturnPreparation.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            return_type=return_type,
        )
        .order_by("-updated_at")
        .first()
    )
    if prepared_return is None:
        raise serializers.ValidationError({"return_type": "Prepare GSTR-3B before using portal challan actions."})
    auth_session = _get_latest_auth_session(
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
    )
    if auth_session is None:
        raise serializers.ValidationError("A verified WhiteBooks auth session is required before using portal challan actions.")
    freshness = get_provider_auth_session_freshness(auth_session=auth_session)
    if freshness["is_stale"]:
        raise serializers.ValidationError(freshness["stale_reason"])
    total_amount = _as_decimal(cgst_tax_amount) + _as_decimal(igst_tax_amount) + _as_decimal(sgst_tax_amount) + _as_decimal(cess_tax_amount)
    if total_amount <= Decimal("0.00"):
        raise serializers.ValidationError({"amounts": "At least one tax component amount must be greater than zero."})
    gstin = compliance_period.gstin
    challan_period = _to_whitebooks_period(compliance_period.period)
    state_code = str(getattr(gstin, "state_code", "") or "").strip()
    gst_username = str(getattr(gstin, "whitebooks_gst_username", "") or "").strip()
    request_payload = {
        "gstin": gstin.gstin,
        "email_id": settings.WHITEBOOKS_CONTACT_EMAIL,
        "mobile_num": mobile_number,
        "tp_name": gstin.client.legal_name,
        "address": address,
        "payment_mod": payment_mode,
        "bank_cd": bank_code,
        "sub_pay_mod": sub_payment_mode,
        "ipAddr": settings.WHITEBOOKS_IP_ADDRESS,
        "cgst_tax_amt": _decimal_to_int(cgst_tax_amount),
        "cgst_int_amt": 0,
        "cgst_fee_amt": 0,
        "cgst_oth_amt": 0,
        "cgst_pen_amt": 0,
        "igst_tax_amt": _decimal_to_int(igst_tax_amount),
        "igst_int_amt": 0,
        "igst_fee_amt": 0,
        "igst_oth_amt": 0,
        "igst_pen_amt": 0,
        "sgst_tax_amt": _decimal_to_int(sgst_tax_amount),
        "sgst_int_amt": 0,
        "sgst_fee_amt": 0,
        "sgst_oth_amt": 0,
        "sgst_pen_amt": 0,
        "cess_tax_amt": _decimal_to_int(cess_tax_amount),
        "cess_int_amt": 0,
        "cess_fee_amt": 0,
        "cess_oth_amt": 0,
        "cess_pen_amt": 0,
        "cgst_tot_amt": _decimal_to_int(cgst_tax_amount),
        "igst_tot_amt": _decimal_to_int(igst_tax_amount),
        "sgst_tot_amt": _decimal_to_int(sgst_tax_amount),
        "cess_tot_amt": _decimal_to_int(cess_tax_amount),
        "total_amt": _decimal_to_int(total_amount),
        "chln_rsn": challan_reason,
        "chln_prd": challan_period,
    }
    return {
        "compliance_period": compliance_period,
        "prepared_return": prepared_return,
        "auth_session": auth_session,
        "gstin": gstin,
        "challan_period": challan_period,
        "total_amount": total_amount,
        "request_payload": request_payload,
        "state_code": state_code,
        "gst_username": gst_username,
    }
