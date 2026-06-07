import hashlib
import json
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from apps.filings.models import ReturnFiling, ReturnFilingOffset
from apps.gst_transactions.models import GSTTransaction
from apps.returns.models import ReturnPreparation


TWOPLACES = Decimal("0.01")


def map_return_filing_to_whitebooks_payload(filing: ReturnFiling) -> dict:
    prepared_return = filing.prepared_return
    transactions = list(
        GSTTransaction.objects.filter(
            is_active=True,
            compliance_period=filing.compliance_period,
        ).select_related("gstin", "client", "compliance_period")
    )
    gstin_value = filing.gstin.gstin if filing.gstin else ""
    period_code = _to_whitebooks_period(filing.compliance_period.period)
    email = filing.readiness_snapshot.get("whitebooks_email", "") if isinstance(filing.readiness_snapshot, dict) else ""

    payload = {
        "workspace_id": str(filing.workspace_id),
        "client_id": str(filing.client_id),
        "gstin": gstin_value,
        "compliance_period": filing.compliance_period.period,
        "whitebooks_ret_period": period_code,
        "return_type": filing.return_type,
        "prepared_return_id": str(prepared_return.id),
        "prepared_snapshot_version": filing.prepared_snapshot_version,
        "summary_snapshot": prepared_return.summary_snapshot,
        "whitebooks": {
            "email": email,
            "pan": filing.client.pan if filing.client else "",
            "readiness": {"save_supported": False, "file_supported": False, "offset_supported": False, "blockers": []},
            "operations": {},
        },
    }

    if filing.return_type == ReturnPreparation.ReturnType.GSTR1:
        payload["whitebooks"]["operations"] = _build_gstr1_operations(
            filing=filing,
            prepared_return=prepared_return,
            transactions=transactions,
            gstin_value=gstin_value,
            period_code=period_code,
        )
    elif filing.return_type == ReturnPreparation.ReturnType.GSTR3B:
        payload["whitebooks"]["operations"] = _build_gstr3b_operations(
            filing=filing,
            prepared_return=prepared_return,
            transactions=transactions,
            gstin_value=gstin_value,
            period_code=period_code,
        )
    else:
        payload["whitebooks"]["readiness"]["blockers"].append("Unsupported return type for WhiteBooks mapping.")
        return payload

    payload["whitebooks"]["readiness"] = payload["whitebooks"]["operations"].pop("readiness")
    return payload


def _build_gstr1_operations(*, filing, prepared_return, transactions, gstin_value, period_code):
    save_payload = _build_gstr1_retsave_payload(
        prepared_return=prepared_return,
        transactions=transactions,
        gstin_value=gstin_value,
        period_code=period_code,
    )
    file_payload = _build_gstr1_retfile_payload(
        save_payload=save_payload,
        gstin_value=gstin_value,
        period_code=period_code,
    )
    blockers = [
        "Live GSTR-1 retfile requires guarded rollout plus ARN/status confirmation before the return can be treated as filed.",
    ]
    return {
        "save": save_payload,
        "proceed": {
            "gstin": gstin_value,
            "retperiod": period_code,
            "type": "GSTR1",
            "isNil": "Y"
            if not save_payload.get("b2b")
            and not save_payload.get("b2cl")
            and not save_payload.get("b2cs")
            and not save_payload.get("b2ba")
            and not save_payload.get("b2cla")
            and not save_payload.get("b2csa")
            and not save_payload.get("cdnra")
            and not save_payload.get("cdnura")
            and not save_payload.get("at")
            and not save_payload.get("txpd")
            and not save_payload.get("exp")
            and not save_payload.get("expa")
            else "N",
        },
        "file": file_payload,
        "status": {"rettype": "GSTR1"},
        "track": {"type": "GSTR1"},
        "readiness": {
            "save_supported": True,
            "file_supported": True,
            "offset_supported": False,
            "blockers": blockers,
        },
    }


def _build_gstr3b_operations(*, filing, prepared_return, transactions, gstin_value, period_code):
    save_payload = _build_gstr3b_retsave_payload(
        prepared_return=prepared_return,
        transactions=transactions,
        gstin_value=gstin_value,
        period_code=period_code,
        home_state_code=getattr(filing.gstin, "state_code", ""),
    )
    offset_profile = _get_latest_ready_offset_profile(filing)
    offset_payload, file_payload = _extract_gstr3b_offset_and_file_payload(offset_profile.provider_payload if offset_profile and isinstance(offset_profile.provider_payload, dict) else {})
    blockers = []
    if not offset_payload:
        blockers.append(
            "GSTR-3B offset payload needs a prepared liability offset profile with provider payload, ledger references, and settlement breakup."
        )
    if not file_payload:
        blockers.append(
            "GSTR-3B retfile payload should follow validated post-offset values from WhiteBooks/GSTN flow, so live filing stays blocked until offset integration is added."
        )
    return {
        "save": save_payload,
        "offset": offset_payload,
        "file": file_payload,
        "status": {"rettype": "GSTR3B"},
        "track": {"type": "GSTR3B"},
        "readiness": {
            "save_supported": True,
            "file_supported": bool(file_payload),
            "offset_supported": bool(offset_payload),
            "blockers": blockers,
        },
    }


