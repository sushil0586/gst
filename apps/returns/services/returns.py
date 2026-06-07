from decimal import Decimal
from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.services.compliance_periods import ensure_period_modifiable
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation

GSTR1_SECTION_KEYS = (
    "b2b",
    "b2cl",
    "b2cs",
    "cdnr",
    "cdnur",
    "advances_received",
    "advances_adjusted",
    "exports",
    "amendments",
    "ecommerce",
    "nil_exempt_non_gst",
    "hsn_summary",
    "documents_issued",
)


def _build_period_exception_summary(*, transactions):
    exception_rows = []
    for transaction in transactions:
        metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
        period_exception = metadata.get("period_exception")
        if not isinstance(period_exception, dict) or period_exception.get("allowed") is not True:
            continue
        exception_rows.append(
            {
                "transaction_id": str(transaction.id),
                "transaction_type": transaction.transaction_type,
                "document_type": transaction.document_type,
                "document_number": transaction.reference_number,
                "document_date": transaction.transaction_date.isoformat() if transaction.transaction_date else "",
                "reason": str(period_exception.get("reason") or ""),
                "category": str(period_exception.get("category") or "general"),
                "selected_period": str(period_exception.get("selected_period") or ""),
            }
        )
    return {
        "count": len(exception_rows),
        "documents": exception_rows,
    }


def prepare_return(*, workspace_id, client_id, gstin_id, compliance_period_id, return_type, user):
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
    ensure_period_modifiable(compliance_period, actor=user, attempted_action="return.prepare")

    with transaction.atomic():
        instance, _ = ReturnPreparation.objects.select_for_update().get_or_create(
            compliance_period=compliance_period,
            return_type=return_type,
            defaults={
                "created_by": user,
                "updated_by": user,
                "prepared_by": user,
                "status": ReturnPreparation.PreparationStatus.DRAFT,
            },
        )

        if instance.status == ReturnPreparation.PreparationStatus.FILED:
            raise serializers.ValidationError("Filed returns cannot be prepared again.")

        instance.status = ReturnPreparation.PreparationStatus.VALIDATING
        instance.updated_by = user
        instance.prepared_by = user
        instance.save(update_fields=["status", "updated_by", "prepared_by", "updated_at"])

        try:
            if return_type == ReturnPreparation.ReturnType.GSTR1:
                summary = prepare_gstr1(compliance_period=compliance_period)
            elif return_type == ReturnPreparation.ReturnType.GSTR3B:
                summary = prepare_gstr3b(compliance_period=compliance_period)
            elif return_type == ReturnPreparation.ReturnType.GSTR7:
                summary = prepare_gstr7(compliance_period=compliance_period)
            elif return_type == ReturnPreparation.ReturnType.GSTR9:
                summary = prepare_gstr9(compliance_period=compliance_period)
            elif return_type == ReturnPreparation.ReturnType.GSTR9C:
                summary = prepare_gstr9c(compliance_period=compliance_period)
            else:
                raise serializers.ValidationError({"return_type": "Unsupported return type."})

            instance.summary_snapshot = summary
            instance.status = ReturnPreparation.PreparationStatus.READY_FOR_REVIEW
            instance.approved_by = None
            instance.filed_by = None
            instance.filed_at = None
            instance.arn = ""
            instance.save(
                update_fields=[
                    "summary_snapshot",
                    "status",
                    "approved_by",
                    "filed_by",
                    "filed_at",
                    "arn",
                    "updated_by",
                    "updated_at",
                ]
            )
            record_audit_log(
                actor=user,
                action="return_preparation.prepared",
                entity=instance,
                workspace_id=workspace_id,
                client_id=client_id,
                metadata={"return_type": return_type, "status": instance.status},
            )
            return instance
        except Exception as exc:
            instance.status = ReturnPreparation.PreparationStatus.FAILED
            instance.summary_snapshot = {"error": str(exc)}
            instance.save(update_fields=["status", "summary_snapshot", "updated_by", "updated_at"])
            record_audit_log(
                actor=user,
                action="return_preparation.failed",
                entity=instance,
                workspace_id=workspace_id,
                client_id=client_id,
                metadata={"return_type": return_type, "error": str(exc)},
            )
            raise


def prepare_gstr1(*, compliance_period):
    """
    GSTR-1 prepared return snapshot contract:

    - Keep `outward_supplies` backward-compatible for existing UI and export consumers.
    - Add `sections` as the canonical section-first container for downstream parity work.
    - Keep `period_exceptions` at the top level for current workflows.
    """

    transactions = list(
        GSTTransaction.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            transaction_type__in=["sales", "credit_note", "debit_note", "advance_received", "advance_adjusted"],
        ).select_related("gstin")
    )

    sales_transactions = [transaction for transaction in transactions if transaction.transaction_type == "sales"]
    amendment_transactions = [transaction for transaction in transactions if _is_amendment_transaction(transaction)]
    non_amendment_transactions = [transaction for transaction in transactions if not _is_amendment_transaction(transaction)]
    non_amendment_sales_transactions = [transaction for transaction in sales_transactions if not _is_amendment_transaction(transaction)]
    export_transactions = [transaction for transaction in non_amendment_sales_transactions if _special_supply_type(transaction)]
    regular_sales_transactions = [transaction for transaction in non_amendment_sales_transactions if not _special_supply_type(transaction)]
    ecommerce_transactions = [transaction for transaction in non_amendment_sales_transactions if _ecommerce_gstin(transaction)]
    amendment_ecommerce_transactions = [transaction for transaction in amendment_transactions if _ecommerce_gstin(transaction)]
    b2b_transactions = [transaction for transaction in regular_sales_transactions if transaction.counterparty_gstin]
    b2cl_transactions = [
        transaction for transaction in regular_sales_transactions if not transaction.counterparty_gstin and _is_large_interstate_invoice(transaction)
    ]
    b2cs_transactions = [
        transaction for transaction in regular_sales_transactions if not transaction.counterparty_gstin and not _is_large_interstate_invoice(transaction)
    ]
    credit_notes = [transaction for transaction in transactions if transaction.transaction_type == "credit_note"]
    debit_notes = [transaction for transaction in transactions if transaction.transaction_type == "debit_note"]
    advance_received_transactions = [transaction for transaction in transactions if transaction.transaction_type == "advance_received"]
    advance_adjusted_transactions = [transaction for transaction in transactions if transaction.transaction_type == "advance_adjusted"]
    cdnr_transactions = [transaction for transaction in credit_notes + debit_notes if transaction.counterparty_gstin]
    cdnur_transactions = [transaction for transaction in credit_notes + debit_notes if not transaction.counterparty_gstin]
    hsn_transactions = sales_transactions + credit_notes + debit_notes

    total_taxable = _sum_decimal_list(transactions, "taxable_value")
    total_tax = _sum_decimal_list(transactions, "tax_amount")

    section_summaries = {
        "b2b": _build_gstr1_section_summary(transactions=b2b_transactions),
        "b2cl": _build_gstr1_section_summary(transactions=b2cl_transactions),
        "b2cs": _build_gstr1_section_summary(transactions=b2cs_transactions),
        "cdnr": _build_gstr1_section_summary(transactions=cdnr_transactions),
        "cdnur": _build_gstr1_section_summary(transactions=cdnur_transactions),
        "advances_received": _build_advance_section_summary(transactions=advance_received_transactions),
        "advances_adjusted": _build_advance_section_summary(transactions=advance_adjusted_transactions),
        "exports": _build_export_section_summary(transactions=export_transactions),
        "amendments": _build_amendment_section_summary(transactions=amendment_transactions),
        "ecommerce": _build_ecommerce_section_summary(transactions=ecommerce_transactions),
        "nil_exempt_non_gst": _build_nil_exempt_section_summary(transactions=sales_transactions),
        "hsn_summary": _build_hsn_section_summary(transactions=hsn_transactions),
        "documents_issued": _build_document_section_summary(transactions=transactions),
    }

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR1,
        "summary_version": "gstr1.sectioned.v1",
        "outward_supplies": {
            "b2b_taxable_value": section_summaries["b2b"]["taxable_value"],
            "b2b_tax_amount": section_summaries["b2b"]["tax_amount"],
            "b2c_taxable_value": _decimal_to_string(
                _decimal_or_zero(section_summaries["b2cl"]["taxable_value"]) + _decimal_or_zero(section_summaries["b2cs"]["taxable_value"])
            ),
            "b2c_tax_amount": _decimal_to_string(
                _decimal_or_zero(section_summaries["b2cl"]["tax_amount"]) + _decimal_or_zero(section_summaries["b2cs"]["tax_amount"])
            ),
            "credit_note_taxable_value": _decimal_to_string(_sum_decimal_list(credit_notes, "taxable_value")),
            "credit_note_tax_amount": _decimal_to_string(_sum_decimal_list(credit_notes, "tax_amount")),
            "debit_note_taxable_value": _decimal_to_string(_sum_decimal_list(debit_notes, "taxable_value")),
            "debit_note_tax_amount": _decimal_to_string(_sum_decimal_list(debit_notes, "tax_amount")),
            "advance_received_taxable_value": section_summaries["advances_received"]["taxable_value"],
            "advance_received_tax_amount": section_summaries["advances_received"]["tax_amount"],
            "advance_adjusted_taxable_value": section_summaries["advances_adjusted"]["taxable_value"],
            "advance_adjusted_tax_amount": section_summaries["advances_adjusted"]["tax_amount"],
            "export_taxable_value": section_summaries["exports"]["taxable_value"],
            "export_tax_amount": section_summaries["exports"]["tax_amount"],
            "amendment_taxable_value": section_summaries["amendments"]["taxable_value"],
            "amendment_tax_amount": section_summaries["amendments"]["tax_amount"],
            "ecommerce_taxable_value": section_summaries["ecommerce"]["taxable_value"],
            "ecommerce_tax_amount": section_summaries["ecommerce"]["tax_amount"],
            "total_taxable_value": _decimal_to_string(total_taxable),
            "total_tax_amount": _decimal_to_string(total_tax),
            "document_count": len(transactions),
        },
        "sections": section_summaries,
        "period_exceptions": _build_period_exception_summary(transactions=transactions),
    }


