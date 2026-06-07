from collections import defaultdict
from decimal import Decimal
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.services.compliance_periods import ensure_period_modifiable
from apps.gst_transactions.models import GSTTransaction, TransactionCorrection
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun

User = get_user_model()

AMOUNT_TOLERANCE = Decimal("1.00")
# Purchase-vs-2B reconciliation is the inward ITC lane.
# Outward credit/debit notes still matter for GSTR-1 and outward tax,
# but they should not be pulled into purchase-side ITC review.
BOOK_TYPES = {"purchase"}
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
                "itc_ready_count",
                "itc_pending_2b_count",
                "itc_pending_review_count",
                "itc_blocked_count",
                "itc_timing_difference_count",
                "itc_vendor_followup_required_count",
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
        metadata={
            "action_status": instance.action_status,
            "review_decision": instance.review_decision,
            "assigned_to": instance.assigned_to_id,
        },
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


@transaction.atomic
def apply_reconciliation_item_books_correction(*, item, validated_data, user):
    ensure_period_modifiable(
        item.reconciliation_run.compliance_period,
        actor=user,
        attempted_action="reconciliation.item_correct",
    )
    transaction_record = item.books_transaction
    if transaction_record is None:
        raise ValidationError("Books correction is only available for reconciliation rows that already have a books transaction.")

    before_snapshot = _serialize_transaction_snapshot(transaction_record)
    editable_fields = {
        "reference_number",
        "transaction_date",
        "counterparty_gstin",
        "counterparty_name",
        "taxable_value",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "cess_amount",
        "total_amount",
        "place_of_supply",
        "reverse_charge",
    }
    update_values = {field: validated_data[field] for field in editable_fields if field in validated_data}

    for field, value in update_values.items():
        setattr(transaction_record, field, value)

    transaction_record.tax_amount = (
        Decimal(transaction_record.cgst_amount)
        + Decimal(transaction_record.sgst_amount)
        + Decimal(transaction_record.igst_amount)
        + Decimal(transaction_record.cess_amount)
    )
    if "total_amount" not in update_values:
        transaction_record.total_amount = Decimal(transaction_record.taxable_value) + Decimal(transaction_record.tax_amount)
    transaction_record.status = GSTTransaction.TransactionStatus.REVIEW
    transaction_record.updated_by = user
    transaction_record.save(
        update_fields=[
            "reference_number",
            "transaction_date",
            "counterparty_gstin",
            "counterparty_name",
            "taxable_value",
            "cgst_amount",
            "sgst_amount",
            "igst_amount",
            "cess_amount",
            "tax_amount",
            "total_amount",
            "place_of_supply",
            "reverse_charge",
            "status",
            "updated_by",
            "updated_at",
        ]
    )

    after_snapshot = _serialize_transaction_snapshot(transaction_record)
    comparable_fields = [
        "reference_number",
        "transaction_date",
        "counterparty_gstin",
        "counterparty_name",
        "taxable_value",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "cess_amount",
        "tax_amount",
        "total_amount",
        "place_of_supply",
        "reverse_charge",
    ]
    changed_fields = [field for field in comparable_fields if before_snapshot.get(field) != after_snapshot.get(field)]
    if not changed_fields:
        raise ValidationError("No books-side values changed. Update at least one field before saving.")

    correction = TransactionCorrection.objects.create(
        workspace=transaction_record.workspace,
        client=transaction_record.client,
        gstin=transaction_record.gstin,
        compliance_period=transaction_record.compliance_period,
        transaction=transaction_record,
        reconciliation_item=item,
        correction_scope=TransactionCorrection.CorrectionScope.RECONCILIATION_BOOKS,
        status=TransactionCorrection.CorrectionStatus.APPLIED,
        reason_code=validated_data["reason_code"],
        reason_note=validated_data["reason_note"],
        changed_fields=changed_fields,
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
        applied_at=timezone.now(),
        applied_by=user,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="transaction_correction.created",
        entity=correction,
        workspace_id=transaction_record.workspace_id,
        client_id=transaction_record.client_id,
        gstin_id=transaction_record.gstin_id,
        compliance_period_id=transaction_record.compliance_period_id,
        metadata={
            "reason_code": correction.reason_code,
            "changed_fields": changed_fields,
            "correction_scope": correction.correction_scope,
        },
        before_state=before_snapshot,
        after_state=after_snapshot,
    )
    record_audit_log(
        actor=user,
        action="transaction_correction.applied",
        entity=correction,
        workspace_id=transaction_record.workspace_id,
        client_id=transaction_record.client_id,
        gstin_id=transaction_record.gstin_id,
        compliance_period_id=transaction_record.compliance_period_id,
        metadata={
            "reason_code": correction.reason_code,
            "changed_fields": changed_fields,
            "reconciliation_run_id": str(item.reconciliation_run_id),
        },
        before_state=before_snapshot,
        after_state=after_snapshot,
    )
    enqueue_reconciliation_run(run=item.reconciliation_run, actor=user)
    return correction


