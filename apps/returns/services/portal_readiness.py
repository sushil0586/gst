from __future__ import annotations

import calendar
from datetime import date
from typing import Any

from django.conf import settings
from django.utils import timezone

from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ProviderAuthSession, ReturnFiling
from apps.filings.services.auth_session_freshness import get_provider_auth_session_freshness
from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import WhiteBooksSubmissionError, WhiteBooksTemporaryError
from apps.returns.models import PortalLedgerSnapshot, ReturnPreparation


RETURN_TYPE_TO_WHITEBOOKS = {
    ReturnPreparation.ReturnType.GSTR1: "GSTR1",
    ReturnPreparation.ReturnType.GSTR3B: "GSTR3B",
    ReturnPreparation.ReturnType.GSTR7: "GSTR7",
    ReturnPreparation.ReturnType.GSTR9: "GSTR9",
    ReturnPreparation.ReturnType.GSTR9C: "GSTR9C",
}

LEDGER_EVIDENCE_COMPONENTS = (
    ("balance", "balance_response"),
    ("taxpayable", "taxpayable_response"),
    ("cash_ledger", "cash_ledger_response"),
    ("itc_ledger", "itc_ledger_response"),
    ("liability_ledger", "liability_ledger_response"),
)
PAYMENT_EVIDENCE_COMPONENTS = (
    ("challan_history", "challan_history_response"),
)