def _build_gstr1_section_summary(*, transactions):
    taxable_value = _sum_decimal_list(transactions, "taxable_value")
    cgst_amount = _sum_decimal_list(transactions, "cgst_amount")
    sgst_amount = _sum_decimal_list(transactions, "sgst_amount")
    igst_amount = _sum_decimal_list(transactions, "igst_amount")
    cess_amount = _sum_decimal_list(transactions, "cess_amount")
    tax_amount = _sum_decimal_list(transactions, "tax_amount")
    total_amount = _sum_decimal_list(transactions, "total_amount")
    return {
        "document_count": len(transactions),
        "taxable_value": _decimal_to_string(taxable_value),
        "cgst_amount": _decimal_to_string(cgst_amount),
        "sgst_amount": _decimal_to_string(sgst_amount),
        "igst_amount": _decimal_to_string(igst_amount),
        "cess_amount": _decimal_to_string(cess_amount),
        "tax_amount": _decimal_to_string(tax_amount),
        "total_amount": _decimal_to_string(total_amount),
        "transaction_ids": [str(transaction.id) for transaction in transactions],
    }


def _build_nil_exempt_section_summary(*, transactions):
    rows = []
    totals = {
        "nil_rated": Decimal("0.00"),
        "exempt": Decimal("0.00"),
        "non_gst": Decimal("0.00"),
    }
    counts = {
        "nil_rated": 0,
        "exempt": 0,
        "non_gst": 0,
    }

    for transaction in transactions:
        category = _infer_supply_category(transaction)
        if category not in totals:
            continue
        totals[category] += transaction.taxable_value or Decimal("0.00")
        counts[category] += 1

    for category in ("nil_rated", "exempt", "non_gst"):
        rows.append(
            {
                "category": category,
                "taxable_value": _decimal_to_string(totals[category]),
                "document_count": counts[category],
            }
        )

    return {
        "rows": rows,
        "total_taxable_value": _decimal_to_string(sum(totals.values(), Decimal("0.00"))),
    }


def _build_advance_section_summary(*, transactions):
    grouped = {}
    for transaction in transactions:
        for component in _iter_transaction_components(transaction):
            supply_type = _advance_supply_type(transaction)
            place_of_supply = str(transaction.place_of_supply or "").strip() or "00"
            rate = _decimal_to_string(component["rate"])
            key = (place_of_supply, supply_type, rate)
            entry = grouped.setdefault(
                key,
                {
                    "place_of_supply": place_of_supply,
                    "supply_type": supply_type,
                    "rate": rate,
                    "taxable_value": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "cess_amount": Decimal("0.00"),
                    "tax_amount": Decimal("0.00"),
                    "total_amount": Decimal("0.00"),
                    "transaction_ids": [],
                    "document_refs": set(),
                },
            )
            entry["taxable_value"] += _decimal_or_zero(component["taxable_value"])
            entry["cgst_amount"] += _decimal_or_zero(component["cgst_amount"])
            entry["sgst_amount"] += _decimal_or_zero(component["sgst_amount"])
            entry["igst_amount"] += _decimal_or_zero(component["igst_amount"])
            entry["cess_amount"] += _decimal_or_zero(component["cess_amount"])
            entry["tax_amount"] += (
                _decimal_or_zero(component["cgst_amount"])
                + _decimal_or_zero(component["sgst_amount"])
                + _decimal_or_zero(component["igst_amount"])
                + _decimal_or_zero(component["cess_amount"])
            )
            entry["total_amount"] += _decimal_or_zero(component["total_amount"])
            entry["document_refs"].add(str(transaction.reference_number or ""))
            transaction_id = str(transaction.id)
            if transaction_id not in entry["transaction_ids"]:
                entry["transaction_ids"].append(transaction_id)

    rows = []
    for key in sorted(grouped.keys()):
        entry = grouped[key]
        rows.append(
            {
                "place_of_supply": entry["place_of_supply"],
                "supply_type": entry["supply_type"],
                "rate": entry["rate"],
                "taxable_value": _decimal_to_string(entry["taxable_value"]),
                "cgst_amount": _decimal_to_string(entry["cgst_amount"]),
                "sgst_amount": _decimal_to_string(entry["sgst_amount"]),
                "igst_amount": _decimal_to_string(entry["igst_amount"]),
                "cess_amount": _decimal_to_string(entry["cess_amount"]),
                "tax_amount": _decimal_to_string(entry["tax_amount"]),
                "total_amount": _decimal_to_string(entry["total_amount"]),
                "document_count": len(entry["document_refs"]),
                "transaction_ids": entry["transaction_ids"],
            }
        )

    return {
        "row_count": len(rows),
        "taxable_value": _decimal_to_string(_sum_decimal_list(transactions, "taxable_value")),
        "cgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "cgst_amount")),
        "sgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "sgst_amount")),
        "igst_amount": _decimal_to_string(_sum_decimal_list(transactions, "igst_amount")),
        "cess_amount": _decimal_to_string(_sum_decimal_list(transactions, "cess_amount")),
        "tax_amount": _decimal_to_string(_sum_decimal_list(transactions, "tax_amount")),
        "total_amount": _decimal_to_string(_sum_decimal_list(transactions, "total_amount")),
        "transaction_ids": [str(transaction.id) for transaction in transactions],
        "rows": rows,
    }


def _build_export_section_summary(*, transactions):
    grouped = {}
    for transaction in transactions:
        supply_type = _special_supply_type(transaction)
        if not supply_type:
            continue
        for component in _iter_transaction_components(transaction):
            rate = _decimal_to_string(component["rate"])
            key = (supply_type, rate)
            entry = grouped.setdefault(
                key,
                {
                    "special_supply_type": supply_type,
                    "rate": rate,
                    "taxable_value": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "cess_amount": Decimal("0.00"),
                    "tax_amount": Decimal("0.00"),
                    "total_amount": Decimal("0.00"),
                    "transaction_ids": [],
                    "document_refs": set(),
                },
            )
            entry["taxable_value"] += _decimal_or_zero(component["taxable_value"])
            entry["cgst_amount"] += _decimal_or_zero(component["cgst_amount"])
            entry["sgst_amount"] += _decimal_or_zero(component["sgst_amount"])
            entry["igst_amount"] += _decimal_or_zero(component["igst_amount"])
            entry["cess_amount"] += _decimal_or_zero(component["cess_amount"])
            entry["tax_amount"] += (
                _decimal_or_zero(component["cgst_amount"])
                + _decimal_or_zero(component["sgst_amount"])
                + _decimal_or_zero(component["igst_amount"])
                + _decimal_or_zero(component["cess_amount"])
            )
            entry["total_amount"] += _decimal_or_zero(component["total_amount"])
            entry["document_refs"].add(str(transaction.reference_number or ""))
            transaction_id = str(transaction.id)
            if transaction_id not in entry["transaction_ids"]:
                entry["transaction_ids"].append(transaction_id)

    rows = []
    for key in sorted(grouped.keys()):
        entry = grouped[key]
        rows.append(
            {
                "special_supply_type": entry["special_supply_type"],
                "rate": entry["rate"],
                "taxable_value": _decimal_to_string(entry["taxable_value"]),
                "cgst_amount": _decimal_to_string(entry["cgst_amount"]),
                "sgst_amount": _decimal_to_string(entry["sgst_amount"]),
                "igst_amount": _decimal_to_string(entry["igst_amount"]),
                "cess_amount": _decimal_to_string(entry["cess_amount"]),
                "tax_amount": _decimal_to_string(entry["tax_amount"]),
                "total_amount": _decimal_to_string(entry["total_amount"]),
                "document_count": len(entry["document_refs"]),
                "transaction_ids": entry["transaction_ids"],
            }
        )

    return {
        "row_count": len(rows),
        "taxable_value": _decimal_to_string(_sum_decimal_list(transactions, "taxable_value")),
        "cgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "cgst_amount")),
        "sgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "sgst_amount")),
        "igst_amount": _decimal_to_string(_sum_decimal_list(transactions, "igst_amount")),
        "cess_amount": _decimal_to_string(_sum_decimal_list(transactions, "cess_amount")),
        "tax_amount": _decimal_to_string(_sum_decimal_list(transactions, "tax_amount")),
        "total_amount": _decimal_to_string(_sum_decimal_list(transactions, "total_amount")),
        "transaction_ids": [str(transaction.id) for transaction in transactions],
        "rows": rows,
    }


