from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError, WhiteBooksTemporaryError
from apps.returns.models import ProviderReturnSummarySnapshot, ReturnPreparation


SUMMARY_CONFIG = {
    ReturnPreparation.ReturnType.GSTR1: {
        "fields": (
            ("total_taxable_value", "Total taxable value"),
            ("total_tax_amount", "Total tax amount"),
            ("document_count", "Document count"),
            ("b2b_taxable_value", "B2B taxable value"),
            ("b2b_tax_amount", "B2B tax amount"),
            ("b2c_taxable_value", "B2C taxable value"),
            ("b2c_tax_amount", "B2C tax amount"),
            ("credit_note_tax_amount", "Credit note tax amount"),
            ("debit_note_tax_amount", "Debit note tax amount"),
        ),
        "provider_keys": {
            "total_taxable_value": ("total_taxable_value", "totaltaxablevalue", "taxable_value", "taxablevalue", "txval"),
            "total_tax_amount": ("total_tax_amount", "totaltaxamount", "total_tax", "totaltax", "tax_amount", "taxamount", "iamt"),
            "document_count": ("document_count", "documentcount", "doc_count", "doccount", "record_count", "recordcount", "ttl_rec"),
            "b2b_taxable_value": ("b2b_taxable_value", "b2btaxablevalue", "b2b_txval", "b2btxval"),
            "b2b_tax_amount": ("b2b_tax_amount", "b2btaxamount", "b2b_tax", "b2btax"),
            "b2c_taxable_value": ("b2c_taxable_value", "b2ctaxablevalue", "b2c_txval", "b2ctxval"),
            "b2c_tax_amount": ("b2c_tax_amount", "b2ctaxamount", "b2c_tax", "b2ctax"),
            "credit_note_tax_amount": ("credit_note_tax_amount", "creditnotetaxamount", "cdnr_tax", "cdnrtax", "cdnur_tax", "cdnurtax"),
            "debit_note_tax_amount": ("debit_note_tax_amount", "debit_note_tax_amount", "debitnotetaxamount"),
        },
    },
    ReturnPreparation.ReturnType.GSTR3B: {
        "fields": (
            ("outward_tax_liability", "Outward tax liability"),
            ("eligible_itc", "Eligible ITC"),
            ("net_tax_payable", "Net tax payable"),
        ),
        "provider_keys": {
            "outward_tax_liability": (
                "outward_tax_liability",
                "total_tax_amount",
                "totaltaxamount",
                "total_tax",
                "tot_tax",
                "tax_liability",
                "taxliability",
                "ttl_tax",
            ),
            "eligible_itc": (
                "eligible_itc",
                "claim_ready_itc",
                "claimreadyitc",
                "itc_available",
                "itcavailable",
                "total_itc",
                "totalitc",
            ),
            "net_tax_payable": (
                "net_tax_payable",
                "nettaxpayable",
                "net_payable",
                "netpayable",
                "tax_payable",
                "taxpayable",
            ),
        },
    },
}


def compare_provider_summary(
    *,
    workspace_id,
    client_id,
    gstin_id,
    compliance_period_id,
    return_type: str,
    actor=None,
) -> ProviderReturnSummarySnapshot:
    if return_type not in SUMMARY_CONFIG:
        raise serializers.ValidationError({"return_type": "Provider summary comparison is currently enabled only for GSTR-1 and GSTR-3B."})
    if not settings.WHITEBOOKS_ENABLE_PROVIDER_SUMMARY_READS:
        raise serializers.ValidationError("WhiteBooks provider summary reads are not enabled for this environment.")

    compliance_period = _get_validated_compliance_period(
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
    )
    prepared_return = _get_prepared_return(compliance_period=compliance_period, return_type=return_type)
    if prepared_return is None:
        raise serializers.ValidationError({"return_type": f"Prepare {return_type.upper()} before comparing the provider summary."})

    auth_session = _get_latest_auth_session(workspace_id=workspace_id, client_id=client_id, gstin_id=gstin_id)
    if auth_session is None:
        raise serializers.ValidationError("A verified WhiteBooks auth session is required before comparing the provider summary.")
    freshness = get_provider_auth_session_freshness(auth_session=auth_session)
    if freshness["is_stale"]:
        raise serializers.ValidationError(freshness["stale_reason"])

    internal_summary = _build_internal_summary(prepared_return)
    threshold_amount = _get_threshold_amount()
    client = WhiteBooksClient()
    gstin = compliance_period.gstin
    state_code = str(getattr(gstin, "state_code", "") or "").strip()
    gst_username = str(getattr(gstin, "whitebooks_gst_username", "") or "").strip()
    ret_period = _to_whitebooks_period(compliance_period.period)
    user = actor if getattr(actor, "is_authenticated", False) else None

    try:
        provider_response = client.sanitize_response_payload(
            _fetch_provider_summary(
                client=client,
                return_type=return_type,
                email=settings.WHITEBOOKS_CONTACT_EMAIL,
                gstin=gstin.gstin,
                ret_period=ret_period,
                txn=auth_session.txn,
                state_code=state_code,
                gst_username=gst_username,
            )
        )
    except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
        snapshot = ProviderReturnSummarySnapshot.objects.create(
            compliance_period=compliance_period,
            prepared_return=prepared_return,
            auth_session=auth_session,
            provider=ReturnFiling.Provider.WHITEBOOKS,
            return_type=return_type,
            fetched_at=timezone.now(),
            status=ProviderReturnSummarySnapshot.ComparisonStatus.PROVIDER_UNAVAILABLE,
            threshold_amount=threshold_amount,
            internal_summary=internal_summary,
            provider_response={},
            normalized_provider_summary={},
            comparison_summary={
                "status": ProviderReturnSummarySnapshot.ComparisonStatus.PROVIDER_UNAVAILABLE,
                "threshold_amount": _decimal_to_string(threshold_amount),
                "rows": [],
                "source": "live_fetch",
            },
            error_message=str(exc),
            created_by=user,
            updated_by=user,
        )
        _record_compare_audit(
            actor=actor,
            action="provider_summary.compare_failed",
            snapshot=snapshot,
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            compliance_period_id=compliance_period_id,
        )
        return snapshot

    normalized_provider_summary = _normalize_provider_summary(provider_response, return_type=return_type)
    comparison_summary = _build_comparison_summary(
        internal_summary=internal_summary,
        provider_summary=normalized_provider_summary,
        return_type=return_type,
        threshold_amount=threshold_amount,
    )
    snapshot = ProviderReturnSummarySnapshot.objects.create(
        compliance_period=compliance_period,
        prepared_return=prepared_return,
        auth_session=auth_session,
        provider=ReturnFiling.Provider.WHITEBOOKS,
        return_type=return_type,
        fetched_at=timezone.now(),
        status=comparison_summary["status"],
        threshold_amount=threshold_amount,
        internal_summary=internal_summary,
        provider_response=provider_response,
        normalized_provider_summary=normalized_provider_summary,
        comparison_summary=comparison_summary,
        created_by=user,
        updated_by=user,
    )
    _record_compare_audit(
        actor=actor,
        action="provider_summary.compare_completed",
        snapshot=snapshot,
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
    )
    return snapshot


