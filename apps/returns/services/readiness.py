from collections import Counter
from decimal import Decimal

from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation
from apps.returns.services.returns import _get_financial_year_label, _get_financial_year_periods


def get_return_readiness(*, workspace_id, client_id, gstin_id, compliance_period_id):
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

    transactions = GSTTransaction.objects.filter(
        is_active=True,
        compliance_period=compliance_period,
    )
    return_preparations = {
        preparation.return_type: preparation
        for preparation in ReturnPreparation.objects.filter(is_active=True, compliance_period=compliance_period)
    }
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
    run_items = list(latest_run.items.all()) if latest_run else []

    gstr1_readiness = _evaluate_gstr1_readiness(
        compliance_period=compliance_period,
        transactions=transactions,
        preparation=return_preparations.get(ReturnPreparation.ReturnType.GSTR1),
    )
    gstr3b_readiness = _evaluate_gstr3b_readiness(
        compliance_period=compliance_period,
        transactions=transactions,
        preparation=return_preparations.get(ReturnPreparation.ReturnType.GSTR3B),
        latest_run=latest_run,
        run_items=run_items,
    )
    gstr7_readiness = _evaluate_gstr7_readiness(
        compliance_period=compliance_period,
        transactions=transactions,
        preparation=return_preparations.get(ReturnPreparation.ReturnType.GSTR7),
    )
    gstr9_readiness = _evaluate_gstr9_readiness(
        compliance_period=compliance_period,
        preparation=return_preparations.get(ReturnPreparation.ReturnType.GSTR9),
    )
    gstr9c_readiness = _evaluate_gstr9c_readiness(
        compliance_period=compliance_period,
        preparation=return_preparations.get(ReturnPreparation.ReturnType.GSTR9C),
    )

    return {
        "context": {
            "workspace": str(compliance_period.gstin.client.workspace_id),
            "workspace_name": compliance_period.gstin.client.workspace.name,
            "client": str(compliance_period.gstin.client_id),
            "client_name": compliance_period.gstin.client.legal_name,
            "gstin": str(compliance_period.gstin_id),
            "gstin_value": compliance_period.gstin.gstin,
            "compliance_period": str(compliance_period.id),
            "period_label": compliance_period.period,
            "is_locked": compliance_period.is_locked,
        },
        "gstr1": gstr1_readiness,
        "gstr3b": gstr3b_readiness,
        "gstr7": gstr7_readiness,
        "gstr9": gstr9_readiness,
        "gstr9c": gstr9c_readiness,
        "overall_status": _resolve_overall_status([gstr1_readiness["status"], gstr3b_readiness["status"], gstr7_readiness["status"], gstr9_readiness["status"], gstr9c_readiness["status"]]),
    }