def _build_amendment_section_summary(*, transactions):
    grouped = {}
    for transaction in transactions:
        target_section = _amendment_target_section(transaction)
        key = (target_section, str(_original_period(transaction) or ""))
        entry = grouped.setdefault(
            key,
            {
                "target_section": target_section,
                "original_period": str(_original_period(transaction) or ""),
                "taxable_value": Decimal("0.00"),
                "cgst_amount": Decimal("0.00"),
                "sgst_amount": Decimal("0.00"),
                "igst_amount": Decimal("0.00"),
                "cess_amount": Decimal("0.00"),
                "tax_amount": Decimal("0.00"),
                "total_amount": Decimal("0.00"),
                "rows": [],
            },
        )
        entry["taxable_value"] += _decimal_or_zero(transaction.taxable_value)
        entry["cgst_amount"] += _decimal_or_zero(transaction.cgst_amount)
        entry["sgst_amount"] += _decimal_or_zero(transaction.sgst_amount)
        entry["igst_amount"] += _decimal_or_zero(transaction.igst_amount)
        entry["cess_amount"] += _decimal_or_zero(transaction.cess_amount)
        entry["tax_amount"] += _decimal_or_zero(transaction.tax_amount)
        entry["total_amount"] += _decimal_or_zero(transaction.total_amount)
        entry["rows"].append(
            {
                "transaction_id": str(transaction.id),
                "transaction_type": transaction.transaction_type,
                "document_type": transaction.document_type,
                "document_number": transaction.reference_number,
                "document_date": transaction.transaction_date.isoformat() if transaction.transaction_date else "",
                "original_document_number": _original_document_number(transaction),
                "original_document_date": _original_document_date(transaction),
                "original_period": str(_original_period(transaction) or ""),
                "original_counterparty_gstin": _original_counterparty_gstin(transaction),
                "target_section": target_section,
                "ecommerce_gstin": _ecommerce_gstin(transaction),
                "special_supply_type": _special_supply_type(transaction),
                "taxable_value": _decimal_to_string(transaction.taxable_value),
                "tax_amount": _decimal_to_string(transaction.tax_amount),
            }
        )

    rows = []
    for key in sorted(grouped.keys()):
        entry = grouped[key]
        rows.append(
            {
                "target_section": entry["target_section"],
                "original_period": entry["original_period"],
                "document_count": len(entry["rows"]),
                "taxable_value": _decimal_to_string(entry["taxable_value"]),
                "cgst_amount": _decimal_to_string(entry["cgst_amount"]),
                "sgst_amount": _decimal_to_string(entry["sgst_amount"]),
                "igst_amount": _decimal_to_string(entry["igst_amount"]),
                "cess_amount": _decimal_to_string(entry["cess_amount"]),
                "tax_amount": _decimal_to_string(entry["tax_amount"]),
                "total_amount": _decimal_to_string(entry["total_amount"]),
                "documents": entry["rows"],
            }
        )

    return {
        "row_count": len(rows),
        "taxable_value": _decimal_to_string(_sum_decimal_list(transactions, "taxable_value")),
        "cgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "cgst_amount")),
        "sgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "sgst_amount")),
        "igst_amount": _decimal_to_string(_sum_decimal_list(transactions, "igst_amount")),
        "cess_amount": _decimal_to_string(_sum_decimal_list(transactions, "cess_amount")),
        "tax_amount": _decimal_to_string(_sum_decimal_list(transactions, "tax_amount")),
        "total_amount": _decimal_to_string(_sum_decimal_list(transactions, "total_amount")),
        "transaction_ids": [str(transaction.id) for transaction in transactions],
        "rows": rows,
    }


def _build_ecommerce_section_summary(*, transactions):
    grouped = {}
    for transaction in transactions:
        ecommerce_gstin = _ecommerce_gstin(transaction)
        if not ecommerce_gstin:
            continue
        section_code = _ecommerce_section(transaction)
        for component in _iter_transaction_components(transaction):
            rate = _decimal_to_string(component["rate"])
            place_of_supply = str(transaction.place_of_supply or "").strip() or "00"
            key = (ecommerce_gstin, section_code, place_of_supply, rate)
            entry = grouped.setdefault(
                key,
                {
                    "ecommerce_gstin": ecommerce_gstin,
                    "section_code": section_code,
                    "place_of_supply": place_of_supply,
                    "rate": rate,
                    "taxable_value": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "cess_amount": Decimal("0.00"),
                    "tax_amount": Decimal("0.00"),
                    "total_amount": Decimal("0.00"),
                    "document_refs": set(),
                },
            )
            entry["taxable_value"] += _decimal_or_zero(component["taxable_value"])
            entry["cgst_amount"] += _decimal_or_zero(component["cgst_amount"])
            entry["sgst_amount"] += _decimal_or_zero(component["sgst_amount"])
            entry["igst_amount"] += _decimal_or_zero(component["igst_amount"])
            entry["cess_amount"] += _decimal_or_zero(component["cess_amount"])
            entry["tax_amount"] += (
                _decimal_or_zero(component["cgst_amount"])
                + _decimal_or_zero(component["sgst_amount"])
                + _decimal_or_zero(component["igst_amount"])
                + _decimal_or_zero(component["cess_amount"])
            )
            entry["total_amount"] += _decimal_or_zero(component["total_amount"])
            entry["document_refs"].add(str(transaction.reference_number or ""))

    rows = []
    for key in sorted(grouped.keys()):
        entry = grouped[key]
        rows.append(
            {
                "ecommerce_gstin": entry["ecommerce_gstin"],
                "section_code": entry["section_code"],
                "place_of_supply": entry["place_of_supply"],
                "rate": entry["rate"],
                "document_count": len(entry["document_refs"]),
                "taxable_value": _decimal_to_string(entry["taxable_value"]),
                "cgst_amount": _decimal_to_string(entry["cgst_amount"]),
                "sgst_amount": _decimal_to_string(entry["sgst_amount"]),
                "igst_amount": _decimal_to_string(entry["igst_amount"]),
                "cess_amount": _decimal_to_string(entry["cess_amount"]),
                "tax_amount": _decimal_to_string(entry["tax_amount"]),
                "total_amount": _decimal_to_string(entry["total_amount"]),
            }
        )

    return {
        "row_count": len(rows),
        "taxable_value": _decimal_to_string(_sum_decimal_list(transactions, "taxable_value")),
        "cgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "cgst_amount")),
        "sgst_amount": _decimal_to_string(_sum_decimal_list(transactions, "sgst_amount")),
        "igst_amount": _decimal_to_string(_sum_decimal_list(transactions, "igst_amount")),
        "cess_amount": _decimal_to_string(_sum_decimal_list(transactions, "cess_amount")),
        "tax_amount": _decimal_to_string(_sum_decimal_list(transactions, "tax_amount")),
        "total_amount": _decimal_to_string(_sum_decimal_list(transactions, "total_amount")),
        "transaction_ids": [str(transaction.id) for transaction in transactions],
        "rows": rows,
    }


