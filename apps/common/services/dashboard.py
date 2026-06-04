from decimal import Decimal

from django.db.models import Count
from django.utils import timezone

from apps.approvals.models import ApprovalRequest
from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction, TransactionRemediationAssignment, TransactionRemediationFollowUp
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace


def build_dashboard_summary(*, workspace_id, client_id=None, gstin_id=None, compliance_period_id=None):
    workspace = Workspace.objects.filter(pk=workspace_id).first()
    client = Client.objects.filter(pk=client_id).first() if client_id else None
    gstin = GSTIN.objects.filter(pk=gstin_id).first() if gstin_id else None
    compliance_period = CompliancePeriod.objects.filter(pk=compliance_period_id).select_related("gstin", "gstin__client").first() if compliance_period_id else None

    imports_qs = ImportBatch.objects.filter(is_active=True, workspace_id=workspace_id)
    transactions_qs = GSTTransaction.objects.filter(is_active=True, workspace_id=workspace_id)
    reconciliation_runs_qs = ReconciliationRun.objects.filter(is_active=True, workspace_id=workspace_id)
    returns_qs = ReturnPreparation.objects.filter(is_active=True, compliance_period__gstin__client__workspace_id=workspace_id)
    approvals_qs = ApprovalRequest.objects.filter(is_active=True, workspace_id=workspace_id)
    audit_logs_qs = AuditLog.objects.filter(is_active=True, workspace_id_ref=workspace_id)
    remediation_assignments_qs = TransactionRemediationAssignment.objects.filter(is_active=True, workspace_id=workspace_id)
    remediation_follow_ups_qs = TransactionRemediationFollowUp.objects.filter(is_active=True, workspace_id=workspace_id)

    if client_id:
        imports_qs = imports_qs.filter(client_id=client_id)
        transactions_qs = transactions_qs.filter(client_id=client_id)
        reconciliation_runs_qs = reconciliation_runs_qs.filter(client_id=client_id)
        returns_qs = returns_qs.filter(compliance_period__gstin__client_id=client_id)
        approvals_qs = approvals_qs.filter(client_id=client_id)
        audit_logs_qs = audit_logs_qs.filter(client_id_ref=client_id)
        remediation_assignments_qs = remediation_assignments_qs.filter(client_id=client_id)
        remediation_follow_ups_qs = remediation_follow_ups_qs.filter(client_id=client_id)
    if gstin_id:
        imports_qs = imports_qs.filter(gstin_id=gstin_id)
        transactions_qs = transactions_qs.filter(gstin_id=gstin_id)
        reconciliation_runs_qs = reconciliation_runs_qs.filter(gstin_id=gstin_id)
        returns_qs = returns_qs.filter(compliance_period__gstin_id=gstin_id)
        approvals_qs = approvals_qs.filter(gstin_id=gstin_id)
        audit_logs_qs = audit_logs_qs.filter(gstin_id_ref=gstin_id)
        remediation_assignments_qs = remediation_assignments_qs.filter(gstin_id=gstin_id)
        remediation_follow_ups_qs = remediation_follow_ups_qs.filter(gstin_id=gstin_id)
    if compliance_period_id:
        imports_qs = imports_qs.filter(compliance_period_id=compliance_period_id)
        transactions_qs = transactions_qs.filter(compliance_period_id=compliance_period_id)
        reconciliation_runs_qs = reconciliation_runs_qs.filter(compliance_period_id=compliance_period_id)
        returns_qs = returns_qs.filter(compliance_period_id=compliance_period_id)
        approvals_qs = approvals_qs.filter(compliance_period_id=compliance_period_id)
        audit_logs_qs = audit_logs_qs.filter(compliance_period_id_ref=compliance_period_id)
        remediation_assignments_qs = remediation_assignments_qs.filter(compliance_period_id=compliance_period_id)
        remediation_follow_ups_qs = remediation_follow_ups_qs.filter(compliance_period_id=compliance_period_id)

    latest_run = reconciliation_runs_qs.order_by("-processed_at", "-created_at").first()
    latest_approvals = approvals_qs.order_by("-created_at")
    gstr1 = returns_qs.filter(return_type=ReturnPreparation.ReturnType.GSTR1).order_by("-updated_at").first()
    gstr3b = returns_qs.filter(return_type=ReturnPreparation.ReturnType.GSTR3B).order_by("-updated_at").first()

    import_summary = _build_import_summary(imports_qs)
    transaction_summary = _build_transaction_summary(transactions_qs)
    reconciliation_summary = _build_reconciliation_summary(latest_run)
    return_summary = _build_return_summary(gstr1, gstr3b)
    approval_summary = _build_approval_summary(latest_approvals)
    filing_status = _build_filing_status(gstr1, gstr3b)
    lock_status = _build_lock_status(compliance_period)
    close_management_summary = _build_close_management_summary(
        remediation_assignments_qs=remediation_assignments_qs,
        remediation_follow_ups_qs=remediation_follow_ups_qs,
        compliance_period=compliance_period,
    )
    workspace_close_manager_summary = build_close_manager_dashboard(workspace_id=workspace_id) if workspace_id else None
    recent_activity = _build_recent_activity(audit_logs_qs[:8])
    open_issues = _calculate_open_issues(reconciliation_summary, approval_summary, return_summary)
    compliance_health_score = calculate_compliance_health_score(
        import_summary=import_summary,
        reconciliation_summary=reconciliation_summary,
        return_summary=return_summary,
        approval_summary=approval_summary,
        filing_status=filing_status,
        lock_status=lock_status,
    )

    return {
        "selected_context": {
            "workspace": {"id": str(workspace.id), "name": workspace.name} if workspace else None,
            "client": {"id": str(client.id), "name": client.legal_name} if client else None,
            "gstin": {"id": str(gstin.id), "value": gstin.gstin} if gstin else None,
            "compliance_period": {
                "id": str(compliance_period.id),
                "period": compliance_period.period,
                "return_type": compliance_period.return_type,
                "status": compliance_period.status,
                "due_date": compliance_period.due_date.isoformat() if compliance_period and compliance_period.due_date else None,
            } if compliance_period else None,
        },
        "compliance_health_score": compliance_health_score,
        "import_summary": import_summary,
        "transaction_summary": transaction_summary,
        "reconciliation_summary": reconciliation_summary,
        "return_summary": return_summary,
        "approval_summary": approval_summary,
        "filing_status": filing_status,
        "lock_status": lock_status,
        "close_management_summary": close_management_summary,
        "workspace_close_manager_summary": workspace_close_manager_summary,
        "open_issues": open_issues,
        "recent_activity": recent_activity,
    }