def _get_latest_ready_offset_profile(filing: ReturnFiling) -> ReturnFilingOffset | None:
    return (
        filing.offset_profiles.filter(
            is_active=True,
            status=ReturnFilingOffset.OffsetStatus.READY,
        )
        .order_by("-version", "-created_at")
        .first()
    )


def _extract_gstr3b_offset_and_file_payload(provider_payload: dict) -> tuple[dict | None, dict | None]:
    if not isinstance(provider_payload, dict) or not provider_payload:
        return None, None

    nested_offset_payload = provider_payload.get("offset_payload")
    nested_file_payload = provider_payload.get("file_payload")
    if isinstance(nested_offset_payload, dict) or isinstance(nested_file_payload, dict):
        return (
            nested_offset_payload if isinstance(nested_offset_payload, dict) else None,
            nested_file_payload if isinstance(nested_file_payload, dict) else None,
        )

    if "offset" in provider_payload and "file" in provider_payload:
        offset_candidate = provider_payload.get("offset")
        file_candidate = provider_payload.get("file")
        return (
            offset_candidate if isinstance(offset_candidate, dict) else None,
            file_candidate if isinstance(file_candidate, dict) else None,
        )

    return provider_payload, None


def _build_gstr1_retsave_payload(*, prepared_return, transactions, gstin_value, period_code):
    outward = prepared_return.summary_snapshot.get("outward_supplies", {}) if isinstance(prepared_return.summary_snapshot, dict) else {}
    sales_transactions = [item for item in transactions if item.transaction_type == "sales"]
    amendment_sales_transactions = [item for item in sales_transactions if _is_amendment_transaction(item)]
    non_amendment_sales_transactions = [item for item in sales_transactions if not _is_amendment_transaction(item)]
    export_transactions = [item for item in non_amendment_sales_transactions if _special_supply_type(item) in {"export_wpay", "export_wopay"}]
    amendment_export_transactions = [item for item in amendment_sales_transactions if _special_supply_type(item) in {"export_wpay", "export_wopay"}]
    special_b2b_transactions = [item for item in non_amendment_sales_transactions if _special_supply_type(item) in {"sez_wpay", "sez_wopay", "deemed_export"}]
    amendment_special_b2b_transactions = [item for item in amendment_sales_transactions if _special_supply_type(item) in {"sez_wpay", "sez_wopay", "deemed_export"}]
    regular_sales_transactions = [item for item in non_amendment_sales_transactions if not _special_supply_type(item)]
    amendment_regular_sales_transactions = [item for item in amendment_sales_transactions if not _special_supply_type(item)]
    credit_notes = [item for item in transactions if item.transaction_type == "credit_note" and not _is_amendment_transaction(item)]
    debit_notes = [item for item in transactions if item.transaction_type == "debit_note" and not _is_amendment_transaction(item)]
    amendment_credit_notes = [item for item in transactions if item.transaction_type == "credit_note" and _is_amendment_transaction(item)]
    amendment_debit_notes = [item for item in transactions if item.transaction_type == "debit_note" and _is_amendment_transaction(item)]
    advance_received_transactions = [item for item in transactions if item.transaction_type == "advance_received"]
    advance_adjusted_transactions = [item for item in transactions if item.transaction_type == "advance_adjusted"]
    b2b_transactions = [item for item in regular_sales_transactions if item.counterparty_gstin] + special_b2b_transactions
    b2cl_transactions = [
        item
        for item in regular_sales_transactions
        if not item.counterparty_gstin and _is_large_interstate_invoice(item)
    ]
    b2cs_transactions = [
        item
        for item in regular_sales_transactions
        if not item.counterparty_gstin and not _is_large_interstate_invoice(item)
    ]
    b2ba_transactions = [item for item in amendment_regular_sales_transactions if item.counterparty_gstin] + amendment_special_b2b_transactions
    b2cla_transactions = [
        item
        for item in amendment_regular_sales_transactions
        if not item.counterparty_gstin and _is_large_interstate_invoice(item)
    ]
    b2csa_transactions = [
        item
        for item in amendment_regular_sales_transactions
        if not item.counterparty_gstin and not _is_large_interstate_invoice(item)
    ]

    return {
        "gstin": gstin_value,
        "fp": period_code,
        "gt": _decimal_to_float(outward.get("total_taxable_value", "0.00")),
        "cur_gt": _decimal_to_float(outward.get("total_taxable_value", "0.00")),
        "b2b": _build_gstr1_b2b_rows(b2b_transactions),
        "b2cl": _build_gstr1_b2cl_rows(b2cl_transactions),
        "b2cs": _build_gstr1_b2cs_rows(b2cs_transactions),
        "b2ba": _build_gstr1_b2b_rows(b2ba_transactions),
        "b2cla": _build_gstr1_b2cl_rows(b2cla_transactions),
        "b2csa": _build_gstr1_b2csa_rows(b2csa_transactions),
        "cdnr": _build_gstr1_note_rows(credit_notes + debit_notes, registered_only=True),
        "cdnur": _build_gstr1_note_rows(credit_notes + debit_notes, registered_only=False),
        "cdnra": _build_gstr1_note_rows(amendment_credit_notes + amendment_debit_notes, registered_only=True),
        "cdnura": _build_gstr1_note_rows(amendment_credit_notes + amendment_debit_notes, registered_only=False),
        "at": _build_gstr1_advance_rows(advance_received_transactions),
        "txpd": _build_gstr1_advance_rows(advance_adjusted_transactions),
        "exp": _build_gstr1_export_rows(export_transactions),
        "expa": _build_gstr1_export_rows(amendment_export_transactions),
    }