def _build_hsn_section_summary(*, transactions):
    grouped = {}
    for transaction in transactions:
        for component in _iter_transaction_components(transaction):
            hsn = str(component["hsn_code"] or "UNSPECIFIED")
            is_service = bool(component["is_service"])
            rate = _decimal_to_string(component["rate"])
            key = (hsn, is_service, rate)
            entry = grouped.setdefault(
                key,
                {
                    "quantity": Decimal("0.00"),
                    "taxable_value": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "cess_amount": Decimal("0.00"),
                    "document_refs": set(),
                },
            )
            entry["quantity"] += _decimal_or_zero(component["quantity"])
            entry["taxable_value"] += _decimal_or_zero(component["taxable_value"])
            entry["cgst_amount"] += _decimal_or_zero(component["cgst_amount"])
            entry["sgst_amount"] += _decimal_or_zero(component["sgst_amount"])
            entry["igst_amount"] += _decimal_or_zero(component["igst_amount"])
            entry["cess_amount"] += _decimal_or_zero(component["cess_amount"])
            entry["document_refs"].add(str(component["reference_number"]))

    rows = []
    for (hsn, is_service, rate), entry in sorted(grouped.items()):
        rows.append(
            {
                "hsn_code": hsn,
                "is_service": is_service,
                "rate": rate,
                "quantity": _decimal_to_string(entry["quantity"]),
                "taxable_value": _decimal_to_string(entry["taxable_value"]),
                "cgst_amount": _decimal_to_string(entry["cgst_amount"]),
                "sgst_amount": _decimal_to_string(entry["sgst_amount"]),
                "igst_amount": _decimal_to_string(entry["igst_amount"]),
                "cess_amount": _decimal_to_string(entry["cess_amount"]),
                "document_count": len(entry["document_refs"]),
            }
        )

    return {
        "row_count": len(rows),
        "rows": rows,
    }


def _build_document_section_summary(*, transactions):
    grouped = {}
    for transaction in transactions:
        key = (transaction.transaction_type, transaction.document_type)
        entry = grouped.setdefault(
            key,
            {
                "count": 0,
                "reference_numbers": [],
            },
        )
        entry["count"] += 1
        entry["reference_numbers"].append(str(transaction.reference_number or ""))

    rows = []
    for (transaction_type, document_type), entry in sorted(grouped.items()):
        references = sorted(filter(None, entry["reference_numbers"]))
        rows.append(
            {
                "transaction_type": transaction_type,
                "document_type": document_type,
                "document_count": entry["count"],
                "first_reference_number": references[0] if references else "",
                "last_reference_number": references[-1] if references else "",
            }
        )

    return {
        "row_count": len(rows),
        "rows": rows,
    }


def _decimal_to_string(value):
    return f"{_decimal_or_zero(value):.2f}"


def _decimal_or_zero(value):
    if value in (None, ""):
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _sum_decimal_list(transactions, field_name):
    total = Decimal("0.00")
    for transaction in transactions:
        total += getattr(transaction, field_name) or Decimal("0.00")
    return total


def _calculate_rate(transaction):
    taxable_value = transaction.taxable_value or Decimal("0.00")
    if not taxable_value:
        return Decimal("0.00")
    return ((transaction.tax_amount or Decimal("0.00")) / taxable_value) * Decimal("100.00")