def build_workspace_summary(*, compliance_period):
    summary = build_dashboard_summary(
        workspace_id=compliance_period.gstin.client.workspace_id,
        client_id=compliance_period.gstin.client_id,
        gstin_id=compliance_period.gstin_id,
        compliance_period_id=compliance_period.id,
    )
    next_action = determine_next_recommended_action(summary)
    return {
        "period_details": summary["selected_context"]["compliance_period"],
        "imports_by_type_status": summary["import_summary"],
        "latest_reconciliation_run": summary["reconciliation_summary"]["latest_run"],
        "reconciliation_issue_counts": {
            "mismatches": summary["reconciliation_summary"]["mismatch_count"],
            "partial_matches": summary["reconciliation_summary"]["partial_match_count"],
            "missing_in_books": summary["reconciliation_summary"]["missing_in_books_count"],
            "missing_in_portal": summary["reconciliation_summary"]["missing_in_portal_count"],
            "duplicates": summary["reconciliation_summary"]["duplicate_count"],
        },
        "return_preparation_statuses": summary["return_summary"],
        "approvals": summary["approval_summary"],
        "audit_activity": summary["recent_activity"],
        "lock_state": summary["lock_status"],
        "next_recommended_action": next_action,
    }


def build_close_manager_dashboard(*, workspace_id):
    workspace = Workspace.objects.filter(pk=workspace_id).first()
    assignments_qs = TransactionRemediationAssignment.objects.filter(is_active=True, workspace_id=workspace_id).select_related(
        "client",
        "gstin",
        "compliance_period",
        "assigned_to",
    )
    follow_ups_qs = TransactionRemediationFollowUp.objects.filter(is_active=True, workspace_id=workspace_id).select_related(
        "client",
        "gstin",
        "compliance_period",
        "assignment",
        "assigned_to",
    )
    now = timezone.now()
    assignments = list(assignments_qs.order_by("-updated_at"))
    follow_ups = list(follow_ups_qs.order_by("remind_at", "-created_at"))

    def _is_open(assignment):
        return assignment.status in {
            TransactionRemediationAssignment.AssignmentStatus.OPEN,
            TransactionRemediationAssignment.AssignmentStatus.IN_PROGRESS,
        }

    def _is_overdue(assignment):
        if not _is_open(assignment):
            return False
        due_date = assignment.compliance_period.due_date
        if due_date:
            return now.date() > due_date
        return (now - assignment.created_at).days >= 5

    def _is_stale(assignment):
        if not _is_open(assignment):
            return False
        return (now - assignment.updated_at).days >= 3

    open_assignments = [assignment for assignment in assignments if _is_open(assignment)]
    escalated_assignments = [assignment for assignment in assignments if assignment.escalated_at]
    overdue_assignments = [assignment for assignment in open_assignments if _is_overdue(assignment)]
    stale_assignments = [assignment for assignment in open_assignments if _is_stale(assignment)]
    open_follow_ups = [
        follow_up
        for follow_up in follow_ups
        if follow_up.status in {TransactionRemediationFollowUp.FollowUpStatus.OPEN, TransactionRemediationFollowUp.FollowUpStatus.SENT}
    ]
    due_follow_ups = [follow_up for follow_up in open_follow_ups if follow_up.remind_at <= now]

    queue_map = {}
    for assignment in assignments:
        key = (assignment.client_id, assignment.compliance_period_id)
        queue = queue_map.setdefault(
            key,
            {
                "client_id": str(assignment.client_id),
                "client_name": assignment.client.legal_name,
                "period_id": str(assignment.compliance_period_id),
                "period": assignment.compliance_period.period,
                "gstin_value": assignment.gstin.gstin if assignment.gstin else None,
                "open_assignments": 0,
                "in_progress_assignments": 0,
                "resolved_assignments": 0,
                "deferred_assignments": 0,
                "escalated_assignments": 0,
                "overdue_assignments": 0,
                "follow_ups_due": 0,
            },
        )
        if assignment.status == TransactionRemediationAssignment.AssignmentStatus.OPEN:
            queue["open_assignments"] += 1
        elif assignment.status == TransactionRemediationAssignment.AssignmentStatus.IN_PROGRESS:
            queue["in_progress_assignments"] += 1
        elif assignment.status == TransactionRemediationAssignment.AssignmentStatus.RESOLVED:
            queue["resolved_assignments"] += 1
        elif assignment.status == TransactionRemediationAssignment.AssignmentStatus.DEFERRED:
            queue["deferred_assignments"] += 1
        if assignment.escalated_at:
            queue["escalated_assignments"] += 1
        if _is_overdue(assignment):
            queue["overdue_assignments"] += 1
    for follow_up in due_follow_ups:
        key = (follow_up.client_id, follow_up.compliance_period_id)
        queue = queue_map.setdefault(
            key,
            {
                "client_id": str(follow_up.client_id),
                "client_name": follow_up.client.legal_name,
                "period_id": str(follow_up.compliance_period_id),
                "period": follow_up.compliance_period.period,
                "gstin_value": follow_up.gstin.gstin if follow_up.gstin else None,
                "open_assignments": 0,
                "in_progress_assignments": 0,
                "resolved_assignments": 0,
                "deferred_assignments": 0,
                "escalated_assignments": 0,
                "overdue_assignments": 0,
                "follow_ups_due": 0,
            },
        )
        queue["follow_ups_due"] += 1

    owner_workload = {}
    for assignment in open_assignments:
        owner_key = assignment.assigned_to_id or "unassigned"
        owner_name = _display_user(assignment.assigned_to) or "Unassigned"
        owner_entry = owner_workload.setdefault(owner_key, {"name": owner_name, "count": 0, "overdue": 0, "escalated": 0})
        owner_entry["count"] += 1
        if _is_overdue(assignment):
            owner_entry["overdue"] += 1
        if assignment.escalated_at:
            owner_entry["escalated"] += 1

    attention_items = [
        {
            "assignment_id": str(assignment.id),
            "title": assignment.title,
            "client_name": assignment.client.legal_name,
            "period": assignment.compliance_period.period,
            "assigned_to_name": _display_user(assignment.assigned_to) or "Unassigned",
            "status": assignment.status,
            "is_escalated": bool(assignment.escalated_at),
            "is_overdue": _is_overdue(assignment),
            "age_days": max((now - assignment.created_at).days, 0),
            "updated_days": max((now - assignment.updated_at).days, 0),
        }
        for assignment in sorted(
            open_assignments,
            key=lambda item: (
                0 if _is_overdue(item) else 1,
                0 if item.escalated_at else 1,
                -(now - item.created_at).days,
            ),
        )[:8]
    ]

    return {
        "workspace": {"id": str(workspace.id), "name": workspace.name} if workspace else None,
        "assignment_count": len(assignments),
        "open_assignment_count": len(open_assignments),
        "escalated_assignment_count": len(escalated_assignments),
        "overdue_assignment_count": len(overdue_assignments),
        "stale_assignment_count": len(stale_assignments),
        "follow_up_count": len(follow_ups),
        "open_follow_up_count": len(open_follow_ups),
        "follow_ups_due_today_count": len(due_follow_ups),
        "queues": sorted(
            queue_map.values(),
            key=lambda queue: (
                -queue["overdue_assignments"],
                -queue["escalated_assignments"],
                -queue["open_assignments"],
                queue["client_name"],
            ),
        )[:10],
        "owner_workload": sorted(owner_workload.values(), key=lambda entry: (-entry["count"], entry["name"]))[:8],
        "attention_items": attention_items,
        "next_follow_ups": [
            {
                "id": str(follow_up.id),
                "title": follow_up.title,
                "client_name": follow_up.client.legal_name,
                "period": follow_up.compliance_period.period,
                "status": follow_up.status,
                "follow_up_type": follow_up.follow_up_type,
                "remind_at": follow_up.remind_at.isoformat(),
                "assigned_to_name": _display_user(follow_up.assigned_to),
                "assignment_title": follow_up.assignment.title,
            }
            for follow_up in follow_ups[:8]
        ],
    }