def _build_gstr3b_retsave_payload(*, prepared_return, transactions, gstin_value, period_code, home_state_code):
    summary = prepared_return.summary_snapshot if isinstance(prepared_return.summary_snapshot, dict) else {}
    outward = summary.get("outward_supplies", {})
    itc_summary = summary.get("itc_summary", {})
    sales_transactions = [item for item in transactions if item.transaction_type == "sales"]

    eligible_itc = _to_decimal(itc_summary.get("eligible_itc", "0.00"))
    outward_taxable = _to_decimal(outward.get("outward_taxable_value", "0.00"))
    outward_tax_liability = _to_decimal(outward.get("outward_tax_liability", "0.00"))
    igst_ratio, cgst_ratio, sgst_ratio, cess_ratio = _tax_component_ratios(sales_transactions)

    return {
        "gstin": gstin_value,
        "ret_period": period_code,
        "sup_details": {
            "osup_det": {
                "txval": _decimal_to_float(outward_taxable),
                "iamt": _decimal_to_float(outward_tax_liability * igst_ratio),
                "camt": _decimal_to_float(outward_tax_liability * cgst_ratio),
                "samt": _decimal_to_float(outward_tax_liability * sgst_ratio),
                "csamt": _decimal_to_float(outward_tax_liability * cess_ratio),
            },
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0},
        },
        "inter_sup": {
            "unreg_details": _build_gstr3b_interstate_unregistered_rows(sales_transactions, home_state_code),
            "comp_details": [],
            "uin_details": [],
        },
        "itc_elg": {
            "itc_avl": [
                {
                    "ty": "IMPG",
                    "iamt": _decimal_to_float(eligible_itc),
                    "camt": 0.0,
                    "samt": 0.0,
                    "csamt": 0.0,
                }
            ],
            "itc_rev": [],
            "itc_net": {
                "iamt": _decimal_to_float(eligible_itc),
                "camt": 0.0,
                "samt": 0.0,
                "csamt": 0.0,
            },
            "itc_inelg": [],
        },
        "inward_sup": {"isup_details": []},
        "intr_ltfee": {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
    }


def _build_gstr1_retfile_payload(*, save_payload, gstin_value, period_code):
    section_summaries = _build_gstr1_section_summaries(save_payload)
    return {
        "gstin": gstin_value,
        "ret_period": period_code,
        "chksum": _build_checksum(section_summaries),
        "newSumFlag": True,
        "sec_sum": section_summaries,
    }


def _build_gstr1_section_summaries(save_payload):
    sections = []
    for section_name, entries, subsection_builder in (
        ("B2B", save_payload.get("b2b", []), _build_b2b_subsections),
        ("B2CL", save_payload.get("b2cl", []), _build_b2cl_subsections),
        ("B2CS", save_payload.get("b2cs", []), _build_b2cs_subsections),
        ("B2BA", save_payload.get("b2ba", []), _build_b2b_subsections),
        ("B2CLA", save_payload.get("b2cla", []), _build_b2cl_subsections),
        ("B2CSA", save_payload.get("b2csa", []), _build_b2csa_subsections),
        ("CDNR", save_payload.get("cdnr", []), _build_note_subsections),
        ("CDNUR", save_payload.get("cdnur", []), _build_note_subsections),
        ("CDNRA", save_payload.get("cdnra", []), _build_note_subsections),
        ("CDNURA", save_payload.get("cdnura", []), _build_note_subsections),
        ("AT", save_payload.get("at", []), _build_advance_subsections),
        ("TXPD", save_payload.get("txpd", []), _build_advance_subsections),
        ("EXP", save_payload.get("exp", []), _build_export_subsections),
        ("EXPA", save_payload.get("expa", []), _build_export_subsections),
    ):
        if not entries:
            continue
        subsections = subsection_builder(section_name, entries)
        sections.append(_summarize_subsections(section_name, subsections))
    return sections