def _iter_transaction_components(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    raw_components = metadata.get("line_items")
    if not isinstance(raw_components, list) or not raw_components:
        return [
            {
                "hsn_code": str(metadata.get("hsn_code") or "UNSPECIFIED"),
                "uqc": str(metadata.get("uqc") or ""),
                "quantity": _decimal_or_zero(metadata.get("quantity")),
                "taxable_value": _decimal_or_zero(transaction.taxable_value),
                "cgst_amount": _decimal_or_zero(transaction.cgst_amount),
                "sgst_amount": _decimal_or_zero(transaction.sgst_amount),
                "igst_amount": _decimal_or_zero(transaction.igst_amount),
                "cess_amount": _decimal_or_zero(transaction.cess_amount),
                "total_amount": _decimal_or_zero(transaction.total_amount),
                "is_service": bool(metadata.get("is_service") or metadata.get("service")),
                "description": str(metadata.get("description") or transaction.counterparty_name or "Outward supply"),
                "rate": _calculate_rate(transaction),
                "reference_number": transaction.reference_number,
            }
        ]

    components = []
    for item in raw_components:
        if not isinstance(item, dict):
            continue
        taxable_value = _decimal_or_zero(item.get("taxable_value"))
        cgst_amount = _decimal_or_zero(item.get("cgst_amount"))
        sgst_amount = _decimal_or_zero(item.get("sgst_amount"))
        igst_amount = _decimal_or_zero(item.get("igst_amount"))
        cess_amount = _decimal_or_zero(item.get("cess_amount"))
        tax_amount = cgst_amount + sgst_amount + igst_amount + cess_amount
        rate = _decimal_or_zero(item.get("rate"))
        if rate == Decimal("0.00") and taxable_value > Decimal("0.00"):
            rate = (tax_amount / taxable_value) * Decimal("100.00") if tax_amount else Decimal("0.00")
        total_amount = _decimal_or_zero(item.get("total_amount"))
        if total_amount == Decimal("0.00"):
            total_amount = taxable_value + tax_amount
        components.append(
            {
                "hsn_code": str(item.get("hsn_code") or metadata.get("hsn_code") or "UNSPECIFIED"),
                "uqc": str(item.get("uqc") or metadata.get("uqc") or ""),
                "quantity": _decimal_or_zero(item.get("quantity")),
                "taxable_value": taxable_value,
                "cgst_amount": cgst_amount,
                "sgst_amount": sgst_amount,
                "igst_amount": igst_amount,
                "cess_amount": cess_amount,
                "total_amount": total_amount,
                "is_service": bool(item.get("is_service") if item.get("is_service") is not None else metadata.get("is_service") or metadata.get("service")),
                "description": str(item.get("description") or metadata.get("description") or transaction.counterparty_name or "Outward supply"),
                "rate": rate,
                "reference_number": transaction.reference_number,
            }
        )

    return components or [
        {
            "hsn_code": str(metadata.get("hsn_code") or "UNSPECIFIED"),
            "uqc": str(metadata.get("uqc") or ""),
            "quantity": _decimal_or_zero(metadata.get("quantity")),
            "taxable_value": _decimal_or_zero(transaction.taxable_value),
            "cgst_amount": _decimal_or_zero(transaction.cgst_amount),
            "sgst_amount": _decimal_or_zero(transaction.sgst_amount),
            "igst_amount": _decimal_or_zero(transaction.igst_amount),
            "cess_amount": _decimal_or_zero(transaction.cess_amount),
            "total_amount": _decimal_or_zero(transaction.total_amount),
            "is_service": bool(metadata.get("is_service") or metadata.get("service")),
            "description": str(metadata.get("description") or transaction.counterparty_name or "Outward supply"),
            "rate": _calculate_rate(transaction),
            "reference_number": transaction.reference_number,
        }
    ]


def _is_large_interstate_invoice(transaction):
    gstin_state = getattr(transaction.gstin, "state_code", "")
    place_of_supply = str(transaction.place_of_supply or "").strip()
    is_interstate = bool(place_of_supply and gstin_state and place_of_supply != gstin_state)
    return is_interstate and (transaction.total_amount or Decimal("0.00")) >= Decimal("250000.00")


def _advance_supply_type(transaction):
    return "INTER" if _decimal_or_zero(transaction.igst_amount) > Decimal("0.00") else "INTRA"


def _special_supply_type(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    special_supply_type = str(metadata.get("special_supply_type") or "").strip().lower()
    if special_supply_type in {"export_wpay", "export_wopay", "sez_wpay", "sez_wopay", "deemed_export"}:
        return special_supply_type
    return ""


def _ecommerce_gstin(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("ecommerce_gstin") or "").strip().upper()


def _ecommerce_section(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    value = str(metadata.get("ecommerce_section") or "").strip().lower()
    if value in {"table_14", "table_15"}:
        return value
    return "table_14" if _ecommerce_gstin(transaction) else ""


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


def _original_counterparty_gstin(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("original_counterparty_gstin") or "").strip().upper()


def _amendment_target_section(transaction):
    if _ecommerce_gstin(transaction):
        return _ecommerce_section(transaction)
    special_supply_type = _special_supply_type(transaction)
    if special_supply_type:
        return special_supply_type
    if transaction.transaction_type in {"credit_note", "debit_note"}:
        return "cdnr" if transaction.counterparty_gstin else "cdnur"
    if transaction.counterparty_gstin:
        return "b2b"
    if _is_large_interstate_invoice(transaction):
        return "b2cl"
    return "b2cs"


def _infer_supply_category(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    category = metadata.get("supply_category")
    if category in {"nil_rated", "exempt", "non_gst"}:
        return category
    if metadata.get("is_non_gst"):
        return "non_gst"
    if metadata.get("is_exempt"):
        return "exempt"
    tax_amount = _decimal_or_zero(transaction.tax_amount)
    taxable_value = _decimal_or_zero(transaction.taxable_value)
    if tax_amount == Decimal("0.00") and taxable_value > Decimal("0.00"):
        return "nil_rated"
    return None


def prepare_gstr7(*, compliance_period):
    transactions = list(
        GSTTransaction.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            transaction_type="tds_deducted",
        ).select_related("gstin")
    )

    grouped = {}
    for transaction in transactions:
        deductee_gstin = str(transaction.counterparty_gstin or "").strip().upper()
        deductee_name = str(transaction.counterparty_name or "").strip()
        key = (deductee_gstin, deductee_name)
        entry = grouped.setdefault(
            key,
            {
                "deductee_gstin": deductee_gstin,
                "deductee_name": deductee_name,
                "document_count": 0,
                "payment_amount": Decimal("0.00"),
                "taxable_value": Decimal("0.00"),
                "igst_amount": Decimal("0.00"),
                "cgst_amount": Decimal("0.00"),
                "sgst_amount": Decimal("0.00"),
                "tds_amount": Decimal("0.00"),
                "transaction_ids": [],
            },
        )
        entry["document_count"] += 1
        entry["payment_amount"] += _decimal_or_zero(transaction.total_amount)
        entry["taxable_value"] += _decimal_or_zero(transaction.taxable_value)
        entry["igst_amount"] += _decimal_or_zero(transaction.igst_amount)
        entry["cgst_amount"] += _decimal_or_zero(transaction.cgst_amount)
        entry["sgst_amount"] += _decimal_or_zero(transaction.sgst_amount)
        entry["tds_amount"] += _decimal_or_zero(transaction.tax_amount)
        entry["transaction_ids"].append(str(transaction.id))

    deductee_rows = []
    for key in sorted(grouped.keys()):
        entry = grouped[key]
        deductee_rows.append(
            {
                "deductee_gstin": entry["deductee_gstin"],
                "deductee_name": entry["deductee_name"],
                "document_count": entry["document_count"],
                "payment_amount": _decimal_to_string(entry["payment_amount"]),
                "taxable_value": _decimal_to_string(entry["taxable_value"]),
                "igst_amount": _decimal_to_string(entry["igst_amount"]),
                "cgst_amount": _decimal_to_string(entry["cgst_amount"]),
                "sgst_amount": _decimal_to_string(entry["sgst_amount"]),
                "tds_amount": _decimal_to_string(entry["tds_amount"]),
                "transaction_ids": entry["transaction_ids"],
            }
        )

    total_payment_amount = _sum_decimal_list(transactions, "total_amount")
    total_taxable_value = _sum_decimal_list(transactions, "taxable_value")
    total_igst_amount = _sum_decimal_list(transactions, "igst_amount")
    total_cgst_amount = _sum_decimal_list(transactions, "cgst_amount")
    total_sgst_amount = _sum_decimal_list(transactions, "sgst_amount")
    total_tds_amount = _sum_decimal_list(transactions, "tax_amount")

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR7,
        "summary_version": "gstr7.monthly.v1",
        "tds_summary": {
            "document_count": len(transactions),
            "deductee_count": len(deductee_rows),
            "payment_amount": _decimal_to_string(total_payment_amount),
            "taxable_value": _decimal_to_string(total_taxable_value),
            "igst_amount": _decimal_to_string(total_igst_amount),
            "cgst_amount": _decimal_to_string(total_cgst_amount),
            "sgst_amount": _decimal_to_string(total_sgst_amount),
            "tds_amount": _decimal_to_string(total_tds_amount),
        },
        "deductees": {
            "row_count": len(deductee_rows),
            "rows": deductee_rows,
        },
        "period_exceptions": _build_period_exception_summary(transactions=transactions),
    }


def prepare_gstr3b(*, compliance_period):
    outward_transactions = GSTTransaction.objects.filter(
        is_active=True,
        compliance_period=compliance_period,
        transaction_type__in=["sales", "debit_note", "credit_note"],
    )
    latest_run = (
        ReconciliationRun.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
            status=ReconciliationRun.RunStatus.COMPLETED,
        )
        .order_by("-processed_at", "-created_at")
        .first()
    )

    items = latest_run.items.all() if latest_run else ReconciliationItem.objects.none()
    books_itc = Decimal("0.00")
    reflected_itc = Decimal("0.00")
    claim_ready_itc = Decimal("0.00")
    pending_2b_itc = Decimal("0.00")
    pending_review_itc = Decimal("0.00")
    blocked_itc = Decimal("0.00")
    timing_difference_itc = Decimal("0.00")
    vendor_followup_required_itc = Decimal("0.00")
    itc_at_risk = Decimal("0.00")
    deferred_blocked_itc = Decimal("0.00")
    unresolved_mismatch_count = 0
    claim_ready_count = 0
    pending_2b_count = 0
    pending_review_count = 0
    blocked_count = 0
    timing_difference_count = 0
    vendor_followup_required_count = 0
    manual_review_decision_count = 0
    manual_claim_now_count = 0
    manual_defer_count = 0
    manual_blocked_count = 0
    manual_vendor_followup_count = 0

    for item in items:
        books_tax = item.books_transaction.tax_amount if item.books_transaction else Decimal("0.00")
        portal_tax = item.portal_transaction.tax_amount if item.portal_transaction else Decimal("0.00")
        decision_tax = portal_tax or books_tax

        books_itc += books_tax
        reflected_itc += portal_tax

        if item.review_decision == ReconciliationItem.ReviewDecision.CLAIM_NOW:
            manual_review_decision_count += 1
            manual_claim_now_count += 1
            claim_ready_itc += decision_tax
            claim_ready_count += 1
            continue
        if item.review_decision == ReconciliationItem.ReviewDecision.DEFER:
            manual_review_decision_count += 1
            manual_defer_count += 1
            deferred_blocked_itc += decision_tax
            pending_2b_itc += decision_tax
            pending_2b_count += 1
            continue
        if item.review_decision == ReconciliationItem.ReviewDecision.BLOCKED:
            manual_review_decision_count += 1
            manual_blocked_count += 1
            blocked_itc += decision_tax
            blocked_count += 1
            itc_at_risk += decision_tax
            if item.match_status != ReconciliationItem.MatchStatus.MATCHED:
                unresolved_mismatch_count += 1
            continue
        if item.review_decision == ReconciliationItem.ReviewDecision.VENDOR_FOLLOW_UP:
            manual_review_decision_count += 1
            manual_vendor_followup_count += 1
            vendor_followup_required_itc += decision_tax
            vendor_followup_required_count += 1
            itc_at_risk += decision_tax
            if item.match_status != ReconciliationItem.MatchStatus.MATCHED:
                unresolved_mismatch_count += 1
            continue

        if item.action_status in {
            ReconciliationItem.ActionStatus.DEFERRED,
            ReconciliationItem.ActionStatus.IGNORED,
        }:
            deferred_blocked_itc += decision_tax
            continue

        if item.action_status == ReconciliationItem.ActionStatus.RESOLVED:
            claim_ready_itc += decision_tax
            claim_ready_count += 1
            continue

        if item.itc_status == ReconciliationItem.ITCStatus.ITC_READY:
            claim_ready_itc += decision_tax
            claim_ready_count += 1
        elif item.itc_status == ReconciliationItem.ITCStatus.ITC_PENDING_2B:
            pending_2b_itc += decision_tax
            pending_2b_count += 1
            itc_at_risk += decision_tax
        elif item.itc_status == ReconciliationItem.ITCStatus.ITC_TIMING_DIFFERENCE:
            timing_difference_itc += decision_tax
            timing_difference_count += 1
            itc_at_risk += decision_tax
        elif item.itc_status == ReconciliationItem.ITCStatus.ITC_VENDOR_FOLLOWUP_REQUIRED:
            vendor_followup_required_itc += decision_tax
            vendor_followup_required_count += 1
            itc_at_risk += decision_tax
        elif item.itc_status == ReconciliationItem.ITCStatus.ITC_BLOCKED:
            blocked_itc += decision_tax
            blocked_count += 1
            itc_at_risk += decision_tax
        else:
            pending_review_itc += decision_tax
            pending_review_count += 1
            itc_at_risk += decision_tax

        if item.match_status != ReconciliationItem.MatchStatus.MATCHED and item.action_status != ReconciliationItem.ActionStatus.RESOLVED:
            unresolved_mismatch_count += 1

    outward_taxable_value = _sum_decimal(outward_transactions, "taxable_value")
    outward_tax_liability = _sum_decimal(outward_transactions, "tax_amount")
    net_tax_payable = outward_tax_liability - claim_ready_itc
    if net_tax_payable < Decimal("0.00"):
        net_tax_payable = Decimal("0.00")

    latest_run_itc_summary = {
        "itc_ready_count": latest_run.itc_ready_count if latest_run else claim_ready_count,
        "itc_pending_2b_count": latest_run.itc_pending_2b_count if latest_run else pending_2b_count,
        "itc_pending_review_count": latest_run.itc_pending_review_count if latest_run else pending_review_count,
        "itc_blocked_count": latest_run.itc_blocked_count if latest_run else blocked_count,
        "itc_timing_difference_count": latest_run.itc_timing_difference_count if latest_run else timing_difference_count,
        "itc_vendor_followup_required_count": latest_run.itc_vendor_followup_required_count if latest_run else vendor_followup_required_count,
    }
    prior_period_deferred_summary = _build_prior_period_deferred_summary(compliance_period=compliance_period)

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR3B,
        "outward_supplies": {
            "outward_taxable_value": str(outward_taxable_value),
            "outward_tax_liability": str(outward_tax_liability),
        },
        "itc_summary": {
            "books_itc": str(books_itc),
            "reflected_itc": str(reflected_itc),
            "claim_ready_itc": str(claim_ready_itc),
            "pending_2b_itc": str(pending_2b_itc),
            "pending_review_itc": str(pending_review_itc),
            "blocked_itc": str(blocked_itc),
            "timing_difference_itc": str(timing_difference_itc),
            "vendor_followup_required_itc": str(vendor_followup_required_itc),
            "claim_ready_count": claim_ready_count,
            "pending_2b_count": pending_2b_count,
            "pending_review_count": pending_review_count,
            "blocked_count": blocked_count,
            "timing_difference_count": timing_difference_count,
            "vendor_followup_required_count": vendor_followup_required_count,
            "eligible_itc": str(claim_ready_itc),
            "itc_at_risk": str(itc_at_risk),
            "deferred_blocked_itc": str(deferred_blocked_itc),
            "net_tax_payable": str(net_tax_payable),
            "unresolved_mismatch_count": unresolved_mismatch_count,
        },
        "reconciliation": {
            "latest_run_id": str(latest_run.id) if latest_run else None,
            "matched_count": latest_run.matched_count if latest_run else 0,
            "partial_match_count": latest_run.partial_match_count if latest_run else 0,
            "missing_in_books_count": latest_run.missing_in_books_count if latest_run else 0,
            "missing_in_portal_count": latest_run.missing_in_portal_count if latest_run else 0,
            "duplicate_count": latest_run.duplicate_count if latest_run else 0,
            "manual_review_decision_count": manual_review_decision_count,
            "manual_claim_now_count": manual_claim_now_count,
            "manual_defer_count": manual_defer_count,
            "manual_blocked_count": manual_blocked_count,
            "manual_vendor_followup_count": manual_vendor_followup_count,
            **prior_period_deferred_summary,
            **latest_run_itc_summary,
        },
        "period_exceptions": _build_period_exception_summary(
            transactions=GSTTransaction.objects.filter(
                is_active=True,
                compliance_period=compliance_period,
                transaction_type__in=["sales", "debit_note", "credit_note", "purchase", "gstr_2b"],
            )
        ),
    }


