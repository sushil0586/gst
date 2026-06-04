from collections import defaultdict
from decimal import Decimal
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.services.compliance_periods import ensure_period_modifiable
from apps.gst_transactions.models import GSTTransaction
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun

User = get_user_model()

AMOUNT_TOLERANCE = Decimal("1.00")
BOOK_TYPES = {"purchase", "debit_note", "credit_note"}
PORTAL_TYPES = {"gstr_2b"}


def create_reconciliation_run(*, serializer, user):
    ensure_period_modifiable(
        serializer.validated_data["compliance_period"],
        actor=user,
        attempted_action="reconciliation.run_create",
    )
    instance = serializer.save(
        status=ReconciliationRun.RunStatus.QUEUED,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="reconciliation_run.created",
        entity=instance,
        workspace_id=instance.workspace_id,
        client_id=instance.client_id,
        gstin_id=instance.gstin_id,
        compliance_period_id=instance.compliance_period_id,
        metadata={"status": instance.status, "run_type": instance.run_type},
    )
    enqueue_reconciliation_run(run=instance, actor=user)
    instance.refresh_from_db()
    return instance


def enqueue_reconciliation_run(*, run, actor):
    if settings.CELERY_TASK_ALWAYS_EAGER:
        process_reconciliation_run(run_id=run.id, actor_id=actor.id if actor else None)
        return

    from apps.reconciliation.tasks import trigger_reconciliation_run

    try:
        trigger_reconciliation_run.apply_async(
            args=[str(run.id), actor.id if actor else None],
            queue=settings.CELERY_RECONCILIATION_QUEUE,
        )
    except Exception:
        if settings.CELERY_STRICT_PRODUCTION_ASYNC and not settings.DEBUG:
            raise RuntimeError("Reconciliation worker is unavailable. Heavy jobs cannot fall back to inline execution in production.")
        process_reconciliation_run(run_id=run.id, actor_id=actor.id if actor else None)


@transaction.atomic
def process_reconciliation_run(*, run_id, actor_id=None):
    actor = User.objects.filter(pk=actor_id).first() if actor_id else None
    run = (
        ReconciliationRun.objects.select_for_update(of=("self",))
        .select_related("workspace", "client", "gstin", "compliance_period")
        .get(pk=run_id)
    )

    try:
        run.status = ReconciliationRun.RunStatus.RUNNING
        run.processed_at = None
        run.error_summary = {}
        run.save(update_fields=["status", "processed_at", "error_summary", "updated_at"])

        books_transactions = _get_books_transactions(run)
        portal_transactions = _get_portal_transactions(run)

        run.items.all().delete()
        result = _build_reconciliation_items(run=run, books_transactions=books_transactions, portal_transactions=portal_transactions)
        _apply_summary(run=run, items=result["items"])

        run.status = ReconciliationRun.RunStatus.COMPLETED
        run.processed_at = timezone.now()
        run.error_summary = {
            "books_count": len(books_transactions),
            "portal_count": len(portal_transactions),
        }
        run.save(
            update_fields=[
                "status",
                "processed_at",
                "error_summary",
                "matched_count",
                "mismatch_count",
                "partial_match_count",
                "missing_in_books_count",
                "missing_in_portal_count",
                "duplicate_count",
                "total_tax_difference",
                "total_itc_at_risk",
                "updated_at",
            ]
        )
        record_audit_log(
            actor=actor,
            action="reconciliation_run.completed",
            entity=run,
            workspace_id=run.workspace_id,
            client_id=run.client_id,
            metadata=run.error_summary,
        )
        return run
    except Exception as exc:
        run.status = ReconciliationRun.RunStatus.FAILED
        run.processed_at = timezone.now()
        run.error_summary = {"message": str(exc)}
        run.save(update_fields=["status", "processed_at", "error_summary", "updated_at"])
        record_audit_log(
            actor=actor,
            action="reconciliation_run.failed",
            entity=run,
            workspace_id=run.workspace_id,
            client_id=run.client_id,
            metadata={"error": str(exc)},
        )
        raise