def build_close_manager_report(*, workspace_id, days=7):
    workspace = Workspace.objects.filter(pk=workspace_id).first()
    now = timezone.now()
    lookback_days = max(int(days or 7), 1)
    window_start = now - timezone.timedelta(days=lookback_days - 1)
    audit_logs = list(
        AuditLog.objects.filter(
            is_active=True,
            workspace_id_ref=workspace_id,
            created_at__gte=window_start,
            action__in=[
                "transaction_remediation_digest.generated",
                "transaction_remediation_digest.dispatched",
                "transaction_remediation_digest.acknowledged",
                "transaction_remediation_digest.failed",
                "transaction_remediation_follow_up.reminder_sent",
                "transaction_remediation_follow_up.completed",
                "transaction_remediation_follow_up.dismissed",
                "transaction_remediation_assignment.auto_escalated",
            ],
        )
        .select_related("actor")
        .order_by("-created_at")
    )

    def _count(action):
        return sum(1 for log in audit_logs if log.action == action)

    daily_map = {}
    for offset in range(lookback_days):
        day = (window_start + timezone.timedelta(days=offset)).date()
        daily_map[day.isoformat()] = {
            "date": day.isoformat(),
            "digests_generated": 0,
            "digests_dispatched": 0,
            "digest_failures": 0,
            "reminders_sent": 0,
            "follow_ups_completed": 0,
            "auto_escalations": 0,
        }
    for log in audit_logs:
        day_key = log.created_at.date().isoformat()
        bucket = daily_map.get(day_key)
        if not bucket:
            continue
        if log.action == "transaction_remediation_digest.generated":
            bucket["digests_generated"] += 1
        elif log.action == "transaction_remediation_digest.dispatched":
            bucket["digests_dispatched"] += 1
        elif log.action == "transaction_remediation_digest.failed":
            bucket["digest_failures"] += 1
        elif log.action == "transaction_remediation_follow_up.reminder_sent":
            bucket["reminders_sent"] += 1
        elif log.action == "transaction_remediation_follow_up.completed":
            bucket["follow_ups_completed"] += 1
        elif log.action == "transaction_remediation_assignment.auto_escalated":
            bucket["auto_escalations"] += 1

    recent_activity = [
        {
            "id": str(log.id),
            "action": log.action,
            "actor_name": _display_user(log.actor) or "System",
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "created_at": log.created_at.isoformat(),
            "metadata": log.metadata,
        }
        for log in audit_logs[:12]
    ]

    return {
        "workspace": {"id": str(workspace.id), "name": workspace.name} if workspace else None,
        "window_days": lookback_days,
        "summary": {
            "digests_generated": _count("transaction_remediation_digest.generated"),
            "digests_dispatched": _count("transaction_remediation_digest.dispatched"),
            "digests_acknowledged": _count("transaction_remediation_digest.acknowledged"),
            "digest_failures": _count("transaction_remediation_digest.failed"),
            "reminders_sent": _count("transaction_remediation_follow_up.reminder_sent"),
            "follow_ups_completed": _count("transaction_remediation_follow_up.completed"),
            "follow_ups_dismissed": _count("transaction_remediation_follow_up.dismissed"),
            "auto_escalations": _count("transaction_remediation_assignment.auto_escalated"),
        },
        "daily": list(daily_map.values()),
        "recent_activity": recent_activity,
    }