def _build_gstr1_b2b_rows(transactions):
    grouped = defaultdict(list)
    for transaction in transactions:
        grouped[transaction.counterparty_gstin].append(transaction)

    rows = []
    for ctin, items in sorted(grouped.items()):
        rows.append(
            {
                "ctin": ctin,
                "inv": [_build_invoice_payload(item) for item in sorted(items, key=lambda row: (row.transaction_date, row.reference_number))],
            }
        )
    return rows


def _build_gstr1_b2cl_rows(transactions):
    grouped = defaultdict(list)
    for transaction in transactions:
        place_of_supply = str(transaction.place_of_supply or "").strip() or "00"
        grouped[place_of_supply].append(transaction)

    rows = []
    for place_of_supply, items in sorted(grouped.items()):
        rows.append(
            {
                "pos": place_of_supply,
                "inv": [_build_invoice_payload(item) for item in sorted(items, key=lambda row: (row.transaction_date, row.reference_number))],
            }
        )
    return rows


def _build_gstr1_b2cs_rows(transactions):
    grouped = {}
    for transaction in transactions:
        place_of_supply = str(transaction.place_of_supply or "").strip() or "00"
        rate = _rate_percentage(transaction)
        etin = _ecommerce_gstin(transaction)
        key = (place_of_supply, rate, etin)
        entry = grouped.setdefault(
            key,
            {"sply_ty": "INTER" if transaction.igst_amount else "INTRA", "pos": place_of_supply, "rt": rate, "txval": Decimal("0.00"), "iamt": Decimal("0.00"), "camt": Decimal("0.00"), "samt": Decimal("0.00"), "csamt": Decimal("0.00"), "etin": etin},
        )
        entry["txval"] += _to_decimal(transaction.taxable_value)
        entry["iamt"] += _to_decimal(transaction.igst_amount)
        entry["camt"] += _to_decimal(transaction.cgst_amount)
        entry["samt"] += _to_decimal(transaction.sgst_amount)
        entry["csamt"] += _to_decimal(transaction.cess_amount)

    rows = []
    for _, entry in sorted(grouped.items()):
        rows.append(
            {
                "sply_ty": entry["sply_ty"],
                "pos": entry["pos"],
                "rt": _decimal_to_float(entry["rt"]),
                "txval": _decimal_to_float(entry["txval"]),
                "iamt": _decimal_to_float(entry["iamt"]),
                "camt": _decimal_to_float(entry["camt"]),
                "samt": _decimal_to_float(entry["samt"]),
                "csamt": _decimal_to_float(entry["csamt"]),
                "etin": entry["etin"],
            }
        )
    return rows


def _build_gstr1_b2csa_rows(transactions):
    grouped = {}
    for transaction in transactions:
        place_of_supply = str(transaction.place_of_supply or "").strip() or "00"
        rate = _rate_percentage(transaction)
        etin = _ecommerce_gstin(transaction)
        original_period = _original_period(transaction)
        key = (original_period, place_of_supply, rate, etin)
        entry = grouped.setdefault(
            key,
            {
                "sply_ty": "INTER" if transaction.igst_amount else "INTRA",
                "pos": place_of_supply,
                "rt": rate,
                "txval": Decimal("0.00"),
                "iamt": Decimal("0.00"),
                "camt": Decimal("0.00"),
                "samt": Decimal("0.00"),
                "csamt": Decimal("0.00"),
                "etin": etin,
                "ofp": original_period,
            },
        )
        entry["txval"] += _to_decimal(transaction.taxable_value)
        entry["iamt"] += _to_decimal(transaction.igst_amount)
        entry["camt"] += _to_decimal(transaction.cgst_amount)
        entry["samt"] += _to_decimal(transaction.sgst_amount)
        entry["csamt"] += _to_decimal(transaction.cess_amount)

    rows = []
    for _, entry in sorted(grouped.items()):
        rows.append(
            {
                "sply_ty": entry["sply_ty"],
                "pos": entry["pos"],
                "rt": _decimal_to_float(entry["rt"]),
                "txval": _decimal_to_float(entry["txval"]),
                "iamt": _decimal_to_float(entry["iamt"]),
                "camt": _decimal_to_float(entry["camt"]),
                "samt": _decimal_to_float(entry["samt"]),
                "csamt": _decimal_to_float(entry["csamt"]),
                "etin": entry["etin"],
                "ofp": entry["ofp"],
            }
        )
    return rows


def _build_gstr1_note_rows(transactions, *, registered_only):
    grouped = defaultdict(list)
    for transaction in transactions:
        has_gstin = bool(transaction.counterparty_gstin)
        if registered_only != has_gstin:
            continue
        key = transaction.counterparty_gstin or "URP"
        grouped[key].append(transaction)

    rows = []
    for counterparty, items in sorted(grouped.items()):
        note_key = "ctin" if registered_only else "typ"
        row = {
            note_key: counterparty if registered_only else "B2CL",
            "nt": [],
        }
        for item in sorted(items, key=lambda value: (value.transaction_date, value.reference_number)):
            note_payload = {
                "ntty": "C" if item.transaction_type == "credit_note" else "D",
                "nt_num": item.reference_number,
                "nt_dt": item.transaction_date.strftime("%d-%m-%Y"),
                "val": _decimal_to_float(item.total_amount),
                "pos": str(item.place_of_supply or "").strip() or "00",
                "itms": [_build_item_payload(component, index=1) for component in _iter_transaction_components(item)],
            }
            if _is_amendment_transaction(item):
                note_payload["ont_num"] = _original_document_number(item)
                note_payload["ont_dt"] = _format_optional_date(_original_document_date(item))
                note_payload["ofp"] = _original_period(item)
            row["nt"].append(note_payload)
        rows.append(row)
    return rows