@transaction.atomic
def create_reconciliation_item_books_entry(*, item, validated_data, user):
    ensure_period_modifiable(
        item.reconciliation_run.compliance_period,
        actor=user,
        attempted_action="reconciliation.item_create_books_entry",
    )
    if item.books_transaction_id is not None:
        raise ValidationError("This reconciliation row already has a books transaction.")
    portal_transaction = item.portal_transaction
    if portal_transaction is None:
        raise ValidationError("Books entry creation is only available for rows that already have a portal-side transaction.")

    before_snapshot = _serialize_transaction_snapshot(portal_transaction)
    editable_fields = {
        "reference_number",
        "transaction_date",
        "counterparty_gstin",
        "counterparty_name",
        "taxable_value",
        "cgst_amount",
        "sgst_amount",
        "igst_amount",
        "cess_amount",
        "total_amount",
        "place_of_supply",
        "reverse_charge",
    }
    initial_values = {
        "workspace": item.reconciliation_run.workspace,
        "client": item.reconciliation_run.client,
        "gstin": item.reconciliation_run.gstin,
        "compliance_period": item.reconciliation_run.compliance_period,
        "transaction_type": "purchase",
        "document_type": portal_transaction.document_type or "invoice",
        "reference_number": validated_data.get("reference_number", portal_transaction.reference_number),
        "transaction_date": validated_data.get("transaction_date", portal_transaction.transaction_date),
        "counterparty_gstin": validated_data.get("counterparty_gstin", portal_transaction.counterparty_gstin),
        "counterparty_name": validated_data.get("counterparty_name", portal_transaction.counterparty_name),
        "taxable_value": Decimal(validated_data.get("taxable_value", portal_transaction.taxable_value)),
        "cgst_amount": Decimal(validated_data.get("cgst_amount", portal_transaction.cgst_amount)),
        "sgst_amount": Decimal(validated_data.get("sgst_amount", portal_transaction.sgst_amount)),
        "igst_amount": Decimal(validated_data.get("igst_amount", portal_transaction.igst_amount)),
        "cess_amount": Decimal(validated_data.get("cess_amount", portal_transaction.cess_amount)),
        "place_of_supply": validated_data.get("place_of_supply", portal_transaction.place_of_supply),
        "reverse_charge": validated_data.get("reverse_charge", portal_transaction.reverse_charge),
        "status": GSTTransaction.TransactionStatus.REVIEW,
        "metadata": {
            **(portal_transaction.metadata or {}),
            "created_via_reconciliation": True,
            "source_reconciliation_item_id": str(item.id),
            "source_portal_transaction_id": str(portal_transaction.id),
            "source_transaction_type": portal_transaction.transaction_type,
        },
        "created_by": user,
        "updated_by": user,
    }
    tax_amount = (
        initial_values["cgst_amount"]
        + initial_values["sgst_amount"]
        + initial_values["igst_amount"]
        + initial_values["cess_amount"]
    )
    initial_values["tax_amount"] = tax_amount
    initial_values["total_amount"] = Decimal(validated_data.get("total_amount", initial_values["taxable_value"] + tax_amount))

    created_transaction = GSTTransaction.objects.create(**initial_values)
    after_snapshot = _serialize_transaction_snapshot(created_transaction)
    changed_fields = [field for field in editable_fields if field in validated_data and before_snapshot.get(field) != after_snapshot.get(field)]
    if not changed_fields:
        changed_fields = ["books_entry_created_from_portal"]

    correction = TransactionCorrection.objects.create(
        workspace=created_transaction.workspace,
        client=created_transaction.client,
        gstin=created_transaction.gstin,
        compliance_period=created_transaction.compliance_period,
        transaction=created_transaction,
        reconciliation_item=item,
        correction_scope=TransactionCorrection.CorrectionScope.RECONCILIATION_BOOKS_CREATE,
        status=TransactionCorrection.CorrectionStatus.APPLIED,
        reason_code=validated_data["reason_code"],
        reason_note=validated_data["reason_note"],
        changed_fields=changed_fields,
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
        applied_at=timezone.now(),
        applied_by=user,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="transaction_correction.created",
        entity=correction,
        workspace_id=created_transaction.workspace_id,
        client_id=created_transaction.client_id,
        gstin_id=created_transaction.gstin_id,
        compliance_period_id=created_transaction.compliance_period_id,
        metadata={
            "reason_code": correction.reason_code,
            "changed_fields": changed_fields,
            "correction_scope": correction.correction_scope,
            "source_portal_transaction_id": str(portal_transaction.id),
        },
        before_state=before_snapshot,
        after_state=after_snapshot,
    )
    record_audit_log(
        actor=user,
        action="transaction_correction.applied",
        entity=correction,
        workspace_id=created_transaction.workspace_id,
        client_id=created_transaction.client_id,
        gstin_id=created_transaction.gstin_id,
        compliance_period_id=created_transaction.compliance_period_id,
        metadata={
            "reason_code": correction.reason_code,
            "changed_fields": changed_fields,
            "reconciliation_run_id": str(item.reconciliation_run_id),
            "source_portal_transaction_id": str(portal_transaction.id),
        },
        before_state=before_snapshot,
        after_state=after_snapshot,
    )
    enqueue_reconciliation_run(run=item.reconciliation_run, actor=user)
    return correction