def prepare_gstr9(*, compliance_period):
    financial_year = _get_financial_year_label(compliance_period.period)
    expected_periods = _get_financial_year_periods(compliance_period.period)

    monthly_preparations = list(
        ReturnPreparation.objects.filter(
            is_active=True,
            compliance_period__gstin=compliance_period.gstin,
            compliance_period__period__in=expected_periods,
            return_type__in=[ReturnPreparation.ReturnType.GSTR1, ReturnPreparation.ReturnType.GSTR3B],
        ).select_related("compliance_period")
    )

    gstr1_preparations = [item for item in monthly_preparations if item.return_type == ReturnPreparation.ReturnType.GSTR1]
    gstr3b_preparations = [item for item in monthly_preparations if item.return_type == ReturnPreparation.ReturnType.GSTR3B]

    gstr1_periods = sorted({item.compliance_period.period for item in gstr1_preparations})
    gstr3b_periods = sorted({item.compliance_period.period for item in gstr3b_preparations})
    available_periods = sorted(set(gstr1_periods) | set(gstr3b_periods))
    missing_periods = [period for period in expected_periods if period not in available_periods]
    blocked_source_periods = sorted(
        {
            item.compliance_period.period
            for item in monthly_preparations
            if item.status == ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION
        }
    )
    failed_source_periods = sorted(
        {
            item.compliance_period.period
            for item in monthly_preparations
            if item.status == ReturnPreparation.PreparationStatus.FAILED
        }
    )
    filed_source_periods = sorted(
        {
            item.compliance_period.period
            for item in monthly_preparations
            if item.status == ReturnPreparation.PreparationStatus.FILED
        }
    )

    gstr1_summaries = [_as_mapping(item.summary_snapshot) for item in gstr1_preparations]
    gstr3b_summaries = [_as_mapping(item.summary_snapshot) for item in gstr3b_preparations]

    annual_outward_taxable = _sum_summary_decimals(
        gstr3b_summaries,
        ("outward_supplies", "outward_taxable_value"),
    )
    annual_outward_liability = _sum_summary_decimals(
        gstr3b_summaries,
        ("outward_supplies", "outward_tax_liability"),
    )
    gstr1_outward_taxable = _sum_summary_decimals(
        gstr1_summaries,
        ("outward_supplies", "total_taxable_value"),
    )
    gstr1_outward_tax = _sum_summary_decimals(
        gstr1_summaries,
        ("outward_supplies", "total_tax_amount"),
    )
    annual_claim_ready_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "claim_ready_itc"))
    annual_books_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "books_itc"))
    annual_reflected_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "reflected_itc"))
    annual_pending_2b_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "pending_2b_itc"))
    annual_pending_review_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "pending_review_itc"))
    annual_blocked_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "blocked_itc"))
    annual_timing_difference_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "timing_difference_itc"))
    annual_vendor_followup_itc = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "vendor_followup_required_itc"))
    annual_itc_at_risk = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "itc_at_risk"))
    annual_net_tax_payable = _sum_summary_decimals(gstr3b_summaries, ("itc_summary", "net_tax_payable"))

    annual_period_exception_count = sum(
        _summary_int(_get_nested_value(summary, "period_exceptions", "count"))
        for summary in [*gstr1_summaries, *gstr3b_summaries]
    )
    annual_unresolved_mismatch_count = sum(
        _summary_int(_get_nested_value(summary, "itc_summary", "unresolved_mismatch_count"))
        for summary in gstr3b_summaries
    )
    annual_manual_decision_count = sum(
        _summary_int(_get_nested_value(summary, "reconciliation", "manual_review_decision_count"))
        for summary in gstr3b_summaries
    )
    annual_amendment_count = sum(
        _summary_int(_get_nested_value(summary, "sections", "amendments", "document_count"))
        for summary in gstr1_summaries
    )

    warning_items = []
    if missing_periods:
        warning_items.append(
            {
                "code": "missing_source_months",
                "severity": "warning",
                "title": "Some months are missing from annual aggregation",
                "detail": f"{len(missing_periods)} monthly period(s) do not yet have prepared GST return inputs for this financial year.",
                "periods": missing_periods,
            }
        )
    if blocked_source_periods:
        warning_items.append(
            {
                "code": "blocked_source_months",
                "severity": "warning",
                "title": "Some source months are blocked",
                "detail": "One or more monthly return drafts are blocked by stale reconciliation and may affect annual completeness.",
                "periods": blocked_source_periods,
            }
        )
    if failed_source_periods:
        warning_items.append(
            {
                "code": "failed_source_months",
                "severity": "warning",
                "title": "Some source months are failed",
                "detail": "One or more monthly return drafts failed preparation and should be reviewed before annual closure.",
                "periods": failed_source_periods,
            }
        )

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR9,
        "summary_version": "gstr9.annual.v1",
        "financial_year": financial_year,
        "anchor_period": compliance_period.period,
        "source_months": {
            "expected_periods": expected_periods,
            "available_periods": available_periods,
            "missing_periods": missing_periods,
            "gstr1_prepared_periods": gstr1_periods,
            "gstr3b_prepared_periods": gstr3b_periods,
            "blocked_source_periods": blocked_source_periods,
            "failed_source_periods": failed_source_periods,
            "filed_source_periods": filed_source_periods,
        },
        "outward_summary": {
            "gstr1_taxable_value": _decimal_to_string(gstr1_outward_taxable),
            "gstr1_tax_amount": _decimal_to_string(gstr1_outward_tax),
            "gstr3b_outward_taxable_value": _decimal_to_string(annual_outward_taxable),
            "gstr3b_outward_tax_liability": _decimal_to_string(annual_outward_liability),
            "annual_taxable_value": _decimal_to_string(gstr1_outward_taxable),
            "annual_tax_liability": _decimal_to_string(annual_outward_liability),
        },
        "itc_summary": {
            "books_itc": _decimal_to_string(annual_books_itc),
            "reflected_itc": _decimal_to_string(annual_reflected_itc),
            "claim_ready_itc": _decimal_to_string(annual_claim_ready_itc),
            "pending_2b_itc": _decimal_to_string(annual_pending_2b_itc),
            "pending_review_itc": _decimal_to_string(annual_pending_review_itc),
            "blocked_itc": _decimal_to_string(annual_blocked_itc),
            "timing_difference_itc": _decimal_to_string(annual_timing_difference_itc),
            "vendor_followup_required_itc": _decimal_to_string(annual_vendor_followup_itc),
            "itc_at_risk": _decimal_to_string(annual_itc_at_risk),
        },
        "liability_summary": {
            "net_tax_payable": _decimal_to_string(annual_net_tax_payable),
            "annual_tax_liability": _decimal_to_string(annual_outward_liability),
            "annual_claim_ready_itc": _decimal_to_string(annual_claim_ready_itc),
        },
        "annual_sections": {
            "outward_supplies": {
                "taxable_value": _decimal_to_string(gstr1_outward_taxable),
                "tax_amount": _decimal_to_string(gstr1_outward_tax),
                "source_return_count": len(gstr1_preparations),
            },
            "itc": {
                "claim_ready_itc": _decimal_to_string(annual_claim_ready_itc),
                "itc_at_risk": _decimal_to_string(annual_itc_at_risk),
                "source_return_count": len(gstr3b_preparations),
            },
            "notes_and_amendments": {
                "amendment_document_count": annual_amendment_count,
                "source_return_count": len(gstr1_preparations),
            },
            "source_exceptions": {
                "period_exception_count": annual_period_exception_count,
                "missing_month_count": len(missing_periods),
                "blocked_source_count": len(blocked_source_periods),
                "failed_source_count": len(failed_source_periods),
                "unresolved_mismatch_count": annual_unresolved_mismatch_count,
                "manual_review_decision_count": annual_manual_decision_count,
            },
        },
        "warnings_summary": {
            "warning_count": len(warning_items),
            "error_count": 0,
            "items": warning_items,
        },
        "source_trace": {
            "gstr1_return_ids": [str(item.id) for item in gstr1_preparations],
            "gstr3b_return_ids": [str(item.id) for item in gstr3b_preparations],
        },
    }