compare_gstr3b_provider_summary = compare_provider_summary


def _get_validated_compliance_period(*, workspace_id, client_id, gstin_id, compliance_period_id) -> CompliancePeriod:
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
    return compliance_period


def _get_prepared_return(*, compliance_period: CompliancePeriod, return_type: str) -> ReturnPreparation | None:
    return (
        ReturnPreparation.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            return_type=return_type,
        )
        .order_by("-updated_at")
        .first()
    )


def _get_latest_auth_session(*, workspace_id, client_id, gstin_id) -> ProviderAuthSession | None:
    return (
        ProviderAuthSession.objects.filter(
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            provider=ReturnFiling.Provider.WHITEBOOKS,
            status=ProviderAuthSession.SessionStatus.SESSION_ACTIVE,
            response_contract_confirmed=True,
        )
        .order_by("-verified_at", "-updated_at")
        .first()
    )


def _fetch_provider_summary(
    *,
    client: WhiteBooksClient,
    return_type: str,
    email: str,
    gstin: str,
    ret_period: str,
    txn: str,
    state_code: str,
    gst_username: str,
) -> dict[str, Any]:
    if return_type == ReturnPreparation.ReturnType.GSTR1:
        return client.get_gstr1_return_summary(
            email=email,
            gstin=gstin,
            ret_period=ret_period,
            txn=txn,
            state_code=state_code,
            gst_username=gst_username,
        )
    return client.get_gstr3b_return_summary(
        email=email,
        gstin=gstin,
        ret_period=ret_period,
        txn=txn,
        state_code=state_code,
        gst_username=gst_username,
    )


def _build_internal_summary(prepared_return: ReturnPreparation) -> dict[str, str]:
    summary = prepared_return.summary_snapshot if isinstance(prepared_return.summary_snapshot, dict) else {}
    outward_supplies = summary.get("outward_supplies") if isinstance(summary.get("outward_supplies"), dict) else {}
    if prepared_return.return_type == ReturnPreparation.ReturnType.GSTR1:
        return {
            "prepared_return_id": str(prepared_return.id),
            "prepared_return_status": prepared_return.status,
            "total_taxable_value": _decimal_to_string(_as_decimal(outward_supplies.get("total_taxable_value"))),
            "total_tax_amount": _decimal_to_string(_as_decimal(outward_supplies.get("total_tax_amount"))),
            "document_count": _decimal_to_string(_as_decimal(outward_supplies.get("document_count"))),
            "b2b_taxable_value": _decimal_to_string(_as_decimal(outward_supplies.get("b2b_taxable_value"))),
            "b2b_tax_amount": _decimal_to_string(_as_decimal(outward_supplies.get("b2b_tax_amount"))),
            "b2c_taxable_value": _decimal_to_string(_as_decimal(outward_supplies.get("b2c_taxable_value"))),
            "b2c_tax_amount": _decimal_to_string(_as_decimal(outward_supplies.get("b2c_tax_amount"))),
            "credit_note_tax_amount": _decimal_to_string(_as_decimal(outward_supplies.get("credit_note_tax_amount"))),
            "debit_note_tax_amount": _decimal_to_string(_as_decimal(outward_supplies.get("debit_note_tax_amount"))),
        }
    itc_summary = summary.get("itc_summary") if isinstance(summary.get("itc_summary"), dict) else {}
    return {
        "prepared_return_id": str(prepared_return.id),
        "prepared_return_status": prepared_return.status,
        "outward_tax_liability": _decimal_to_string(
            _as_decimal(outward_supplies.get("outward_tax_liability") or outward_supplies.get("total_tax_amount"))
        ),
        "eligible_itc": _decimal_to_string(
            _as_decimal(itc_summary.get("eligible_itc") or itc_summary.get("claim_ready_itc"))
        ),
        "net_tax_payable": _decimal_to_string(_as_decimal(itc_summary.get("net_tax_payable"))),
    }