def _evaluate_gstr1_readiness(*, compliance_period, transactions, preparation):
    relevant_transactions = transactions.filter(
        transaction_type__in=["sales", "credit_note", "debit_note", "advance_received", "advance_adjusted"]
    ).order_by("id")
    sales_transactions = relevant_transactions.filter(transaction_type="sales")
    advance_transactions = relevant_transactions.filter(transaction_type__in=["advance_received", "advance_adjusted"])
    invoice_like_transactions = relevant_transactions.exclude(transaction_type__in=["advance_received", "advance_adjusted"])
    issues = []

    if compliance_period.is_locked:
        issues.append(
            _issue(
                code="period_locked",
                severity="error",
                title="Compliance period is locked",
                detail="This period is locked. Unlock it before preparing or revising GSTR-1 data.",
            )
        )

    if not sales_transactions.exists() and not advance_transactions.exists():
        issues.append(
            _issue(
                code="missing_sales_transactions",
                severity="error",
                title="Outward transactions are required",
                detail="No sales or advance transactions are available for the selected compliance period.",
                action_label="Review imports",
                action_target="/imports",
            )
        )

    line_items = list(_iter_transaction_line_items(invoice_like_transactions))
    missing_hsn = sum(1 for _, item in line_items if not item.get("hsn_code"))
    missing_uqc = sum(1 for _, item in line_items if not item.get("uqc"))
    missing_quantity = sum(1 for _, item in line_items if item.get("quantity") in (None, "", "0", "0.00"))
    missing_supply_category = sum(1 for _, item in line_items if not item.get("supply_category"))
    missing_hsn_transactions = _collect_transaction_ids(transaction for transaction, item in line_items if not item.get("hsn_code"))
    missing_uqc_transactions = _collect_transaction_ids(transaction for transaction, item in line_items if not item.get("uqc"))
    missing_quantity_transactions = _collect_transaction_ids(
        transaction for transaction, item in line_items if item.get("quantity") in (None, "", "0", "0.00")
    )
    missing_supply_category_transactions = _collect_transaction_ids(
        transaction for transaction, item in line_items if not item.get("supply_category")
    )
    amendment_transactions = [transaction for transaction in relevant_transactions if _is_amendment_transaction(transaction)]
    special_supply_transactions = [
        transaction
        for transaction in sales_transactions
        if _special_supply_type(transaction)
    ]
    ecommerce_transactions = [
        transaction
        for transaction in sales_transactions
        if _ecommerce_gstin(transaction) or _ecommerce_section(transaction)
    ]
    missing_special_supply_gstin_transactions = _collect_transaction_ids(
        transaction
        for transaction in special_supply_transactions
        if _special_supply_type(transaction) in {"sez_wpay", "sez_wopay", "deemed_export"} and not transaction.counterparty_gstin
    )
    missing_export_shipping_bill_transactions = _collect_transaction_ids(
        transaction
        for transaction in special_supply_transactions
        if _special_supply_type(transaction) in {"export_wpay", "export_wopay"}
        and not _export_reference_present(transaction)
    )
    missing_ecommerce_gstin_transactions = _collect_transaction_ids(
        transaction
        for transaction in ecommerce_transactions
        if _ecommerce_section(transaction) and not _ecommerce_gstin(transaction)
    )
    missing_amendment_reference_transactions = _collect_transaction_ids(
        transaction
        for transaction in amendment_transactions
        if not _original_document_number(transaction) or not _original_period(transaction)
    )
    orphaned_amendment_transactions = _collect_transaction_ids(
        transaction
        for transaction in amendment_transactions
        if _original_document_number(transaction) and _original_document_number(transaction) not in {
            item.reference_number for item in relevant_transactions if not _is_amendment_transaction(item)
        }
    )
    document_type_conflicts = len(
        {
            str(transaction.id)
            for transaction, _ in line_items
            if transaction.metadata.get("mixed_fields") and "supply_category" in transaction.metadata.get("mixed_fields", [])
        }
    )
    document_type_conflict_transactions = _collect_transaction_ids(
        transaction
        for transaction, _ in line_items
        if transaction.metadata.get("mixed_fields") and "supply_category" in transaction.metadata.get("mixed_fields", [])
    )

    advance_line_items = list(_iter_transaction_line_items(advance_transactions))
    missing_advance_pos_transactions = _collect_transaction_ids(
        transaction for transaction in advance_transactions if not str(transaction.place_of_supply or "").strip()
    )
    missing_advance_rate_transactions = _collect_transaction_ids(
        transaction for transaction, item in advance_line_items if not _line_item_rate_present(transaction, item)
    )
    missing_advance_reference_transactions = _collect_transaction_ids(
        transaction
        for transaction in advance_transactions.filter(transaction_type="advance_adjusted")
        if not _advance_reference_present(transaction)
    )

    if missing_hsn:
        issues.append(
            _issue(
                code="missing_hsn",
                severity="warning",
                title="HSN codes missing",
                detail=f"{missing_hsn} line item(s) are missing HSN codes. HSN summary sheets will be incomplete.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_hsn_transactions,
                suggested_fix=_bulk_fix(
                    fields=["hsn_code"],
                    title="Bulk fill HSN codes",
                    detail="Select the affected transactions and apply a shared HSN code where the same classification is valid.",
                ),
            )
        )
    if missing_uqc:
        issues.append(
            _issue(
                code="missing_uqc",
                severity="warning",
                title="UQC missing",
                detail=f"{missing_uqc} line item(s) are missing unit quantity codes.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_uqc_transactions,
                suggested_fix=_bulk_fix(
                    fields=["uqc"],
                    title="Bulk fill UQC",
                    detail="Apply a shared UQC across the selected transactions if the same unit applies.",
                ),
            )
        )
    if missing_quantity:
        issues.append(
            _issue(
                code="missing_quantity",
                severity="warning",
                title="Quantity missing",
                detail=f"{missing_quantity} line item(s) are missing quantity values.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_quantity_transactions,
                suggested_fix=_row_review(
                    fields=["quantity"],
                    title="Review quantities line by line",
                    detail="Quantities usually differ per invoice line, so review each affected transaction before export.",
                ),
            )
        )
    if missing_supply_category:
        issues.append(
            _issue(
                code="missing_supply_category",
                severity="warning",
                title="Supply category missing",
                detail=f"{missing_supply_category} line item(s) do not define taxable/nil/exempt classification.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_supply_category_transactions,
                suggested_fix=_bulk_fix(
                    fields=["supply_category"],
                    title="Bulk classify supply category",
                    detail="Set taxable, nil-rated, exempt, or non-GST for the selected transactions if they share the same treatment.",
                ),
            )
        )
    if document_type_conflicts:
        issues.append(
            _issue(
                code="conflicting_supply_category",
                severity="warning",
                title="Conflicting supply classification",
                detail=f"{document_type_conflicts} transaction(s) contain mixed supply category metadata across line items.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=document_type_conflict_transactions,
                suggested_fix=_row_review(
                    fields=["supply_category"],
                    title="Resolve conflicting line items",
                    detail="These transactions have mixed supply categories across line items and should be reviewed individually.",
                ),
            )
        )
    if missing_special_supply_gstin_transactions:
        issues.append(
            _issue(
                code="special_supply_gstin_missing",
                severity="error",
                title="SEZ or deemed export recipient GSTIN is missing",
                detail=f"{len(missing_special_supply_gstin_transactions)} special-supply transaction(s) need a recipient GSTIN for GSTR-1 section 6 classification.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_special_supply_gstin_transactions,
                suggested_fix=_bulk_fix(
                    fields=["counterparty_gstin"],
                    title="Fill recipient GSTIN for special supplies",
                    detail="SEZ and deemed-export rows should carry the recipient GSTIN before return preparation or filing.",
                ),
            )
        )
    if missing_export_shipping_bill_transactions:
        issues.append(
            _issue(
                code="export_reference_missing",
                severity="warning",
                title="Export reference details are missing",
                detail=f"{len(missing_export_shipping_bill_transactions)} export transaction(s) do not include shipping bill or bill-of-export references yet.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_export_shipping_bill_transactions,
                suggested_fix=_row_review(
                    title="Add export references when available",
                    detail="Shipping bill and port-code details improve export traceability and provider payload quality.",
                ),
            )
        )
    if missing_ecommerce_gstin_transactions:
        issues.append(
            _issue(
                code="ecommerce_gstin_missing",
                severity="error",
                title="E-commerce operator GSTIN is missing",
                detail=f"{len(missing_ecommerce_gstin_transactions)} e-commerce transaction(s) define an e-commerce section but do not include the operator GSTIN.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_ecommerce_gstin_transactions,
                suggested_fix=_bulk_fix(
                    fields=["ecommerce_gstin"],
                    title="Fill operator GSTIN",
                    detail="Add the collecting operator GSTIN before preparing GSTR-1 tables 14 or 15.",
                ),
            )
        )
    if missing_amendment_reference_transactions:
        issues.append(
            _issue(
                code="amendment_reference_missing",
                severity="error",
                title="Amendment references are incomplete",
                detail=f"{len(missing_amendment_reference_transactions)} amendment transaction(s) are missing the original document number or original period.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_amendment_reference_transactions,
                suggested_fix=_row_review(
                    title="Complete original-document linkage",
                    detail="Amendment rows need original document references so the correct GSTR-1 amendment table can be prepared.",
                ),
            )
        )
    if orphaned_amendment_transactions:
        issues.append(
            _issue(
                code="orphaned_amendment_reference",
                severity="warning",
                title="Some amendments do not link to a known base document",
                detail=f"{len(orphaned_amendment_transactions)} amendment transaction(s) reference original documents that are not present in the current transaction scope.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=orphaned_amendment_transactions,
                suggested_fix=_row_review(
                    title="Verify original amendment links",
                    detail="Confirm the original document number and return period, or import the missing base document if it belongs in this scope.",
                ),
            )
        )

    if missing_advance_pos_transactions:
        issues.append(
            _issue(
                code="advance_pos_missing",
                severity="error",
                title="Advance place of supply is missing",
                detail=f"{len(missing_advance_pos_transactions)} advance transaction(s) are missing place of supply, so GSTR-1 table 11 cannot be grouped correctly.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_advance_pos_transactions,
                suggested_fix=_bulk_fix(
                    fields=["place_of_supply"],
                    title="Fill place of supply for advance rows",
                    detail="Apply the correct state code before preparing or filing GSTR-1 with advance transactions.",
                ),
            )
        )

    if missing_advance_rate_transactions:
        issues.append(
            _issue(
                code="advance_rate_missing",
                severity="error",
                title="Advance tax rate is missing",
                detail=f"{len(missing_advance_rate_transactions)} advance transaction(s) are missing a usable GST rate, so advance tax cannot be summarized rate-wise.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_advance_rate_transactions,
                suggested_fix=_row_review(
                    title="Review advance rate data",
                    detail="Each advance row should carry either an explicit line-item rate or enough tax amounts to infer the rate safely.",
                ),
            )
        )

    if missing_advance_reference_transactions:
        issues.append(
            _issue(
                code="advance_reference_missing",
                severity="warning",
                title="Advance adjustments are missing source references",
                detail=f"{len(missing_advance_reference_transactions)} advance adjustment transaction(s) do not reference the original advance, which weakens review traceability.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=missing_advance_reference_transactions,
                suggested_fix=_row_review(
                    title="Link adjustments back to original advances",
                    detail="Store the original receipt voucher or advance reference in transaction metadata for each adjustment row.",
                ),
            )
        )

    summary = preparation.summary_snapshot if preparation else {}
    outward_supplies = summary.get("outward_supplies", {}) if isinstance(summary, dict) else {}

    return _build_readiness_payload(
        return_type=ReturnPreparation.ReturnType.GSTR1,
        preparation=preparation,
        issues=issues,
        metrics={
            "transaction_count": relevant_transactions.count(),
            "sales_transaction_count": sales_transactions.count(),
            "advance_transaction_count": advance_transactions.count(),
            "special_supply_transaction_count": len(special_supply_transactions),
            "amendment_transaction_count": len(amendment_transactions),
            "ecommerce_transaction_count": len(ecommerce_transactions),
            "line_item_count": len(line_items),
            "total_taxable_value": str(outward_supplies.get("total_taxable_value", "0.00")),
            "total_tax_amount": str(outward_supplies.get("total_tax_amount", "0.00")),
        },
    )