def _build_gstr1_advance_rows(transactions):
    grouped = {}
    for transaction in transactions:
        place_of_supply = str(transaction.place_of_supply or "").strip() or "00"
        supply_type = "INTER" if _to_decimal(transaction.igst_amount) > Decimal("0.00") else "INTRA"
        key = (place_of_supply, supply_type)
        entry = grouped.setdefault(
            key,
            {"pos": place_of_supply, "sply_ty": supply_type, "itms": []},
        )
        for component in _iter_transaction_components(transaction):
            entry["itms"].append(
                {
                    "rt": _decimal_to_float(component["rate"]),
                    "ad_amt": _decimal_to_float(component["taxable_value"]),
                    "iamt": _decimal_to_float(component["igst_amount"]),
                    "camt": _decimal_to_float(component["cgst_amount"]),
                    "samt": _decimal_to_float(component["sgst_amount"]),
                    "csamt": _decimal_to_float(component["cess_amount"]),
                }
            )

    rows = []
    for _, entry in sorted(grouped.items()):
        rows.append(
            {
                "pos": entry["pos"],
                "sply_ty": entry["sply_ty"],
                "itms": entry["itms"],
            }
        )
    return rows


def _build_gstr1_export_rows(transactions):
    grouped = defaultdict(list)
    for transaction in transactions:
        grouped[_export_type_code(transaction)].append(transaction)

    rows = []
    for export_type, items in sorted(grouped.items()):
        rows.append(
            {
                "exp_typ": export_type,
                "inv": [_build_export_invoice_payload(item) for item in sorted(items, key=lambda row: (row.transaction_date, row.reference_number))],
            }
        )
    return rows


def _build_b2b_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        ctin = str(entry.get("ctin") or "UNKNOWN")
        metrics = _summarize_invoice_documents(entry.get("inv", []))
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{ctin}"), metrics, []))
    return subsections


def _build_b2cl_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        pos = str(entry.get("pos") or "00")
        metrics = _summarize_invoice_documents(entry.get("inv", []))
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{pos}"), metrics, []))
    return subsections


def _build_b2cs_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        pos = str(entry.get("pos") or "00")
        rate = str(entry.get("rt") or "0")
        metrics = _summarize_b2cs_entry(entry)
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{pos}_{rate}"), metrics, []))
    return subsections


def _build_b2csa_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        ofp = str(entry.get("ofp") or "UNKNOWN")
        pos = str(entry.get("pos") or "00")
        rate = str(entry.get("rt") or "0")
        etin = str(entry.get("etin") or "NA")
        metrics = _summarize_b2cs_entry(entry)
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{ofp}_{pos}_{rate}_{etin}"), metrics, []))
    return subsections


def _build_note_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        anchor = str(entry.get("ctin") or entry.get("typ") or "UNKNOWN")
        metrics = _summarize_note_documents(entry.get("nt", []))
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{anchor}"), metrics, []))
    return subsections


def _build_advance_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        pos = str(entry.get("pos") or "00")
        supply_type = str(entry.get("sply_ty") or "UNKNOWN")
        metrics = _summarize_advance_entry(entry)
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{pos}_{supply_type}"), metrics, []))
    return subsections


def _build_export_subsections(section_name, entries):
    subsections = []
    for entry in entries:
        export_type = str(entry.get("exp_typ") or "UNKNOWN")
        metrics = _summarize_invoice_documents(entry.get("inv", []))
        subsections.append(_build_section_summary(_safe_section_name(f"{section_name}_{export_type}"), metrics, []))
    return subsections


def _summarize_subsections(section_name, subsections):
    metrics = _combine_metrics(subsections)
    return _build_section_summary(section_name, metrics, subsections)


def _build_section_summary(section_name, metrics, subsections):
    payload = {
        "sec_nm": section_name,
        "ttl_rec": metrics["ttl_rec"],
        "ttl_val": _decimal_to_float(metrics["ttl_val"]),
        "ttl_igst": _decimal_to_float(metrics["ttl_igst"]),
        "ttl_sgst": _decimal_to_float(metrics["ttl_sgst"]),
        "ttl_cgst": _decimal_to_float(metrics["ttl_cgst"]),
        "ttl_cess": _decimal_to_float(metrics["ttl_cess"]),
        "ttl_tax": _decimal_to_float(metrics["ttl_tax"]),
        "act_tax": _decimal_to_float(metrics["act_tax"]),
        "act_igst": _decimal_to_float(metrics["act_igst"]),
        "act_sgst": _decimal_to_float(metrics["act_sgst"]),
        "act_cgst": _decimal_to_float(metrics["act_cgst"]),
        "act_val": _decimal_to_float(metrics["act_val"]),
        "act_cess": _decimal_to_float(metrics["act_cess"]),
    }
    if subsections:
        payload["sub_sections"] = subsections
    payload["chksum"] = _build_checksum(payload)
    return payload