def get_portal_filing_readiness(*, workspace_id, client_id, gstin_id, compliance_period_id, return_type: str, actor=None) -> dict:
    compliance_period = (
        CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace")
        .get(pk=compliance_period_id)
    )
    if compliance_period.gstin.client.workspace_id != workspace_id:
        raise ValueError("Compliance period does not belong to the selected workspace.")
    if compliance_period.gstin.client_id != client_id:
        raise ValueError("Compliance period does not belong to the selected client.")
    if compliance_period.gstin_id != gstin_id:
        raise ValueError("Compliance period does not belong to the selected GSTIN.")

    prepared_return = (
        ReturnPreparation.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            return_type=return_type,
        )
        .order_by("-updated_at")
        .first()
    )

    blockers: list[str] = []
    warnings: list[str] = []
    ledger_reads_enabled = bool(settings.WHITEBOOKS_ENABLE_LEDGER_READS)
    payment_reads_enabled = bool(settings.WHITEBOOKS_ENABLE_PAYMENT_READS)
    auth_session = _get_latest_auth_session(
        workspace_id=workspace_id,
        client_id=client_id,
        gstin_id=gstin_id,
    )

    auth_payload = {
        "available": auth_session is not None,
        "session_id": str(auth_session.id) if auth_session else None,
        "status": auth_session.status if auth_session else "",
        "freshness_summary": _build_freshness_summary(auth_session),
    }

    if not ledger_reads_enabled:
        blockers.append("WhiteBooks ledger reads are not enabled for this environment.")
    if auth_session is None:
        blockers.append("A verified WhiteBooks auth session is required before portal balances can be fetched.")
    elif auth_payload["freshness_summary"]["is_stale"]:
        blockers.append(auth_payload["freshness_summary"]["stale_reason"])

    ret_period = _to_whitebooks_period(compliance_period.period)
    whitebooks_return_type = RETURN_TYPE_TO_WHITEBOOKS.get(return_type, "")
    client = WhiteBooksClient()
    balance_response = None
    taxpayable_response = None
    cash_ledger_response = None
    itc_ledger_response = None
    liability_ledger_response = None
    challan_history_response = None
    challan_summary_response = None
    challan_reference = ""
    transport_errors: list[str] = []

    computed_summary = _build_computed_summary(prepared_return)
    latest_snapshot = _get_latest_snapshot(compliance_period_id=compliance_period.id, return_type=return_type)
    captured_snapshot = None

    if not blockers:
        gstin = compliance_period.gstin
        state_code = str(getattr(gstin, "state_code", "") or "").strip()
        gst_username = str(getattr(gstin, "whitebooks_gst_username", "") or "").strip()
        from_date, to_date = _to_period_date_range(compliance_period.period)

        try:
            balance_response = client.sanitize_response_payload(
                client.get_cash_itc_balance(
                    email=settings.WHITEBOOKS_CONTACT_EMAIL,
                    gstin=gstin.gstin,
                    ret_period=ret_period,
                    txn=auth_session.txn,
                    state_code=state_code,
                    gst_username=gst_username,
                )
            )
        except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            warnings.append("Portal balance evidence could not be fetched right now.")
            transport_errors.append(f"balance: {exc}")

        try:
            taxpayable_response = client.sanitize_response_payload(
                client.get_tax_payable_balance(
                    email=settings.WHITEBOOKS_CONTACT_EMAIL,
                    gstin=gstin.gstin,
                    ret_period=ret_period,
                    return_type=whitebooks_return_type,
                    txn=auth_session.txn,
                    state_code=state_code,
                    gst_username=gst_username,
                )
            )
        except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            warnings.append("Portal tax payable evidence could not be fetched right now.")
            transport_errors.append(f"taxpayable: {exc}")

        try:
            cash_ledger_response = client.sanitize_response_payload(
                client.get_cash_ledger_details(
                    email=settings.WHITEBOOKS_CONTACT_EMAIL,
                    gstin=gstin.gstin,
                    from_date=from_date,
                    to_date=to_date,
                    txn=auth_session.txn,
                    state_code=state_code,
                    gst_username=gst_username,
                )
            )
        except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            warnings.append("Portal cash ledger could not be fetched right now.")
            transport_errors.append(f"cashdtl: {exc}")

        try:
            itc_ledger_response = client.sanitize_response_payload(
                client.get_itc_ledger_details(
                    email=settings.WHITEBOOKS_CONTACT_EMAIL,
                    gstin=gstin.gstin,
                    from_date=from_date,
                    to_date=to_date,
                    txn=auth_session.txn,
                    state_code=state_code,
                    gst_username=gst_username,
                )
            )
        except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            warnings.append("Portal ITC ledger could not be fetched right now.")
            transport_errors.append(f"itc: {exc}")

        try:
            liability_ledger_response = client.sanitize_response_payload(
                client.get_liability_ledger_details(
                    email=settings.WHITEBOOKS_CONTACT_EMAIL,
                    gstin=gstin.gstin,
                    from_date=from_date,
                    to_date=to_date,
                    txn=auth_session.txn,
                    state_code=state_code,
                    gst_username=gst_username,
                )
            )
        except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            warnings.append("Portal liability ledger could not be fetched right now.")
            transport_errors.append(f"tax: {exc}")

        if payment_reads_enabled:
            try:
                challan_history_response = client.sanitize_response_payload(
                    client.get_challan_history(
                        email=settings.WHITEBOOKS_CONTACT_EMAIL,
                        gstin=gstin.gstin,
                        from_date=from_date,
                        to_date=to_date,
                        txn=auth_session.txn,
                        state_code=state_code,
                        gst_username=gst_username,
                    )
                )
                challan_reference = _extract_cpin(challan_history_response)
            except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
                warnings.append("Portal challan history could not be fetched right now.")
                transport_errors.append(f"chllnlst: {exc}")

            if challan_reference:
                try:
                    challan_summary_response = client.sanitize_response_payload(
                        client.get_challan_summary(
                            email=settings.WHITEBOOKS_CONTACT_EMAIL,
                            gstin=gstin.gstin,
                            cpin=challan_reference,
                            txn=auth_session.txn,
                            state_code=state_code,
                            gst_username=gst_username,
                        )
                    )
                except (WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
                    warnings.append("Portal challan summary could not be fetched right now.")
                    transport_errors.append(f"chllnsum: {exc}")
            elif challan_history_response:
                warnings.append(
                    "Portal challan history was fetched, but no CPIN could be identified for challan summary lookup."
                )
        else:
            warnings.append("WhiteBooks challan reads are not enabled for this environment.")

        if any(
            response
            for response in (
                balance_response,
                taxpayable_response,
                cash_ledger_response,
                itc_ledger_response,
                liability_ledger_response,
                challan_history_response,
                challan_summary_response,
            )
        ):
            captured_snapshot = _create_snapshot(
                compliance_period=compliance_period,
                prepared_return=prepared_return,
                auth_session=auth_session,
                provider=ReturnFiling.Provider.WHITEBOOKS,
                return_type=return_type,
                computed_summary=computed_summary,
                balance_response=balance_response,
                taxpayable_response=taxpayable_response,
                cash_ledger_response=cash_ledger_response,
                itc_ledger_response=itc_ledger_response,
                liability_ledger_response=liability_ledger_response,
                challan_reference=challan_reference,
                challan_history_response=challan_history_response,
                challan_summary_response=challan_summary_response,
                actor=actor,
            )

    transport_error = " | ".join(transport_errors)
    if transport_errors:
        warnings.append("Some portal evidence could not be fetched right now. Review the transport detail and retry later.")

    provider_evidence = _build_provider_evidence(
        captured_snapshot=captured_snapshot,
        latest_snapshot=latest_snapshot,
        live_balance_response=balance_response,
        live_taxpayable_response=taxpayable_response,
        live_cash_ledger_response=cash_ledger_response,
        live_itc_ledger_response=itc_ledger_response,
        live_liability_ledger_response=liability_ledger_response,
        live_challan_reference=challan_reference,
        live_challan_history_response=challan_history_response,
        live_challan_summary_response=challan_summary_response,
    )
    provider_evidence["support_summary"] = _build_provider_evidence_support_summary(
        provider_evidence=provider_evidence,
        blockers=blockers,
        transport_errors=transport_errors,
        ledger_reads_enabled=ledger_reads_enabled,
        payment_reads_enabled=payment_reads_enabled,
        live_fetch_attempted=ledger_reads_enabled and not blockers,
    )

    return {
        "provider": ReturnFiling.Provider.WHITEBOOKS,
        "return_type": return_type,
        "context": {
            "workspace": str(compliance_period.gstin.client.workspace_id),
            "client": str(compliance_period.gstin.client_id),
            "gstin": str(compliance_period.gstin_id),
            "gstin_value": compliance_period.gstin.gstin,
            "compliance_period": str(compliance_period.id),
            "period_label": compliance_period.period,
            "whitebooks_ret_period": ret_period,
            "whitebooks_return_type": whitebooks_return_type,
        },
        "portal_sync": {
            "enabled": ledger_reads_enabled,
            "payment_reads_enabled": payment_reads_enabled,
            "can_fetch": not blockers,
            "blockers": blockers,
            "warnings": warnings,
            "transport_error": transport_error,
        },
        "auth_session": auth_payload,
        "computed_summary": computed_summary,
        "provider_evidence": provider_evidence,
    }


def _build_computed_summary(prepared_return: ReturnPreparation | None) -> dict[str, Any]:
    if prepared_return is None:
        return {
            "prepared_return_id": None,
            "prepared_return_status": "",
            "outward_tax_liability": "0.00",
            "eligible_itc": "0.00",
            "net_tax_payable": "0.00",
        }
    snapshot = prepared_return.summary_snapshot if isinstance(prepared_return.summary_snapshot, dict) else {}
    outward = snapshot.get("outward_supplies") if isinstance(snapshot.get("outward_supplies"), dict) else {}
    itc_summary = snapshot.get("itc_summary") if isinstance(snapshot.get("itc_summary"), dict) else {}
    return {
        "prepared_return_id": str(prepared_return.id),
        "prepared_return_status": prepared_return.status,
        "outward_tax_liability": str(outward.get("outward_tax_liability") or "0.00"),
        "eligible_itc": str(itc_summary.get("eligible_itc") or "0.00"),
        "net_tax_payable": str(itc_summary.get("net_tax_payable") or "0.00"),
    }


def _build_provider_evidence(
    *,
    captured_snapshot: PortalLedgerSnapshot | None,
    latest_snapshot: PortalLedgerSnapshot | None,
    live_balance_response: dict[str, Any] | None,
    live_taxpayable_response: dict[str, Any] | None,
    live_cash_ledger_response: dict[str, Any] | None,
    live_itc_ledger_response: dict[str, Any] | None,
    live_liability_ledger_response: dict[str, Any] | None,
    live_challan_reference: str,
    live_challan_history_response: dict[str, Any] | None,
    live_challan_summary_response: dict[str, Any] | None,
) -> dict[str, Any]:
    if captured_snapshot is not None:
        return {
            "source": "live_fetch",
            "snapshot_id": str(captured_snapshot.id),
            "fetched_at": captured_snapshot.fetched_at.isoformat(),
            "balance_response": live_balance_response,
            "taxpayable_response": live_taxpayable_response,
            "cash_ledger_response": live_cash_ledger_response,
            "cash_ledger_summary": _build_cash_ledger_summary(live_cash_ledger_response),
            "itc_ledger_response": live_itc_ledger_response,
            "itc_ledger_summary": _build_generic_ledger_summary(live_itc_ledger_response),
            "liability_ledger_response": live_liability_ledger_response,
            "liability_ledger_summary": _build_generic_ledger_summary(live_liability_ledger_response),
            "challan_reference": live_challan_reference or None,
            "challan_history_response": live_challan_history_response,
            "challan_summary_response": live_challan_summary_response,
        }
    if latest_snapshot is not None:
        return {
            "source": "saved_snapshot",
            "snapshot_id": str(latest_snapshot.id),
            "fetched_at": latest_snapshot.fetched_at.isoformat(),
            "balance_response": _coerce_payload(latest_snapshot.balance_response),
            "taxpayable_response": _coerce_payload(latest_snapshot.taxpayable_response),
            "cash_ledger_response": _coerce_payload(latest_snapshot.cash_ledger_response),
            "cash_ledger_summary": _build_cash_ledger_summary(_coerce_payload(latest_snapshot.cash_ledger_response)),
            "itc_ledger_response": _coerce_payload(latest_snapshot.itc_ledger_response),
            "itc_ledger_summary": _build_generic_ledger_summary(_coerce_payload(latest_snapshot.itc_ledger_response)),
            "liability_ledger_response": _coerce_payload(latest_snapshot.liability_ledger_response),
            "liability_ledger_summary": _build_generic_ledger_summary(_coerce_payload(latest_snapshot.liability_ledger_response)),
            "challan_reference": latest_snapshot.challan_reference or None,
            "challan_history_response": _coerce_payload(latest_snapshot.challan_history_response),
            "challan_summary_response": _coerce_payload(latest_snapshot.challan_summary_response),
        }
    return {
        "source": "none",
        "snapshot_id": None,
        "fetched_at": None,
        "balance_response": None,
        "taxpayable_response": None,
        "cash_ledger_response": None,
        "cash_ledger_summary": None,
        "itc_ledger_response": None,
        "itc_ledger_summary": None,
        "liability_ledger_response": None,
        "liability_ledger_summary": None,
        "challan_reference": None,
        "challan_history_response": None,
        "challan_summary_response": None,
    }


def _coerce_payload(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict) and value:
        return value
    return None


def _build_provider_evidence_support_summary(
    *,
    provider_evidence: dict[str, Any],
    blockers: list[str],
    transport_errors: list[str],
    ledger_reads_enabled: bool,
    payment_reads_enabled: bool,
    live_fetch_attempted: bool,
) -> dict[str, Any]:
    expected_components = list(LEDGER_EVIDENCE_COMPONENTS)
    if payment_reads_enabled:
        expected_components.extend(PAYMENT_EVIDENCE_COMPONENTS)
        if provider_evidence.get("challan_reference"):
            expected_components.append(("challan_summary", "challan_summary_response"))

    captured_components = [
        label
        for label, payload_key in expected_components
        if bool(provider_evidence.get(payload_key))
    ]
    missing_components = [
        label
        for label, payload_key in expected_components
        if not provider_evidence.get(payload_key)
    ]
    failed_components = [_extract_transport_component(error) for error in transport_errors]
    source = provider_evidence.get("source") or "none"
    used_saved_snapshot = source == "saved_snapshot"

    if blockers and source == "none":
        status = "blocked"
        label = "Blocked"
        detail = "Portal evidence could not be fetched and no saved snapshot is available."
    elif blockers and used_saved_snapshot:
        status = "saved_fallback"
        label = "Saved fallback"
        detail = "Live portal fetch is blocked, so the latest saved snapshot is being shown."
    elif used_saved_snapshot:
        status = "saved_fallback"
        label = "Saved fallback"
        detail = "Latest saved portal evidence is being shown."
    elif source == "none":
        status = "missing"
        label = "Missing"
        detail = "No portal evidence has been captured for this return context yet."
    elif missing_components or transport_errors:
        status = "partial_live"
        label = "Partial live"
        detail = "Some live portal evidence was captured, but one or more provider calls did not return usable data."
    else:
        status = "complete_live"
        label = "Complete live"
        detail = "All enabled portal evidence calls returned usable data in the latest live fetch."

    return {
        "status": status,
        "label": label,
        "detail": detail,
        "source": source,
        "snapshot_id": provider_evidence.get("snapshot_id"),
        "fetched_at": provider_evidence.get("fetched_at"),
        "ledger_reads_enabled": ledger_reads_enabled,
        "payment_reads_enabled": payment_reads_enabled,
        "live_fetch_attempted": live_fetch_attempted,
        "used_saved_snapshot": used_saved_snapshot,
        "captured_components": captured_components,
        "missing_components": missing_components,
        "failed_components": failed_components,
        "transport_error_count": len(transport_errors),
    }


def _extract_transport_component(error: str) -> str:
    value = str(error or "").strip()
    if ":" not in value:
        return value
    return value.split(":", 1)[0].strip()


def _build_freshness_summary(auth_session: ProviderAuthSession | None) -> dict[str, Any]:
    if auth_session is None:
        return {
            "verified_at": None,
            "expires_at": None,
            "is_stale": True,
            "stale_reason": "This provider auth session is not active yet. Request OTP and verify it first.",
        }
    freshness = get_provider_auth_session_freshness(auth_session=auth_session)
    return {
        "verified_at": freshness["verified_at"],
        "expires_at": freshness["expires_at"],
        "is_stale": freshness["is_stale"],
        "stale_reason": freshness["stale_reason"],
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


def _get_latest_snapshot(*, compliance_period_id, return_type: str) -> PortalLedgerSnapshot | None:
    return (
        PortalLedgerSnapshot.objects.filter(
            is_active=True,
            compliance_period_id=compliance_period_id,
            provider=ReturnFiling.Provider.WHITEBOOKS,
            return_type=return_type,
        )
        .order_by("-fetched_at", "-created_at")
        .first()
    )


def _create_snapshot(
    *,
    compliance_period: CompliancePeriod,
    prepared_return: ReturnPreparation | None,
    auth_session: ProviderAuthSession | None,
    provider: str,
    return_type: str,
    computed_summary: dict[str, Any],
    balance_response: dict[str, Any] | None,
    taxpayable_response: dict[str, Any] | None,
    cash_ledger_response: dict[str, Any] | None,
    itc_ledger_response: dict[str, Any] | None,
    liability_ledger_response: dict[str, Any] | None,
    challan_reference: str,
    challan_history_response: dict[str, Any] | None,
    challan_summary_response: dict[str, Any] | None,
    actor=None,
) -> PortalLedgerSnapshot:
    user = actor if getattr(actor, "is_authenticated", False) else None
    return PortalLedgerSnapshot.objects.create(
        compliance_period=compliance_period,
        prepared_return=prepared_return,
        provider=provider,
        return_type=return_type,
        auth_session=auth_session,
        fetched_at=timezone.now(),
        computed_summary=computed_summary,
        balance_response=balance_response or {},
        taxpayable_response=taxpayable_response or {},
        cash_ledger_response=cash_ledger_response or {},
        itc_ledger_response=itc_ledger_response or {},
        liability_ledger_response=liability_ledger_response or {},
        challan_reference=challan_reference,
        challan_history_response=challan_history_response or {},
        challan_summary_response=challan_summary_response or {},
        created_by=user,
        updated_by=user,
    )


def _to_whitebooks_period(period: str) -> str:
    value = str(period or "").strip()
    if len(value) >= 7 and value[4] == "-":
        return f"{value[5:7]}{value[:4]}"
    return value.replace("-", "")


def _to_period_date_range(period: str) -> tuple[str, str]:
    year_str, month_str = str(period or "").strip().split("-", 1)
    year = int(year_str)
    month = int(month_str[:2])
    last_day = calendar.monthrange(year, month)[1]
    return (
        date(year, month, 1).strftime("%d-%m-%Y"),
        date(year, month, last_day).strftime("%d-%m-%Y"),
    )


def _build_cash_ledger_summary(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict) or not payload:
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    opening = data.get("op_bal") if isinstance(data.get("op_bal"), dict) else {}
    closing = data.get("cl_bal") if isinstance(data.get("cl_bal"), dict) else {}
    transactions = data.get("tr") if isinstance(data.get("tr"), list) else []
    return {
        "from_date": data.get("fr_dt") or "",
        "to_date": data.get("to_dt") or "",
        "opening_total": _stringify_amount(opening.get("tot_rng_bal")),
        "closing_total": _stringify_amount(closing.get("tot_rng_bal")),
        "transaction_count": len(transactions),
        "closing_breakdown": {
            "cgst": _stringify_amount(_extract_nested_amount(closing, "cgstbal", "tot")),
            "sgst": _stringify_amount(_extract_nested_amount(closing, "sgstbal", "tot")),
            "igst": _stringify_amount(_extract_nested_amount(closing, "igstbal", "tot")),
            "cess": _stringify_amount(_extract_nested_amount(closing, "cessbal", "tot")),
        },
    }


def _build_generic_ledger_summary(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict) or not payload:
        return None
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    opening = data.get("op_bal") if isinstance(data.get("op_bal"), dict) else {}
    closing = data.get("cl_bal") if isinstance(data.get("cl_bal"), dict) else {}
    transactions = data.get("tr") if isinstance(data.get("tr"), list) else []
    return {
        "from_date": data.get("fr_dt") or "",
        "to_date": data.get("to_dt") or "",
        "opening_total": _stringify_amount(opening.get("tot_rng_bal")),
        "closing_total": _stringify_amount(closing.get("tot_rng_bal")),
        "transaction_count": len(transactions),
    }


def _extract_nested_amount(payload: dict[str, Any], section_key: str, amount_key: str) -> Any:
    section = payload.get(section_key)
    if isinstance(section, dict):
        return section.get(amount_key)
    return None


def _stringify_amount(value: Any) -> str:
    if value in (None, ""):
        return "0.00"
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return str(value)


def _extract_cpin(payload: Any) -> str:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if str(key).lower() == "cpin" and value:
                return str(value).strip()
            extracted = _extract_cpin(value)
            if extracted:
                return extracted
        return ""
    if isinstance(payload, list):
        for entry in payload:
            extracted = _extract_cpin(entry)
            if extracted:
                return extracted
    return ""