def update_reconciliation_item(*, serializer, user):
    previous = serializer.instance
    old_status = previous.action_status
    old_assignee_id = previous.assigned_to_id
    instance = serializer.save(updated_by=user)
    record_audit_log(
        actor=user,
        action="reconciliation_item.updated",
        entity=instance,
        workspace_id=instance.reconciliation_run.workspace_id,
        client_id=instance.reconciliation_run.client_id,
        metadata={"action_status": instance.action_status, "assigned_to": instance.assigned_to_id},
    )
    if instance.assigned_to_id and instance.assigned_to_id != old_assignee_id:
        record_audit_log(
            actor=user,
            action="reconciliation_item.assigned",
            entity=instance,
            workspace_id=instance.reconciliation_run.workspace_id,
            client_id=instance.reconciliation_run.client_id,
            metadata={"assigned_to": instance.assigned_to_id},
        )
    if instance.action_status != old_status and instance.action_status in {
        ReconciliationItem.ActionStatus.RESOLVED,
        ReconciliationItem.ActionStatus.DEFERRED,
        ReconciliationItem.ActionStatus.IGNORED,
    }:
        record_audit_log(
            actor=user,
            action=f"reconciliation_item.{instance.action_status}",
            entity=instance,
            workspace_id=instance.reconciliation_run.workspace_id,
            client_id=instance.reconciliation_run.client_id,
            metadata={"remarks": instance.remarks},
        )
    return instance


def _get_books_transactions(run):
    queryset = GSTTransaction.objects.filter(
        is_active=True,
        workspace_id=run.workspace_id,
        client_id=run.client_id,
        compliance_period_id=run.compliance_period_id,
        transaction_type__in=BOOK_TYPES,
    )
    if run.gstin_id:
        queryset = queryset.filter(gstin_id=run.gstin_id)
    return list(queryset.order_by("transaction_date", "reference_number", "id"))


def _get_portal_transactions(run):
    queryset = GSTTransaction.objects.filter(
        is_active=True,
        workspace_id=run.workspace_id,
        client_id=run.client_id,
        compliance_period_id=run.compliance_period_id,
        transaction_type__in=PORTAL_TYPES,
    )
    if run.gstin_id:
        queryset = queryset.filter(gstin_id=run.gstin_id)
    return list(queryset.order_by("transaction_date", "reference_number", "id"))


def _build_reconciliation_items(*, run, books_transactions, portal_transactions):
    books_groups = _group_transactions(books_transactions)
    portal_groups = _group_transactions(portal_transactions)
    items = []

    processed_books_ids = set()
    processed_portal_ids = set()
    all_keys = set(books_groups) | set(portal_groups)

    for key in sorted(all_keys):
        books_group = books_groups.get(key, [])
        portal_group = portal_groups.get(key, [])

        if len(books_group) > 1:
            for transaction in books_group:
                items.append(_build_item(
                    run=run,
                    books_transaction=transaction,
                    portal_transaction=None,
                    match_status=ReconciliationItem.MatchStatus.DUPLICATE_IN_BOOKS,
                    mismatch_reason=ReconciliationItem.MismatchReason.DUPLICATE_INVOICE,
                ))
                processed_books_ids.add(transaction.id)
        if len(portal_group) > 1:
            for transaction in portal_group:
                items.append(_build_item(
                    run=run,
                    books_transaction=None,
                    portal_transaction=transaction,
                    match_status=ReconciliationItem.MatchStatus.DUPLICATE_IN_PORTAL,
                    mismatch_reason=ReconciliationItem.MismatchReason.DUPLICATE_INVOICE,
                ))
                processed_portal_ids.add(transaction.id)

        if len(books_group) == 1 and len(portal_group) == 1:
            books_tx = books_group[0]
            portal_tx = portal_group[0]
            processed_books_ids.add(books_tx.id)
            processed_portal_ids.add(portal_tx.id)
            comparison = _compare_transactions(books_tx, portal_tx)
            items.append(_build_item(
                run=run,
                books_transaction=books_tx,
                portal_transaction=portal_tx,
                match_status=comparison["status"],
                mismatch_reason=comparison["reason"],
                tax_difference=comparison["tax_difference"],
                taxable_difference=comparison["taxable_difference"],
                total_difference=comparison["total_difference"],
            ))

    unmatched_books = [tx for tx in books_transactions if tx.id not in processed_books_ids]
    unmatched_portal = [tx for tx in portal_transactions if tx.id not in processed_portal_ids]

    fuzzy_pairs, remaining_books, remaining_portal = _pair_fuzzy(unmatched_books, unmatched_portal)
    for books_tx, portal_tx, status, reason in fuzzy_pairs:
        comparison = _compare_transactions(books_tx, portal_tx, forced_status=status, forced_reason=reason)
        items.append(_build_item(
            run=run,
            books_transaction=books_tx,
            portal_transaction=portal_tx,
            match_status=comparison["status"],
            mismatch_reason=comparison["reason"],
            tax_difference=comparison["tax_difference"],
            taxable_difference=comparison["taxable_difference"],
            total_difference=comparison["total_difference"],
        ))

    for books_tx in remaining_books:
        items.append(_build_item(
            run=run,
            books_transaction=books_tx,
            portal_transaction=None,
            match_status=ReconciliationItem.MatchStatus.MISSING_IN_PORTAL,
            mismatch_reason=ReconciliationItem.MismatchReason.MISSING_IN_PORTAL,
            tax_difference=books_tx.tax_amount,
            taxable_difference=books_tx.taxable_value,
            total_difference=books_tx.total_amount,
        ))

    for portal_tx in remaining_portal:
        items.append(_build_item(
            run=run,
            books_transaction=None,
            portal_transaction=portal_tx,
            match_status=ReconciliationItem.MatchStatus.MISSING_IN_BOOKS,
            mismatch_reason=ReconciliationItem.MismatchReason.MISSING_IN_BOOKS,
            tax_difference=portal_tx.tax_amount,
            taxable_difference=portal_tx.taxable_value,
            total_difference=portal_tx.total_amount,
        ))

    created_items = ReconciliationItem.objects.bulk_create(items)
    return {"items": created_items}