def _summarize_invoice_documents(invoices):
    metrics = _empty_summary_metrics()
    for invoice in invoices:
        taxable_value, igst, sgst, cgst, cess = _extract_invoice_tax_components(invoice)
        metrics["ttl_rec"] += 1
        _apply_document_metrics(metrics, taxable_value, igst, sgst, cgst, cess)
    return metrics


def _summarize_note_documents(notes):
    metrics = _empty_summary_metrics()
    for note in notes:
        taxable_value, igst, sgst, cgst, cess = _extract_note_tax_components(note)
        metrics["ttl_rec"] += 1
        _apply_document_metrics(metrics, taxable_value, igst, sgst, cgst, cess)
    return metrics


def _summarize_b2cs_entry(entry):
    metrics = _empty_summary_metrics()
    taxable_value = _to_decimal(entry.get("txval", 0))
    igst = _to_decimal(entry.get("iamt", 0))
    cgst = _to_decimal(entry.get("camt", 0))
    sgst = _to_decimal(entry.get("samt", 0))
    cess = _to_decimal(entry.get("csamt", 0))
    metrics["ttl_rec"] = 1
    _apply_document_metrics(metrics, taxable_value, igst, sgst, cgst, cess)
    return metrics


def _summarize_advance_entry(entry):
    metrics = _empty_summary_metrics()
    metrics["ttl_rec"] = 1
    for item in entry.get("itms", []):
        taxable_value = _to_decimal(item.get("ad_amt", 0))
        igst = _to_decimal(item.get("iamt", 0))
        cgst = _to_decimal(item.get("camt", 0))
        sgst = _to_decimal(item.get("samt", 0))
        cess = _to_decimal(item.get("csamt", 0))
        _apply_document_metrics(metrics, taxable_value, igst, sgst, cgst, cess)
    return metrics


def _extract_invoice_tax_components(invoice):
    taxable_value = Decimal("0.00")
    igst = Decimal("0.00")
    sgst = Decimal("0.00")
    cgst = Decimal("0.00")
    cess = Decimal("0.00")
    for item in invoice.get("itms", []):
        item_det = item.get("itm_det", {}) if isinstance(item.get("itm_det"), dict) else {}
        taxable_value += _to_decimal(item_det.get("txval", 0))
        igst += _to_decimal(item_det.get("iamt", 0))
        cgst += _to_decimal(item_det.get("camt", 0))
        sgst += _to_decimal(item_det.get("samt", 0))
        cess += _to_decimal(item_det.get("csamt", 0))
    if taxable_value == Decimal("0.00"):
        taxable_value = _to_decimal(invoice.get("val", 0)) - (igst + cgst + sgst + cess)
    return taxable_value, igst, sgst, cgst, cess


def _extract_note_tax_components(note):
    taxable_value = Decimal("0.00")
    igst = Decimal("0.00")
    sgst = Decimal("0.00")
    cgst = Decimal("0.00")
    cess = Decimal("0.00")
    for item in note.get("itms", []):
        item_det = item.get("itm_det", {}) if isinstance(item.get("itm_det"), dict) else {}
        taxable_value += _to_decimal(item_det.get("txval", 0))
        igst += _to_decimal(item_det.get("iamt", 0))
        cgst += _to_decimal(item_det.get("camt", 0))
        sgst += _to_decimal(item_det.get("samt", 0))
        cess += _to_decimal(item_det.get("csamt", 0))
    if note.get("ntty") == "C":
        taxable_value *= Decimal("-1")
        igst *= Decimal("-1")
        cgst *= Decimal("-1")
        sgst *= Decimal("-1")
        cess *= Decimal("-1")
    return taxable_value, igst, sgst, cgst, cess


def _apply_document_metrics(metrics, taxable_value, igst, sgst, cgst, cess):
    total_tax = igst + sgst + cgst + cess
    metrics["ttl_val"] += taxable_value
    metrics["ttl_igst"] += igst
    metrics["ttl_sgst"] += sgst
    metrics["ttl_cgst"] += cgst
    metrics["ttl_cess"] += cess
    metrics["ttl_tax"] += total_tax
    metrics["act_val"] += taxable_value
    metrics["act_igst"] += igst
    metrics["act_sgst"] += sgst
    metrics["act_cgst"] += cgst
    metrics["act_cess"] += cess
    metrics["act_tax"] += total_tax