def prepare_gstr9c(*, compliance_period):
    financial_year = _get_financial_year_label(compliance_period.period)
    expected_periods = _get_financial_year_periods(compliance_period.period)
    anchor_gstr9 = (
        ReturnPreparation.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            return_type=ReturnPreparation.ReturnType.GSTR9,
        )
        .select_related("compliance_period")
        .first()
    )

    annual_transactions = list(
        GSTTransaction.objects.filter(
            is_active=True,
            gstin=compliance_period.gstin,
            compliance_period__period__in=expected_periods,
            transaction_type__in=["sales", "purchase", "credit_note", "debit_note", "advance_received", "advance_adjusted"],
        ).select_related("compliance_period")
    )
    outward_transactions = [
        item
        for item in annual_transactions
        if item.transaction_type in {"sales", "credit_note", "debit_note", "advance_received", "advance_adjusted"}
    ]
    purchase_transactions = [item for item in annual_transactions if item.transaction_type == "purchase"]

    gstr9_summary = anchor_gstr9.summary_snapshot if anchor_gstr9 and isinstance(anchor_gstr9.summary_snapshot, dict) else {}
    gstr9_outward_summary = _as_mapping(gstr9_summary.get("outward_summary"))
    gstr9_itc_summary = _as_mapping(gstr9_summary.get("itc_summary"))
    gstr9_source_months = _as_mapping(gstr9_summary.get("source_months"))
    gstr9_warnings = _as_mapping(gstr9_summary.get("warnings_summary"))
    gstr9_source_trace = _as_mapping(gstr9_summary.get("source_trace"))

    books_outward_taxable_value = _sum_decimal_list(outward_transactions, "taxable_value")
    books_outward_tax_amount = _sum_decimal_list(outward_transactions, "tax_amount")
    books_itc = _sum_decimal_list(purchase_transactions, "tax_amount")

    gstr9_annual_taxable_value = _decimal_or_zero(gstr9_outward_summary.get("annual_taxable_value"))
    gstr9_annual_tax_liability = _decimal_or_zero(gstr9_outward_summary.get("annual_tax_liability"))
    gstr9_books_itc = _decimal_or_zero(gstr9_itc_summary.get("books_itc"))
    gstr9_claim_ready_itc = _decimal_or_zero(gstr9_itc_summary.get("claim_ready_itc"))

    outward_taxable_variance = books_outward_taxable_value - gstr9_annual_taxable_value
    outward_tax_variance = books_outward_tax_amount - gstr9_annual_tax_liability
    books_itc_variance = books_itc - gstr9_books_itc
    claim_ready_itc_variance = books_itc - gstr9_claim_ready_itc

    warning_items = []
    if anchor_gstr9 is None:
        warning_items.append(
            {
                "code": "missing_gstr9_source_return",
                "severity": "warning",
                "title": "GSTR-9 annual source is missing",
                "detail": "Prepare the annual GSTR-9 draft first so GSTR-9C can compare books against the annual GST return base.",
            }
        )
    if _summary_int(gstr9_warnings.get("warning_count")) > 0:
        warning_items.append(
            {
                "code": "gstr9_source_warnings_present",
                "severity": "warning",
                "title": "GSTR-9 source still carries annual warnings",
                "detail": "The linked GSTR-9 draft still has annual source warnings. Review those before relying on this comparison operationally.",
            }
        )
    if outward_taxable_variance != Decimal("0.00"):
        warning_items.append(
            {
                "code": "outward_taxable_variance_detected",
                "severity": "warning",
                "title": "Books outward turnover differs from GSTR-9",
                "detail": "Annual outward taxable value in books does not fully match the linked GSTR-9 rollup yet.",
            }
        )
    if claim_ready_itc_variance != Decimal("0.00"):
        warning_items.append(
            {
                "code": "itc_variance_detected",
                "severity": "warning",
                "title": "Books ITC differs from annual GST position",
                "detail": "Annual books ITC does not fully match the annual claim-ready ITC currently carried through GSTR-9.",
            }
        )

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR9C,
        "summary_version": "gstr9c.compare.v1",
        "financial_year": financial_year,
        "anchor_period": compliance_period.period,
        "comparison_basis": "gstr9_vs_books_annual_snapshot",
        "source_months": {
            "expected_periods": expected_periods,
            "available_periods": sorted({item.compliance_period.period for item in annual_transactions if item.compliance_period}),
            "gstr9_available": bool(anchor_gstr9),
            "gstr9_anchor_period": anchor_gstr9.compliance_period.period if anchor_gstr9 else "",
            "gstr9_missing_periods": list(gstr9_source_months.get("missing_periods") or []),
            "gstr9_blocked_source_periods": list(gstr9_source_months.get("blocked_source_periods") or []),
        },
        "books_summary": {
            "outward_taxable_value": _decimal_to_string(books_outward_taxable_value),
            "outward_tax_amount": _decimal_to_string(books_outward_tax_amount),
            "itc_amount": _decimal_to_string(books_itc),
            "outward_document_count": len(outward_transactions),
            "purchase_document_count": len(purchase_transactions),
        },
        "gstr9_summary": {
            "annual_taxable_value": _decimal_to_string(gstr9_annual_taxable_value),
            "annual_tax_liability": _decimal_to_string(gstr9_annual_tax_liability),
            "books_itc": _decimal_to_string(gstr9_books_itc),
            "claim_ready_itc": _decimal_to_string(gstr9_claim_ready_itc),
        },
        "comparison_summary": {
            "outward_taxable_variance": _decimal_to_string(outward_taxable_variance),
            "outward_tax_variance": _decimal_to_string(outward_tax_variance),
            "books_itc_variance": _decimal_to_string(books_itc_variance),
            "claim_ready_itc_variance": _decimal_to_string(claim_ready_itc_variance),
        },
        "annual_sections": {
            "books_position": {
                "outward_document_count": len(outward_transactions),
                "purchase_document_count": len(purchase_transactions),
            },
            "gstr9_alignment": {
                "gstr9_present": bool(anchor_gstr9),
                "linked_gstr1_return_count": len(gstr9_source_trace.get("gstr1_return_ids") or []),
                "linked_gstr3b_return_count": len(gstr9_source_trace.get("gstr3b_return_ids") or []),
            },
            "variances": {
                "outward_taxable_variance": _decimal_to_string(outward_taxable_variance),
                "outward_tax_variance": _decimal_to_string(outward_tax_variance),
                "claim_ready_itc_variance": _decimal_to_string(claim_ready_itc_variance),
            },
        },
        "warnings_summary": {
            "warning_count": len(warning_items),
            "error_count": 0,
            "items": warning_items,
        },
        "source_trace": {
            "gstr9_return_id": str(anchor_gstr9.id) if anchor_gstr9 else None,
            "gstr1_return_ids": [str(value) for value in (gstr9_source_trace.get("gstr1_return_ids") or [])],
            "gstr3b_return_ids": [str(value) for value in (gstr9_source_trace.get("gstr3b_return_ids") or [])],
            "transaction_count": len(annual_transactions),
        },
    }