def build_close_manager_digest_payload(*, workspace_id):
    summary = build_close_manager_dashboard(workspace_id=workspace_id)
    queues = summary["queues"]
    attention_items = summary["attention_items"]
    next_follow_ups = summary["next_follow_ups"]
    highlights = []
    if summary["overdue_assignment_count"] > 0:
        highlights.append(f"{summary['overdue_assignment_count']} overdue remediation assignment(s)")
    if summary["escalated_assignment_count"] > 0:
        highlights.append(f"{summary['escalated_assignment_count']} escalated queue(s)")
    if summary["follow_ups_due_today_count"] > 0:
        highlights.append(f"{summary['follow_ups_due_today_count']} follow-up(s) due today")
    if not highlights:
        highlights.append("No urgent remediation items today")
    return {
        "generated_at": timezone.now().isoformat(),
        "workspace": summary["workspace"],
        "highlights": highlights,
        "metrics": {
            "assignment_count": summary["assignment_count"],
            "open_assignment_count": summary["open_assignment_count"],
            "escalated_assignment_count": summary["escalated_assignment_count"],
            "overdue_assignment_count": summary["overdue_assignment_count"],
            "follow_ups_due_today_count": summary["follow_ups_due_today_count"],
        },
        "queues": queues[:5],
        "attention_items": attention_items[:5],
        "next_follow_ups": next_follow_ups[:5],
    }