def _combine_metrics(section_summaries):
    metrics = _empty_summary_metrics()
    for summary in section_summaries:
        metrics["ttl_rec"] += int(summary.get("ttl_rec", 0) or 0)
        for key in ("ttl_val", "ttl_igst", "ttl_sgst", "ttl_cgst", "ttl_cess", "ttl_tax", "act_val", "act_igst", "act_sgst", "act_cgst", "act_cess", "act_tax"):
            metrics[key] += _to_decimal(summary.get(key, 0))
    return metrics


def _empty_summary_metrics():
    return {
        "ttl_rec": 0,
        "ttl_val": Decimal("0.00"),
        "ttl_igst": Decimal("0.00"),
        "ttl_sgst": Decimal("0.00"),
        "ttl_cgst": Decimal("0.00"),
        "ttl_cess": Decimal("0.00"),
        "ttl_tax": Decimal("0.00"),
        "act_tax": Decimal("0.00"),
        "act_igst": Decimal("0.00"),
        "act_sgst": Decimal("0.00"),
        "act_cgst": Decimal("0.00"),
        "act_val": Decimal("0.00"),
        "act_cess": Decimal("0.00"),
    }


def _safe_section_name(value):
    sanitized = "".join(character if character.isalnum() else "_" for character in value.upper())
    return sanitized[:64]


def _build_checksum(payload):
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=_json_decimal_serializer)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _json_decimal_serializer(value):
    if isinstance(value, Decimal):
        return _decimal_to_float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _build_invoice_payload(transaction):
    payload = {
        "inum": transaction.reference_number,
        "idt": transaction.transaction_date.strftime("%d-%m-%Y"),
        "val": _decimal_to_float(transaction.total_amount),
        "pos": str(transaction.place_of_supply or "").strip() or "00",
        "rchrg": "Y" if transaction.reverse_charge else "N",
        "inv_typ": _invoice_type_code(transaction),
        "itms": [_build_item_payload(component, index=index + 1) for index, component in enumerate(_iter_transaction_components(transaction))],
    }
    if _ecommerce_gstin(transaction):
        payload["etin"] = _ecommerce_gstin(transaction)
    if _is_amendment_transaction(transaction):
        payload["oinum"] = _original_document_number(transaction)
        payload["oidt"] = _format_optional_date(_original_document_date(transaction))
        payload["ofp"] = _original_period(transaction)
    return payload


def _build_export_invoice_payload(transaction):
    payload = {
        "inum": transaction.reference_number,
        "idt": transaction.transaction_date.strftime("%d-%m-%Y"),
        "val": _decimal_to_float(transaction.total_amount),
        "sbnum": str((transaction.metadata or {}).get("shipping_bill_number") or ""),
        "sbdt": _format_optional_date((transaction.metadata or {}).get("shipping_bill_date")),
        "sbpcode": str((transaction.metadata or {}).get("port_code") or ""),
        "itms": [_build_item_payload(component, index=index + 1) for index, component in enumerate(_iter_transaction_components(transaction))],
    }
    if _is_amendment_transaction(transaction):
        payload["oinum"] = _original_document_number(transaction)
        payload["oidt"] = _format_optional_date(_original_document_date(transaction))
        payload["ofp"] = _original_period(transaction)
    return payload


def _build_item_payload(component, *, index):
    return {
        "num": index,
        "itm_det": {
            "rt": _decimal_to_float(component["rate"]),
            "txval": _decimal_to_float(component["taxable_value"]),
            "iamt": _decimal_to_float(component["igst_amount"]),
            "camt": _decimal_to_float(component["cgst_amount"]),
            "samt": _decimal_to_float(component["sgst_amount"]),
            "csamt": _decimal_to_float(component["cess_amount"]),
        },
    }


def _build_gstr3b_interstate_unregistered_rows(transactions, home_state_code):
    grouped = defaultdict(lambda: {"txval": Decimal("0.00"), "iamt": Decimal("0.00")})
    for transaction in transactions:
        if transaction.counterparty_gstin:
            continue
        place_of_supply = str(transaction.place_of_supply or "").strip()
        if not place_of_supply or place_of_supply == home_state_code:
            continue
        grouped[place_of_supply]["txval"] += _to_decimal(transaction.taxable_value)
        grouped[place_of_supply]["iamt"] += _to_decimal(transaction.igst_amount)

    return [
        {
            "pos": place_of_supply,
            "txval": _decimal_to_float(values["txval"]),
            "iamt": _decimal_to_float(values["iamt"]),
        }
        for place_of_supply, values in sorted(grouped.items())
    ]


def _is_large_interstate_invoice(transaction):
    place_of_supply = str(transaction.place_of_supply or "").strip()
    home_state_code = str(getattr(transaction.gstin, "state_code", "") or "").strip()
    total_amount = _to_decimal(transaction.total_amount)
    return bool(place_of_supply and home_state_code and place_of_supply != home_state_code and total_amount >= Decimal("250000.00"))