def _normalize_provider_summary(payload: dict[str, Any], *, return_type: str) -> dict[str, str | bool]:
    normalized: dict[str, str | bool] = {}
    provider_keys = SUMMARY_CONFIG[return_type]["provider_keys"]
    for field, candidate_keys in provider_keys.items():
        value = _find_amount(payload, candidate_keys)
        normalized[field] = _decimal_to_string(_as_decimal(value)) if value is not None else "0.00"
        normalized[f"{field}_present"] = value is not None
    return normalized


def _build_comparison_summary(
    *,
    internal_summary: dict[str, str],
    provider_summary: dict[str, str | bool],
    return_type: str,
    threshold_amount: Decimal,
) -> dict[str, Any]:
    rows = []
    mismatch_count = 0
    within_threshold_count = 0
    matched_count = 0

    for field, label in SUMMARY_CONFIG[return_type]["fields"]:
        internal_amount = _as_decimal(internal_summary.get(field))
        provider_present = bool(provider_summary.get(f"{field}_present"))
        provider_amount = _as_decimal(provider_summary.get(field))
        difference_amount = internal_amount - provider_amount
        absolute_difference = abs(difference_amount)
        if not provider_present or absolute_difference > threshold_amount:
            severity = "mismatch"
            mismatch_count += 1
        elif absolute_difference > Decimal("0.00"):
            severity = "within_threshold"
            within_threshold_count += 1
        else:
            severity = "match"
            matched_count += 1
        rows.append(
            {
                "field": field,
                "label": label,
                "internal_amount": _decimal_to_string(internal_amount),
                "provider_amount": _decimal_to_string(provider_amount),
                "difference_amount": _decimal_to_string(difference_amount),
                "absolute_difference": _decimal_to_string(absolute_difference),
                "provider_present": provider_present,
                "severity": severity,
            }
        )

    if mismatch_count:
        status = ProviderReturnSummarySnapshot.ComparisonStatus.MISMATCH
    elif within_threshold_count:
        status = ProviderReturnSummarySnapshot.ComparisonStatus.WITHIN_THRESHOLD
    else:
        status = ProviderReturnSummarySnapshot.ComparisonStatus.MATCHED

    return {
        "status": status,
        "threshold_amount": _decimal_to_string(threshold_amount),
        "matched_count": matched_count,
        "within_threshold_count": within_threshold_count,
        "mismatch_count": mismatch_count,
        "compared_fields": [field for field, _label in SUMMARY_CONFIG[return_type]["fields"]],
        "rows": rows,
        "source": "live_fetch",
    }


def _find_amount(value: Any, candidate_keys: tuple[str, ...]) -> Any:
    candidates = {_normalize_key(key) for key in candidate_keys}
    if isinstance(value, dict):
        for key, child in value.items():
            if _normalize_key(key) in candidates and child not in (None, ""):
                return child
        for child in value.values():
            found = _find_amount(child, candidate_keys)
            if found is not None:
                return found
    if isinstance(value, list):
        for child in value:
            found = _find_amount(child, candidate_keys)
            if found is not None:
                return found
    return None


def _normalize_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _get_threshold_amount() -> Decimal:
    return _as_decimal(getattr(settings, "PROVIDER_SUMMARY_COMPARE_THRESHOLD_AMOUNT", "1.00"))


def _as_decimal(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0.00")
    try:
        return Decimal(str(value).replace(",", "")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def _decimal_to_string(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01'))}"


def _to_whitebooks_period(period: str) -> str:
    value = str(period or "").strip()
    if len(value) >= 7 and value[4] == "-":
        return f"{value[5:7]}{value[:4]}"
    return value.replace("-", "")


def _record_compare_audit(*, actor, action: str, snapshot: ProviderReturnSummarySnapshot, workspace_id, client_id, gstin_id, compliance_period_id) -> None:
    record_audit_log(
        actor=actor,
        action=action,
        entity=snapshot,
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
        compliance_period_id=compliance_period_id,
        metadata={
            "return_type": snapshot.return_type,
            "provider": snapshot.provider,
        },
        after_state={
            "status": snapshot.status,
            "mismatch_count": snapshot.comparison_summary.get("mismatch_count", 0),
            "error_message": snapshot.error_message,
        },
    )