def _evaluate_gstr3b_readiness(*, compliance_period, transactions, preparation, latest_run, run_items):
    issues = []
    outward_transactions = transactions.filter(transaction_type__in=["sales", "credit_note", "debit_note"])
    purchase_transactions = transactions.filter(transaction_type__in=["purchase", "debit_note", "credit_note"])
    gstr2b_transactions = transactions.filter(transaction_type="gstr_2b")

    if compliance_period.is_locked:
        issues.append(
            _issue(
                code="period_locked",
                severity="error",
                title="Compliance period is locked",
                detail="This period is locked. Unlock it before preparing or revising GSTR-3B data.",
            )
        )

    if not outward_transactions.exists():
        issues.append(
            _issue(
                code="missing_outward_transactions",
                severity="error",
                title="Outward transactions are required",
                detail="No outward transactions are available to compute GSTR-3B liability.",
                action_label="Review imports",
                action_target="/imports",
            )
        )
    if not purchase_transactions.exists():
        issues.append(
            _issue(
                code="missing_purchase_transactions",
                severity="warning",
                title="Purchase transactions missing",
                detail="No purchase transactions are available for ITC review.",
                action_label="Review imports",
                action_target="/imports",
            )
        )
    if not gstr2b_transactions.exists():
        issues.append(
            _issue(
                code="missing_gstr2b_transactions",
                severity="error",
                title="GSTR-2B import is required",
                detail="No GSTR-2B transactions are available for ITC validation.",
                action_label="Review imports",
                action_target="/imports",
            )
        )
    if latest_run is None:
        issues.append(
            _issue(
                code="missing_reconciliation_run",
                severity="error",
                title="Reconciliation has not been run",
                detail="Run GSTR-2B reconciliation before relying on GSTR-3B ITC values.",
                action_label="Go to reconciliation",
                action_target="/reconciliation",
            )
        )

    unresolved_items = [
        item
        for item in run_items
        if item.match_status != ReconciliationItem.MatchStatus.MATCHED
        and item.action_status not in {ReconciliationItem.ActionStatus.RESOLVED, ReconciliationItem.ActionStatus.IGNORED}
    ]
    if unresolved_items:
        unresolved_transaction_ids = _collect_transaction_ids(
            transaction
            for item in unresolved_items
            for transaction in (item.books_transaction, item.portal_transaction)
            if transaction is not None
        )
        issues.append(
            _issue(
                code="unresolved_reconciliation_items",
                severity="warning",
                title="Unresolved reconciliation items remain",
                detail=f"{len(unresolved_items)} reconciliation item(s) are still open or deferred for this period.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=unresolved_transaction_ids,
                suggested_fix=_row_review(
                    title="Review reconciliation-linked transactions",
                    detail="Inspect the linked books and 2B transactions, then correct metadata or resolve the underlying reconciliation item.",
                ),
            )
        )

    action_status_counts = Counter(item.action_status for item in run_items)
    summary = preparation.summary_snapshot if preparation else {}
    itc_summary = summary.get("itc_summary", {}) if isinstance(summary, dict) else {}
    snapshot_itc_at_risk = Decimal(str(itc_summary.get("itc_at_risk", "0.00")))
    live_itc_at_risk = latest_run.total_itc_at_risk if latest_run and latest_run.total_itc_at_risk else _calculate_itc_at_risk(run_items)
    itc_at_risk = max(snapshot_itc_at_risk, live_itc_at_risk)
    if itc_at_risk > Decimal("0.00"):
        at_risk_transaction_ids = _collect_transaction_ids(
            transaction
            for item in run_items
            if item.action_status not in {ReconciliationItem.ActionStatus.RESOLVED, ReconciliationItem.ActionStatus.IGNORED}
            and item.match_status != ReconciliationItem.MatchStatus.MATCHED
            for transaction in (item.books_transaction, item.portal_transaction)
            if transaction is not None
        )
        issues.append(
            _issue(
                code="itc_at_risk",
                severity="warning",
                title="ITC remains at risk",
                detail=f"ITC at risk is Rs. {itc_at_risk:.2f} based on the latest reconciliation output.",
                action_label="Review affected transactions",
                action_target="/reports",
                transaction_ids=at_risk_transaction_ids,
                suggested_fix=_row_review(
                    title="Investigate ITC risk drivers",
                    detail="Start from the affected transactions, then resolve or defer the related reconciliation items before filing.",
                ),
            )
        )

    snapshot_blocked_itc_count = int(itc_summary.get("blocked_count", 0) or 0)
    snapshot_timing_difference_count = int(itc_summary.get("timing_difference_count", 0) or 0)
    snapshot_vendor_followup_count = int(itc_summary.get("vendor_followup_required_count", 0) or 0)
    snapshot_pending_review_count = int(itc_summary.get("pending_review_count", 0) or 0)
    blocked_itc_count = max(snapshot_blocked_itc_count, latest_run.itc_blocked_count if latest_run else 0)
    timing_difference_count = max(
        snapshot_timing_difference_count,
        latest_run.itc_timing_difference_count if latest_run else 0,
    )
    vendor_followup_count = max(
        snapshot_vendor_followup_count,
        latest_run.itc_vendor_followup_required_count if latest_run else 0,
    )
    pending_review_count = max(
        snapshot_pending_review_count,
        latest_run.itc_pending_review_count if latest_run else 0,
    )
    period_exception_count = (
        int(summary.get("period_exceptions", {}).get("count", 0))
        if isinstance(summary.get("period_exceptions", {}), dict)
        else 0
    )

    if blocked_itc_count > 0:
        issues.append(
            _issue(
                code="blocked_itc_rows",
                severity="warning",
                title="Some ITC rows are blocked",
                detail=f"{blocked_itc_count} reconciliation row(s) are currently blocked for ITC and should be reviewed before approval or filing.",
                action_label="Review blocked rows",
                action_target="/reconciliation",
            )
        )

    if timing_difference_count > 0:
        issues.append(
            _issue(
                code="timing_difference_itc",
                severity="warning",
                title="Timing-difference ITC needs review",
                detail=f"{timing_difference_count} row(s) match across periods and need timing review before the final 3B decision is trusted.",
                action_label="Review timing differences",
                action_target="/reconciliation",
            )
        )

    if vendor_followup_count > 0:
        issues.append(
            _issue(
                code="vendor_followup_itc",
                severity="warning",
                title="Vendor follow-up is still pending",
                detail=f"{vendor_followup_count} row(s) need supplier-side follow-up before ITC can be treated as comfortable.",
                action_label="Review vendor follow-up rows",
                action_target="/reconciliation",
            )
        )

    if pending_review_count > 0:
        issues.append(
            _issue(
                code="pending_review_itc",
                severity="warning",
                title="Some ITC rows still need review",
                detail=f"{pending_review_count} row(s) need value or document review before GSTR-3B can be treated as clean.",
                action_label="Review pending rows",
                action_target="/reconciliation",
            )
        )

    if period_exception_count > 0:
        issues.append(
            _issue(
                code="period_exceptions_present",
                severity="warning",
                title="Period exceptions exist in return inputs",
                detail=f"{period_exception_count} source transaction(s) were accepted with a period exception and should be reviewed before approval or filing.",
                action_label="Review source rows",
                action_target="/reports",
            )
        )

    return _build_readiness_payload(
        return_type=ReturnPreparation.ReturnType.GSTR3B,
        preparation=preparation,
        issues=issues,
        metrics={
            "outward_transaction_count": outward_transactions.count(),
            "purchase_transaction_count": purchase_transactions.count(),
            "gstr2b_transaction_count": gstr2b_transactions.count(),
            "reconciliation_run_id": str(latest_run.id) if latest_run else None,
            "unresolved_mismatch_count": len(unresolved_items),
            "deferred_item_count": action_status_counts.get(ReconciliationItem.ActionStatus.DEFERRED, 0),
            "itc_at_risk": str(itc_at_risk),
            "eligible_itc": str(itc_summary.get("claim_ready_itc", itc_summary.get("eligible_itc", "0.00"))),
            "net_tax_payable": str(itc_summary.get("net_tax_payable", "0.00")),
            "blocked_itc_count": blocked_itc_count,
            "timing_difference_count": timing_difference_count,
            "vendor_followup_count": vendor_followup_count,
            "pending_review_count": pending_review_count,
            "period_exception_count": period_exception_count,
        },
    )