def _special_supply_type(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    value = str(metadata.get("special_supply_type") or "").strip().lower()
    if value in {"export_wpay", "export_wopay", "sez_wpay", "sez_wopay", "deemed_export"}:
        return value
    return ""


def _ecommerce_gstin(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("ecommerce_gstin") or "").strip().upper()


def _is_amendment_transaction(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return bool(
        metadata.get("is_amendment")
        or metadata.get("original_document_number")
        or metadata.get("original_document_date")
        or metadata.get("original_period")
    )


def _original_document_number(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("original_document_number") or "").strip()


def _original_document_date(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("original_document_date") or "").strip()


def _original_period(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("original_period") or "").strip()


def _invoice_type_code(transaction):
    special_supply_type = _special_supply_type(transaction)
    mapping = {
        "sez_wpay": "SEWP",
        "sez_wopay": "SEWOP",
        "deemed_export": "DE",
    }
    return mapping.get(special_supply_type, "R")


def _export_type_code(transaction):
    special_supply_type = _special_supply_type(transaction)
    if special_supply_type == "export_wopay":
        return "WOPAY"
    return "WPAY"


def _format_optional_date(value):
    if value in (None, ""):
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d-%m-%Y")
    try:
        return _parse_iso_like_date(str(value)).strftime("%d-%m-%Y")
    except ValueError:
        return str(value)


def _parse_iso_like_date(value):
    from datetime import datetime

    for date_format in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, date_format)
        except ValueError:
            continue
    raise ValueError("Unsupported date format")


def _iter_transaction_components(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    raw_items = metadata.get("line_items")
    if not isinstance(raw_items, list) or not raw_items:
        return [
            {
                "taxable_value": _to_decimal(transaction.taxable_value),
                "cgst_amount": _to_decimal(transaction.cgst_amount),
                "sgst_amount": _to_decimal(transaction.sgst_amount),
                "igst_amount": _to_decimal(transaction.igst_amount),
                "cess_amount": _to_decimal(transaction.cess_amount),
                "rate": _rate_percentage(transaction),
            }
        ]

    items = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        taxable_value = _to_decimal(raw_item.get("taxable_value", "0.00"))
        cgst_amount = _to_decimal(raw_item.get("cgst_amount", "0.00"))
        sgst_amount = _to_decimal(raw_item.get("sgst_amount", "0.00"))
        igst_amount = _to_decimal(raw_item.get("igst_amount", "0.00"))
        cess_amount = _to_decimal(raw_item.get("cess_amount", "0.00"))
        tax_amount = cgst_amount + sgst_amount + igst_amount + cess_amount
        rate = _to_decimal(raw_item.get("rate", "0.00"))
        if rate == Decimal("0.00") and taxable_value > Decimal("0.00") and tax_amount:
            rate = (tax_amount / taxable_value) * Decimal("100.00")
        items.append(
            {
                "taxable_value": taxable_value,
                "cgst_amount": cgst_amount,
                "sgst_amount": sgst_amount,
                "igst_amount": igst_amount,
                "cess_amount": cess_amount,
                "rate": _quantize(rate),
            }
        )
    return items or [
        {
            "taxable_value": _to_decimal(transaction.taxable_value),
            "cgst_amount": _to_decimal(transaction.cgst_amount),
            "sgst_amount": _to_decimal(transaction.sgst_amount),
            "igst_amount": _to_decimal(transaction.igst_amount),
            "cess_amount": _to_decimal(transaction.cess_amount),
            "rate": _rate_percentage(transaction),
        }
    ]


def _tax_component_ratios(transactions):
    igst = sum((_to_decimal(item.igst_amount) for item in transactions), Decimal("0.00"))
    cgst = sum((_to_decimal(item.cgst_amount) for item in transactions), Decimal("0.00"))
    sgst = sum((_to_decimal(item.sgst_amount) for item in transactions), Decimal("0.00"))
    cess = sum((_to_decimal(item.cess_amount) for item in transactions), Decimal("0.00"))
    total = igst + cgst + sgst + cess
    if total == Decimal("0.00"):
        return Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00")
    return igst / total, cgst / total, sgst / total, cess / total


def _rate_percentage(transaction):
    taxable_value = _to_decimal(transaction.taxable_value)
    if taxable_value == Decimal("0.00"):
        return Decimal("0.00")
    tax_amount = _to_decimal(transaction.tax_amount)
    if tax_amount == Decimal("0.00"):
        tax_amount = _to_decimal(transaction.cgst_amount) + _to_decimal(transaction.sgst_amount) + _to_decimal(transaction.igst_amount) + _to_decimal(transaction.cess_amount)
    if tax_amount == Decimal("0.00"):
        return Decimal("0.00")
    return _quantize((tax_amount / taxable_value) * Decimal("100.00"))


def _to_whitebooks_period(period):
    if not period or "-" not in period:
        return str(period or "")
    year, month = str(period).split("-", 1)
    return f"{month}{year}"


def _to_decimal(value):
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value or "0.00"))


def _decimal_to_float(value):
    return float(_quantize(_to_decimal(value)))


def _quantize(value):
    return _to_decimal(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