def calculate_compliance_health_score(*, import_summary, reconciliation_summary, return_summary, approval_summary, filing_status, lock_status):
    score = 100
    if import_summary["by_type"].get("sales", 0) == 0:
        score -= 15
    if import_summary["by_type"].get("purchase", 0) == 0:
        score -= 15
    if import_summary["by_type"].get("gstr_2b", 0) == 0:
        score -= 15
    unresolved = reconciliation_summary["open_issue_count"]
    score -= min(20, unresolved * 2)
    if return_summary["gstr1"]["status"] == "not_prepared":
        score -= 10
    if return_summary["gstr3b"]["status"] == "not_prepared":
        score -= 10
    if approval_summary["pending_count"] > 0:
        score -= 5
    if filing_status["all_filed"] and lock_status["is_locked"]:
        score = min(100, score + 10)
    return max(0, score)


def determine_next_recommended_action(summary):
    if summary["lock_status"]["is_locked"]:
        return "Period locked. Review audit trail or unlock only if correction is required."
    if summary["import_summary"]["by_type"].get("sales", 0) == 0:
        return "Upload sales register for this period."
    if summary["import_summary"]["by_type"].get("purchase", 0) == 0:
        return "Upload purchase register for this period."
    if summary["import_summary"]["by_type"].get("gstr_2b", 0) == 0:
        return "Upload GSTR-2B file for this period."
    if not summary["reconciliation_summary"]["latest_run"]:
        return "Run GSTR-2B reconciliation."
    if summary["reconciliation_summary"]["open_issue_count"] > 0:
        return "Review and action unresolved reconciliation items."
    if summary["return_summary"]["gstr1"]["status"] == "not_prepared":
        return "Prepare GSTR-1 draft."
    if summary["return_summary"]["gstr3b"]["status"] == "not_prepared":
        return "Prepare GSTR-3B draft."
    if summary["approval_summary"]["pending_count"] > 0:
        return "Resolve pending approval requests."
    if not summary["filing_status"]["all_filed"]:
        return "Mark approved returns as filed and lock the period."
    return "Monthly workspace is in a healthy state."