def _evaluate_gstr7_readiness(*, compliance_period, transactions, preparation):
    relevant_transactions = transactions.filter(transaction_type="tds_deducted").order_by("id")
    issues = []

    if compliance_period.is_locked:
        issues.append(
            _issue(
                code="period_locked",
                severity="error",
                title="Compliance period is locked",
                detail="This period is locked. Unlock it before preparing or revising GSTR-7 data.",
            )
        )

    if not relevant_transactions.exists():
        issues.append(
            _issue(
                code="missing_tds_transactions",
                severity="error",
                title="TDS deduction rows are required",
                detail="No TDS deducted transactions are available for the selected compliance period.",
                action_label="Review imports",
                action_target="/imports",
            )
        )

    missing_deductee_gstin_transactions = _collect_transaction_ids(
        transaction for transaction in relevant_transactions if not str(transaction.counterparty_gstin or "").strip()
    )
    zero_tds_transactions = _collect_transaction_ids(
        transaction for transaction in relevant_transactions if _to_decimal(transaction.tax_amount) <= Decimal("0.00")
    )
    zero_payment_transactions = _collect_transaction_ids(
        transaction for transaction in relevant_transactions if _to_decimal(transaction.total_amount) <= Decimal("0.00")
    )

    duplicate_references = Counter(
        str(transaction.reference_number or "").strip()
        for transaction in relevant_transactions
        if str(transaction.reference_number or "").strip()
    )
    duplicate_reference_values = sorted(reference for reference, count in duplicate_references.items() if count > 1)

    if missing_deductee_gstin_transactions:
        issues.append(
            _issue(
                code="missing_deductee_gstin",
                severity="error",
                title="Some deductee GSTIN values are missing",
                detail="Every GSTR-7 row should carry the deductee GSTIN before the return is prepared.",
                action_label="Review imports",
                action_target="/imports",
                transaction_ids=missing_deductee_gstin_transactions,
            )
        )

    if zero_tds_transactions:
        issues.append(
            _issue(
                code="zero_tds_amount",
                severity="warning",
                title="Some rows have zero TDS amount",
                detail="Rows with zero deducted tax should be reviewed before relying on the GSTR-7 draft.",
                action_label="Review imports",
                action_target="/imports",
                transaction_ids=zero_tds_transactions,
            )
        )

    if zero_payment_transactions:
        issues.append(
            _issue(
                code="zero_payment_amount",
                severity="warning",
                title="Some rows have zero payment amount",
                detail="Rows with zero payment amount should be checked for source-file completeness.",
                action_label="Review imports",
                action_target="/imports",
                transaction_ids=zero_payment_transactions,
            )
        )

    if duplicate_reference_values:
        issues.append(
            _issue(
                code="duplicate_tds_document_numbers",
                severity="warning",
                title="Duplicate TDS document numbers detected",
                detail=f"{len(duplicate_reference_values)} duplicated document number(s) were found in TDS source rows for this period.",
                action_label="Review imports",
                action_target="/imports",
            )
        )

    total_tds_amount = sum((_to_decimal(transaction.tax_amount) for transaction in relevant_transactions), Decimal("0.00"))
    distinct_deductees = len(
        {
            str(transaction.counterparty_gstin or "").strip().upper()
            for transaction in relevant_transactions
            if str(transaction.counterparty_gstin or "").strip()
        }
    )

    return _build_readiness_payload(
        return_type=ReturnPreparation.ReturnType.GSTR7,
        preparation=preparation,
        issues=issues,
        metrics={
            "document_count": relevant_transactions.count(),
            "deductee_count": distinct_deductees,
            "total_tds_amount": f"{total_tds_amount:.2f}",
            "duplicate_document_count": len(duplicate_reference_values),
        },
    )