def _serialize_transaction_snapshot(transaction_record):
    return {
        "reference_number": transaction_record.reference_number,
        "transaction_date": transaction_record.transaction_date.isoformat() if transaction_record.transaction_date else None,
        "counterparty_gstin": transaction_record.counterparty_gstin,
        "counterparty_name": transaction_record.counterparty_name,
        "taxable_value": str(transaction_record.taxable_value),
        "cgst_amount": str(transaction_record.cgst_amount),
        "sgst_amount": str(transaction_record.sgst_amount),
        "igst_amount": str(transaction_record.igst_amount),
        "cess_amount": str(transaction_record.cess_amount),
        "tax_amount": str(transaction_record.tax_amount),
        "total_amount": str(transaction_record.total_amount),
        "place_of_supply": transaction_record.place_of_supply,
        "reverse_charge": transaction_record.reverse_charge,
        "status": transaction_record.status,
    }


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
    period_relationship = _period_relationship(books_tx, portal_tx)

    if forced_status and forced_reason:
        return {
            "status": forced_status,
            "reason": forced_reason,
            "tax_difference": tax_difference,
            "taxable_difference": taxable_difference,
            "total_difference": total_difference,
        }

    if books_tx.transaction_date != portal_tx.transaction_date:
        if (
            period_relationship in {
                ReconciliationItem.PeriodRelationship.PRIOR_PERIOD,
                ReconciliationItem.PeriodRelationship.NEXT_PERIOD,
            }
            and taxable_difference <= AMOUNT_TOLERANCE
            and tax_difference <= AMOUNT_TOLERANCE
            and total_difference <= AMOUNT_TOLERANCE
        ):
            status = ReconciliationItem.MatchStatus.PARTIAL_MATCH
            reason = ReconciliationItem.MismatchReason.DATE_MISMATCH
        else:
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


def _period_key(transaction):
    if transaction is None or transaction.transaction_date is None:
        return None
    return (transaction.transaction_date.year, transaction.transaction_date.month)


def _period_relationship(books_transaction, portal_transaction):
    books_period = _period_key(books_transaction)
    portal_period = _period_key(portal_transaction)
    if not books_period or not portal_period:
        return ReconciliationItem.PeriodRelationship.UNKNOWN
    if books_period == portal_period:
        return ReconciliationItem.PeriodRelationship.SAME_PERIOD
    if books_period < portal_period:
        return ReconciliationItem.PeriodRelationship.NEXT_PERIOD
    return ReconciliationItem.PeriodRelationship.PRIOR_PERIOD


def _derive_issue_bucket(match_status, mismatch_reason, books_transaction, portal_transaction):
    relationship = _period_relationship(books_transaction, portal_transaction)

    if match_status == ReconciliationItem.MatchStatus.MATCHED:
        return ReconciliationItem.IssueBucket.READY, "No action needed", relationship

    if match_status in {
        ReconciliationItem.MatchStatus.DUPLICATE_IN_BOOKS,
        ReconciliationItem.MatchStatus.DUPLICATE_IN_PORTAL,
    } or mismatch_reason == ReconciliationItem.MismatchReason.DUPLICATE_INVOICE:
        return ReconciliationItem.IssueBucket.DUPLICATE_CLEANUP, "Review and clear duplicate", relationship

    if mismatch_reason == ReconciliationItem.MismatchReason.DATE_MISMATCH or relationship in {
        ReconciliationItem.PeriodRelationship.PRIOR_PERIOD,
        ReconciliationItem.PeriodRelationship.NEXT_PERIOD,
    }:
        return ReconciliationItem.IssueBucket.TIMING_DIFFERENCE, "Review period timing", relationship

    if match_status == ReconciliationItem.MatchStatus.MISSING_IN_PORTAL or mismatch_reason == ReconciliationItem.MismatchReason.MISSING_IN_PORTAL:
        return ReconciliationItem.IssueBucket.VENDOR_FOLLOW_UP, "Follow up with supplier", relationship

    if match_status == ReconciliationItem.MatchStatus.MISSING_IN_BOOKS or mismatch_reason == ReconciliationItem.MismatchReason.MISSING_IN_BOOKS:
        return ReconciliationItem.IssueBucket.BOOKS_CORRECTION, "Check missing booking", relationship

    if mismatch_reason in {
        ReconciliationItem.MismatchReason.GSTIN_MISMATCH,
        ReconciliationItem.MismatchReason.DOCUMENT_NUMBER_MISMATCH,
    }:
        return ReconciliationItem.IssueBucket.DOCUMENT_REVIEW, "Compare source invoice", relationship

    if match_status == ReconciliationItem.MatchStatus.PARTIAL_MATCH or mismatch_reason in {
        ReconciliationItem.MismatchReason.TAXABLE_VALUE_MISMATCH,
        ReconciliationItem.MismatchReason.TAX_AMOUNT_MISMATCH,
        ReconciliationItem.MismatchReason.TOTAL_AMOUNT_MISMATCH,
    }:
        return ReconciliationItem.IssueBucket.VALUE_REVIEW, "Review values against source", relationship

    return ReconciliationItem.IssueBucket.ISSUE_REVIEW, "Open and review", relationship