def _build_import_summary(imports_qs):
    by_type = {key: 0 for key in ["sales", "purchase", "credit_note", "debit_note", "gstr_2b"]}
    by_status = {}
    for entry in imports_qs.values("import_type").annotate(total=Count("id")):
        by_type[entry["import_type"]] = entry["total"]
    for entry in imports_qs.values("status").annotate(total=Count("id")):
        by_status[entry["status"]] = entry["total"]
    latest_batches = [
        {
            "id": str(batch.id),
            "import_type": batch.import_type,
            "status": batch.status,
            "file_name": batch.file_name,
            "total_rows": batch.total_rows,
            "valid_rows": batch.valid_rows,
            "invalid_rows": batch.invalid_rows,
        }
        for batch in imports_qs.order_by("-created_at")[:5]
    ]
    return {
        "total_batches": imports_qs.count(),
        "by_type": by_type,
        "by_status": by_status,
        "latest_batches": latest_batches,
    }


def _build_transaction_summary(transactions_qs):
    by_type = {
        entry["transaction_type"]: entry["total"]
        for entry in transactions_qs.values("transaction_type").annotate(total=Count("id"))
    }
    return {
        "total_transactions": transactions_qs.count(),
        "by_type": by_type,
        "sales_count": by_type.get("sales", 0),
        "purchase_count": by_type.get("purchase", 0),
        "gstr_2b_count": by_type.get("gstr_2b", 0),
    }


def _build_reconciliation_summary(latest_run):
    if latest_run is None:
        return {
            "latest_run": None,
            "matched_count": 0,
            "mismatch_count": 0,
            "partial_match_count": 0,
            "missing_in_books_count": 0,
            "missing_in_portal_count": 0,
            "duplicate_count": 0,
            "total_itc_at_risk": "0.00",
            "open_issue_count": 0,
            "mismatch_breakdown": [],
            "top_vendors": [],
        }
    items = ReconciliationItem.objects.filter(reconciliation_run=latest_run, is_active=True).select_related("books_transaction", "portal_transaction", "assigned_to")
    breakdown = [
        {"name": "Matched", "value": latest_run.matched_count, "color": "#4f46e5"},
        {"name": "Partial Match", "value": latest_run.partial_match_count, "color": "#7c3aed"},
        {"name": "Missing in 2B", "value": latest_run.missing_in_portal_count, "color": "#f59e0b"},
        {"name": "Missing in Books", "value": latest_run.missing_in_books_count, "color": "#ef4444"},
        {"name": "Duplicates", "value": latest_run.duplicate_count, "color": "#10b981"},
    ]
    vendor_totals = {}
    for item in items:
        vendor = item.books_transaction.counterparty_name if item.books_transaction else (item.portal_transaction.counterparty_name if item.portal_transaction else "Unknown vendor")
        gstin = item.books_transaction.counterparty_gstin if item.books_transaction else (item.portal_transaction.counterparty_gstin if item.portal_transaction else "")
        key = (vendor, gstin, item.match_status, item.assigned_to.get_full_name().strip() if item.assigned_to else "Unassigned")
        vendor_totals.setdefault(key, Decimal("0.00"))
        vendor_totals[key] += item.tax_difference
    top_vendors = [
        {
            "vendor": key[0],
            "gstin": key[1],
            "issue": key[2].replace("_", " "),
            "tax_difference": f"Rs. {format_decimal(amount)}",
            "status": "Resolved" if key[2] == "matched" else "Open",
            "assigned_to": key[3] or "Unassigned",
        }
        for key, amount in sorted(vendor_totals.items(), key=lambda entry: entry[1], reverse=True)[:5]
    ]
    open_issues = latest_run.partial_match_count + latest_run.mismatch_count + latest_run.missing_in_books_count + latest_run.missing_in_portal_count + latest_run.duplicate_count
    return {
        "latest_run": {
            "id": str(latest_run.id),
            "status": latest_run.status,
            "processed_at": latest_run.processed_at.isoformat() if latest_run.processed_at else None,
        },
        "matched_count": latest_run.matched_count,
        "mismatch_count": latest_run.mismatch_count,
        "partial_match_count": latest_run.partial_match_count,
        "missing_in_books_count": latest_run.missing_in_books_count,
        "missing_in_portal_count": latest_run.missing_in_portal_count,
        "duplicate_count": latest_run.duplicate_count,
        "total_itc_at_risk": format_decimal(latest_run.total_itc_at_risk),
        "open_issue_count": open_issues,
        "mismatch_breakdown": breakdown,
        "top_vendors": top_vendors,
    }


