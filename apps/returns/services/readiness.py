from collections import Counter
from decimal import Decimal

from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation


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
        "overall_status": _resolve_overall_status([gstr1_readiness["status"], gstr3b_readiness["status"]]),
    }


def _evaluate_gstr1_readiness(*, compliance_period, transactions, preparation):
    relevant_transactions = transactions.filter(transaction_type__in=["sales", "credit_note", "debit_note"]).order_by("id")
    sales_transactions = relevant_transactions.filter(transaction_type="sales")
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

    if not sales_transactions.exists():
        issues.append(
            _issue(
                code="missing_sales_transactions",
                severity="error",
                title="Sales transactions are required",
                detail="No sales transactions are available for the selected compliance period.",
                action_label="Review imports",
                action_target="/imports",
            )
        )

    line_items = list(_iter_transaction_line_items(relevant_transactions))
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

    summary = preparation.summary_snapshot if preparation else {}
    outward_supplies = summary.get("outward_supplies", {}) if isinstance(summary, dict) else {}

    return _build_readiness_payload(
        return_type=ReturnPreparation.ReturnType.GSTR1,
        preparation=preparation,
        issues=issues,
        metrics={
            "transaction_count": relevant_transactions.count(),
            "sales_transaction_count": sales_transactions.count(),
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
            "eligible_itc": str(itc_summary.get("eligible_itc", "0.00")),
            "net_tax_payable": str(itc_summary.get("net_tax_payable", "0.00")),
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
        }


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