def _derive_itc_status(match_status, mismatch_reason, issue_bucket, books_transaction, portal_transaction):
    relationship = _period_relationship(books_transaction, portal_transaction)

    if match_status == ReconciliationItem.MatchStatus.MATCHED:
        return ReconciliationItem.ITCStatus.ITC_READY

    if issue_bucket == ReconciliationItem.IssueBucket.TIMING_DIFFERENCE or relationship in {
        ReconciliationItem.PeriodRelationship.PRIOR_PERIOD,
        ReconciliationItem.PeriodRelationship.NEXT_PERIOD,
    }:
        return ReconciliationItem.ITCStatus.ITC_TIMING_DIFFERENCE

    if match_status == ReconciliationItem.MatchStatus.MISSING_IN_PORTAL or mismatch_reason == ReconciliationItem.MismatchReason.MISSING_IN_PORTAL:
        return ReconciliationItem.ITCStatus.ITC_PENDING_2B

    if match_status == ReconciliationItem.MatchStatus.MISSING_IN_BOOKS:
        return ReconciliationItem.ITCStatus.ITC_BLOCKED

    if issue_bucket in {
        ReconciliationItem.IssueBucket.DUPLICATE_CLEANUP,
        ReconciliationItem.IssueBucket.BOOKS_CORRECTION,
    }:
        return ReconciliationItem.ITCStatus.ITC_BLOCKED

    if issue_bucket in {
        ReconciliationItem.IssueBucket.VENDOR_FOLLOW_UP,
        ReconciliationItem.IssueBucket.DOCUMENT_REVIEW,
    }:
        return ReconciliationItem.ITCStatus.ITC_VENDOR_FOLLOWUP_REQUIRED

    if issue_bucket in {
        ReconciliationItem.IssueBucket.VALUE_REVIEW,
        ReconciliationItem.IssueBucket.ISSUE_REVIEW,
    }:
        return ReconciliationItem.ITCStatus.ITC_PENDING_REVIEW

    return ReconciliationItem.ITCStatus.ITC_PENDING_REVIEW


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
    issue_bucket, recommended_next_action, period_relationship = _derive_issue_bucket(
        match_status,
        mismatch_reason,
        books_transaction,
        portal_transaction,
    )
    itc_status = _derive_itc_status(
        match_status,
        mismatch_reason,
        issue_bucket,
        books_transaction,
        portal_transaction,
    )
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
        issue_bucket=issue_bucket,
        recommended_next_action=recommended_next_action,
        period_relationship=period_relationship,
        itc_status=itc_status,
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
    run.itc_ready_count = sum(1 for item in items if item.itc_status == ReconciliationItem.ITCStatus.ITC_READY)
    run.itc_pending_2b_count = sum(1 for item in items if item.itc_status == ReconciliationItem.ITCStatus.ITC_PENDING_2B)
    run.itc_pending_review_count = sum(1 for item in items if item.itc_status == ReconciliationItem.ITCStatus.ITC_PENDING_REVIEW)
    run.itc_blocked_count = sum(1 for item in items if item.itc_status == ReconciliationItem.ITCStatus.ITC_BLOCKED)
    run.itc_timing_difference_count = sum(1 for item in items if item.itc_status == ReconciliationItem.ITCStatus.ITC_TIMING_DIFFERENCE)
    run.itc_vendor_followup_required_count = sum(
        1 for item in items if item.itc_status == ReconciliationItem.ITCStatus.ITC_VENDOR_FOLLOWUP_REQUIRED
    )


def _normalize_document_number(value):
    return re.sub(r"[\s/\-]+", "", (value or "").strip().upper())


def _normalize_gstin(value):
    return (value or "").strip().upper()