def _build_return_summary(gstr1, gstr3b):
    def _entry(instance):
        if instance is None:
            return {"status": "not_prepared", "id": None}
        return {
            "id": str(instance.id),
            "status": instance.status,
            "prepared_by_name": _display_user(instance.prepared_by),
            "approved_by_name": _display_user(instance.approved_by),
            "filed_by_name": _display_user(instance.filed_by),
            "filed_at": instance.filed_at.isoformat() if instance.filed_at else None,
            "arn": instance.arn,
            "summary_snapshot": instance.summary_snapshot,
        }
    filed_count = sum(1 for entry in [gstr1, gstr3b] if entry and entry.status == ReturnPreparation.PreparationStatus.FILED)
    return {
        "gstr1": _entry(gstr1),
        "gstr3b": _entry(gstr3b),
        "filed_count": filed_count,
        "total_expected": 2,
        "display_status": f"{filed_count}/2 Filed",
    }


def _build_approval_summary(approvals_qs):
    counts = {
        entry["status"]: entry["total"]
        for entry in approvals_qs.values("status").annotate(total=Count("id"))
    }
    latest = approvals_qs.select_related("requested_to").first()
    return {
        "pending_count": counts.get(ApprovalRequest.ApprovalStatus.PENDING, 0),
        "approved_count": counts.get(ApprovalRequest.ApprovalStatus.APPROVED, 0),
        "rejected_count": counts.get(ApprovalRequest.ApprovalStatus.REJECTED, 0),
        "cancelled_count": counts.get(ApprovalRequest.ApprovalStatus.CANCELLED, 0),
        "latest": {
            "id": str(latest.id),
            "status": latest.status,
            "entity_type": latest.entity_type,
            "requested_to_name": latest.requested_to.get_full_name().strip() if latest and latest.requested_to else None,
        } if latest else None,
    }


def _build_filing_status(gstr1, gstr3b):
    return {
        "gstr1_status": gstr1.status if gstr1 else "not_prepared",
        "gstr3b_status": gstr3b.status if gstr3b else "not_prepared",
        "all_filed": bool(gstr1 and gstr1.status == ReturnPreparation.PreparationStatus.FILED and gstr3b and gstr3b.status == ReturnPreparation.PreparationStatus.FILED),
    }