def _get_previous_period_label(period_label):
    try:
        current = datetime.strptime(period_label, "%Y-%m")
    except (TypeError, ValueError):
        return None

    year = current.year
    month = current.month
    if month == 1:
        return f"{year - 1:04d}-12"
    return f"{year:04d}-{month - 1:02d}"


def _get_financial_year_label(period_label):
    try:
        current = datetime.strptime(period_label, "%Y-%m")
    except (TypeError, ValueError):
        return ""
    start_year = current.year if current.month >= 4 else current.year - 1
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def _get_financial_year_periods(period_label):
    try:
        current = datetime.strptime(period_label, "%Y-%m")
    except (TypeError, ValueError):
        return []
    start_year = current.year if current.month >= 4 else current.year - 1
    periods = []
    year = start_year
    month = 4
    for _ in range(12):
        periods.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            month = 1
            year += 1
    return periods


def _as_mapping(value):
    return value if isinstance(value, dict) else {}


def _get_nested_value(mapping, *keys):
    current = mapping if isinstance(mapping, dict) else None
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _sum_summary_decimals(summaries, path):
    total = Decimal("0.00")
    for summary in summaries:
        total += _decimal_or_zero(_get_nested_value(summary, *path))
    return total


def _summary_int(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _build_prior_period_deferred_summary(*, compliance_period):
    previous_period_label = _get_previous_period_label(compliance_period.period)
    if not previous_period_label:
        return {
            "prior_period_deferred_period": None,
            "prior_period_deferred_count": 0,
            "prior_period_deferred_itc": "0.00",
            "prior_period_deferred_run_id": None,
        }

    previous_run = (
        ReconciliationRun.objects.filter(
            is_active=True,
            gstin=compliance_period.gstin,
            compliance_period__period=previous_period_label,
            compliance_period__return_type=compliance_period.return_type,
            run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
            status=ReconciliationRun.RunStatus.COMPLETED,
        )
        .order_by("-processed_at", "-created_at")
        .first()
    )

    if not previous_run:
        return {
            "prior_period_deferred_period": previous_period_label,
            "prior_period_deferred_count": 0,
            "prior_period_deferred_itc": "0.00",
            "prior_period_deferred_run_id": None,
        }

    deferred_items = list(previous_run.items.filter(review_decision=ReconciliationItem.ReviewDecision.DEFER))
    deferred_itc = Decimal("0.00")
    for item in deferred_items:
        books_tax = item.books_transaction.tax_amount if item.books_transaction else Decimal("0.00")
        portal_tax = item.portal_transaction.tax_amount if item.portal_transaction else Decimal("0.00")
        deferred_itc += portal_tax or books_tax

    return {
        "prior_period_deferred_period": previous_period_label,
        "prior_period_deferred_count": len(deferred_items),
        "prior_period_deferred_itc": _decimal_to_string(deferred_itc),
        "prior_period_deferred_run_id": str(previous_run.id),
    }


def approve_return(*, instance, user):
    if instance.status != ReturnPreparation.PreparationStatus.READY_FOR_REVIEW:
        raise serializers.ValidationError("Only returns ready for review can be approved.")
    if settings.FILING_ENFORCE_MAKER_CHECKER and instance.prepared_by_id and instance.prepared_by_id == user.id:
        raise serializers.ValidationError(
            "Maker-checker policy blocks the same user from preparing and approving this return."
        )
    instance.status = ReturnPreparation.PreparationStatus.APPROVED
    instance.approved_by = user
    instance.updated_by = user
    instance.save(update_fields=["status", "approved_by", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="return_preparation.approved",
        entity=instance,
        workspace_id=instance.compliance_period.gstin.client.workspace_id,
        client_id=instance.compliance_period.gstin.client_id,
        metadata={"return_type": instance.return_type},
    )
    return instance


def mark_filed(*, instance, user, arn=""):
    if instance.status != ReturnPreparation.PreparationStatus.APPROVED:
        raise serializers.ValidationError("Only approved returns can be marked filed.")
    now = timezone.now()
    with transaction.atomic():
        instance.status = ReturnPreparation.PreparationStatus.FILED
        instance.filed_by = user
        instance.filed_at = now
        instance.arn = arn or instance.arn
        instance.updated_by = user
        instance.save(update_fields=["status", "filed_by", "filed_at", "arn", "updated_by", "updated_at"])

        from apps.filings.models import ReturnFiling, ReturnFilingAttempt, ReturnFilingEvent

        filing = (
            ReturnFiling.objects.filter(
                prepared_return=instance,
                prepared_snapshot_version=1,
                is_active=True,
            )
            .order_by("-created_at")
            .first()
        )
        if filing is not None:
            latest_attempt = filing.attempts.order_by("-attempt_number").first()
            previous_filing_status = filing.status
            filing.status = ReturnFiling.FilingStatus.FILED
            filing.filed_by = user
            filing.filed_at = now
            filing.arn_received_at = filing.arn_received_at or now
            filing.arn = instance.arn
            filing.last_status_sync_at = now
            filing.updated_by = user
            filing.error_summary = {}
            filing.save(
                update_fields=[
                    "status",
                    "filed_by",
                    "filed_at",
                    "arn_received_at",
                    "arn",
                    "last_status_sync_at",
                    "updated_by",
                    "error_summary",
                    "updated_at",
                ]
            )
            if latest_attempt is not None and latest_attempt.status != ReturnFilingAttempt.AttemptStatus.COMPLETED:
                latest_attempt.status = ReturnFilingAttempt.AttemptStatus.COMPLETED
                latest_attempt.completed_at = latest_attempt.completed_at or now
                latest_attempt.updated_by = user
                latest_attempt.save(update_fields=["status", "completed_at", "updated_by", "updated_at"])
            ReturnFilingEvent.objects.create(
                return_filing=filing,
                filing_attempt=latest_attempt,
                event_type="filing.marked_filed_manually",
                old_status=previous_filing_status,
                new_status=ReturnFiling.FilingStatus.FILED,
                actor=user,
                metadata={
                    "return_type": instance.return_type,
                    "arn": instance.arn,
                    "manual_filing": True,
                },
            )
            record_audit_log(
                actor=user,
                action="return_filing.marked_filed_manually",
                entity=filing,
                workspace_id=filing.workspace_id,
                client_id=filing.client_id,
                gstin_id=filing.gstin_id,
                compliance_period_id=filing.compliance_period_id,
                metadata={"return_type": filing.return_type, "arn": filing.arn},
            )
    record_audit_log(
        actor=user,
        action="return_preparation.filed",
        entity=instance,
        workspace_id=instance.compliance_period.gstin.client.workspace_id,
        client_id=instance.compliance_period.gstin.client_id,
        metadata={"return_type": instance.return_type, "arn": instance.arn},
    )
    return instance


def _sum_decimal(queryset, field_name):
    total = Decimal("0.00")
    for value in queryset.values_list(field_name, flat=True):
        total += value or Decimal("0.00")
    return total