def _group_transactions(transactions):
    grouped = defaultdict(list)
    for transaction in transactions:
        key = (
            _normalize_gstin(transaction.counterparty_gstin),
            _normalize_document_number(transaction.reference_number),
        )
        grouped[key].append(transaction)
    return grouped


def _compare_transactions(books_tx, portal_tx, forced_status=None, forced_reason=None):
    taxable_difference = abs((books_tx.taxable_value or Decimal("0")) - (portal_tx.taxable_value or Decimal("0")))
    tax_difference = abs((books_tx.tax_amount or Decimal("0")) - (portal_tx.tax_amount or Decimal("0")))
    total_difference = abs((books_tx.total_amount or Decimal("0")) - (portal_tx.total_amount or Decimal("0")))

    if forced_status and forced_reason:
        return {
            "status": forced_status,
            "reason": forced_reason,
            "tax_difference": tax_difference,
            "taxable_difference": taxable_difference,
            "total_difference": total_difference,
        }

    if books_tx.transaction_date != portal_tx.transaction_date:
        status = ReconciliationItem.MatchStatus.MISMATCH
        reason = ReconciliationItem.MismatchReason.DATE_MISMATCH
    elif taxable_difference == 0 and tax_difference == 0 and total_difference == 0:
        status = ReconciliationItem.MatchStatus.MATCHED
        reason = ""
    elif taxable_difference <= AMOUNT_TOLERANCE and tax_difference <= AMOUNT_TOLERANCE and total_difference <= AMOUNT_TOLERANCE:
        status = ReconciliationItem.MatchStatus.PARTIAL_MATCH
        reason = _resolve_amount_reason(taxable_difference, tax_difference, total_difference)
    else:
        status = ReconciliationItem.MatchStatus.MISMATCH
        reason = _resolve_amount_reason(taxable_difference, tax_difference, total_difference)

    return {
        "status": status,
        "reason": reason,
        "tax_difference": tax_difference,
        "taxable_difference": taxable_difference,
        "total_difference": total_difference,
    }


def _resolve_amount_reason(taxable_difference, tax_difference, total_difference):
    if taxable_difference > AMOUNT_TOLERANCE:
        return ReconciliationItem.MismatchReason.TAXABLE_VALUE_MISMATCH
    if tax_difference > AMOUNT_TOLERANCE:
        return ReconciliationItem.MismatchReason.TAX_AMOUNT_MISMATCH
    if total_difference > Decimal("0.00"):
        return ReconciliationItem.MismatchReason.TOTAL_AMOUNT_MISMATCH
    if tax_difference > Decimal("0.00"):
        return ReconciliationItem.MismatchReason.TAX_AMOUNT_MISMATCH
    if taxable_difference > Decimal("0.00"):
        return ReconciliationItem.MismatchReason.TAXABLE_VALUE_MISMATCH
    return ""