def _build_close_management_summary(*, remediation_assignments_qs, remediation_follow_ups_qs, compliance_period):
    assignments = list(remediation_assignments_qs.select_related("assigned_to").order_by("-updated_at"))
    follow_ups = list(
        remediation_follow_ups_qs.select_related("assigned_to", "assignment", "created_by").order_by("remind_at", "-created_at")
    )
    due_date = compliance_period.due_date if compliance_period else None
    now = None
    from django.utils import timezone

    now = timezone.now()

    def _assignment_is_overdue(assignment):
        if assignment.status in {
            TransactionRemediationAssignment.AssignmentStatus.RESOLVED,
            TransactionRemediationAssignment.AssignmentStatus.DEFERRED,
        }:
            return False
        if due_date:
            return now.date() > due_date
        return (now - assignment.created_at).days >= 5

    def _assignment_is_stale(assignment):
        if assignment.status in {
            TransactionRemediationAssignment.AssignmentStatus.RESOLVED,
            TransactionRemediationAssignment.AssignmentStatus.DEFERRED,
        }:
            return False
        return (now - assignment.updated_at).days >= 3

    open_assignments = [
        assignment
        for assignment in assignments
        if assignment.status
        in {
            TransactionRemediationAssignment.AssignmentStatus.OPEN,
            TransactionRemediationAssignment.AssignmentStatus.IN_PROGRESS,
        }
    ]
    overdue_assignments = [assignment for assignment in open_assignments if _assignment_is_overdue(assignment)]
    stale_assignments = [assignment for assignment in open_assignments if _assignment_is_stale(assignment)]
    escalated_assignments = [assignment for assignment in assignments if assignment.escalated_at]
    open_follow_ups = [
        follow_up
        for follow_up in follow_ups
        if follow_up.status
        in {
            TransactionRemediationFollowUp.FollowUpStatus.OPEN,
            TransactionRemediationFollowUp.FollowUpStatus.SENT,
        }
    ]
    due_today_follow_ups = [follow_up for follow_up in open_follow_ups if follow_up.remind_at.date() <= now.date()]
    owner_workload = {}
    for assignment in open_assignments:
        key = assignment.assigned_to_id or "unassigned"
        name = assignment.assigned_to.get_full_name().strip() if assignment.assigned_to else "Unassigned"
        if assignment.assigned_to and not name:
            name = assignment.assigned_to.username
        entry = owner_workload.setdefault(key, {"name": name or "Unassigned", "count": 0, "escalated": 0})
        entry["count"] += 1
        if assignment.escalated_at:
            entry["escalated"] += 1

    next_follow_ups = [
        {
            "id": str(follow_up.id),
            "title": follow_up.title,
            "status": follow_up.status,
            "follow_up_type": follow_up.follow_up_type,
            "remind_at": follow_up.remind_at.isoformat(),
            "assigned_to_name": _display_user(follow_up.assigned_to),
            "assignment_title": follow_up.assignment.title,
        }
        for follow_up in follow_ups[:5]
    ]
    return {
        "assignment_count": len(assignments),
        "open_assignment_count": len(open_assignments),
        "in_progress_count": sum(1 for assignment in assignments if assignment.status == TransactionRemediationAssignment.AssignmentStatus.IN_PROGRESS),
        "resolved_count": sum(1 for assignment in assignments if assignment.status == TransactionRemediationAssignment.AssignmentStatus.RESOLVED),
        "deferred_count": sum(1 for assignment in assignments if assignment.status == TransactionRemediationAssignment.AssignmentStatus.DEFERRED),
        "overdue_assignment_count": len(overdue_assignments),
        "stale_assignment_count": len(stale_assignments),
        "escalated_assignment_count": len(escalated_assignments),
        "follow_up_count": len(follow_ups),
        "open_follow_up_count": len(open_follow_ups),
        "follow_ups_due_today_count": len(due_today_follow_ups),
        "owner_workload": sorted(owner_workload.values(), key=lambda entry: (-entry["count"], entry["name"]))[:6],
        "next_follow_ups": next_follow_ups,
    }


def _build_lock_status(compliance_period):
    if compliance_period is None:
        return {"is_locked": False, "locked_at": None, "locked_by_name": None}
    locked_by_name = None
    if compliance_period.locked_by:
        locked_by_name = compliance_period.locked_by.get_full_name().strip() or compliance_period.locked_by.username
    return {
        "is_locked": compliance_period.is_locked,
        "locked_at": compliance_period.locked_at.isoformat() if compliance_period.locked_at else None,
        "locked_by_name": locked_by_name,
    }


def _build_recent_activity(audit_logs):
    activities = []
    for audit_log in audit_logs:
        activities.append(
            {
                "id": str(audit_log.id),
                "action": audit_log.action,
                "entity_type": audit_log.entity_type,
                "entity_id": str(audit_log.entity_id),
                "actor_name": audit_log.actor.get_full_name().strip() if audit_log.actor and audit_log.actor.get_full_name().strip() else (audit_log.actor.username if audit_log.actor else "System"),
                "description": _describe_audit_action(audit_log),
                "timestamp": audit_log.created_at.isoformat(),
            }
        )
    return activities


def _describe_audit_action(audit_log):
    action = audit_log.action.replace(".", " ").replace("_", " ")
    entity = audit_log.entity_type.replace("_", " ")
    return f"{action.capitalize()} on {entity}."


def _calculate_open_issues(reconciliation_summary, approval_summary, return_summary):
    open_returns = 0
    for key in ["gstr1", "gstr3b"]:
        if return_summary[key]["status"] not in {"filed", "approved"}:
            open_returns += 1
    return reconciliation_summary["open_issue_count"] + approval_summary["pending_count"] + open_returns


def format_decimal(value):
    return f"{Decimal(value or 0):,.2f}"


def _display_user(user):
    if user is None:
        return None
    full_name = user.get_full_name().strip()
    return full_name or user.username