def _evaluate_gstr9_readiness(*, compliance_period, preparation):
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

    gstr1_prepared_periods = sorted(
        {item.compliance_period.period for item in monthly_preparations if item.return_type == ReturnPreparation.ReturnType.GSTR1}
    )
    gstr3b_prepared_periods = sorted(
        {item.compliance_period.period for item in monthly_preparations if item.return_type == ReturnPreparation.ReturnType.GSTR3B}
    )
    missing_gstr1_periods = [period for period in expected_periods if period not in gstr1_prepared_periods]
    missing_gstr3b_periods = [period for period in expected_periods if period not in gstr3b_prepared_periods]
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

    issues = []

    if compliance_period.is_locked:
        issues.append(
            _issue(
                code="period_locked",
                severity="error",
                title="Compliance period is locked",
                detail="This period is locked. Unlock it before preparing or revising GSTR-9 data.",
            )
        )

    if not gstr1_prepared_periods:
        issues.append(
            _issue(
                code="missing_gstr1_source_returns",
                severity="error",
                title="GSTR-1 source returns are missing",
                detail="Prepare at least one monthly GSTR-1 draft in this financial year before building GSTR-9.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if not gstr3b_prepared_periods:
        issues.append(
            _issue(
                code="missing_gstr3b_source_returns",
                severity="error",
                title="GSTR-3B source returns are missing",
                detail="Prepare at least one monthly GSTR-3B draft in this financial year before building GSTR-9.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if compliance_period.period[-2:] != "03":
        issues.append(
            _issue(
                code="annual_anchor_not_year_end",
                severity="warning",
                title="Annual review is anchored before year-end",
                detail="This GSTR-9 view is being prepared from a non-March period. Treat it as an in-progress annual rollup until the financial year closes.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if missing_gstr1_periods:
        issues.append(
            _issue(
                code="missing_gstr1_source_months",
                severity="warning",
                title="Some GSTR-1 source months are still missing",
                detail=f"{len(missing_gstr1_periods)} month(s) in {financial_year} do not yet have prepared GSTR-1 inputs for annual aggregation.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if missing_gstr3b_periods:
        issues.append(
            _issue(
                code="missing_gstr3b_source_months",
                severity="warning",
                title="Some GSTR-3B source months are still missing",
                detail=f"{len(missing_gstr3b_periods)} month(s) in {financial_year} do not yet have prepared GSTR-3B inputs for annual aggregation.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if blocked_source_periods:
        issues.append(
            _issue(
                code="blocked_source_months",
                severity="error",
                title="Some source months are blocked",
                detail="One or more monthly return drafts are blocked by stale reconciliation and should be refreshed before trusting the annual rollup.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if failed_source_periods:
        issues.append(
            _issue(
                code="failed_source_months",
                severity="error",
                title="Some source months failed preparation",
                detail="One or more monthly return drafts failed preparation and should be repaired before using the annual rollup operationally.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    return _build_readiness_payload(
        return_type=ReturnPreparation.ReturnType.GSTR9,
        preparation=preparation,
        issues=issues,
        metrics={
            "financial_year": financial_year,
            "expected_month_count": len(expected_periods),
            "gstr1_prepared_month_count": len(gstr1_prepared_periods),
            "gstr3b_prepared_month_count": len(gstr3b_prepared_periods),
            "missing_gstr1_month_count": len(missing_gstr1_periods),
            "missing_gstr3b_month_count": len(missing_gstr3b_periods),
            "blocked_source_month_count": len(blocked_source_periods),
            "failed_source_month_count": len(failed_source_periods),
            "filed_source_month_count": len(filed_source_periods),
        },
    )


def _evaluate_gstr9c_readiness(*, compliance_period, preparation):
    anchor_gstr9 = ReturnPreparation.objects.filter(
        is_active=True,
        compliance_period=compliance_period,
        return_type=ReturnPreparation.ReturnType.GSTR9,
    ).first()
    annual_transactions = GSTTransaction.objects.filter(
        is_active=True,
        gstin=compliance_period.gstin,
        compliance_period__period__in=_get_financial_year_periods(compliance_period.period),
        transaction_type__in=["sales", "purchase", "credit_note", "debit_note", "advance_received", "advance_adjusted"],
    )

    issues = []
    if compliance_period.is_locked:
        issues.append(
            _issue(
                code="period_locked",
                severity="error",
                title="Compliance period is locked",
                detail="This period is locked. Unlock it before preparing or revising GSTR-9C data.",
            )
        )

    if anchor_gstr9 is None:
        issues.append(
            _issue(
                code="missing_gstr9_anchor_return",
                severity="error",
                title="GSTR-9 annual source is missing",
                detail="Prepare GSTR-9 first for this annual context before building GSTR-9C comparison.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if compliance_period.period[-2:] != "03":
        issues.append(
            _issue(
                code="annual_anchor_not_year_end",
                severity="warning",
                title="Annual comparison is anchored before year-end",
                detail="This GSTR-9C view is being prepared from a non-March period. Treat it as an in-progress annual comparison until the financial year closes.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    if not annual_transactions.exists():
        issues.append(
            _issue(
                code="missing_books_transactions_for_financial_year",
                severity="warning",
                title="No annual books transactions found",
                detail="The annual books comparison is empty because no source transactions were found in this financial year for the selected GSTIN.",
                action_label="Open imports",
                action_target="/imports",
            )
        )

    if anchor_gstr9 and anchor_gstr9.status in {
        ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION,
        ReturnPreparation.PreparationStatus.FAILED,
    }:
        issues.append(
            _issue(
                code="gstr9_source_not_operationally_ready",
                severity="error",
                title="GSTR-9 source is not operationally ready",
                detail="The linked GSTR-9 draft is blocked or failed. Repair that annual source before relying on GSTR-9C comparison operationally.",
                action_label="Open returns",
                action_target="/returns",
            )
        )

    return _build_readiness_payload(
        return_type=ReturnPreparation.ReturnType.GSTR9C,
        preparation=preparation,
        issues=issues,
        metrics={
            "financial_year": _get_financial_year_label(compliance_period.period),
            "gstr9_available": bool(anchor_gstr9),
            "annual_transaction_count": annual_transactions.count(),
            "annual_books_outward_count": annual_transactions.filter(transaction_type__in=["sales", "credit_note", "debit_note", "advance_received", "advance_adjusted"]).count(),
            "annual_books_purchase_count": annual_transactions.filter(transaction_type="purchase").count(),
        },
    )


def _build_readiness_payload(*, return_type, preparation, issues, metrics):
    status = _resolve_readiness_status(issues)
    warning_count = sum(1 for issue in issues if issue["severity"] == "warning")
    error_count = sum(1 for issue in issues if issue["severity"] == "error")
    return {
        "return_type": return_type,
        "status": status,
        "can_prepare": error_count == 0,
        "can_export": error_count == 0,
        "warning_count": warning_count,
        "error_count": error_count,
        "issues": issues,
        "prepared_return": {
            "id": str(preparation.id),
            "status": preparation.status,
            "updated_at": preparation.updated_at.isoformat(),
        }
        if preparation
        else None,
        "metrics": metrics,
    }


def _resolve_readiness_status(issues):
    if any(issue["severity"] == "error" for issue in issues):
        return "blocked"
    if any(issue["severity"] == "warning" for issue in issues):
        return "ready_with_warnings"
    return "ready"


def _resolve_overall_status(statuses):
    if "blocked" in statuses:
        return "blocked"
    if "ready_with_warnings" in statuses:
        return "ready_with_warnings"
    return "ready"


def _iter_transaction_line_items(transactions):
    for transaction in transactions:
        line_items = transaction.metadata.get("line_items") if isinstance(transaction.metadata, dict) else None
        if line_items:
            for item in line_items:
                if isinstance(item, dict):
                    yield transaction, item
            continue
        yield transaction, {
            "hsn_code": transaction.metadata.get("hsn_code") if isinstance(transaction.metadata, dict) else None,
            "uqc": transaction.metadata.get("uqc") if isinstance(transaction.metadata, dict) else None,
            "quantity": transaction.metadata.get("quantity") if isinstance(transaction.metadata, dict) else None,
            "supply_category": transaction.metadata.get("supply_category") if isinstance(transaction.metadata, dict) else None,
            "rate": transaction.metadata.get("rate") if isinstance(transaction.metadata, dict) else None,
        }


def _line_item_rate_present(transaction, item):
    raw_rate = item.get("rate")
    if raw_rate not in (None, "", "0", "0.00"):
        return True
    taxable_value = _to_decimal(item.get("taxable_value", transaction.taxable_value))
    tax_amount = (
        _to_decimal(item.get("cgst_amount", transaction.cgst_amount))
        + _to_decimal(item.get("sgst_amount", transaction.sgst_amount))
        + _to_decimal(item.get("igst_amount", transaction.igst_amount))
        + _to_decimal(item.get("cess_amount", transaction.cess_amount))
    )
    return taxable_value > Decimal("0.00") and tax_amount > Decimal("0.00")


def _advance_reference_present(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return bool(
        metadata.get("advance_reference")
        or metadata.get("original_advance_reference")
        or metadata.get("receipt_voucher_number")
    )


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


def _original_period(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return str(metadata.get("original_period") or "").strip()


def _export_reference_present(transaction):
    metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
    return bool(metadata.get("shipping_bill_number") or metadata.get("port_code"))


def _calculate_itc_at_risk(run_items):
    total = Decimal("0.00")
    for item in run_items:
        if item.action_status in {ReconciliationItem.ActionStatus.RESOLVED, ReconciliationItem.ActionStatus.IGNORED}:
            continue
        if item.match_status == ReconciliationItem.MatchStatus.MATCHED:
            continue
        if item.portal_transaction:
            total += item.portal_transaction.tax_amount or Decimal("0.00")
    return total


def _issue(
    *,
    code,
    severity,
    title,
    detail,
    action_label=None,
    action_target=None,
    transaction_ids=None,
    suggested_fix=None,
):
    issue = {
        "code": code,
        "severity": severity,
        "title": title,
        "detail": detail,
        "action_label": action_label,
        "action_target": action_target,
    }
    if transaction_ids:
        issue["transaction_ids"] = transaction_ids
    if suggested_fix:
        issue["suggested_fix"] = suggested_fix
    return issue


def _collect_transaction_ids(transactions):
    identifiers = []
    for transaction in transactions:
        transaction_id = str(transaction.id)
        if transaction_id not in identifiers:
            identifiers.append(transaction_id)
    return identifiers[:50]


def _to_decimal(value):
    if value in (None, ""):
        return Decimal("0.00")
    return Decimal(str(value))


def _bulk_fix(*, fields, title=None, detail=None):
    payload = {
        "mode": "bulk_correct",
        "fields": fields,
    }
    if title:
        payload["title"] = title
    if detail:
        payload["detail"] = detail
    return payload


def _row_review(*, fields=None, title=None, detail=None):
    payload = {
        "mode": "row_review",
    }
    if fields:
        payload["fields"] = fields
    if title:
        payload["title"] = title
    if detail:
        payload["detail"] = detail
    return payload