def _pair_fuzzy(books_transactions, portal_transactions):
    fuzzy_pairs = []
    remaining_portal = portal_transactions[:]
    remaining_books = []

    for books_tx in books_transactions:
        match_index = next(
            (
                index
                for index, portal_tx in enumerate(remaining_portal)
                if books_tx.counterparty_gstin and books_tx.counterparty_gstin == portal_tx.counterparty_gstin
                and books_tx.transaction_date == portal_tx.transaction_date
                and _amounts_within_tolerance(books_tx, portal_tx)
            ),
            None,
        )
        if match_index is not None:
            portal_tx = remaining_portal.pop(match_index)
            fuzzy_pairs.append(
                (
                    books_tx,
                    portal_tx,
                    ReconciliationItem.MatchStatus.MISMATCH,
                    ReconciliationItem.MismatchReason.DOCUMENT_NUMBER_MISMATCH,
                )
            )
            continue

        match_index = next(
            (
                index
                for index, portal_tx in enumerate(remaining_portal)
                if _normalize_document_number(books_tx.reference_number) == _normalize_document_number(portal_tx.reference_number)
                and books_tx.transaction_date == portal_tx.transaction_date
                and _amounts_within_tolerance(books_tx, portal_tx)
            ),
            None,
        )
        if match_index is not None:
            portal_tx = remaining_portal.pop(match_index)
            fuzzy_pairs.append(
                (
                    books_tx,
                    portal_tx,
                    ReconciliationItem.MatchStatus.MISMATCH,
                    ReconciliationItem.MismatchReason.GSTIN_MISMATCH,
                )
            )
            continue

        remaining_books.append(books_tx)

    return fuzzy_pairs, remaining_books, remaining_portal


def _amounts_within_tolerance(books_tx, portal_tx):
    return (
        abs((books_tx.taxable_value or Decimal("0")) - (portal_tx.taxable_value or Decimal("0"))) <= AMOUNT_TOLERANCE
        and abs((books_tx.tax_amount or Decimal("0")) - (portal_tx.tax_amount or Decimal("0"))) <= AMOUNT_TOLERANCE
        and abs((books_tx.total_amount or Decimal("0")) - (portal_tx.total_amount or Decimal("0"))) <= AMOUNT_TOLERANCE
    )


def _build_item(
    *,
    run,
    books_transaction,
    portal_transaction,
    match_status,
    mismatch_reason="",
    tax_difference=Decimal("0.00"),
    taxable_difference=Decimal("0.00"),
    total_difference=Decimal("0.00"),
):
    return ReconciliationItem(
        reconciliation_run=run,
        books_transaction=books_transaction,
        portal_transaction=portal_transaction,
        match_status=match_status,
        mismatch_reason=mismatch_reason,
        tax_difference=tax_difference,
        taxable_difference=taxable_difference,
        total_difference=total_difference,
        action_status=ReconciliationItem.ActionStatus.OPEN,
        metadata={
            "books_reference": getattr(books_transaction, "reference_number", ""),
            "portal_reference": getattr(portal_transaction, "reference_number", ""),
        },
        created_by=run.created_by,
        updated_by=run.updated_by,
    )


def _apply_summary(*, run, items):
    run.matched_count = sum(1 for item in items if item.match_status == ReconciliationItem.MatchStatus.MATCHED)
    run.partial_match_count = sum(1 for item in items if item.match_status == ReconciliationItem.MatchStatus.PARTIAL_MATCH)
    run.mismatch_count = sum(1 for item in items if item.match_status == ReconciliationItem.MatchStatus.MISMATCH)
    run.missing_in_books_count = sum(1 for item in items if item.match_status == ReconciliationItem.MatchStatus.MISSING_IN_BOOKS)
    run.missing_in_portal_count = sum(1 for item in items if item.match_status == ReconciliationItem.MatchStatus.MISSING_IN_PORTAL)
    run.duplicate_count = sum(
        1
        for item in items
        if item.match_status in {
            ReconciliationItem.MatchStatus.DUPLICATE_IN_BOOKS,
            ReconciliationItem.MatchStatus.DUPLICATE_IN_PORTAL,
        }
    )
    run.total_tax_difference = sum((item.tax_difference for item in items), Decimal("0.00"))
    run.total_itc_at_risk = sum(
        (
            item.portal_transaction.tax_amount
            for item in items
            if item.match_status in {
                ReconciliationItem.MatchStatus.MISSING_IN_BOOKS,
                ReconciliationItem.MatchStatus.MISMATCH,
                ReconciliationItem.MatchStatus.PARTIAL_MATCH,
                ReconciliationItem.MatchStatus.DUPLICATE_IN_PORTAL,
            }
            and item.portal_transaction is not None
        ),
        Decimal("0.00"),
    )


def _normalize_document_number(value):
    return re.sub(r"[\s/\-]+", "", (value or "").strip().upper())


def _normalize_gstin(value):
    return (value or "").strip().upper()
